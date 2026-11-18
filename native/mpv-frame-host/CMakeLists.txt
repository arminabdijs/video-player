cmake_minimum_required(VERSION 3.20)
project(aura_mpv_frame_host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig QUIET)
if (DEFINED ENV{SDL2_DIR} AND NOT "$ENV{SDL2_DIR}" STREQUAL "")
  set(SDL2_DIR "$ENV{SDL2_DIR}" CACHE PATH "SDL2 CMake package directory")
endif()
find_package(SDL2 CONFIG QUIET)
find_package(OpenGL REQUIRED)

if (TARGET SDL2::SDL2)
  set(AURA_SDL_TARGET SDL2::SDL2)
elseif (PkgConfig_FOUND)
  pkg_check_modules(SDL2 REQUIRED IMPORTED_TARGET sdl2)
  set(AURA_SDL_TARGET PkgConfig::SDL2)
else()
  message(FATAL_ERROR "SDL2 development files were not found.")
endif()

if (WIN32)
  set(MPV_INCLUDE_DIR "$ENV{MPV_INCLUDE_DIR}" CACHE PATH "Directory containing mpv/client.h")
  set(MPV_LIBRARY "$ENV{MPV_LIB}" CACHE FILEPATH "Import library for libmpv")
  if (NOT MPV_INCLUDE_DIR OR NOT MPV_LIBRARY)
    message(FATAL_ERROR "Set MPV_INCLUDE_DIR and MPV_LIB for the bundled Windows libmpv SDK.")
  endif()
  add_library(MPV::MPV UNKNOWN IMPORTED)
  set_target_properties(MPV::MPV PROPERTIES
    IMPORTED_LOCATION "${MPV_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${MPV_INCLUDE_DIR}"
  )
else()
  if (NOT PkgConfig_FOUND)
    message(FATAL_ERROR "pkg-config is required to locate libmpv on Linux.")
  endif()
  pkg_check_modules(MPV REQUIRED IMPORTED_TARGET mpv)
  set(MPV_TARGET PkgConfig::MPV)
endif()

add_executable(aura-mpv-frame-host main.cpp)
target_link_libraries(aura-mpv-frame-host PRIVATE ${AURA_SDL_TARGET} OpenGL::GL)
if (WIN32)
  target_link_libraries(aura-mpv-frame-host PRIVATE MPV::MPV)
else()
  target_link_libraries(aura-mpv-frame-host PRIVATE ${MPV_TARGET})
endif()

if (MSVC)
  target_compile_options(aura-mpv-frame-host PRIVATE /W4 /permissive-)
else()
  target_compile_options(aura-mpv-frame-host PRIVATE -Wall -Wextra -Wpedantic -Wconversion)
  set_target_properties(aura-mpv-frame-host PROPERTIES
    BUILD_RPATH_USE_ORIGIN ON
    BUILD_RPATH "$ORIGIN/lib"
    INSTALL_RPATH "$ORIGIN/lib"
  )
endif()

set_target_properties(aura-mpv-frame-host PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/dist"
)

install(TARGETS aura-mpv-frame-host RUNTIME DESTINATION .)
