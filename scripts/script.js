/**
 * Aura Material Video Player - Clean & Safe Engine
 */

const explorerView = document.getElementById("explorerView");
const playerWorkspace = document.getElementById("playerWorkspace");
const foldersContainer = document.getElementById("foldersContainer");
const videoCounter = document.getElementById("videoCounter");
const searchInput = document.getElementById("searchInput");
const searchFieldBox = document.getElementById("searchFieldBox");
const dropZone = document.getElementById("dropZone");

const openFolderBtn = document.getElementById("openFolderBtn");
const explorerActions = document.getElementById("explorerActions");
const topBackBtn = document.getElementById("topBackBtn");

const singleFileBtn = document.getElementById("singleFileBtn");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
const subtitleInput = document.getElementById("subtitleInput");

const playerStage = document.getElementById("player");
const video = document.getElementById("video");
const playBtn = document.getElementById("playBtn");
const centerPlay = document.getElementById("centerPlay");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const prevVideoBtn = document.getElementById("prevVideoBtn");
const nextVideoBtn = document.getElementById("nextVideoBtn");
const toggleDrawerBtn = document.getElementById("toggleDrawerBtn");

const progressBar = document.getElementById("progressBar");
const bufferBar = document.getElementById("bufferBar");
const progressArea = document.getElementById("progressArea");
const progressThumb = document.getElementById("progressThumb");
const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");

const subtitleLayer = document.getElementById("subtitleLayer");

const subBtn = document.getElementById("subtitleBtn");
const subtitleMenu = document.getElementById("subtitleMenu");
const closeSubtitle = document.getElementById("closeSubtitle");
const subtitleToggle = document.getElementById("subtitleToggle");
const subBgToggleBtn = document.getElementById("subBgToggleBtn");
const subtitleFileName = document.getElementById("subtitleFileName");
const subtitleStatus = document.getElementById("subtitleStatus");
const removeSubtitle = document.getElementById("removeSubtitle");
const subtitleUploadBtn = document.getElementById("subtitleUploadBtn");
const subtitleSize = document.getElementById("subtitleSize");
const subtitleSizeValue = document.getElementById("subtitleSizeValue");
const subtitlePosition = document.getElementById("subtitlePosition");
const subtitlePositionValue = document.getElementById("subtitlePositionValue");

const speedBtn = document.getElementById("speedBtn");
const speedMenu = document.getElementById("speedMenu");
const closeSpeed = document.getElementById("closeSpeed");
const speedInput = document.getElementById("speedInput");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const speedPreview = document.getElementById("speedPreview");
const applySpeed = document.getElementById("applySpeed");

const volumeSlider = document.getElementById("volumeRange");
const muteBtn = document.getElementById("muteBtn");
const pipBtn = document.getElementById("pipBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const videoLoader = document.getElementById("videoLoader");

const seekLeftFeedback = document.getElementById("seekLeftFeedback");
const seekRightFeedback = document.getElementById("seekRightFeedback");

const livePlaylistDrawer = document.getElementById("livePlaylistDrawer");
const drawerVideosList = document.getElementById("drawerVideosList");
const drawerFolderTitle = document.getElementById("drawerFolderTitle");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");

const MIN_SPEED = 0.1;
const MAX_SPEED = 16;
const SEEK_STEP = 10;
const HIDE_DELAY = 2500;

let library = [];
let flatPlaylist = [];
let currentPlaylistIndex = -1;
let currentFolderVideos = [];
let subtitles = [];
let subtitleEnabled = true;
let subtitleFile = null;
let controlsTimer = null;
let activeObjectURL = null;
let activeFilter = "all";

const VIDEO_REGEX = /\.(mp4|webm|mkv|mov|avi|m4v|ts)$/i;
const SUB_REGEX = /\.(srt|vtt)$/i;

const savedVolume = localStorage.getItem("aura_volume");
if (savedVolume !== null) {
  video.volume = parseFloat(savedVolume);
  volumeSlider.value = video.volume;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeName(filename) {
  return filename
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[._\-+]/g, " ")
    .replace(/\b(1080p|720p|480p|2160p|4k|bluray|web-dl|x264|x265|hevc|aac|farsi|persian)\b/gi, "")
    .trim();
}

// -------------------------------------------------------------
// LAZY POSTER GENERATOR
// -------------------------------------------------------------
const thumbObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const card = entry.target;
        const file = card._videoFile;
        if (file && !card._thumbnailLoaded) {
          card._thumbnailLoaded = true;
          observer.unobserve(card);
          loadPosterForCard(card, file);
        }
      }
    });
  },
  { rootMargin: "150px" },
);

function loadPosterForCard(card, file) {
  const wrapper = card.querySelector(".poster-thumb-wrapper");
  if (!wrapper) return;

  const videoElem = document.createElement("video");
  videoElem.preload = "metadata";
  videoElem.muted = true;
  videoElem.playsInline = true;
  const url = URL.createObjectURL(file);
  videoElem.src = url;

  videoElem.addEventListener("loadeddata", () => {
    videoElem.currentTime = Math.min(1.5, videoElem.duration * 0.1 || 0.5);
  });

  videoElem.addEventListener("seeked", () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 280;
      canvas.height = 158;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
      const placeholder = wrapper.querySelector("svg");
      if (placeholder) placeholder.remove();
      wrapper.appendChild(canvas);
    } catch (e) {}
    URL.revokeObjectURL(url);
    videoElem.remove();
  });

  videoElem.addEventListener("error", () => {
    URL.revokeObjectURL(url);
    videoElem.remove();
  });
}

// -------------------------------------------------------------
// FOLDER PICKER HANDLER & UI SWITCHING
// -------------------------------------------------------------
function handleDirectoryPicker() {
  if (folderInput) {
    folderInput.click();
  }
}

if (folderInput) {
  folderInput.addEventListener("change", (e) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const fileEntries = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const pathParts = file.webkitRelativePath ? file.webkitRelativePath.split("/") : [];
      const folderName = pathParts.length > 1 ? pathParts[0] : "پوشه ویدیوها";
      fileEntries.push({ file, folder: folderName });
    }

    processScannedFiles(fileEntries);
    returnToExplorer(false);
    folderInput.value = "";
  });
}

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const items = e.dataTransfer.items;
  const filesMap = [];

  async function traverseEntry(entry, path = "پوشه دراگی") {
    if (entry.isFile) {
      const file = await new Promise((res) => entry.file(res));
      filesMap.push({ file, folder: path });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = async () => {
        let entries = [];
        let batch;
        do {
          batch = await new Promise((res) => reader.readEntries(res));
          entries.push(...batch);
        } while (batch.length > 0);
        return entries;
      };
      const children = await readAll();
      for (const child of children) {
        await traverseEntry(child, entry.name);
      }
    }
  }

  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          await traverseEntry(entry);
        } else {
          const file = item.getAsFile();
          if (file) filesMap.push({ file, folder: "فایل‌های دراگی" });
        }
      }
    }
  } else if (e.dataTransfer.files) {
    for (const file of e.dataTransfer.files) {
      filesMap.push({ file, folder: "فایل‌های دراگی" });
    }
  }

  if (filesMap.length > 0) {
    processScannedFiles(filesMap);
  }
});

function processScannedFiles(fileList) {
  const videoFiles = [];
  const subtitleFiles = [];

  fileList.forEach(({ file, folder }) => {
    if (VIDEO_REGEX.test(file.name)) {
      videoFiles.push({ file, folder, cleanName: normalizeName(file.name), baseName: file.name.replace(/\.[^/.]+$/, "") });
    } else if (SUB_REGEX.test(file.name)) {
      subtitleFiles.push({ file, folder, cleanName: normalizeName(file.name), baseName: file.name.replace(/\.[^/.]+$/, "") });
    }
  });

  const foldersMap = {};

  videoFiles.forEach((vid) => {
    if (!foldersMap[vid.folder]) foldersMap[vid.folder] = [];

    const matchedSubs = subtitleFiles.filter((sub) => {
      return sub.folder === vid.folder && (sub.baseName.includes(vid.baseName) || vid.baseName.includes(sub.baseName) || sub.cleanName === vid.cleanName);
    });

    foldersMap[vid.folder].push({
      file: vid.file,
      name: vid.file.name,
      baseName: vid.baseName,
      subFiles: matchedSubs.map((s) => s.file),
    });
  });

  library = Object.keys(foldersMap).map((folderName) => ({
    folderName,
    videos: foldersMap[folderName],
  }));

  buildFlatPlaylist();
  renderExplorer();
}

function buildFlatPlaylist() {
  flatPlaylist = [];
  library.forEach((group) => {
    group.videos.forEach((item) => flatPlaylist.push({ ...item, folderName: group.folderName }));
  });
}

function renderExplorer() {
  foldersContainer.innerHTML = "";
  const query = searchInput.value.toLowerCase().trim();
  let totalVideos = 0;

  library.forEach((group) => {
    const filteredVideos = group.videos.filter((item) => {
      const matchSearch = item.name.toLowerCase().includes(query);
      let matchFilter = true;
      if (activeFilter === "subbed") {
        matchFilter = item.subFiles.length > 0;
      } else if (activeFilter === "nosub") {
        matchFilter = item.subFiles.length === 0;
      }
      return matchSearch && matchFilter;
    });

    if (filteredVideos.length === 0) return;
    totalVideos += filteredVideos.length;

    const groupEl = document.createElement("div");
    groupEl.className = "folder-group";

    const headEl = document.createElement("div");
    headEl.className = "folder-head";
    headEl.innerHTML = `
      <div class="folder-title-wrap">
        <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <strong>${group.folderName}</strong>
      </div>
      <span class="folder-count-badge">${filteredVideos.length} ویدیو</span>
    `;

    const gridEl = document.createElement("div");
    gridEl.className = "videos-grid";

    filteredVideos.forEach((item) => {
      const card = document.createElement("div");
      card.className = "video-poster-card";
      card._videoFile = item.file;
      const sizeMB = (item.file.size / (1024 * 1024)).toFixed(1);

      card.innerHTML = `
        <div class="poster-thumb-wrapper">
          <div class="poster-badges">
            ${item.subFiles.length > 0 ? `<span class="badge-sub">CC</span>` : "<span></span>"}
            <span class="badge-size">${sizeMB} MB</span>
          </div>
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"/></svg>
        </div>
        <div class="poster-meta">
          <span class="poster-title" title="${item.name}">${item.name}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        const globalIdx = flatPlaylist.findIndex((v) => v.file === item.file);
        playIndex(globalIdx, group.videos);
      });

      thumbObserver.observe(card);
      gridEl.appendChild(card);
    });

    groupEl.appendChild(headEl);
    groupEl.appendChild(gridEl);
    foldersContainer.appendChild(groupEl);
  });

  videoCounter.textContent = `${totalVideos} ویدیو یافت شد`;
}

// -------------------------------------------------------------
// PLAYER & SUBTITLE ENGINE
// -------------------------------------------------------------
async function playIndex(index, folderVideosList = null) {
  if (index < 0 || index >= flatPlaylist.length) return;
  currentPlaylistIndex = index;
  const item = flatPlaylist[index];

  if (folderVideosList) {
    currentFolderVideos = folderVideosList;
  } else {
    const parentFolder = library.find((g) => g.folderName === item.folderName);
    currentFolderVideos = parentFolder ? parentFolder.videos : [item];
  }

  if (activeObjectURL) URL.revokeObjectURL(activeObjectURL);
  activeObjectURL = URL.createObjectURL(item.file);

  video.src = activeObjectURL;

  resetSubtitles();

  if (item.subFiles && item.subFiles.length > 0) {
    const subFile = item.subFiles[0];
    await loadSubtitle(subFile);
  }

  explorerView.classList.add("hidden");
  playerWorkspace.classList.add("active");

  if (explorerActions) explorerActions.classList.add("hidden");
  if (searchFieldBox) searchFieldBox.classList.add("hidden");
  if (topBackBtn) topBackBtn.classList.remove("hidden");

  renderLiveDrawer();

  video.play().catch(() => {});
  resetControlsTimer();
}

function renderLiveDrawer() {
  const currentItem = flatPlaylist[currentPlaylistIndex];
  drawerFolderTitle.textContent = currentItem ? currentItem.folderName : "";
  drawerVideosList.innerHTML = "";

  currentFolderVideos.forEach((vid) => {
    const row = document.createElement("div");
    row.className = `drawer-v-item ${vid.file === currentItem?.file ? "active" : ""}`;
    row.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"/></svg>
      <span class="drawer-v-name" title="${vid.name}">${vid.name}</span>
    `;
    row.addEventListener("click", () => {
      const idx = flatPlaylist.findIndex((v) => v.file === vid.file);
      if (idx !== -1) playIndex(idx, currentFolderVideos);
    });
    drawerVideosList.appendChild(row);
  });
}

function playNextVideo() {
  if (currentPlaylistIndex + 1 < flatPlaylist.length) {
    playIndex(currentPlaylistIndex + 1);
  }
}

function playPrevVideo() {
  if (currentPlaylistIndex - 1 >= 0) {
    playIndex(currentPlaylistIndex - 1);
  }
}

function returnToExplorer(pauseVideo = true) {
  if (pauseVideo) {
    video.pause();
  }
  playerWorkspace.classList.remove("active");
  explorerView.classList.remove("hidden");
  livePlaylistDrawer.classList.remove("open");

  if (explorerActions) explorerActions.classList.remove("hidden");
  if (searchFieldBox) searchFieldBox.classList.remove("hidden");
  if (topBackBtn) topBackBtn.classList.add("hidden");
}

function resetSubtitles() {
  subtitles = [];
  subtitleEnabled = true;
  subtitleFile = null;
  subtitleLayer.innerHTML = "";
  subtitleLayer.classList.add("hidden");
  subtitleToggle.classList.add("active");
  subtitleToggle.setAttribute("aria-pressed", "true");
  subBtn.classList.add("active");
  subtitleFileName.textContent = "زیرنویسی انتخاب نشده";
  subtitleStatus.textContent = "زیرنویس خاموش است";
  subtitleInput.value = "";
}

function isSubtitleFile(file) {
  if (!file) return false;
  return /\.(srt|vtt)$/i.test(file.name);
}

function parseTimestamp(value) {
  if (!value) return NaN;
  const clean = value.trim().replace(",", ".").replace(/\s+/g, "");
  const parts = clean.split(":");
  if (parts.length === 3) {
    const h = Number(parts[0]),
      m = Number(parts[1]),
      s = Number(parts[2]);
    return Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s) ? h * 3600 + m * 60 + s : NaN;
  }
  if (parts.length === 2) {
    const m = Number(parts[0]),
      s = Number(parts[1]);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : NaN;
  }
  return NaN;
}

function cleanSubtitleText(text) {
  return text
    .replace(/\{\\.*?\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function loadSubtitle(file) {
  if (!file || !isSubtitleFile(file)) return;
  try {
    const text = await file.text();
    const parsed = /\.vtt$/i.test(file.name) ? parseVTT(text) : parseSRT(text);
    if (!parsed.length) return;
    subtitles = parsed;
    subtitleFile = file;
    subtitleFileName.textContent = file.name;
    subtitleStatus.textContent = `${parsed.length} بخش زیرنویس · فعال`;
    subtitleEnabled = true;
    subtitleToggle.classList.add("active");
    subBtn.classList.add("active");
    updateSubtitles();
  } catch (err) {}
}

function parseSRT(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const result = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;
    const timing = lines[timeIdx].split("-->").map((v) => v.trim());
    if (timing.length < 2) continue;
    const start = parseTimestamp(timing[0].split(/\s+/)[0]);
    const end = parseTimestamp(timing[1].split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const subtitleText = cleanSubtitleText(lines.slice(timeIdx + 1).join("\n"));
    if (subtitleText) result.push({ start, end, text: subtitleText });
  }
  return result.sort((a, b) => a.start - b.start);
}

function parseVTT(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const result = [];
  for (const block of blocks) {
    if (block.startsWith("WEBVTT")) continue;
    const lines = block.split("\n");
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;
    const timing = lines[timeIdx].split("-->").map((v) => v.trim());
    if (timing.length < 2) continue;
    const start = parseTimestamp(timing[0].split(/\s+/)[0]);
    const end = parseTimestamp(timing[1].split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const subtitleText = cleanSubtitleText(lines.slice(timeIdx + 1).join("\n"));
    if (subtitleText) result.push({ start, end, text: subtitleText });
  }
  return result.sort((a, b) => a.start - b.start);
}

let currentSubtitleIndex = -1;

function findSubtitleIndex(time) {
  let low = 0,
    high = subtitles.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = subtitles[mid];
    if (time < item.start) high = mid - 1;
    else if (time > item.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

function updateSubtitles() {
  if (!subtitleEnabled || !subtitles.length || !Number.isFinite(video.currentTime)) {
    subtitleLayer.classList.add("hidden");
    subtitleLayer.innerHTML = "";
    currentSubtitleIndex = -1;
    return;
  }

  const index = findSubtitleIndex(video.currentTime);
  if (index === currentSubtitleIndex) return;
  currentSubtitleIndex = index;

  if (index === -1) {
    subtitleLayer.classList.add("hidden");
    subtitleLayer.innerHTML = "";
    return;
  }

  const item = subtitles[index];
  subtitleLayer.innerHTML = "";
  const element = document.createElement("div");
  element.className = `subtitle-bubble`;
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
  const element = subtitleLayer.querySelector(".subtitle-bubble");
  if (element) {
    element.style.fontSize = `calc(clamp(14px, 2.1vw, 28px) * ${size / 100})`;
    element.style.background = subBgToggleBtn.classList.contains("active") ? "rgba(20, 18, 24, 0.88)" : "transparent";
    element.style.textShadow = subBgToggleBtn.classList.contains("active") ? "0 2px 5px rgba(0, 0, 0, 0.95)" : "0 1px 4px #000, 0 0 12px #000";
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
  subBtn.classList.toggle("active", subtitleEnabled);

  if (!subtitleEnabled) {
    subtitleLayer.classList.add("hidden");
    subtitleLayer.innerHTML = "";
    subtitleStatus.textContent = "زیرنویس خاموش است";
  } else {
    subtitleStatus.textContent = `${subtitles.length} بخش زیرنویس · فعال`;
    currentSubtitleIndex = -1;
    updateSubtitles();
  }
}

// -------------------------------------------------------------
// SPEED & PLAYBACK LOGIC
// -------------------------------------------------------------
function cleanSpeed(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clamp(parsed, MIN_SPEED, MAX_SPEED) : 1;
}

function formatSpeed(value) {
  const speed = cleanSpeed(value);
  return Number.isInteger(speed) ? `${speed}x` : `${Number(speed.toFixed(2))}x`;
}

function updateSpeedUI(value) {
  const speed = cleanSpeed(value);
  if (speedInput) speedInput.value = speed;
  if (speedRange) speedRange.value = speed;
  if (speedValue) speedValue.textContent = formatSpeed(speed);
  if (speedPreview) speedPreview.textContent = Number(speed.toFixed(2));
}

function setPlaybackRate(value) {
  const speed = cleanSpeed(value);
  video.playbackRate = speed;
  ["preservesPitch", "mozPreservesPitch", "webkitPreservesPitch"].forEach((prop) => {
    if (prop in video) video[prop] = true;
  });
  updateSpeedUI(speed);
}

function applySelectedSpeed() {
  const speed = cleanSpeed(speedInput.value);
  setPlaybackRate(speed);
  closeSpeedMenu();
  showControls();
}

function openSpeedMenu() {
  closeSubtitleMenu();
  speedMenu.classList.add("open");
  speedBtn.classList.add("active");
  clearControlsTimer();
}

function closeSpeedMenu() {
  speedMenu.classList.remove("open");
  speedBtn.classList.remove("active");
  if (!video.paused) scheduleHideControls();
}

function openSubtitleMenu() {
  closeSpeedMenu();
  subtitleMenu.classList.add("open");
  subBtn.classList.add("active");
  clearControlsTimer();
}

function closeSubtitleMenu() {
  subtitleMenu.classList.remove("open");
  if (!subtitleEnabled) subBtn.classList.remove("active");
  if (!video.paused) scheduleHideControls();
}

function togglePlay() {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function formatTime(secs) {
  const total = Math.floor(secs) || 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function updateProgress() {
  const current = video.currentTime || 0;
  const total = video.duration || 0;

  currentTime.textContent = formatTime(current);
  duration.textContent = formatTime(total);

  const pct = total ? (current / total) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressThumb.style.left = `${pct}%`;

  if (video.buffered.length > 0) {
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    bufferBar.style.width = `${(bufferedEnd / total) * 100}%`;
  }
}

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);
  updateSubtitles();
  showControls();
}

function showSeekFeedback(direction) {
  const el = direction === "left" ? seekLeftFeedback : seekRightFeedback;
  el.classList.add("show");
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove("show"), 600);
}

function clearControlsTimer() {
  if (controlsTimer) {
    clearTimeout(controlsTimer);
    controlsTimer = null;
  }
}

function scheduleHideControls() {
  clearTimeout(controlsTimer);
  if (video.paused || video.ended || speedMenu.classList.contains("open") || subtitleMenu.classList.contains("open")) return;
  controlsTimer = setTimeout(() => {
    if (!video.paused && !video.ended) {
      playerStage.classList.add("hide-controls");
    }
  }, HIDE_DELAY);
}

function showControls() {
  playerStage.classList.remove("hide-controls");
  clearTimeout(controlsTimer);
  if (!video.paused && !video.ended) scheduleHideControls();
}

// Event Listeners
openFolderBtn.addEventListener("click", handleDirectoryPicker);
const fabSelectFolder = document.getElementById("fabSelectFolder");
if (fabSelectFolder) fabSelectFolder.addEventListener("click", handleDirectoryPicker);

if (topBackBtn) {
  topBackBtn.addEventListener("click", () => returnToExplorer(true));
}

singleFileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) {
    const singleObj = { file: e.target.files[0], name: e.target.files[0].name, subFiles: [] };
    library = [{ folderName: "فایل‌های تکی", videos: [singleObj] }];
    buildFlatPlaylist();
    playIndex(0, [singleObj]);
  }
});

searchInput.addEventListener("input", renderExplorer);

// Filter Event Listeners
document.getElementById("filterAll").addEventListener("click", (e) => {
  document.querySelectorAll(".m3-chip").forEach((p) => p.classList.remove("active"));
  e.target.classList.add("active");
  activeFilter = "all";
  renderExplorer();
});

document.getElementById("filterSubbed").addEventListener("click", (e) => {
  document.querySelectorAll(".m3-chip").forEach((p) => p.classList.remove("active"));
  e.target.classList.add("active");
  activeFilter = "subbed";
  renderExplorer();
});

const filterNoSubBtn = document.getElementById("filterNoSub");
if (filterNoSubBtn) {
  filterNoSubBtn.addEventListener("click", (e) => {
    document.querySelectorAll(".m3-chip").forEach((p) => p.classList.remove("active"));
    e.target.classList.add("active");
    activeFilter = "nosub";
    renderExplorer();
  });
}

playBtn.addEventListener("click", togglePlay);
centerPlay.addEventListener("click", togglePlay);
video.addEventListener("click", togglePlay);

toggleDrawerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  livePlaylistDrawer.classList.add("open");
});

closeDrawerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  livePlaylistDrawer.classList.remove("open");
});

video.addEventListener("play", () => {
  playerStage.classList.add("playing");
  playBtn.classList.add("playing");
  resetControlsTimer();
});

video.addEventListener("pause", () => {
  playerStage.classList.remove("playing");
  playBtn.classList.remove("playing");
  playerStage.classList.remove("hide-controls");
});

video.addEventListener("ended", playNextVideo);

video.addEventListener("timeupdate", () => {
  updateProgress();
  updateSubtitles();
});

video.addEventListener("waiting", () => videoLoader.classList.add("active"));
video.addEventListener("canplay", () => videoLoader.classList.remove("active"));

backBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  seekBy(-SEEK_STEP);
  showSeekFeedback("left");
});

forwardBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  seekBy(SEEK_STEP);
  showSeekFeedback("right");
});

prevVideoBtn.addEventListener("click", playPrevVideo);
nextVideoBtn.addEventListener("click", playNextVideo);

progressArea.addEventListener("click", (e) => {
  const rect = progressArea.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  video.currentTime = ratio * video.duration;
});

playerStage.addEventListener("mousemove", () => {
  playerStage.classList.remove("hide-controls");
  resetControlsTimer();
});

subBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  subtitleMenu.classList.contains("open") ? closeSubtitleMenu() : openSubtitleMenu();
});

closeSubtitle.addEventListener("click", closeSubtitleMenu);
subtitleToggle.addEventListener("click", toggleSubtitle);

subBgToggleBtn.addEventListener("click", () => {
  subBgToggleBtn.classList.toggle("active");
  updateSubtitleStyle();
});

subtitleSize.addEventListener("input", updateSubtitleStyle);
subtitlePosition.addEventListener("input", updateSubtitleStyle);

removeSubtitle.addEventListener("click", resetSubtitles);

subtitleUploadBtn.addEventListener("click", () => subtitleInput.click());
subtitleInput.addEventListener("change", async (e) => {
  if (e.target.files[0]) {
    loadSubtitle(e.target.files[0]);
  }
});

speedBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  speedMenu.classList.contains("open") ? closeSpeedMenu() : openSpeedMenu();
});

closeSpeed.addEventListener("click", closeSpeedMenu);

speedRange.addEventListener("input", () => {
  updateSpeedUI(speedRange.value);
});

speedInput.addEventListener("input", () => {
  const val = Number.parseFloat(speedInput.value);
  if (Number.isFinite(val)) {
    const clean = clamp(val, MIN_SPEED, MAX_SPEED);
    speedRange.value = clean;
    speedPreview.textContent = Number(clean.toFixed(2));
  }
});

applySpeed.addEventListener("click", applySelectedSpeed);

document.addEventListener("click", (e) => {
  if (!e.target.closest("#subtitleMenu") && !e.target.closest("#subtitleBtn")) closeSubtitleMenu();
  if (!e.target.closest("#speedMenu") && !e.target.closest("#speedBtn")) closeSpeedMenu();
  if (!e.target.closest("#livePlaylistDrawer") && !e.target.closest("#toggleDrawerBtn")) livePlaylistDrawer.classList.remove("open");
});

volumeSlider.addEventListener("input", (e) => {
  video.volume = e.target.value;
  localStorage.setItem("aura_volume", video.volume);
  document.querySelector(".volume-cluster").classList.toggle("muted", video.volume === 0);
});

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  document.querySelector(".volume-cluster").classList.toggle("muted", video.muted);
});

fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    playerStage.requestFullscreen?.();
    playerStage.classList.add("is-fullscreen");
  } else {
    document.exitFullscreen?.();
    playerStage.classList.remove("is-fullscreen");
  }
});

pipBtn.addEventListener("click", () => {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else {
    video.requestPictureInPicture?.();
  }
});

document.addEventListener("keydown", (e) => {
  if (!playerWorkspace.classList.contains("active")) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT") return;

  switch (e.key.toLowerCase()) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "arrowleft":
      e.preventDefault();
      seekBy(-SEEK_STEP);
      showSeekFeedback("left");
      break;
    case "arrowright":
      e.preventDefault();
      seekBy(SEEK_STEP);
      showSeekFeedback("right");
      break;
    case "f":
      e.preventDefault();
      fullscreenBtn.click();
      break;
    case "m":
      e.preventDefault();
      muteBtn.click();
      break;
    case "n":
      e.preventDefault();
      playNextVideo();
      break;
    case "p":
      e.preventDefault();
      playPrevVideo();
      break;
  }
});

updateSpeedUI(1);
