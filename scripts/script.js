const fileInput = document.getElementById("fileInput");
const uploadSection = document.getElementById("uploadSection");
const uploadBox = document.getElementById("uploadBox");

const playerSection = document.getElementById("playerSection");
const player = document.getElementById("player");
const video = document.getElementById("video");

const controls = document.getElementById("controls");
const centerPlay = document.getElementById("centerPlay");
const playBtn = document.getElementById("playBtn");

const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");

const muteBtn = document.getElementById("muteBtn");
const volumeRange = document.getElementById("volumeRange");

const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");

const progressArea = document.getElementById("progressArea");
const progressTrack = document.getElementById("progressTrack");
const progressBar = document.getElementById("progressBar");
const bufferBar = document.getElementById("bufferBar");
const progressThumb = document.getElementById("progressThumb");

const speedBtn = document.getElementById("speedBtn");
const speedMenu = document.getElementById("speedMenu");
const speedInput = document.getElementById("speedInput");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const speedPreview = document.getElementById("speedPreview");
const applySpeed = document.getElementById("applySpeed");
const closeSpeed = document.getElementById("closeSpeed");

const subtitleBtn = document.getElementById("subtitleBtn");
const subtitleMenu = document.getElementById("subtitleMenu");
const subtitleInput = document.getElementById("subtitleInput");
const subtitleUploadBtn = document.getElementById("subtitleUploadBtn");
const closeSubtitle = document.getElementById("closeSubtitle");
const subtitleToggle = document.getElementById("subtitleToggle");
const subtitleFileName = document.getElementById("subtitleFileName");
const subtitleStatus = document.getElementById("subtitleStatus");
const removeSubtitle = document.getElementById("removeSubtitle");
const subtitleLayer = document.getElementById("subtitleLayer");
const subtitleSize = document.getElementById("subtitleSize");
const subtitleSizeValue = document.getElementById("subtitleSizeValue");
const subtitlePosition = document.getElementById("subtitlePosition");
const subtitlePositionValue = document.getElementById("subtitlePositionValue");

const pipBtn = document.getElementById("pipBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const changeFileHeader = document.getElementById("changeFileHeader");
const changeFileTop = document.getElementById("changeFileTop");

const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const videoResolution = document.getElementById("videoResolution");
const topFileName = document.getElementById("topFileName");

const videoLoading = document.getElementById("videoLoading");

const MIN_SPEED = 0.1;
const MAX_SPEED = 16;
const SEEK_STEP = 10;
const HIDE_DELAY = 2500;

let objectUrl = null;
let controlsTimer = null;
let progressDragging = false;
let activityFrame = null;
let lastVolume = 1;

let subtitles = [];
let subtitleEnabled = false;
let subtitleFile = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return [String(hours).padStart(2, "0"), String(minutes).padStart(2, "0"), String(secs).padStart(2, "0")].join(":");
  }

  return [String(minutes).padStart(2, "0"), String(secs).padStart(2, "0")].join(":");
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];

  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function cleanSpeed(value) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return clamp(parsed, MIN_SPEED, MAX_SPEED);
}

function formatSpeed(value) {
  const speed = cleanSpeed(value);

  if (Number.isInteger(speed)) {
    return `${speed}x`;
  }

  return `${Number(speed.toFixed(2))}x`;
}

function updateSpeedUI(value) {
  const speed = cleanSpeed(value);

  speedInput.value = speed;
  speedRange.value = speed;
  speedValue.textContent = formatSpeed(speed);
  speedPreview.textContent = Number(speed.toFixed(2));
}

function setPlaybackRate(value) {
  const speed = cleanSpeed(value);

  video.playbackRate = speed;

  if ("preservesPitch" in video) {
    video.preservesPitch = true;
  }

  if ("mozPreservesPitch" in video) {
    video.mozPreservesPitch = true;
  }

  if ("webkitPreservesPitch" in video) {
    video.webkitPreservesPitch = true;
  }

  updateSpeedUI(speed);
}

function isVideoFile(file) {
  if (!file) {
    return false;
  }

  if (file.type?.startsWith("video/")) {
    return true;
  }

  return /\.(mp4|webm|mkv|mov|avi|m4v|ogv|ogg|mpeg|mpg|3gp)$/i.test(file.name);
}

function isSubtitleFile(file) {
  if (!file) {
    return false;
  }

  return /\.(srt|vtt)$/i.test(file.name);
}

function openFilePicker() {
  fileInput.value = "";
  fileInput.click();
}

function loadFile(file) {
  if (!file || !isVideoFile(file)) {
    return;
  }

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  video.pause();

  objectUrl = URL.createObjectURL(file);

  video.removeAttribute("src");
  video.load();

  video.src = objectUrl;
  video.load();

  uploadSection.style.display = "none";
  playerSection.classList.add("active");

  fileName.textContent = file.name;
  topFileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  videoResolution.textContent = "-";

  currentTime.textContent = "00:00";
  duration.textContent = "00:00";

  progressBar.style.width = "0%";
  bufferBar.style.width = "0%";
  progressThumb.style.left = "0%";

  player.classList.remove("playing");
  player.classList.add("paused");
  player.classList.remove("controls-hidden");

  setPlaybackRate(1);
  updatePiPSupport();
  showControls();
}

function resetSubtitles() {
  subtitles = [];
  subtitleEnabled = false;
  subtitleFile = null;

  subtitleLayer.innerHTML = "";
  subtitleLayer.classList.add("hidden");

  subtitleToggle.classList.remove("active");
  subtitleToggle.setAttribute("aria-pressed", "false");

  subtitleBtn.classList.remove("active");

  subtitleFileName.textContent = "زیرنویسی انتخاب نشده";

  subtitleStatus.textContent = "زیرنویس خاموش است";

  subtitleInput.value = "";
}

async function loadSubtitle(file) {
  if (!file || !isSubtitleFile(file)) {
    return;
  }

  try {
    const text = await file.text();

    let parsed;

    if (/\.vtt$/i.test(file.name)) {
      parsed = parseVTT(text);
    } else {
      parsed = parseSRT(text);
    }

    if (!parsed.length) {
      subtitleFileName.textContent = "زیرنویس قابل خواندن نیست";

      subtitleStatus.textContent = "فایل فاقد Cue معتبر است";

      return;
    }

    subtitles = parsed;
    subtitleFile = file;

    subtitleFileName.textContent = file.name;
    subtitleStatus.textContent = `${parsed.length} بخش زیرنویس`;

    subtitleEnabled = true;

    subtitleToggle.classList.add("active");
    subtitleToggle.setAttribute("aria-pressed", "true");

    subtitleBtn.classList.add("active");

    updateSubtitle();
  } catch {
    subtitleFileName.textContent = "خطا در خواندن زیرنویس";

    subtitleStatus.textContent = "فایل قابل پردازش نیست";
  }
}

function parseTimestamp(value) {
  const clean = value.trim().replace(",", ".");

  const parts = clean.split(":");

  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return NaN;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return NaN;
    }

    return minutes * 60 + seconds;
  }

  return NaN;
}

function cleanSubtitleText(text) {
  return text
    .replace(/\{\\.*?\}/g, "")
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "")
    .replace(/<i>/gi, "")
    .replace(/<\/i>/gi, "")
    .replace(/<b>/gi, "")
    .replace(/<\/b>/gi, "")
    .replace(/<u>/gi, "")
    .replace(/<\/u>/gi, "")
    .trim();
}

function parseSRT(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const result = [];

  for (const block of blocks) {
    const lines = block.split("\n");

    const timeIndex = lines.findIndex((line) => line.includes("-->"));

    if (timeIndex === -1) {
      continue;
    }

    const timing = lines[timeIndex].split("-->").map((value) => value.trim());

    if (timing.length !== 2) {
      continue;
    }

    const start = parseTimestamp(timing[0].split(/\s+/)[0]);

    const end = parseTimestamp(timing[1].split(/\s+/)[0]);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const subtitleText = cleanSubtitleText(lines.slice(timeIndex + 1).join("\n"));

    if (!subtitleText) {
      continue;
    }

    result.push({
      start,
      end,
      text: subtitleText,
    });
  }

  return result.sort((a, b) => a.start - b.start);
}

function parseVTT(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const result = [];

  for (const block of blocks) {
    if (block === "WEBVTT" || block.startsWith("WEBVTT\n")) {
      continue;
    }

    const lines = block.split("\n");

    const timeIndex = lines.findIndex((line) => line.includes("-->"));

    if (timeIndex === -1) {
      continue;
    }

    const timing = lines[timeIndex].split("-->").map((value) => value.trim());

    if (timing.length !== 2) {
      continue;
    }

    const start = parseTimestamp(timing[0].split(/\s+/)[0]);

    const end = parseTimestamp(timing[1].split(/\s+/)[0]);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const subtitleText = cleanSubtitleText(lines.slice(timeIndex + 1).join("\n"));

    if (!subtitleText) {
      continue;
    }

    result.push({
      start,
      end,
      text: subtitleText,
    });
  }

  return result.sort((a, b) => a.start - b.start);
}

function findSubtitleIndex(time) {
  let low = 0;
  let high = subtitles.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = subtitles[mid];

    if (time < item.start) {
      high = mid - 1;
    } else if (time > item.end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

let currentSubtitleIndex = -1;

function updateSubtitle() {
  if (!subtitleEnabled || !subtitles.length || !Number.isFinite(video.currentTime)) {
    subtitleLayer.classList.add("hidden");
    currentSubtitleIndex = -1;
    return;
  }

  const index = findSubtitleIndex(video.currentTime);

  if (index === currentSubtitleIndex) {
    return;
  }

  currentSubtitleIndex = index;

  if (index === -1) {
    subtitleLayer.classList.add("hidden");
    subtitleLayer.innerHTML = "";
    return;
  }

  const item = subtitles[index];

  subtitleLayer.innerHTML = "";

  const element = document.createElement("div");

  element.className = "subtitle-text";
  element.textContent = item.text;

  subtitleLayer.appendChild(element);
  subtitleLayer.classList.remove("hidden");

  updateSubtitleStyle();
}

function updateSubtitleStyle() {
  const size = Number(subtitleSize.value);

  const position = Number(subtitlePosition.value);

  subtitleSizeValue.textContent = `${size}%`;

  subtitlePositionValue.textContent = `${position}%`;

  subtitleLayer.style.bottom = `${position}%`;

  const element = subtitleLayer.querySelector(".subtitle-text");

  if (element) {
    element.style.fontSize = `calc(clamp(14px, 2.1vw, 28px) * ${size / 100})`;
  }
}

function toggleSubtitle() {
  if (!subtitles.length) {
    subtitleInput.click();
    return;
  }

  subtitleEnabled = !subtitleEnabled;

  subtitleToggle.classList.toggle("active", subtitleEnabled);

  subtitleToggle.setAttribute("aria-pressed", String(subtitleEnabled));

  subtitleBtn.classList.toggle("active", subtitleEnabled);

  subtitleStatus.textContent = subtitleEnabled ? `${subtitles.length} بخش زیرنویس · فعال` : `${subtitles.length} بخش زیرنویس · خاموش`;

  currentSubtitleIndex = -1;

  updateSubtitle();
}

function removeSubtitleFile() {
  resetSubtitles();
}

async function togglePlay() {
  if (!video.src) {
    return;
  }

  if (video.paused || video.ended) {
    try {
      await video.play();
    } catch {
      showControls();
    }
  } else {
    video.pause();
  }
}

function updatePlayState() {
  if (video.paused || video.ended) {
    player.classList.remove("playing");
    player.classList.add("paused");
    showControls();
    return;
  }

  player.classList.remove("paused");
  player.classList.add("playing");
  scheduleHideControls();
}

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) {
    return;
  }

  video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);

  updateSubtitle();
  showControls();
}

function updateProgress() {
  const current = video.currentTime || 0;

  const total = video.duration || 0;

  currentTime.textContent = formatTime(current);

  duration.textContent = formatTime(total);

  if (!total) {
    progressBar.style.width = "0%";
    progressThumb.style.left = "0%";
    return;
  }

  const percent = clamp((current / total) * 100, 0, 100);

  progressBar.style.width = `${percent}%`;

  progressThumb.style.left = `${percent}%`;
}

function updateBuffered() {
  if (!Number.isFinite(video.duration) || !video.buffered.length) {
    bufferBar.style.width = "0%";
    return;
  }

  let bufferedEnd = 0;

  for (let i = 0; i < video.buffered.length; i++) {
    if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
      bufferedEnd = video.buffered.end(i);

      break;
    }
  }

  if (!bufferedEnd) {
    bufferedEnd = video.buffered.end(video.buffered.length - 1);
  }

  const percent = clamp((bufferedEnd / video.duration) * 100, 0, 100);

  bufferBar.style.width = `${percent}%`;
}

function updateProgressFromPointer(clientX) {
  const rect = progressTrack.getBoundingClientRect();

  if (!rect.width || !Number.isFinite(video.duration)) {
    return;
  }

  const percent = clamp((clientX - rect.left) / rect.width, 0, 1);

  const time = percent * video.duration;

  const percentValue = percent * 100;

  video.currentTime = time;

  progressBar.style.width = `${percentValue}%`;

  progressThumb.style.left = `${percentValue}%`;

  currentTime.textContent = formatTime(time);

  updateSubtitle();
}

function toggleMute() {
  if (video.muted || video.volume === 0) {
    video.muted = false;
    video.volume = lastVolume || 1;
  } else {
    lastVolume = video.volume;
    video.muted = true;
  }

  updateVolumeUI();
  showControls();
}

function setVolume(value) {
  const volume = clamp(Number(value), 0, 1);

  if (volume > 0) {
    lastVolume = volume;
  }

  video.volume = volume;
  video.muted = volume === 0;

  updateVolumeUI();
  showControls();
}

function updateVolumeUI() {
  const muted = video.muted || video.volume === 0;

  muteBtn.parentElement.classList.toggle("muted", muted);

  if (!muted) {
    volumeRange.value = video.volume;
  }
}

function getViewport() {
  if (window.visualViewport) {
    return {
      width: visualViewport.width,
      height: visualViewport.height,
      offsetLeft: visualViewport.offsetLeft,
      offsetTop: visualViewport.offsetTop,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  };
}

function positionMenu(menu, button) {
  if (!menu.classList.contains("open")) {
    return;
  }

  const buttonRect = button.getBoundingClientRect();

  const menuWidth = menu.offsetWidth;

  const menuHeight = menu.offsetHeight;

  const viewport = getViewport();

  const gap = 10;
  const padding = 8;

  let left = buttonRect.left + buttonRect.width / 2 - menuWidth / 2 + viewport.offsetLeft;

  left = clamp(left, viewport.offsetLeft + padding, viewport.offsetLeft + viewport.width - menuWidth - padding);

  let top = buttonRect.top - menuHeight - gap + viewport.offsetTop;

  if (top < viewport.offsetTop + padding) {
    top = buttonRect.bottom + gap + viewport.offsetTop;
  }

  if (top + menuHeight > viewport.offsetTop + viewport.height - padding) {
    top = viewport.offsetTop + Math.max(padding, viewport.height - menuHeight - padding);
  }

  menu.style.left = `${left}px`;

  menu.style.top = `${top}px`;
}

function positionSpeedMenu() {
  positionMenu(speedMenu, speedBtn);
}

function positionSubtitleMenu() {
  positionMenu(subtitleMenu, subtitleBtn);
}

function openSpeedMenu() {
  closeSubtitleMenu();

  speedMenu.classList.add("open");

  speedBtn.classList.add("active");

  speedBtn.setAttribute("aria-expanded", "true");

  clearControlsTimer();

  controls.classList.remove("hidden");

  requestAnimationFrame(() => {
    positionSpeedMenu();
    speedInput.focus();
    speedInput.select();
  });
}

function closeSpeedMenu() {
  speedMenu.classList.remove("open");

  speedBtn.classList.remove("active");

  speedBtn.setAttribute("aria-expanded", "false");

  speedMenu.style.left = "";
  speedMenu.style.top = "";

  if (!video.paused) {
    scheduleHideControls();
  }
}

function toggleSpeedMenu() {
  if (speedMenu.classList.contains("open")) {
    closeSpeedMenu();
  } else {
    openSpeedMenu();
  }
}

function applySelectedSpeed() {
  const speed = cleanSpeed(speedInput.value);

  setPlaybackRate(speed);
  closeSpeedMenu();
  showControls();
}

function updateSpeedFromRange() {
  updateSpeedUI(speedRange.value);
}

function openSubtitleMenu() {
  closeSpeedMenu();

  subtitleMenu.classList.add("open");

  subtitleBtn.classList.add("active");

  subtitleBtn.setAttribute("aria-expanded", "true");

  clearControlsTimer();

  controls.classList.remove("hidden");

  requestAnimationFrame(() => {
    positionSubtitleMenu();
  });
}

function closeSubtitleMenu() {
  subtitleMenu.classList.remove("open");

  subtitleBtn.setAttribute("aria-expanded", "false");

  subtitleMenu.style.left = "";
  subtitleMenu.style.top = "";

  if (!subtitleEnabled) {
    subtitleBtn.classList.remove("active");
  }

  if (!video.paused) {
    scheduleHideControls();
  }
}

function toggleSubtitleMenu() {
  if (subtitleMenu.classList.contains("open")) {
    closeSubtitleMenu();
  } else {
    openSubtitleMenu();
  }
}

function isFullscreen() {
  return document.fullscreenElement === player || document.webkitFullscreenElement === player;
}

async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }

      return;
    }

    if (player.requestFullscreen) {
      await player.requestFullscreen();
      return;
    }

    if (player.webkitRequestFullscreen) {
      player.webkitRequestFullscreen();
    }
  } catch {}
}

function updateFullscreenState() {
  player.classList.toggle("is-fullscreen", isFullscreen());
}

function isPiPSupported() {
  return Boolean(document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function");
}

function updatePiPSupport() {
  const supported = isPiPSupported() && Boolean(video.src);

  pipBtn.disabled = !supported;

  pipBtn.style.display = supported ? "" : "none";
}

async function togglePiP() {
  if (!isPiPSupported() || !video.src) {
    return;
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    await video.requestPictureInPicture();
  } catch {}
}

function clearControlsTimer() {
  if (controlsTimer) {
    clearTimeout(controlsTimer);
    controlsTimer = null;
  }
}

function scheduleHideControls() {
  clearControlsTimer();

  if (video.paused || video.ended || speedMenu.classList.contains("open") || subtitleMenu.classList.contains("open")) {
    return;
  }

  controlsTimer = setTimeout(() => {
    if (!video.paused && !video.ended && !speedMenu.classList.contains("open") && !subtitleMenu.classList.contains("open")) {
      controls.classList.add("hidden");
      player.classList.add("controls-hidden");
    }
  }, HIDE_DELAY);
}

function showControls() {
  controls.classList.remove("hidden");
  player.classList.remove("controls-hidden");

  clearControlsTimer();

  if (!video.paused && !video.ended) {
    scheduleHideControls();
  }
}

function handleActivity() {
  if (activityFrame) {
    return;
  }

  activityFrame = requestAnimationFrame(() => {
    activityFrame = null;

    controls.classList.remove("hidden");

    player.classList.remove("controls-hidden");

    clearControlsTimer();

    if (!video.paused && !video.ended && !speedMenu.classList.contains("open") && !subtitleMenu.classList.contains("open")) {
      scheduleHideControls();
    }
  });
}

function handlePlayerClick(event) {
  if (event.target.closest(".controls") || event.target.closest(".player-top") || event.target.closest(".center-play") || event.target.closest(".subtitle-layer")) {
    return;
  }

  if (controls.classList.contains("hidden")) {
    showControls();
    return;
  }

  togglePlay();
}

function updateResolution() {
  if (video.videoWidth && video.videoHeight) {
    videoResolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
  }
}

uploadBox.addEventListener("click", openFilePicker);

uploadBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (file) {
    loadFile(file);
  }
});

changeFileHeader.addEventListener("click", openFilePicker);

changeFileTop.addEventListener("click", (event) => {
  event.stopPropagation();
  openFilePicker();
});

uploadBox.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadBox.classList.add("dragging");
});

uploadBox.addEventListener("dragleave", (event) => {
  if (!uploadBox.contains(event.relatedTarget)) {
    uploadBox.classList.remove("dragging");
  }
});

uploadBox.addEventListener("drop", (event) => {
  event.preventDefault();

  uploadBox.classList.remove("dragging");

  const files = event.dataTransfer.files;

  if (!files?.length) {
    return;
  }

  const videoFile = Array.from(files).find(isVideoFile);

  const subtitle = Array.from(files).find(isSubtitleFile);

  if (videoFile) {
    loadFile(videoFile);
  }

  if (subtitle) {
    loadSubtitle(subtitle);
  }
});

playBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePlay();
});

centerPlay.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePlay();
});

backBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  seekBy(-SEEK_STEP);
});

forwardBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  seekBy(SEEK_STEP);
});

muteBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMute();
});

volumeRange.addEventListener("input", (event) => {
  setVolume(event.target.value);
});

speedBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSpeedMenu();
});

speedMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

closeSpeed.addEventListener("click", closeSpeedMenu);

speedRange.addEventListener("input", updateSpeedFromRange);

speedInput.addEventListener("input", () => {
  const value = Number.parseFloat(speedInput.value);

  if (Number.isFinite(value)) {
    const cleanValue = clamp(value, MIN_SPEED, MAX_SPEED);

    speedRange.value = cleanValue;

    speedPreview.textContent = Number(cleanValue.toFixed(2));
  }
});

speedInput.addEventListener("blur", () => {
  const speed = cleanSpeed(speedInput.value);

  updateSpeedUI(speed);
});

speedInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applySelectedSpeed();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeSpeedMenu();
  }
});

applySpeed.addEventListener("click", applySelectedSpeed);

subtitleBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSubtitleMenu();
});

subtitleMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

subtitleUploadBtn.addEventListener("click", () => {
  subtitleInput.value = "";
  subtitleInput.click();
});

subtitleInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (file) {
    loadSubtitle(file);
  }
});

closeSubtitle.addEventListener("click", closeSubtitleMenu);

subtitleToggle.addEventListener("click", toggleSubtitle);

removeSubtitle.addEventListener("click", removeSubtitleFile);

subtitleSize.addEventListener("input", updateSubtitleStyle);

subtitlePosition.addEventListener("input", updateSubtitleStyle);

pipBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePiP();
});

fullscreenBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleFullscreen();
});

progressArea.addEventListener("pointerdown", (event) => {
  if (!Number.isFinite(video.duration)) {
    return;
  }

  progressDragging = true;

  progressArea.classList.add("dragging");

  try {
    progressArea.setPointerCapture(event.pointerId);
  } catch {}

  updateProgressFromPointer(event.clientX);

  showControls();
});

progressArea.addEventListener("pointermove", (event) => {
  if (!progressDragging) {
    return;
  }

  updateProgressFromPointer(event.clientX);
});

function stopProgressDragging(event) {
  if (!progressDragging) {
    return;
  }

  progressDragging = false;

  progressArea.classList.remove("dragging");

  try {
    progressArea.releasePointerCapture(event.pointerId);
  } catch {}

  showControls();
}

progressArea.addEventListener("pointerup", stopProgressDragging);

progressArea.addEventListener("pointercancel", stopProgressDragging);

player.addEventListener("click", handlePlayerClick);

player.addEventListener("pointermove", handleActivity);

player.addEventListener("pointerdown", handleActivity);

player.addEventListener("touchstart", handleActivity, { passive: true });

player.addEventListener("mouseleave", () => {
  if (!video.paused && !speedMenu.classList.contains("open") && !subtitleMenu.classList.contains("open")) {
    clearControlsTimer();

    controlsTimer = setTimeout(() => {
      controls.classList.add("hidden");
      player.classList.add("controls-hidden");
    }, 700);
  }
});

video.addEventListener("play", updatePlayState);

video.addEventListener("playing", () => {
  videoLoading.classList.remove("active");

  updatePlayState();
});

video.addEventListener("pause", () => {
  videoLoading.classList.remove("active");

  updatePlayState();
});

video.addEventListener("ended", () => {
  videoLoading.classList.remove("active");

  updatePlayState();

  video.currentTime = 0;

  updateProgress();
  updateSubtitle();
});

video.addEventListener("waiting", () => {
  videoLoading.classList.add("active");
});

video.addEventListener("stalled", () => {
  videoLoading.classList.add("active");
});

video.addEventListener("canplay", () => {
  videoLoading.classList.remove("active");
});

video.addEventListener("loadedmetadata", () => {
  duration.textContent = formatTime(video.duration);

  updateResolution();
  updateProgress();
  updateBuffered();
  updatePiPSupport();
  updateSubtitle();
});

video.addEventListener("durationchange", () => {
  duration.textContent = formatTime(video.duration);
});

video.addEventListener("timeupdate", () => {
  updateProgress();
  updateSubtitle();
});

video.addEventListener("progress", updateBuffered);

video.addEventListener("volumechange", updateVolumeUI);

video.addEventListener("ratechange", () => {
  if (video.playbackRate >= MIN_SPEED && video.playbackRate <= MAX_SPEED) {
    updateSpeedUI(video.playbackRate);
  }
});

video.addEventListener("enterpictureinpicture", () => {
  pipBtn.classList.add("active");
});

video.addEventListener("leavepictureinpicture", () => {
  pipBtn.classList.remove("active");
});

document.addEventListener("fullscreenchange", updateFullscreenState);

document.addEventListener("webkitfullscreenchange", updateFullscreenState);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".speed-wrapper")) {
    closeSpeedMenu();
  }

  if (!event.target.closest(".subtitle-wrapper")) {
    closeSubtitleMenu();
  }
});

window.addEventListener("resize", () => {
  positionSpeedMenu();
  positionSubtitleMenu();
});

window.addEventListener(
  "scroll",
  () => {
    positionSpeedMenu();
    positionSubtitleMenu();
  },
  { passive: true },
);

if (window.visualViewport) {
  visualViewport.addEventListener("resize", () => {
    positionSpeedMenu();
    positionSubtitleMenu();
  });

  visualViewport.addEventListener("scroll", () => {
    positionSpeedMenu();
    positionSubtitleMenu();
  });
}

document.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;

  const tag = activeElement?.tagName;

  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    if (event.key === "Escape") {
      closeSpeedMenu();
      closeSubtitleMenu();
    }

    return;
  }

  if (!video.src) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case " ":
    case "k":
      event.preventDefault();
      togglePlay();
      break;

    case "arrowleft":
      event.preventDefault();
      seekBy(-SEEK_STEP);
      break;

    case "arrowright":
      event.preventDefault();
      seekBy(SEEK_STEP);
      break;

    case "arrowup":
      event.preventDefault();
      setVolume(video.volume + 0.05);
      break;

    case "arrowdown":
      event.preventDefault();
      setVolume(video.volume - 0.05);
      break;

    case "m":
      event.preventDefault();
      toggleMute();
      break;

    case "f":
      event.preventDefault();
      toggleFullscreen();
      break;

    case "c":
      event.preventDefault();
      toggleSubtitle();
      break;

    case "escape":
      closeSpeedMenu();
      closeSubtitleMenu();
      break;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearControlsTimer();
  } else if (!video.paused) {
    showControls();
  }
});

window.addEventListener("beforeunload", () => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
});

video.volume = 1;
video.muted = false;

updateVolumeUI();
updateSpeedUI(1);
updateSubtitleStyle();
updatePiPSupport();
resetSubtitles();
