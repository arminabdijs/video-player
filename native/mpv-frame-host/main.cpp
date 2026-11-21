#define SDL_MAIN_HANDLED
#define GL_GLEXT_PROTOTYPES 1

#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>
#include <SDL.h>
#include <SDL_opengl.h>

#ifndef GL_PIXEL_PACK_BUFFER
#define GL_PIXEL_PACK_BUFFER 0x88EB
#endif
#ifndef GL_STREAM_READ
#define GL_STREAM_READ 0x88E1
#endif
#ifndef GL_READ_ONLY
#define GL_READ_ONLY 0x88B8
#endif
#ifndef GL_SYNC_GPU_COMMANDS_COMPLETE
#define GL_SYNC_GPU_COMMANDS_COMPLETE 0x9117
#endif
#ifndef GL_ALREADY_SIGNALED
#define GL_ALREADY_SIGNALED 0x911A
#endif
#ifndef GL_TIMEOUT_EXPIRED
#define GL_TIMEOUT_EXPIRED 0x911B
#endif
#ifndef GL_CONDITION_SATISFIED
#define GL_CONDITION_SATISFIED 0x911C
#endif
#ifndef GL_RGBA16F
#define GL_RGBA16F 0x881A
#endif

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <iostream>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {
constexpr std::uint32_t kFrameMagic = 0x41525541U; // "AURA" on little-endian hosts.
constexpr std::uint32_t kMaxDimension = 8192;
constexpr std::uint64_t kMaxFrameBytes = 256ULL * 1024ULL * 1024ULL;
constexpr int kTargetFps = 60; // Output only on decoded-frame callbacks; this is a ceiling, not forced frame generation.
constexpr int kPboCount = 1; // A single pending readback prevents stale-frame queues and A/V latency.
constexpr int kMaxOutputWidth = 3840;
constexpr int kMaxOutputHeight = 2160;
int g_deviceMaxOutputWidth = kMaxOutputWidth;
int g_deviceMaxOutputHeight = kMaxOutputHeight;

#pragma pack(push, 1)
struct FrameHeader {
  std::uint32_t magic;
  std::uint32_t width;
  std::uint32_t height;
  std::uint32_t stride;
  std::uint32_t byteCount;
  std::uint32_t sequence;
};
#pragma pack(pop)

struct Options {
  std::string file;
  double start = 0.0;
  bool diagnoseCodecs = false;
  bool verifyRequiredCodecs = false;
  bool thumbnail = false;
  bool warmup = false;
  int width = 1920;
  int height = 1080;
};

std::atomic<bool> g_frameDirty{true};
std::atomic<bool> g_frameInFlight{false};
std::atomic<bool> g_frameOutputEnabled{true};
std::atomic<bool> g_running{true};
std::mutex g_commandMutex;
std::deque<std::string> g_commands;
std::atomic<std::uint64_t> g_requestedSize{0};
std::atomic<double> g_pendingStartTime{0.0};
std::atomic<bool> g_seekOnFileLoaded{false};

void mpvUpdate(void *) {
  g_frameDirty.store(true, std::memory_order_release);
}

void *getGlProcAddress(void *, const char *name) {
  return SDL_GL_GetProcAddress(name);
}

void emitEvent(const std::string &type, const std::string &detail = {}) {
  std::fprintf(stderr, "AURA_EVENT type=%s", type.c_str());
  if (!detail.empty()) std::fprintf(stderr, " detail=%s", detail.c_str());
  std::fputc('\n', stderr);
  std::fflush(stderr);
}

template <typename T>
T getNumber(mpv_handle *mpv, const char *name, mpv_format format, T fallback) {
  T value = fallback;
  if (mpv_get_property(mpv, name, format, &value) < 0) return fallback;
  return value;
}

std::string getString(mpv_handle *mpv, const char *name, const char *fallback = "") {
  char *value = mpv_get_property_string(mpv, name);
  if (!value) return fallback;
  std::string result(value);
  mpv_free(value);
  return result;
}

void emitState(mpv_handle *mpv) {
  const double time = getNumber<double>(mpv, "time-pos", MPV_FORMAT_DOUBLE, 0.0);
  const double duration = getNumber<double>(mpv, "duration", MPV_FORMAT_DOUBLE, 0.0);
  const double speed = getNumber<double>(mpv, "speed", MPV_FORMAT_DOUBLE, 1.0);
  const double volume = getNumber<double>(mpv, "volume", MPV_FORMAT_DOUBLE, 100.0);
  const int paused = getNumber<int>(mpv, "pause", MPV_FORMAT_FLAG, 1);
  const int muted = getNumber<int>(mpv, "mute", MPV_FORMAT_FLAG, 0);
  const std::int64_t width = getNumber<std::int64_t>(mpv, "width", MPV_FORMAT_INT64, 0);
  const std::int64_t height = getNumber<std::int64_t>(mpv, "height", MPV_FORMAT_INT64, 0);

  std::fprintf(stderr,
    "AURA_STATE time=%.6f duration=%.6f speed=%.4f volume=%.2f paused=%d muted=%d width=%lld height=%lld\n",
    time, duration, speed, volume, paused, muted,
    static_cast<long long>(width), static_cast<long long>(height));
  std::fflush(stderr);
}

struct SdlOpenGLRuntime {
  SDL_Window *window = nullptr;
  SDL_GLContext context = nullptr;
  std::string driver;
};

SdlOpenGLRuntime initializeSdlOpenGL() {
  std::vector<std::string> candidates;
  const char *explicitDriver = std::getenv("SDL_VIDEODRIVER");
  if (explicitDriver && *explicitDriver) candidates.emplace_back(explicitDriver);
#ifdef __linux__
  const char *wayland = std::getenv("WAYLAND_DISPLAY");
  const char *x11 = std::getenv("DISPLAY");
  if (wayland && *wayland && std::find(candidates.begin(), candidates.end(), "wayland") == candidates.end()) {
    candidates.emplace_back("wayland");
  }
  // SDL2-compat uses SDL3 internally. Some host/driver combinations cannot
  // create an OpenGL context on its Wayland backend; retry through XWayland
  // when available rather than terminating the embedded player immediately.
  if (x11 && *x11 && std::find(candidates.begin(), candidates.end(), "x11") == candidates.end()) {
    candidates.emplace_back("x11");
  }
#endif
  if (candidates.empty()) candidates.emplace_back("");

  std::string failures;
  for (const auto &driver : candidates) {
    SDL_Quit();
    if (driver.empty()) {
#ifdef _WIN32
      _putenv_s("SDL_VIDEODRIVER", "");
#else
      unsetenv("SDL_VIDEODRIVER");
#endif
    } else {
      SDL_setenv("SDL_VIDEODRIVER", driver.c_str(), 1);
    }
    SDL_ClearError();
    const std::string label = driver.empty() ? "automatic" : driver;
    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
      if (!failures.empty()) failures += " | ";
      failures += "SDL_Init(" + label + "): " + SDL_GetError();
      continue;
    }

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 1);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 0);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 0);
    SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 0);

    SDL_Window *window = SDL_CreateWindow("Aura Player Render Host", SDL_WINDOWPOS_UNDEFINED,
      SDL_WINDOWPOS_UNDEFINED, 16, 16, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
    if (!window) {
      if (!failures.empty()) failures += " | ";
      failures += "SDL_CreateWindow(" + label + "): " + SDL_GetError();
      SDL_Quit();
      continue;
    }

    SDL_GLContext context = SDL_GL_CreateContext(window);
    if (!context) {
      if (!failures.empty()) failures += " | ";
      failures += "SDL_GL_CreateContext(" + label + "): " + SDL_GetError();
      SDL_DestroyWindow(window);
      SDL_Quit();
      continue;
    }
    if (SDL_GL_MakeCurrent(window, context) != 0) {
      if (!failures.empty()) failures += " | ";
      failures += "SDL_GL_MakeCurrent(" + label + "): " + SDL_GetError();
      SDL_GL_DeleteContext(context);
      SDL_DestroyWindow(window);
      SDL_Quit();
      continue;
    }

    const char *actualDriver = SDL_GetCurrentVideoDriver();
    return {window, context, actualDriver ? actualDriver : label};
  }

  throw std::runtime_error("Could not initialize an SDL OpenGL context. Attempts: " + failures +
    ". On Fedora Wayland, verify the Mesa/OpenGL driver and that XWayland is available for fallback.");
}

Options parseArguments(int argc, char **argv) {
  Options options;
  for (int i = 1; i < argc; ++i) {
    const std::string arg(argv[i]);
    if (arg == "--diagnose-codecs") options.diagnoseCodecs = true;
    else if (arg == "--verify-required-codecs") options.verifyRequiredCodecs = true;
    else if (arg == "--thumbnail") options.thumbnail = true;
    else if (arg == "--warmup") options.warmup = true;
    else if (arg == "--file" && i + 1 < argc) options.file = argv[++i];
    else if (arg == "--start" && i + 1 < argc) options.start = std::max(0.0, std::atof(argv[++i]));
    else if (arg == "--width" && i + 1 < argc) options.width = std::clamp(std::atoi(argv[++i]), 320, static_cast<int>(kMaxOutputWidth));
    else if (arg == "--height" && i + 1 < argc) options.height = std::clamp(std::atoi(argv[++i]), 180, static_cast<int>(kMaxOutputHeight));
  }
  if (options.thumbnail) {
    options.width = std::clamp(options.width, 160, 640);
    options.height = std::clamp(options.height, 90, 360);
  }
  if (options.warmup) {
    options.width = std::min(options.width, 640);
    options.height = std::min(options.height, 360);
  }
  if (options.file.empty() && !options.diagnoseCodecs && !options.verifyRequiredCodecs && !options.warmup) {
    throw std::runtime_error("Missing --file argument.");
  }
  return options;
}

void commandReader() {
  std::string line;
  while (g_running.load(std::memory_order_relaxed) && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    std::lock_guard<std::mutex> lock(g_commandMutex);
    if (g_commands.size() < 128) g_commands.push_back(line);
  }
}

int hexValue(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

std::string decodeHex(const std::string &encoded) {
  if (encoded.size() % 2 != 0 || encoded.size() > 32768) return {};
  std::string decoded;
  decoded.reserve(encoded.size() / 2);
  for (std::size_t index = 0; index < encoded.size(); index += 2) {
    const int high = hexValue(encoded[index]);
    const int low = hexValue(encoded[index + 1]);
    if (high < 0 || low < 0) return {};
    decoded.push_back(static_cast<char>((high << 4) | low));
  }
  return decoded;
}

void executeCommand(mpv_handle *mpv, const std::string &line) {
  std::istringstream stream(line);
  std::string command;
  stream >> command;
  if (command.empty()) return;

  if (command == "load-file-hex") {
    std::string encodedPath;
    double startTime = 0.0;
    stream >> encodedPath;
    if (!(stream >> startTime)) startTime = 0.0;
    const std::string filePath = decodeHex(encodedPath);
    if (filePath.empty() || !std::isfinite(startTime)) {
      emitEvent("error", "The requested media path or start time is invalid.");
      return;
    }
    g_pendingStartTime.store(std::max(0.0, startTime), std::memory_order_release);
    g_seekOnFileLoaded.store(startTime > 0.01, std::memory_order_release);
    const char *args[] = {"loadfile", filePath.c_str(), "replace", nullptr};
    const int result = mpv_command(mpv, args);
    if (result < 0) emitEvent("error", mpv_error_string(result));
    else {
      mpv_set_property_string(mpv, "pause", "no");
      emitEvent("opening-media");
    }
  }
  else if (command == "play") mpv_set_property_string(mpv, "pause", "no");
  else if (command == "pause") mpv_set_property_string(mpv, "pause", "yes");
  else if (command == "toggle-pause") mpv_command_string(mpv, "cycle pause");
  else if (command == "stop") mpv_command_string(mpv, "stop");
  else if (command == "quit") g_running.store(false, std::memory_order_relaxed);
  else if (command == "frames-enabled") {
    int enabled = 1;
    stream >> enabled;
    g_frameOutputEnabled.store(enabled != 0, std::memory_order_release);
    if (enabled != 0) g_frameDirty.store(true, std::memory_order_release);
  }
  else if (command == "frame-ack") {
    // Release backpressure only. Do not mark a frame dirty here: while paused,
    // an ACK must not cause the same still frame to be resent continuously.
    // Real MPV render callbacks keep g_frameDirty set while a frame is in flight.
    g_frameInFlight.store(false, std::memory_order_release);
  }
  else if (command == "seek") {
    double value = 0.0;
    stream >> value;
    if (std::isfinite(value)) {
      const std::string text = std::to_string(std::max(0.0, value));
      const char *args[] = {"seek", text.c_str(), "absolute+exact", nullptr};
      mpv_command(mpv, args);
    }
  } else if (command == "set") {
    std::string property;
    std::string value;
    stream >> property >> value;
    if (!property.empty() && !value.empty()) mpv_set_property_string(mpv, property.c_str(), value.c_str());
  } else if (command == "cycle") {
    std::string property;
    stream >> property;
    if (!property.empty()) {
      const char *args[] = {"cycle", property.c_str(), nullptr};
      mpv_command(mpv, args);
    }
  } else if (command == "resize") {
    int width = 0;
    int height = 0;
    stream >> width >> height;
    if (width >= 480 && width <= kMaxOutputWidth && height >= 270 && height <= kMaxOutputHeight) {
      const int boundedWidth = std::clamp(width, 480, g_deviceMaxOutputWidth);
      const int boundedHeight = std::clamp(height, 270, g_deviceMaxOutputHeight);
      const auto packed = (static_cast<std::uint64_t>(static_cast<std::uint32_t>(boundedWidth)) << 32U) |
        static_cast<std::uint32_t>(boundedHeight);
      g_requestedSize.store(packed, std::memory_order_release);
    }
  } else if (command == "add-subtitle-hex") {
    std::string encodedPath;
    stream >> encodedPath;
    const std::string filePath = decodeHex(encodedPath);
    if (!filePath.empty()) {
      const char *args[] = {"sub-add", filePath.c_str(), "select", nullptr};
      const int result = mpv_command(mpv, args);
      if (result < 0) emitEvent("error", mpv_error_string(result));
    }
  }
}

void processCommands(mpv_handle *mpv) {
  std::deque<std::string> pending;
  {
    std::lock_guard<std::mutex> lock(g_commandMutex);
    pending.swap(g_commands);
  }
  for (const auto &command : pending) executeCommand(mpv, command);
}

struct GlFunctions {
  PFNGLGENFRAMEBUFFERSPROC genFramebuffers = nullptr;
  PFNGLBINDFRAMEBUFFERPROC bindFramebuffer = nullptr;
  PFNGLFRAMEBUFFERTEXTURE2DPROC framebufferTexture2D = nullptr;
  PFNGLCHECKFRAMEBUFFERSTATUSPROC checkFramebufferStatus = nullptr;
  PFNGLDELETEFRAMEBUFFERSPROC deleteFramebuffers = nullptr;
  using GenBuffersFn = void (APIENTRY *)(GLsizei, GLuint *);
  using BindBufferFn = void (APIENTRY *)(GLenum, GLuint);
  using BufferDataFn = void (APIENTRY *)(GLenum, GLsizeiptr, const void *, GLenum);
  using MapBufferFn = void *(APIENTRY *)(GLenum, GLenum);
  using UnmapBufferFn = GLboolean (APIENTRY *)(GLenum);
  using DeleteBuffersFn = void (APIENTRY *)(GLsizei, const GLuint *);
  GenBuffersFn genBuffers = nullptr;
  BindBufferFn bindBuffer = nullptr;
  BufferDataFn bufferData = nullptr;
  MapBufferFn mapBuffer = nullptr;
  UnmapBufferFn unmapBuffer = nullptr;
  DeleteBuffersFn deleteBuffers = nullptr;
  using FenceSyncFn = void *(APIENTRY *)(GLenum, GLbitfield);
  using ClientWaitSyncFn = GLenum(APIENTRY *)(void *, GLbitfield, std::uint64_t);
  using DeleteSyncFn = void (APIENTRY *)(void *);
  FenceSyncFn fenceSync = nullptr;
  ClientWaitSyncFn clientWaitSync = nullptr;
  DeleteSyncFn deleteSync = nullptr;
};

bool loadGlFunctions(GlFunctions &gl) {
  gl.genFramebuffers = reinterpret_cast<PFNGLGENFRAMEBUFFERSPROC>(SDL_GL_GetProcAddress("glGenFramebuffers"));
  gl.bindFramebuffer = reinterpret_cast<PFNGLBINDFRAMEBUFFERPROC>(SDL_GL_GetProcAddress("glBindFramebuffer"));
  gl.framebufferTexture2D = reinterpret_cast<PFNGLFRAMEBUFFERTEXTURE2DPROC>(SDL_GL_GetProcAddress("glFramebufferTexture2D"));
  gl.checkFramebufferStatus = reinterpret_cast<PFNGLCHECKFRAMEBUFFERSTATUSPROC>(SDL_GL_GetProcAddress("glCheckFramebufferStatus"));
  gl.deleteFramebuffers = reinterpret_cast<PFNGLDELETEFRAMEBUFFERSPROC>(SDL_GL_GetProcAddress("glDeleteFramebuffers"));
  gl.genBuffers = reinterpret_cast<GlFunctions::GenBuffersFn>(SDL_GL_GetProcAddress("glGenBuffers"));
  gl.bindBuffer = reinterpret_cast<GlFunctions::BindBufferFn>(SDL_GL_GetProcAddress("glBindBuffer"));
  gl.bufferData = reinterpret_cast<GlFunctions::BufferDataFn>(SDL_GL_GetProcAddress("glBufferData"));
  gl.mapBuffer = reinterpret_cast<GlFunctions::MapBufferFn>(SDL_GL_GetProcAddress("glMapBuffer"));
  gl.unmapBuffer = reinterpret_cast<GlFunctions::UnmapBufferFn>(SDL_GL_GetProcAddress("glUnmapBuffer"));
  gl.deleteBuffers = reinterpret_cast<GlFunctions::DeleteBuffersFn>(SDL_GL_GetProcAddress("glDeleteBuffers"));
  gl.fenceSync = reinterpret_cast<GlFunctions::FenceSyncFn>(SDL_GL_GetProcAddress("glFenceSync"));
  gl.clientWaitSync = reinterpret_cast<GlFunctions::ClientWaitSyncFn>(SDL_GL_GetProcAddress("glClientWaitSync"));
  gl.deleteSync = reinterpret_cast<GlFunctions::DeleteSyncFn>(SDL_GL_GetProcAddress("glDeleteSync"));
  return gl.genFramebuffers && gl.bindFramebuffer && gl.framebufferTexture2D && gl.checkFramebufferStatus && gl.deleteFramebuffers;
}

struct Framebuffer {
  GLuint texture = 0;
  GLuint fbo = 0;
  int width = 0;
  int height = 0;
  GLenum internalFormat = GL_RGBA8;

  void destroy(const GlFunctions &gl) {
    if (texture) glDeleteTextures(1, &texture);
    if (fbo) gl.deleteFramebuffers(1, &fbo);
    texture = 0;
    fbo = 0;
    width = 0;
    height = 0;
    internalFormat = GL_RGBA8;
  }

  bool resize(const GlFunctions &gl, int newWidth, int newHeight, bool preferFloat = true) {
    if (newWidth < 1 || newHeight < 1 || newWidth > static_cast<int>(kMaxDimension) || newHeight > static_cast<int>(kMaxDimension)) return false;
    if (width == newWidth && height == newHeight && fbo) return true;
    destroy(gl);
    width = newWidth;
    height = newHeight;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    gl.genFramebuffers(1, &fbo);

    const auto attachAndCheck = [&](GLenum format, GLenum type) {
      internalFormat = format;
      glTexImage2D(GL_TEXTURE_2D, 0, static_cast<GLint>(format), width, height, 0, GL_RGBA, type, nullptr);
      gl.bindFramebuffer(GL_FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, 0);
      return gl.checkFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
    };

    // Keep libmpv's intermediate video processing at 16-bit float precision
    // whenever the GPU supports it. The final readback remains 8-bit sRGB for
    // Chromium Canvas, with explicit dithering/tone mapping configured below.
    bool valid = preferFloat && attachAndCheck(GL_RGBA16F, GL_FLOAT);
    if (!valid) valid = attachAndCheck(GL_RGBA8, GL_UNSIGNED_BYTE);
    gl.bindFramebuffer(GL_FRAMEBUFFER, 0);
    if (!valid) {
      gl.deleteFramebuffers(1, &fbo);
      glDeleteTextures(1, &texture);
      texture = 0;
      fbo = 0;
      width = 0;
      height = 0;
      internalFormat = GL_RGBA8;
      return false;
    }
    return true;
  }
};
bool getDisplayDimensions(mpv_handle *mpv, std::int64_t &displayWidth, std::int64_t &displayHeight) {
  const auto readPair = [&](const char *widthProperty, const char *heightProperty) {
    std::int64_t width = 0;
    std::int64_t height = 0;
    const int widthStatus = mpv_get_property(mpv, widthProperty, MPV_FORMAT_INT64, &width);
    const int heightStatus = mpv_get_property(mpv, heightProperty, MPV_FORMAT_INT64, &height);
    if (widthStatus < 0 || heightStatus < 0 || width < 1 || height < 1) return false;
    displayWidth = width;
    displayHeight = height;
    return true;
  };

  // Prefer mpv's display dimensions: unlike raw coded width/height, these
  // already account for sample-aspect-ratio and display transforms. Older
  // builds/early startup states may not expose them yet, so keep safe fallbacks.
  if (readPair("dwidth", "dheight")) return true;
  if (readPair("video-params/dw", "video-params/dh")) return true;
  return readPair("width", "height");
}

std::pair<int, int> fitVideoOutputWithinBounds(std::int64_t sourceWidth, std::int64_t sourceHeight,
                                                int maxWidth, int maxHeight) {
  if (sourceWidth < 1 || sourceHeight < 1 || maxWidth < 1 || maxHeight < 1) {
    return {std::max(1, maxWidth), std::max(1, maxHeight)};
  }

  // Render at the physical viewport resolution, not merely at the source's
  // coded resolution. This lets libmpv's GPU scaler perform the final upscale
  // (e.g. 720p -> 1080p) instead of delegating it to Chromium's Canvas sampler.
  // The FBO remains source-aspect-correct, so the Canvas can still implement
  // contain/cover/fill without distorting the video inside libmpv.
  const double sourceAspect = static_cast<double>(sourceWidth) / static_cast<double>(sourceHeight);
  const double boundsAspect = static_cast<double>(maxWidth) / static_cast<double>(maxHeight);
  int outputWidth = 0;
  int outputHeight = 0;
  if (sourceAspect >= boundsAspect) {
    outputWidth = maxWidth;
    outputHeight = static_cast<int>(std::lround(static_cast<double>(maxWidth) / sourceAspect));
  } else {
    outputHeight = maxHeight;
    outputWidth = static_cast<int>(std::lround(static_cast<double>(maxHeight) * sourceAspect));
  }

  // Even dimensions are broadly compatible with video/GPU paths and avoid
  // odd chroma edges while preserving the closest representable display AR.
  outputWidth = std::clamp(outputWidth & ~1, 2, maxWidth);
  outputHeight = std::clamp(outputHeight & ~1, 2, maxHeight);
  return {outputWidth, outputHeight};
}

bool writeFrame(int width, int height, std::uint32_t sequence, const std::uint8_t *pixels, bool waitForRendererAck = true) {
  const std::uint64_t byteCount64 = static_cast<std::uint64_t>(width) * static_cast<std::uint64_t>(height) * 4ULL;
  if (!pixels || byteCount64 > kMaxFrameBytes) return false;
  FrameHeader header{kFrameMagic, static_cast<std::uint32_t>(width), static_cast<std::uint32_t>(height),
    static_cast<std::uint32_t>(width * 4), static_cast<std::uint32_t>(byteCount64), sequence};
  const auto count = static_cast<std::size_t>(byteCount64);
  // Arm renderer backpressure before publishing any bytes. The parent's pipe
  // reader can receive the complete frame and return its ACK immediately; if
  // the flag were set after fflush(), the ACK thread could clear it first and
  // this writer could then leave the native renderer permanently stalled.
  if (waitForRendererAck) g_frameInFlight.store(true, std::memory_order_release);
  if (std::fwrite(&header, sizeof(header), 1, stdout) != 1) {
    if (waitForRendererAck) g_frameInFlight.store(false, std::memory_order_release);
    return false;
  }
  if (std::fwrite(pixels, 1, count, stdout) != count) {
    if (waitForRendererAck) g_frameInFlight.store(false, std::memory_order_release);
    return false;
  }
  std::fflush(stdout);
  return true;
}

bool writeFrame(int width, int height, std::uint32_t sequence, const std::vector<std::uint8_t> &pixels, bool waitForRendererAck = true) {
  return writeFrame(width, height, sequence, pixels.data(), waitForRendererAck);
}

class PixelReadbackRing {
public:
  bool initialize(const GlFunctions &functions, std::size_t byteCount) {
    gl_ = &functions;
    byteCount_ = byteCount;
    if (!gl_->genBuffers || !gl_->bindBuffer || !gl_->bufferData || !gl_->mapBuffer ||
        !gl_->unmapBuffer || !gl_->deleteBuffers) return false;
    gl_->genBuffers(kPboCount, buffers_.data());
    for (GLuint buffer : buffers_) {
      if (!buffer) { destroy(); return false; }
      gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, buffer);
      gl_->bufferData(GL_PIXEL_PACK_BUFFER, static_cast<GLsizeiptr>(byteCount_), nullptr, GL_STREAM_READ);
    }
    gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    enabled_ = true;
    return true;
  }

  bool enqueueReadback(int width, int height, std::uint32_t sequence) {
    if (!enabled_ || pendingCount_ >= kPboCount) return false;
    const GLuint buffer = buffers_[writeIndex_];
    // Storage is allocated once during initialize(). Reallocating it per frame
    // defeats the PBO benefit. glFlush submits the readback so the next native
    // loop can map it without waiting for another decoded video frame.
    gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, buffer);
    glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    fences_[writeIndex_] = gl_->fenceSync
      ? gl_->fenceSync(GL_SYNC_GPU_COMMANDS_COMPLETE, 0)
      : nullptr;
    queuedAt_[writeIndex_] = std::chrono::steady_clock::now();
    gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    glFlush();
    pending_[writeIndex_] = true;
    sequences_[writeIndex_] = sequence;
    writeIndex_ = (writeIndex_ + 1) % kPboCount;
    ++pendingCount_;
    return true;
  }

  bool available() const { return enabled_; }
  bool hasPending() const { return enabled_ && pendingCount_ > 0; }
  bool oldestReady() const {
    if (!hasPending()) return false;
    const void *fence = fences_[readIndex_];
    if (fence && gl_->clientWaitSync) {
      const GLenum status = gl_->clientWaitSync(const_cast<void *>(fence), 0, 0);
      return status != GL_TIMEOUT_EXPIRED;
    }
    // Older OpenGL drivers may not expose ARB_sync. Give the asynchronous
    // PBO readback a few milliseconds before mapping rather than immediately
    // stalling the CPU on the same GL command stream.
    return std::chrono::steady_clock::now() - queuedAt_[readIndex_] >= std::chrono::milliseconds(4);
  }
  bool flushPending(int width, int height) {
    return hasPending() && consumeOldest(width, height);
  }

  void destroy() {
    if (gl_) {
      if (gl_->deleteSync) {
        for (void *fence : fences_) if (fence) gl_->deleteSync(fence);
      }
      if (gl_->deleteBuffers) gl_->deleteBuffers(kPboCount, buffers_.data());
    }
    gl_ = nullptr;
    buffers_.fill(0);
    fences_.fill(nullptr);
    pending_.fill(false);
    pendingCount_ = 0;
    writeIndex_ = 0;
    readIndex_ = 0;
    enabled_ = false;
  }

  ~PixelReadbackRing() { destroy(); }

private:
  bool consumeOldest(int width, int height) {
    if (!pending_[readIndex_]) return false;
    const GLuint buffer = buffers_[readIndex_];
    gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, buffer);
    const auto *pixels = static_cast<const std::uint8_t *>(gl_->mapBuffer(GL_PIXEL_PACK_BUFFER, GL_READ_ONLY));
    if (!pixels) {
      gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, 0);
      return false;
    }
    const bool written = writeFrame(width, height, sequences_[readIndex_], pixels);
    const GLboolean valid = gl_->unmapBuffer(GL_PIXEL_PACK_BUFFER);
    if (fences_[readIndex_] && gl_->deleteSync) gl_->deleteSync(fences_[readIndex_]);
    fences_[readIndex_] = nullptr;
    gl_->bindBuffer(GL_PIXEL_PACK_BUFFER, 0);
    pending_[readIndex_] = false;
    readIndex_ = (readIndex_ + 1) % kPboCount;
    --pendingCount_;
    return written && valid == GL_TRUE;
  }

  const GlFunctions *gl_ = nullptr;
  std::array<GLuint, kPboCount> buffers_{};
  std::array<void *, kPboCount> fences_{};
  std::array<std::chrono::steady_clock::time_point, kPboCount> queuedAt_{};
  std::array<std::uint32_t, kPboCount> sequences_{};
  std::array<bool, kPboCount> pending_{};
  std::size_t byteCount_ = 0;
  int writeIndex_ = 0;
  int readIndex_ = 0;
  int pendingCount_ = 0;
  bool enabled_ = false;
};
} // namespace

std::string jsonEscape(const std::string &value) {
  std::string output;
  for (const unsigned char character : value) {
    if (character == '"' || character == '\\') {
      output.push_back('\\');
      output.push_back(static_cast<char>(character));
    } else if (character == '\n') output += "\\n";
    else if (character == '\r') output += "\\r";
    else if (character >= 0x20) output.push_back(static_cast<char>(character));
  }
  return output;
}

std::string nodeText(const mpv_node *node) {
  if (!node) return {};
  if (node->format == MPV_FORMAT_STRING && node->u.string) return node->u.string;
  if (node->format == MPV_FORMAT_FLAG) return node->u.flag ? "true" : "false";
  if (node->format == MPV_FORMAT_INT64) return std::to_string(node->u.int64);
  if (node->format == MPV_FORMAT_DOUBLE) return std::to_string(node->u.double_);
  return {};
}

int diagnoseCodecs(bool verifyRequired) {
  const std::vector<std::string> required = {
    "h264", "hevc", "av1", "vp8", "vp9", "mpeg1video", "mpeg2video", "mpeg4",
    "vc1", "wmv1", "wmv2", "wmv3", "mjpeg", "prores", "dnxhd", "ffv1", "huffyuv", "theora", "dvvideo",
    "aac", "mp3", "ac3", "eac3", "dca", "truehd", "mlp", "flac", "opus", "vorbis", "alac",
    "ape", "wavpack", "wmav1", "wmav2", "pcm_s16le", "pcm_s24le"
  };
  std::vector<std::string> discovered;
  mpv_handle *mpv = mpv_create();
  if (!mpv) throw std::runtime_error("mpv_create failed.");
  mpv_set_option_string(mpv, "vo", "null");
  mpv_set_option_string(mpv, "audio-display", "no");
  mpv_set_option_string(mpv, "terminal", "no");
  const int initialized = mpv_initialize(mpv);
  if (initialized < 0) {
    const std::string message = mpv_error_string(initialized);
    mpv_terminate_destroy(mpv);
    throw std::runtime_error("mpv_initialize failed: " + message);
  }

  mpv_node result{};
  const int propertyResult = mpv_get_property(mpv, "decoder-list", MPV_FORMAT_NODE, &result);
  if (propertyResult < 0 || result.format != MPV_FORMAT_NODE_ARRAY || !result.u.list) {
    mpv_free_node_contents(&result);
    mpv_terminate_destroy(mpv);
    throw std::runtime_error("libmpv did not expose decoder-list; codec availability cannot be diagnosed.");
  }

  std::cout << "{\"decoders\":[";
  bool first = true;
  const mpv_node_list *list = result.u.list;
  for (int index = 0; index < list->num; ++index) {
    const mpv_node *entry = &list->values[index];
    if (entry->format != MPV_FORMAT_NODE_MAP || !entry->u.list) continue;
    std::string codec, driver, description;
    for (int field = 0; field < entry->u.list->num; ++field) {
      const char *key = entry->u.list->keys[field];
      const std::string value = nodeText(&entry->u.list->values[field]);
      if (!key) continue;
      if (std::strcmp(key, "codec") == 0) codec = value;
      else if (std::strcmp(key, "driver") == 0) driver = value;
      else if (std::strcmp(key, "description") == 0) description = value;
    }
    if (!codec.empty()) discovered.push_back(codec);
    // FFmpeg exposes some decoder aliases as the driver rather than the codec name (e.g. dts / dca).
    if (!driver.empty()) discovered.push_back(driver);
    if (!first) std::cout << ',';
    first = false;
    std::cout << "{\"codec\":\"" << jsonEscape(codec)
      << "\",\"driver\":\"" << jsonEscape(driver)
      << "\",\"description\":\"" << jsonEscape(description) << "\"}";
  }
  std::vector<std::string> missing;
  for (const auto &codec : required) {
    const bool found = std::any_of(discovered.begin(), discovered.end(), [&](const std::string &value) {
      return value == codec;
    });
    if (!found) missing.push_back(codec);
  }
  std::cout << "],\"requiredCodecs\":[";
  for (std::size_t index = 0; index < required.size(); ++index) {
    if (index) std::cout << ',';
    std::cout << "\"" << jsonEscape(required[index]) << "\"";
  }
  std::cout << "],\"missingRequired\":[";
  for (std::size_t index = 0; index < missing.size(); ++index) {
    if (index) std::cout << ',';
    std::cout << "\"" << jsonEscape(missing[index]) << "\"";
  }
  std::cout << "]}\n";
  std::cout.flush();
  mpv_free_node_contents(&result);
  mpv_terminate_destroy(mpv);
  if (verifyRequired && !missing.empty()) return 2;
  return 0;
}

int main(int argc, char **argv) {
#ifdef _WIN32
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stdin), _O_BINARY);
#endif
  std::setvbuf(stdout, nullptr, _IONBF, 0);

  try {
    Options options = parseArguments(argc, argv);
    if (options.diagnoseCodecs || options.verifyRequiredCodecs) return diagnoseCodecs(options.verifyRequiredCodecs);
    emitEvent("phase", "initializing SDL/OpenGL display backend");
    const SdlOpenGLRuntime graphics = initializeSdlOpenGL();
    SDL_Window *window = graphics.window;
    SDL_GLContext glContext = graphics.context;
    emitEvent("sdl-driver", graphics.driver);

    GlFunctions gl;
    if (!loadGlFunctions(gl)) throw std::runtime_error("The OpenGL driver does not provide framebuffer objects.");

    const char *vendorText = reinterpret_cast<const char *>(glGetString(GL_VENDOR));
    const char *rendererText = reinterpret_cast<const char *>(glGetString(GL_RENDERER));
    std::string gpuVendor = vendorText ? vendorText : "unknown";
    std::string gpuRenderer = rendererText ? rendererText : "unknown";
    std::string gpuIdentity = gpuVendor + " " + gpuRenderer;
    std::string gpuLower = gpuIdentity;
    std::transform(gpuLower.begin(), gpuLower.end(), gpuLower.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    const unsigned int logicalCpuCount = std::max(1U, std::thread::hardware_concurrency());
    const bool lowPowerIntel = gpuLower.find("intel") != std::string::npos &&
      (logicalCpuCount <= 4 ||
       gpuLower.find("hd graphics 620") != std::string::npos ||
       gpuLower.find("hd graphics 630") != std::string::npos ||
       gpuLower.find("uhd graphics 600") != std::string::npos ||
       gpuLower.find("uhd graphics 605") != std::string::npos ||
       gpuLower.find("uhd graphics 610") != std::string::npos ||
       gpuLower.find("uhd graphics 615") != std::string::npos ||
       gpuLower.find("uhd graphics 620") != std::string::npos ||
       gpuLower.find("uhd graphics 630") != std::string::npos);
    // Intel integrated GPUs such as HD 620 benefit from an 8-bit presentation
    // target: the Canvas transport is 8-bit anyway, and RGBA16F adds bandwidth
    // without preserving extra output precision across IPC.
    const bool preferFloatFramebuffer = !lowPowerIntel;
    if (lowPowerIntel) {
      // This class of iGPU shares system memory and is commonly paired with
      // 1080p panels. Rendering a 4K RGBA frame only to copy it through IPC
      // wastes bandwidth; decode stays at source resolution, presentation is
      // capped to a full-HD physical viewport on this low-power profile.
      g_deviceMaxOutputWidth = 1920;
      g_deviceMaxOutputHeight = 1080;
      options.width = std::min(options.width, g_deviceMaxOutputWidth);
      options.height = std::min(options.height, g_deviceMaxOutputHeight);
      emitEvent("render-size-cap", "1920x1080-for-integrated-intel");
    }
    emitEvent("gpu-profile", lowPowerIntel ? "intel-integrated-balanced" : "high-quality-gpu");
    emitEvent("gpu-renderer", gpuIdentity);

    // Probe actual render-target precision before configuring libmpv.
    Framebuffer framebuffer;
    if (!framebuffer.resize(gl, options.width, options.height, preferFloatFramebuffer)) {
      throw std::runtime_error("Could not create the initial video output framebuffer.");
    }
    const bool floatFramebufferSupported = framebuffer.internalFormat == GL_RGBA16F;
    emitEvent("framebuffer-format", floatFramebufferSupported ? "rgba16f" : "rgba8-fallback");

    emitEvent("phase", "creating libmpv core");
    mpv_handle *mpv = mpv_create();
    if (!mpv) throw std::runtime_error("mpv_create failed.");
    auto setOption = [mpv](const char *key, const char *value) {
      const int result = mpv_set_option_string(mpv, key, value);
      if (result < 0) throw std::runtime_error(std::string("Could not set MPV option ") + key + ": " + mpv_error_string(result));
    };
    setOption("vo", "libmpv");
#ifdef _WIN32
    // The current libmpv OpenGL render API cannot use zero-copy D3D11VA surfaces.
    // Prefer the copy-back D3D11VA path to offload H.264/HEVC decode from weak
    // CPUs, then retain mpv's safe automatic choices and software fallback.
    setOption("hwdec", "d3d11va-copy,auto-safe");
#else
    setOption("hwdec", "auto-safe");
#endif
    setOption("hwdec-software-fallback", "yes");
    setOption("hwdec-threads", "0");

    // High-quality, color-managed output. The renderer now performs final
    // viewport scaling itself, so the high-quality scaler is applied to both
    // upscaling and downscaling rather than leaving the final upscale to CSS.
    const auto setQualityOption = [mpv](const char *key, const char *value) {
      const int result = mpv_set_option_string(mpv, key, value);
      if (result < 0) {
        emitEvent("quality-option-fallback", std::string(key) + ": " + mpv_error_string(result));
        return false;
      }
      return true;
    };
    if (lowPowerIntel) {
      // Balanced profile for low-power integrated GPUs (e.g. Intel HD 620):
      // retain high-quality reconstruction while avoiding costly EWA sharp,
      // sigmoid, deband and float-FBO passes that commonly cause frame pacing
      // stalls on this class of GPU.
      setQualityOption("scale", "lanczos");
      setQualityOption("cscale", "bilinear");
      setQualityOption("dscale", "mitchell");
      setQualityOption("correct-downscaling", "yes");
      setQualityOption("sigmoid-upscaling", "no");
      setQualityOption("deband", "no");
      setQualityOption("interpolation", "no");
      setQualityOption("video-sync", "audio");
      setQualityOption("framedrop", "vo");
      setQualityOption("vd-lavc-threads", "0");
      emitEvent("video-quality-profile", "low-power-balanced-lanczos-mitchell-rgba8-auto-threads");
    } else {
      setQualityOption("scale", "ewa_lanczossharp");
      setQualityOption("cscale", "spline36");
      setQualityOption("dscale", "mitchell");
      setQualityOption("correct-downscaling", "yes");
      setQualityOption("sigmoid-upscaling", "yes");
      setQualityOption("deband", "yes");
      setQualityOption("deband-iterations", "1");
      setQualityOption("deband-threshold", "48");
      setQualityOption("deband-range", "16");
      setQualityOption("deband-grain", "24");
      if (floatFramebufferSupported) {
        setQualityOption("fbo-format", "rgba16f");
        setQualityOption("linear-downscaling", "yes");
      } else {
        emitEvent("quality-option-fallback", "RGBA16F unavailable; using default libmpv FBO precision and RGBA8 external target");
      }
      emitEvent("video-quality-profile", floatFramebufferSupported
        ? "ewa-lanczossharp-spline36-chroma-mitchell-downscale-deband-rgba16f-sdr-srgb"
        : "ewa-lanczossharp-spline36-chroma-mitchell-downscale-deband-rgba8-sdr-srgb");
    }
    setQualityOption("dither", "fruit");
    setQualityOption("dither-depth", "8");
    setQualityOption("target-prim", "bt.709");
    setQualityOption("target-trc", "srgb");
    setQualityOption("tone-mapping", "bt.2390");
    // 100 nits is too restrictive as a generic SDR target. Let mpv select
    // its standard SDR reference peak (and use HDR metadata where available).
    setQualityOption("target-peak", "auto");
    setQualityOption("hdr-compute-peak", "yes");
    setOption("deinterlace", "auto");
#ifdef __linux__
    // Do not force gpu-hwdec-interop to a backend name. This is a libmpv
    // debugging option whose accepted backend names vary with the linked
    // libmpv build. A hard-coded value such as vaapi-egl can be rejected by
    // valid Fedora builds and abort playback before the renderer is created.
    // Keep libmpv's built-in automatic interop discovery and the safe decoder
    // policy above; unavailable CUDA/VDPAU interops may log warnings but must
    // not prevent VA-API or software fallback from being selected.
    emitEvent("hwdec-interop-policy", "libmpv-default-auto");
#endif
    setOption("audio-display", "no");
    if (options.thumbnail) setOption("ao", "null");
    setOption("osc", "no");
    setOption("input-default-bindings", "no");
    setOption("terminal", "no");
    setOption("sub-auto", "all");
    setOption("sub-visibility", "no");
    setOption("embeddedfonts", "yes");
    setOption("slang", "fa,per,fas,en");
    setOption("alang", "fa,per,fas,en");
    setOption("keep-open", "no");
    setOption("force-window", "no");

    emitEvent("phase", "initializing libmpv core");
    const int initResult = mpv_initialize(mpv);
    if (initResult < 0) throw std::runtime_error(std::string("mpv_initialize failed: ") + mpv_error_string(initResult));

    // mpv 0.41+/2.5 headers expose two fields here; older releases may
    // retain the deprecated third field. Zero-initialize for ABI-safe defaults.
    mpv_opengl_init_params glInit{};
    glInit.get_proc_address = getGlProcAddress;
    glInit.get_proc_address_ctx = nullptr;
    const char *api = MPV_RENDER_API_TYPE_OPENGL;
    mpv_render_param renderParams[] = {
      {MPV_RENDER_PARAM_API_TYPE, const_cast<char *>(api)},
      {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &glInit},
      {MPV_RENDER_PARAM_INVALID, nullptr}
    };
    emitEvent("phase", "creating libmpv OpenGL render context");
    mpv_render_context *renderContext = nullptr;
    const int renderResult = mpv_render_context_create(&renderContext, mpv, renderParams);
    if (renderResult < 0) throw std::runtime_error(std::string("MPV OpenGL renderer init failed: ") + mpv_error_string(renderResult));
    mpv_render_context_set_update_callback(renderContext, mpvUpdate, nullptr);

    if (!options.warmup) {
      emitEvent("phase", "opening media file");
      g_pendingStartTime.store(options.start, std::memory_order_release);
      g_seekOnFileLoaded.store(options.start > 0.01, std::memory_order_release);
      const char *loadArgs[] = {"loadfile", options.file.c_str(), "replace", nullptr};
      const int loadResult = mpv_command(mpv, loadArgs);
      if (loadResult < 0) {
        throw std::runtime_error(std::string("Could not load the selected file: ") + mpv_error_string(loadResult));
      }
    } else {
      emitEvent("phase", "native player warm and waiting for media");
    }

    if (options.thumbnail) {
      emitEvent("phase", "decoding native poster frame");
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(12);
      bool fileLoaded = false;
      bool seekIssued = false;
      bool posterOutputConfigured = false;
      bool frameWritten = false;
      std::vector<std::uint8_t> posterPixels(static_cast<std::size_t>(options.width) * static_cast<std::size_t>(options.height) * 4U);
      std::uint32_t posterSequence = 1;
      while (std::chrono::steady_clock::now() < deadline && !frameWritten) {
        mpv_event *event = mpv_wait_event(mpv, 0.01);
        if (event && event->event_id == MPV_EVENT_FILE_LOADED) {
          fileLoaded = true;
          if (!seekIssued && options.start > 0.01) {
            const std::string startText = std::to_string(options.start);
            const char *seekArgs[] = {"seek", startText.c_str(), "absolute+exact", nullptr};
            const int seekResult = mpv_command(mpv, seekArgs);
            if (seekResult < 0) emitEvent("thumbnail-seek-warning", mpv_error_string(seekResult));
            seekIssued = true;
          }
        } else if (event && event->event_id == MPV_EVENT_END_FILE) {
          throw std::runtime_error("The selected file ended before a video poster frame was decoded.");
        }

        const unsigned int updateFlags = mpv_render_context_update(renderContext);
        if (fileLoaded && (updateFlags & MPV_RENDER_UPDATE_FRAME) != 0U) {
          std::int64_t videoWidth = 0;
          std::int64_t videoHeight = 0;
          if (getDisplayDimensions(mpv, videoWidth, videoHeight)) {
            if (!posterOutputConfigured) {
              const auto outputSize = fitVideoOutputWithinBounds(videoWidth, videoHeight, options.width, options.height);
              if (!framebuffer.resize(gl, outputSize.first, outputSize.second, preferFloatFramebuffer)) {
                throw std::runtime_error("Could not create an aspect-correct native poster framebuffer.");
              }
              posterPixels.assign(static_cast<std::size_t>(framebuffer.width) * static_cast<std::size_t>(framebuffer.height) * 4U, 0);
              emitEvent("thumbnail-output-size", std::to_string(framebuffer.width) + "x" + std::to_string(framebuffer.height));
              emitEvent("framebuffer-format", framebuffer.internalFormat == GL_RGBA16F ? "rgba16f" : "rgba8-fallback");
              posterOutputConfigured = true;
            }
            mpv_opengl_fbo fbo{static_cast<int>(framebuffer.fbo), framebuffer.width, framebuffer.height, static_cast<int>(framebuffer.internalFormat)};
            int flipY = 0;
            mpv_render_param params[] = {
              {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
              {MPV_RENDER_PARAM_FLIP_Y, &flipY},
              {MPV_RENDER_PARAM_INVALID, nullptr}
            };
            mpv_render_context_render(renderContext, params);
            gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.fbo);
            glPixelStorei(GL_PACK_ALIGNMENT, 1);
            glReadPixels(0, 0, framebuffer.width, framebuffer.height, GL_RGBA, GL_UNSIGNED_BYTE, posterPixels.data());
            gl.bindFramebuffer(GL_FRAMEBUFFER, 0);
            frameWritten = writeFrame(framebuffer.width, framebuffer.height, posterSequence++, posterPixels, false);
          }
        }
        SDL_Delay(4);
      }
      if (!frameWritten) throw std::runtime_error("Timed out while decoding a native video poster frame (12 seconds).");
      emitEvent("thumbnail-ready");
      framebuffer.destroy(gl);
      mpv_render_context_set_update_callback(renderContext, nullptr, nullptr);
      mpv_render_context_free(renderContext);
      mpv_terminate_destroy(mpv);
      SDL_GL_DeleteContext(glContext);
      SDL_DestroyWindow(window);
      SDL_Quit();
      return 0;
    }

    std::thread reader(commandReader);
    emitEvent("ready");

    std::vector<std::uint8_t> pixels;
    PixelReadbackRing readback;
    bool asyncReadback = false;
    bool videoOutputConfigured = false;
    emitEvent("frame-readback", "waiting-for-source-dimensions");
    emitEvent("frame-orientation", "native-fbo-readback-no-cpu-row-flip");
    std::uint32_t sequence = 0;
    auto nextState = std::chrono::steady_clock::now();
    auto nextOutputProbe = nextState;
    auto lastFrame = std::chrono::steady_clock::now();
    auto configureVideoOutput = [&]() {
      std::int64_t sourceWidth = 0;
      std::int64_t sourceHeight = 0;
      if (!getDisplayDimensions(mpv, sourceWidth, sourceHeight)) return false;

      const auto outputSize = fitVideoOutputWithinBounds(sourceWidth, sourceHeight, options.width, options.height);
      if (!framebuffer.resize(gl, outputSize.first, outputSize.second, preferFloatFramebuffer)) {
        throw std::runtime_error("Could not create a viewport-resolution, source-aspect-correct video framebuffer.");
      }
      // FBO dimensions match the source display aspect at the full physical
      // viewport resolution. libmpv performs the final quality upscale/downscale.
      readback.destroy();
      pixels.assign(static_cast<std::size_t>(framebuffer.width) * static_cast<std::size_t>(framebuffer.height) * 4U, 0);
      asyncReadback = readback.initialize(gl, pixels.size());
      emitEvent("frame-readback", asyncReadback ? "pixel-buffer-ring" : "synchronous-fallback");
      emitEvent("video-output-size", std::to_string(framebuffer.width) + "x" + std::to_string(framebuffer.height));
      emitEvent("framebuffer-format", framebuffer.internalFormat == GL_RGBA16F ? "rgba16f" : "rgba8-fallback");
      videoOutputConfigured = true;
      return true;
    };

    while (g_running.load(std::memory_order_relaxed)) {
      SDL_Event event;
      while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) g_running.store(false, std::memory_order_relaxed);
      }
      processCommands(mpv);

      // Keep the latest viewport request until source dimensions are known.
      // Fullscreen/ResizeObserver can fire before MPV emits FILE_LOADED.
      const std::uint64_t requestedSize = g_requestedSize.exchange(0, std::memory_order_acq_rel);
      const int requestedWidth = static_cast<int>(requestedSize >> 32U);
      const int requestedHeight = static_cast<int>(requestedSize & 0xffffffffULL);
      if (requestedWidth >= 480 && requestedHeight >= 270 &&
          (requestedWidth != options.width || requestedHeight != options.height)) {
        options.width = std::clamp(requestedWidth, 480, g_deviceMaxOutputWidth);
        options.height = std::clamp(requestedHeight, 270, g_deviceMaxOutputHeight);
        if (videoOutputConfigured) {
          if (configureVideoOutput()) {
            emitEvent("video-output-resized", std::to_string(framebuffer.width) + "x" + std::to_string(framebuffer.height));
            lastFrame = std::chrono::steady_clock::time_point{};
          } else {
            emitEvent("resize-warning", "Could not read source display dimensions while resizing output.");
          }
        }
      }

      while (true) {
        mpv_event *event = mpv_wait_event(mpv, 0.0);
        if (!event || event->event_id == MPV_EVENT_NONE) break;
        if (event->event_id == MPV_EVENT_FILE_LOADED) {
          emitEvent("loaded");
          const std::string activeHwdec = getString(mpv, "hwdec-current", "no");
          emitEvent("hwdec-current", activeHwdec.empty() || activeHwdec == "no" ? "software" : activeHwdec);
          if (!configureVideoOutput()) {
            nextOutputProbe = std::chrono::steady_clock::now() + std::chrono::milliseconds(100);
          } else {
            nextOutputProbe = std::chrono::steady_clock::time_point::max();
          }
          if (g_seekOnFileLoaded.exchange(false, std::memory_order_acq_rel)) {
            const double startTime = g_pendingStartTime.load(std::memory_order_acquire);
            const std::string startText = std::to_string(std::max(0.0, startTime));
            const char *seekArgs[] = {"seek", startText.c_str(), "absolute+exact", nullptr};
            const int seekResult = mpv_command(mpv, seekArgs);
            if (seekResult < 0) emitEvent("error", mpv_error_string(seekResult));
          }
        }
        else if (event->event_id == MPV_EVENT_END_FILE) emitEvent("ended");
        else if (event->event_id == MPV_EVENT_PLAYBACK_RESTART) emitEvent("playing");
        else if (event->event_id == MPV_EVENT_LOG_MESSAGE) {
          const auto *message = static_cast<mpv_event_log_message *>(event->data);
          if (message && message->log_level <= MPV_LOG_LEVEL_WARN) emitEvent("log", message->text ? message->text : "MPV warning");
        }
      }

      const auto now = std::chrono::steady_clock::now();
      if (now >= nextState) {
        emitState(mpv);
        nextState = now + std::chrono::milliseconds(100);
      }

      // Some demuxers/codecs publish the video dimensions shortly after
      // FILE_LOADED. Probe at 10 Hz instead of every 2 ms SDL loop iteration.
      if (!videoOutputConfigured && now >= nextOutputProbe) {
        if (configureVideoOutput()) {
          nextOutputProbe = std::chrono::steady_clock::time_point::max();
        } else {
          nextOutputProbe = now + std::chrono::milliseconds(100);
        }
      }

      // Drain the last PBO on the next native loop, not on the next decoded
      // source frame. This avoids adding one full source-frame of latency and
      // still gives the GPU a loop turn to complete the asynchronous readback.
      if (videoOutputConfigured && g_frameOutputEnabled.load(std::memory_order_acquire) &&
          !g_frameInFlight.load(std::memory_order_acquire) && readback.available() &&
          readback.hasPending() && readback.oldestReady()) {
        if (!readback.flushPending(framebuffer.width, framebuffer.height)) {
          emitEvent("frame-readback", "PBO mapping failed; switching to synchronous readback");
          readback.destroy();
          g_frameDirty.store(true, std::memory_order_release);
        }
      }

      const bool frameInFlight = g_frameInFlight.load(std::memory_order_acquire);
      const bool readbackPending = readback.available() && readback.hasPending();
      // A completed frame may be waiting for its GL fence while the renderer
      // is still free. Do not queue another PBO behind it: that would replay
      // stale frames after ACK and make video visibly trail the audio clock.
      // Keep g_frameDirty set until both the renderer and the single readback
      // slot are free; then render the newest libmpv frame and drop obsolete
      // intermediate updates instead of building a latency queue.
      const bool frameSlotAvailable = !frameInFlight && !readbackPending;
      const bool frameOutputEnabled = g_frameOutputEnabled.load(std::memory_order_acquire);
      const auto frameInterval = std::chrono::milliseconds(1000 / kTargetFps);
      const bool frameDue = now - lastFrame >= frameInterval;
      // Do not clear a dirty update before the pacing interval expires. If we
      // consume it too early, no later decode callback is guaranteed to arrive
      // for a still image or a low-frame-rate source.
      const bool dirty = frameOutputEnabled && frameSlotAvailable && frameDue &&
        g_frameDirty.exchange(false, std::memory_order_acq_rel);
      if (videoOutputConfigured && frameSlotAvailable && dirty) {
        mpv_render_context_update(renderContext);
        mpv_opengl_fbo fbo{static_cast<int>(framebuffer.fbo), framebuffer.width, framebuffer.height, static_cast<int>(framebuffer.internalFormat)};
        int flipY = 0;
        mpv_render_param params[] = {
          {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
          {MPV_RENDER_PARAM_FLIP_Y, &flipY},
          {MPV_RENDER_PARAM_INVALID, nullptr}
        };
        mpv_render_context_render(renderContext, params);
        gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.fbo);
        glPixelStorei(GL_PACK_ALIGNMENT, 1);
        bool frameOk = false;
        if (readback.available()) {
          frameOk = readback.enqueueReadback(framebuffer.width, framebuffer.height, ++sequence);
        } else {
          glReadPixels(0, 0, framebuffer.width, framebuffer.height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
          frameOk = writeFrame(framebuffer.width, framebuffer.height, ++sequence, pixels);
        }
        gl.bindFramebuffer(GL_FRAMEBUFFER, 0);
        if (!frameOk) {
          emitEvent("error", "OpenGL frame readback failed; switching to synchronous transfer.");
          readback.destroy();
          gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.fbo);
          glReadPixels(0, 0, framebuffer.width, framebuffer.height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
          gl.bindFramebuffer(GL_FRAMEBUFFER, 0);
          if (!writeFrame(framebuffer.width, framebuffer.height, sequence, pixels)) {
            g_running.store(false, std::memory_order_relaxed);
          }
        }
        lastFrame = now;
      }
      const bool outputEnabledNow = g_frameOutputEnabled.load(std::memory_order_acquire);
      const bool framePendingNow = g_frameDirty.load(std::memory_order_acquire);
      const bool frameInFlightNow = g_frameInFlight.load(std::memory_order_acquire);
      // Poll quickly only when a decoded frame is waiting to be rendered.
      // During normal wait/backpressure, sleep longer to reduce CPU wakeups.
      SDL_Delay(outputEnabledNow && framePendingNow && !frameInFlightNow ? 1 : (outputEnabledNow ? 4 : 8));
    }

    g_running.store(false, std::memory_order_relaxed);
    if (reader.joinable()) {
      // The Electron host sends quit and closes stdin, releasing getline. Join
      // the command reader before destroying libmpv and the SDL/OpenGL context.
      reader.join();
    }
    readback.destroy();
    framebuffer.destroy(gl);
    mpv_render_context_set_update_callback(renderContext, nullptr, nullptr);
    mpv_render_context_free(renderContext);
    mpv_terminate_destroy(mpv);
    SDL_GL_DeleteContext(glContext);
    SDL_DestroyWindow(window);
    SDL_Quit();
    emitEvent("stopped");
    return 0;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "AURA_FATAL %s\n", error.what());
    std::fflush(stderr);
    emitEvent("error", error.what());
    SDL_Quit();
    return 1;
  }
}
