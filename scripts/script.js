'use strict';

const explorerView = document.getElementById('explorerView');
const playerWorkspace = document.getElementById('playerWorkspace');
const foldersContainer = document.getElementById('foldersContainer');
const videoCounter = document.getElementById('videoCounter');
const searchInput = document.getElementById('searchInput');
const searchFieldBox = document.getElementById('searchFieldBox');
const dropZone = document.getElementById('dropZone');

const openFolderBtn = document.getElementById('openFolderBtn');
const explorerActions = document.getElementById('explorerActions');
const topBackBtn = document.getElementById('topBackBtn');

const singleFileBtn = document.getElementById('singleFileBtn');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const subtitleInput = document.getElementById('subtitleInput');

const playerStage = document.getElementById('player');
const video = document.getElementById('video');

const playBtn = document.getElementById('playBtn');
const centerPlay = document.getElementById('centerPlay');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');

const prevVideoBtn = document.getElementById('prevVideoBtn');
const nextVideoBtn = document.getElementById('nextVideoBtn');
const randomModeBtn = document.getElementById('randomModeBtn');
const toggleDrawerBtn = document.getElementById('toggleDrawerBtn');

const progressBar = document.getElementById('progressBar');
const bufferBar = document.getElementById('bufferBar');
const progressArea = document.getElementById('progressArea');
const progressThumb = document.getElementById('progressThumb');
const currentTime = document.getElementById('currentTime');
const duration = document.getElementById('duration');

const subtitleLayer = document.getElementById('subtitleLayer');

const subBtn = document.getElementById('subtitleBtn');
const subtitleMenu = document.getElementById('subtitleMenu');
const closeSubtitle = document.getElementById('closeSubtitle');
const subtitleToggle = document.getElementById('subtitleToggle');
const subBgToggleBtn = document.getElementById('subBgToggleBtn');
const subtitleFileName = document.getElementById('subtitleFileName');
const subtitleStatus = document.getElementById('subtitleStatus');
const removeSubtitle = document.getElementById('removeSubtitle');
const subtitleUploadBtn = document.getElementById('subtitleUploadBtn');
const subtitleSize = document.getElementById('subtitleSize');
const subtitleSizeValue = document.getElementById('subtitleSizeValue');
const subtitlePosition = document.getElementById('subtitlePosition');
const subtitlePositionValue = document.getElementById('subtitlePositionValue');

const speedBtn = document.getElementById('speedBtn');
const speedMenu = document.getElementById('speedMenu');
const closeSpeed = document.getElementById('closeSpeed');
const speedInput = document.getElementById('speedInput');
const speedRange = document.getElementById('speedRange');
const speedValue = document.getElementById('speedValue');
const speedPreview = document.getElementById('speedPreview');
const applySpeed = document.getElementById('applySpeed');

const volumeSlider = document.getElementById('volumeRange');
const muteBtn = document.getElementById('muteBtn');
const pipBtn = document.getElementById('pipBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const videoLoader = document.getElementById('videoLoader');

const seekLeftFeedback = document.getElementById('seekLeftFeedback');
const seekRightFeedback = document.getElementById('seekRightFeedback');

const livePlaylistDrawer = document.getElementById('livePlaylistDrawer');
const drawerVideosList = document.getElementById('drawerVideosList');
const drawerFolderTitle = document.getElementById('drawerFolderTitle');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

const fabSelectFolder = document.getElementById('fabSelectFolder');

const filterAll = document.getElementById('filterAll');
const filterSubbed = document.getElementById('filterSubbed');
const filterNoSub = document.getElementById('filterNoSub');

/* =========================================================
   CONSTANTS
========================================================= */

const MIN_SPEED = 0.1;
const MAX_SPEED = 16;

const SEEK_STEP = 10;
const HIDE_DELAY = 2500;

const VIDEO_REGEX = /\.(mp4|webm|mkv|mov|avi|m4v|ts|ogv)$/i;
const SUB_REGEX = /\.(srt|vtt)$/i;

const STORAGE_VOLUME = 'aura_volume';
const STORAGE_SPEED = 'aura_speed';

/* =========================================================
   STATE
========================================================= */

let library = [];
let flatPlaylist = [];

let currentPlaylistIndex = -1;
let currentFolderVideos = [];

let subtitles = [];
let subtitleEnabled = false;
let subtitleFile = null;
let currentSubtitleIndex = -1;

let activeObjectURL = null;

let activeFilter = 'all';

let controlsTimer = null;
let statusTimer = null;

let dragDepth = 0;

let lastVolume = 1;

let randomPlayback = false;
let randomQueue = [];

let currentPlaybackRate = 1;

/* =========================================================
   SAFE HELPERS
========================================================= */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return clamp(number, min, max);
}

function naturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeName(filename) {
  return String(filename || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[._\-+]+/g, ' ')
    .replace(/\b(1080p|720p|480p|2160p|4k|bluray|web-dl|webrip|brrip|x264|x265|hevc|h264|h265|aac|farsi|persian|forced|sdh|sub|subtitle|dubbed)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createSvgIcon(path, viewBox = '0 0 24 24') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');

  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  pathEl.setAttribute('d', path);

  svg.appendChild(pathEl);

  return svg;
}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadStoredNumber(key, fallback, min, max) {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null || raw === '') {
      return fallback;
    }

    const number = Number(raw);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return clamp(number, min, max);
  } catch {
    return fallback;
  }
}

function storeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage may be unavailable.
  }
}

lastVolume = loadStoredNumber(STORAGE_VOLUME, 1, 0, 1);

currentPlaybackRate = loadStoredNumber(STORAGE_SPEED, 1, MIN_SPEED, MAX_SPEED);

video.volume = lastVolume;
video.playbackRate = currentPlaybackRate;

if (volumeSlider) {
  volumeSlider.value = String(lastVolume);
}

/* =========================================================
   PLAYER STATUS
========================================================= */

function ensurePlayerStatus() {
  let status = document.getElementById('playerStatus');

  if (status) {
    return status;
  }

  status = document.createElement('div');

  status.id = 'playerStatus';
  status.className = 'player-status hidden';

  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  playerStage.appendChild(status);

  return status;
}

function showPlayerStatus(message, { error = false, timeout = 4500 } = {}) {
  const status = ensurePlayerStatus();

  status.textContent = message;
  status.classList.toggle('error', error);

  status.classList.remove('hidden');

  clearTimeout(statusTimer);

  if (timeout > 0) {
    statusTimer = setTimeout(() => {
      status.classList.add('hidden');
    }, timeout);
  }
}

function hidePlayerStatus() {
  const status = document.getElementById('playerStatus');

  if (status) {
    status.classList.add('hidden');
  }

  clearTimeout(statusTimer);
}

/* =========================================================
   POSTER GENERATION
   Sequential / Ordered
========================================================= */

const posterQueue = [];
const posterQueued = new WeakSet();

let posterWorkerRunning = false;
let posterGenerationToken = 0;

const thumbObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries, observer) => {
          const visibleCards = entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => entry.target)
            .filter((card) => card && card._videoFile && !card._thumbnailLoaded)
            .sort((a, b) => Number(a.dataset.order || 0) - Number(b.dataset.order || 0));

          for (const card of visibleCards) {
            observer.unobserve(card);
            enqueuePoster(card);
          }
        },
        {
          rootMargin: '300px 0px',
          threshold: 0.01,
        },
      )
    : null;

function enqueuePoster(card) {
  if (!card || !card._videoFile || card._thumbnailLoaded || posterQueued.has(card)) {
    return;
  }

  posterQueued.add(card);
  card.dataset.posterState = 'queued';

  posterQueue.push(card);

  processPosterQueue();
}

async function processPosterQueue() {
  if (posterWorkerRunning) {
    return;
  }

  posterWorkerRunning = true;

  while (posterQueue.length) {
    const card = posterQueue.shift();

    if (!card || !card.isConnected || !card._videoFile || card._thumbnailLoaded) {
      continue;
    }

    card.dataset.posterState = 'loading';

    try {
      await loadPosterForCard(card, card._videoFile);
    } catch {
      // Keep placeholder if the browser cannot decode the file.
    }

    if (card.isConnected) {
      card.dataset.posterState = 'done';
      card._thumbnailLoaded = true;
    }

    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  }

  posterWorkerRunning = false;
}

function resetPosterQueue() {
  posterGenerationToken += 1;
  posterQueue.length = 0;
}

function loadPosterForCard(card, file) {
  return new Promise((resolve) => {
    const wrapper = card?.querySelector('.poster-thumb-wrapper');

    if (!wrapper || !file) {
      resolve();
      return;
    }

    const posterVideo = document.createElement('video');

    posterVideo.preload = 'metadata';
    posterVideo.muted = true;
    posterVideo.playsInline = true;
    posterVideo.disablePictureInPicture = true;

    const url = URL.createObjectURL(file);

    const generation = posterGenerationToken;

    let finished = false;
    let timeoutId = 0;

    function cleanup() {
      if (finished) {
        return;
      }

      finished = true;

      clearTimeout(timeoutId);

      URL.revokeObjectURL(url);

      try {
        posterVideo.pause();
        posterVideo.removeAttribute('src');
        posterVideo.load();
      } catch {
        // Ignore cleanup errors.
      }

      posterVideo.remove();

      resolve();
    }

    function renderFrame() {
      if (finished) {
        return;
      }

      if (generation !== posterGenerationToken || !card.isConnected) {
        cleanup();
        return;
      }

      try {
        if (!posterVideo.videoWidth || !posterVideo.videoHeight) {
          cleanup();
          return;
        }

        const canvas = document.createElement('canvas');

        const outW = 640;
        const outH = 360;

        canvas.width = outW;
        canvas.height = outH;

        canvas.className = 'poster-canvas';
        canvas.setAttribute('aria-hidden', 'true');

        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          return;
        }

        const sourceRatio = posterVideo.videoWidth / posterVideo.videoHeight;

        const targetRatio = outW / outH;

        let sx = 0;
        let sy = 0;
        let sw = posterVideo.videoWidth;
        let sh = posterVideo.videoHeight;

        if (sourceRatio > targetRatio) {
          sw = posterVideo.videoHeight * targetRatio;

          sx = (posterVideo.videoWidth - sw) / 2;
        } else if (sourceRatio < targetRatio) {
          sh = posterVideo.videoWidth / targetRatio;

          sy = (posterVideo.videoHeight - sh) / 2;
        }

        ctx.drawImage(posterVideo, sx, sy, sw, sh, 0, 0, outW, outH);

        wrapper.querySelector('.poster-placeholder')?.remove();

        wrapper.querySelector('.poster-canvas')?.remove();

        wrapper.appendChild(canvas);
      } catch {
        // Keep default placeholder.
      } finally {
        cleanup();
      }
    }

    timeoutId = window.setTimeout(cleanup, 5000);

    posterVideo.addEventListener(
      'loadedmetadata',
      () => {
        if (finished) {
          return;
        }

        const durationValue = Number.isFinite(posterVideo.duration) ? posterVideo.duration : 0;

        const targetTime = durationValue > 0 ? Math.min(1.5, Math.max(0.1, durationValue * 0.1)) : 0;

        try {
          posterVideo.currentTime = targetTime;
        } catch {
          renderFrame();
        }
      },
      {
        once: true,
      },
    );

    posterVideo.addEventListener('seeked', renderFrame, {
      once: true,
    });

    posterVideo.addEventListener('error', cleanup, {
      once: true,
    });

    posterVideo.src = url;
    posterVideo.load();
  });
}

function observeCard(card) {
  if (!card?._videoFile) {
    return;
  }

  if (thumbObserver) {
    thumbObserver.observe(card);
  } else {
    enqueuePoster(card);
  }
}

/* =========================================================
   FILE DETECTION
========================================================= */

function isVideoFile(file) {
  return Boolean(file && VIDEO_REGEX.test(file.name || ''));
}

function isSubtitleFile(file) {
  return Boolean(file && SUB_REGEX.test(file.name || ''));
}

/* =========================================================
   DIRECTORY PICKER
========================================================= */

function handleDirectoryPicker() {
  folderInput?.click();
}

function getFolderFromRelativePath(file) {
  if (!file?.webkitRelativePath) {
    return 'پوشه ویدیوها';
  }

  const parts = file.webkitRelativePath.split('/').filter(Boolean);

  if (parts.length <= 1) {
    return 'پوشه ویدیوها';
  }

  return parts.slice(0, -1).join('/');
}

/* =========================================================
   DIRECTORY ENTRY TRAVERSAL
========================================================= */

async function readDirectoryEntries(reader) {
  const entries = [];

  while (true) {
    const batch = await new Promise((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });

    if (!batch.length) {
      break;
    }

    entries.push(...batch);
  }

  return entries;
}

async function traverseEntry(entry, parentFolder = '', output = []) {
  if (!entry) {
    return output;
  }

  if (entry.isFile) {
    const file = await new Promise((resolve) => {
      entry.file(resolve, () => resolve(null));
    });

    if (file) {
      output.push({
        file,
        folder: parentFolder || 'فایل‌های دراگی',
      });
    }

    return output;
  }

  if (entry.isDirectory) {
    const folderPath = parentFolder ? `${parentFolder}/${entry.name}` : entry.name;

    const reader = entry.createReader();

    const children = await readDirectoryEntries(reader);

    for (const child of children) {
      await traverseEntry(child, folderPath, output);
    }
  }

  return output;
}

/* =========================================================
   FILE / FOLDER PROCESSING
========================================================= */

function subtitleMatchScore(videoItem, subtitleItem) {
  if (videoItem.folder !== subtitleItem.folder) {
    return 0;
  }

  const videoName = videoItem.cleanName;

  const subtitleName = subtitleItem.cleanName;

  if (!videoName || !subtitleName) {
    return 0;
  }

  if (videoName === subtitleName) {
    return 100;
  }

  const startsVideo = subtitleName.startsWith(`${videoName} `);

  const startsSubtitle = videoName.startsWith(`${subtitleName} `);

  if (startsVideo || startsSubtitle) {
    return 60;
  }

  return 0;
}

function processScannedFiles(fileList) {
  const videoFiles = [];
  const subtitleFiles = [];

  for (const entry of fileList || []) {
    const file = entry?.file;

    if (!file) {
      continue;
    }

    const folder = entry.folder || 'پوشه ویدیوها';

    const baseName = file.name.replace(/\.[^/.]+$/, '');

    const cleanName = normalizeName(file.name);

    if (isVideoFile(file)) {
      videoFiles.push({
        file,
        folder,
        name: file.name,
        baseName,
        cleanName,
      });
    } else if (isSubtitleFile(file)) {
      subtitleFiles.push({
        file,
        folder,
        name: file.name,
        baseName,
        cleanName,
      });
    }
  }

  /* -------------------------------------------------------
     Sort files FIRST
  ------------------------------------------------------- */

  videoFiles.sort((a, b) => {
    const folderCompare = naturalCompare(a.folder, b.folder);

    if (folderCompare !== 0) {
      return folderCompare;
    }

    return naturalCompare(a.name, b.name);
  });

  subtitleFiles.sort((a, b) => {
    const folderCompare = naturalCompare(a.folder, b.folder);

    if (folderCompare !== 0) {
      return folderCompare;
    }

    return naturalCompare(a.name, b.name);
  });

  const foldersMap = new Map();

  /* -------------------------------------------------------
     Match subtitles
  ------------------------------------------------------- */

  for (const videoItem of videoFiles) {
    if (!foldersMap.has(videoItem.folder)) {
      foldersMap.set(videoItem.folder, []);
    }

    const matchedSubs = subtitleFiles
      .map((sub) => ({
        sub,
        score: subtitleMatchScore(videoItem, sub),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || naturalCompare(a.sub.name, b.sub.name));

    foldersMap.get(videoItem.folder).push({
      file: videoItem.file,
      name: videoItem.name,
      baseName: videoItem.baseName,
      cleanName: videoItem.cleanName,
      subFiles: matchedSubs.map((entry) => entry.sub.file),
    });
  }

  library = Array.from(foldersMap.entries()).map(([folderName, videos]) => ({
    folderName,
    videos: videos.sort((a, b) => naturalCompare(a.name, b.name)),
  }));

  /* -------------------------------------------------------
     Sort folders
  ------------------------------------------------------- */

  library.sort((a, b) => naturalCompare(a.folderName, b.folderName));

  /* -------------------------------------------------------
     Rebuild playlist
  ------------------------------------------------------- */

  buildFlatPlaylist();

  currentPlaylistIndex = -1;

  resetRandomQueue();

  renderExplorer();
}

/* =========================================================
   FLAT PLAYLIST
========================================================= */

function buildFlatPlaylist() {
  flatPlaylist = [];

  const sortedLibrary = [...library].sort((a, b) => naturalCompare(a.folderName, b.folderName));

  for (const group of sortedLibrary) {
    const sortedVideos = [...group.videos].sort((a, b) => naturalCompare(a.name, b.name));

    group.videos = sortedVideos;

    for (const item of sortedVideos) {
      flatPlaylist.push({
        ...item,
        folderName: group.folderName,
      });
    }
  }
}

/* =========================================================
   EXPLORER
========================================================= */

function renderEmptyExplorer(message) {
  const empty = document.createElement('div');

  empty.className = 'explorer-empty-state';

  const icon = createSvgIcon('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');

  const text = document.createElement('span');

  text.textContent = message;

  empty.append(icon, text);

  foldersContainer.appendChild(empty);
}

function createFolderElement(group, filteredVideos) {
  const groupEl = document.createElement('div');

  groupEl.className = 'folder-group';

  const headEl = document.createElement('div');

  headEl.className = 'folder-head';

  const titleWrap = document.createElement('div');

  titleWrap.className = 'folder-title-wrap';

  titleWrap.appendChild(createSvgIcon('M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'));

  const folderTitle = document.createElement('strong');

  folderTitle.textContent = group.folderName;

  titleWrap.appendChild(folderTitle);

  const badge = document.createElement('span');

  badge.className = 'folder-count-badge';

  badge.textContent = `${filteredVideos.length} ویدیو`;

  headEl.append(titleWrap, badge);

  const gridEl = document.createElement('div');

  gridEl.className = 'videos-grid';

  filteredVideos.forEach((item, index) => {
    const card = document.createElement('div');

    card.className = 'video-poster-card';

    card.dataset.order = String(index);

    card._videoFile = item.file;

    const thumb = document.createElement('div');

    thumb.className = 'poster-thumb-wrapper';

    const badges = document.createElement('div');

    badges.className = 'poster-badges';

    if (item.subFiles?.length) {
      const subBadge = document.createElement('span');

      subBadge.className = 'badge-sub';

      subBadge.textContent = 'CC';

      badges.appendChild(subBadge);
    } else {
      const emptyBadge = document.createElement('span');

      badges.appendChild(emptyBadge);
    }

    const sizeBadge = document.createElement('span');

    sizeBadge.className = 'badge-size';

    const sizeMB = (item.file.size / (1024 * 1024)).toFixed(1);

    sizeBadge.textContent = `${sizeMB} MB`;

    badges.appendChild(sizeBadge);

    const placeholder = createSvgIcon('M8 5v14l11-7Z');

    placeholder.classList.add('poster-placeholder');

    thumb.append(badges, placeholder);

    const meta = document.createElement('div');

    meta.className = 'poster-meta';

    const title = document.createElement('span');

    title.className = 'poster-title';

    title.textContent = item.name;

    title.title = item.name;

    meta.appendChild(title);

    card.append(thumb, meta);

    card.addEventListener('click', () => {
      const globalIndex = flatPlaylist.findIndex((entry) => entry.file === item.file);

      if (globalIndex !== -1) {
        playIndex(globalIndex, group.videos);
      }
    });

    observeCard(card);

    gridEl.appendChild(card);
  });

  groupEl.append(headEl, gridEl);

  return groupEl;
}

function renderExplorer() {
  resetPosterQueue();

  foldersContainer.innerHTML = '';

  const query = String(searchInput?.value || '')
    .toLocaleLowerCase('fa')
    .trim();

  let totalVideos = 0;

  for (const group of library) {
    const sortedVideos = [...group.videos].sort((a, b) => naturalCompare(a.name, b.name));

    const filteredVideos = sortedVideos.filter((item) => {
      const matchSearch = item.name.toLocaleLowerCase('fa').includes(query);

      let matchFilter = true;

      if (activeFilter === 'subbed') {
        matchFilter = item.subFiles.length > 0;
      } else if (activeFilter === 'nosub') {
        matchFilter = item.subFiles.length === 0;
      }

      return matchSearch && matchFilter;
    });

    if (!filteredVideos.length) {
      continue;
    }

    totalVideos += filteredVideos.length;

    foldersContainer.appendChild(createFolderElement(group, filteredVideos));
  }

  if (videoCounter) {
    videoCounter.textContent = `${totalVideos} ویدیو یافت شد`;
  }

  if (!totalVideos) {
    if (!library.length) {
      renderEmptyExplorer('هنوز هیچ ویدیویی به کتابخانه اضافه نشده است.');
    } else {
      renderEmptyExplorer('با این فیلتر یا عبارت جستجو، ویدیویی پیدا نشد.');
    }
  }
}

/* =========================================================
   PLAYER VIEW
========================================================= */

function setPlayerView(active) {
  if (active) {
    explorerView.classList.add('hidden');

    playerWorkspace.classList.add('active');

    explorerActions?.classList.add('hidden');

    searchFieldBox?.classList.add('hidden');

    topBackBtn?.classList.remove('hidden');
  } else {
    explorerView.classList.remove('hidden');

    playerWorkspace.classList.remove('active');

    explorerActions?.classList.remove('hidden');

    searchFieldBox?.classList.remove('hidden');

    topBackBtn?.classList.add('hidden');
  }
}

/* =========================================================
   VIDEO SOURCE
========================================================= */

function releaseActiveVideoSource() {
  video.pause();

  video.removeAttribute('src');

  video.load();

  if (activeObjectURL) {
    URL.revokeObjectURL(activeObjectURL);

    activeObjectURL = null;
  }
}

/* =========================================================
   PLAYBACK
========================================================= */

function safePlay() {
  const promise = video.play();

  if (promise && typeof promise.catch === 'function') {
    promise.catch((error) => {
      if (error?.name === 'NotAllowedError') {
        showPlayerStatus('پخش خودکار توسط مرورگر مسدود شد؛ روی دکمهٔ پخش بزنید.');
      } else if (error?.name !== 'AbortError') {
        showPlayerStatus('پخش این فایل شروع نشد.', {
          error: true,
        });
      }
    });
  }
}

function playIndex(index, folderVideosList = null) {
  if (index < 0 || index >= flatPlaylist.length) {
    return;
  }

  const item = flatPlaylist[index];

  if (!item?.file) {
    return;
  }

  currentPlaylistIndex = index;

  if (randomPlayback) {
    randomQueue = randomQueue.filter((queueIndex) => queueIndex !== index);
  }

  if (folderVideosList) {
    currentFolderVideos = [...folderVideosList].sort((a, b) => naturalCompare(a.name, b.name));
  } else {
    const parentFolder = library.find((group) => group.folderName === item.folderName);

    currentFolderVideos = parentFolder ? [...parentFolder.videos].sort((a, b) => naturalCompare(a.name, b.name)) : [item];
  }

  closeSubtitleMenu();
  closeSpeedMenu();

  livePlaylistDrawer.classList.remove('open');

  clearControlsTimer();

  playerStage.classList.remove('hide-controls');

  hidePlayerStatus();

  videoLoader?.classList.remove('active');

  releaseActiveVideoSource();

  activeObjectURL = URL.createObjectURL(item.file);

  video.src = activeObjectURL;

  /*
   * CRITICAL:
   * Browser may reset playbackRate
   * after changing video.src.
   *
   * Always restore the persistent
   * speed immediately after assigning
   * the new source.
   */
  video.playbackRate = currentPlaybackRate;

  ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch'].forEach((property) => {
    if (property in video) {
      video[property] = true;
    }
  });

  setPlayerView(true);

  renderLiveDrawer();

  resetSubtitlesForVideo();

  /*
   * Start immediately from the
   * user's click path.
   */
  safePlay();

  if (item.subFiles?.length) {
    loadSubtitle(item.subFiles[0]);
  }

  updateProgress();

  showControls();
}

/* =========================================================
   RANDOM PLAYBACK
========================================================= */

function shuffleArray(items) {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function rebuildRandomQueue() {
  const availableIndexes = flatPlaylist.map((_, index) => index).filter((index) => index !== currentPlaylistIndex);

  randomQueue = shuffleArray(availableIndexes);
}

function resetRandomQueue() {
  randomQueue = [];

  if (randomPlayback && flatPlaylist.length > 1) {
    rebuildRandomQueue();
  }
}

function updateRandomModeUI() {
  if (!randomModeBtn) {
    return;
  }

  randomModeBtn.classList.toggle('active', randomPlayback);

  randomModeBtn.setAttribute('aria-pressed', String(randomPlayback));

  randomModeBtn.title = randomPlayback ? 'پخش رندوم: روشن' : 'پخش رندوم: خاموش';

  randomModeBtn.setAttribute('aria-label', randomPlayback ? 'خاموش کردن پخش رندوم' : 'روشن کردن پخش رندوم');
}

function toggleRandomPlayback() {
  randomPlayback = !randomPlayback;

  if (randomPlayback) {
    rebuildRandomQueue();

    showPlayerStatus('پخش رندوم روشن شد');
  } else {
    randomQueue = [];

    showPlayerStatus('پخش رندوم خاموش شد');
  }

  updateRandomModeUI();
}

function getRandomNextIndex() {
  if (flatPlaylist.length <= 1) {
    return -1;
  }

  if (!randomQueue.length) {
    rebuildRandomQueue();
  }

  const nextIndex = randomQueue.shift();

  if (typeof nextIndex !== 'number') {
    return -1;
  }

  return nextIndex;
}

function playNextVideo() {
  if (randomPlayback) {
    const nextIndex = getRandomNextIndex();

    if (nextIndex !== -1) {
      playIndex(nextIndex);
    }

    return;
  }

  if (currentPlaylistIndex + 1 < flatPlaylist.length) {
    playIndex(currentPlaylistIndex + 1);
  }
}

function playPrevVideo() {
  if (currentPlaylistIndex - 1 >= 0) {
    playIndex(currentPlaylistIndex - 1);
  }
}

/* =========================================================
   DRAWER
========================================================= */

function renderLiveDrawer() {
  const currentItem = flatPlaylist[currentPlaylistIndex];

  drawerFolderTitle.textContent = currentItem?.folderName || '';

  drawerVideosList.innerHTML = '';

  for (const vid of currentFolderVideos) {
    const row = document.createElement('div');

    row.className = 'drawer-v-item';

    if (vid.file === currentItem?.file) {
      row.classList.add('active');
    }

    const icon = createSvgIcon('M8 5v14l11-7Z');

    const name = document.createElement('span');

    name.className = 'drawer-v-name';

    name.title = vid.name;

    name.textContent = vid.name;

    row.append(icon, name);

    row.addEventListener('click', (event) => {
      event.stopPropagation();

      const index = flatPlaylist.findIndex((entry) => entry.file === vid.file);

      if (index !== -1) {
        playIndex(index, currentFolderVideos);
      }
    });

    drawerVideosList.appendChild(row);
  }
}

/* =========================================================
   RETURN TO EXPLORER
========================================================= */

function returnToExplorer(pauseVideo = true) {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch?.(() => {});
  }

  if (pauseVideo) {
    releaseActiveVideoSource();
  }

  livePlaylistDrawer.classList.remove('open');

  closeSubtitleMenu();
  closeSpeedMenu();

  clearControlsTimer();

  playerStage.classList.remove('hide-controls', 'playing', 'is-fullscreen');

  videoLoader?.classList.remove('active');

  resetSubtitlesForVideo();

  setPlayerView(false);
}

/* =========================================================
   SUBTITLES
========================================================= */

function resetSubtitlesForVideo() {
  subtitles = [];
  subtitleEnabled = false;
  subtitleFile = null;
  currentSubtitleIndex = -1;

  subtitleLayer.innerHTML = '';

  subtitleLayer.classList.add('hidden');

  subtitleToggle.classList.remove('active');

  subtitleToggle.setAttribute('aria-pressed', 'false');

  subBtn.classList.remove('active');

  subtitleFileName.textContent = 'زیرنویسی انتخاب نشده';

  subtitleStatus.textContent = 'زیرنویس خاموش است';

  subtitleInput.value = '';
}

function clearCurrentSubtitle() {
  subtitles = [];
  subtitleEnabled = false;
  subtitleFile = null;
  currentSubtitleIndex = -1;

  subtitleLayer.innerHTML = '';

  subtitleLayer.classList.add('hidden');

  subtitleToggle.classList.remove('active');

  subtitleToggle.setAttribute('aria-pressed', 'false');

  subBtn.classList.remove('active');

  subtitleFileName.textContent = 'زیرنویسی انتخاب نشده';

  subtitleStatus.textContent = 'زیرنویس خاموش است';
}

function parseTimestamp(value) {
  if (!value) {
    return NaN;
  }

  const clean = String(value).trim().replace(',', '.').replace(/\s+/g, '');

  const parts = clean.split(':');

  let h = 0;
  let m = 0;
  let s = 0;

  if (parts.length === 3) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    s = Number(parts[2]);
  } else if (parts.length === 2) {
    m = Number(parts[0]);
    s = Number(parts[1]);
  } else {
    return NaN;
  }

  if (![h, m, s].every(Number.isFinite)) {
    return NaN;
  }

  if (h < 0 || m < 0 || m > 59 || s < 0 || s >= 60) {
    return NaN;
  }

  return h * 3600 + m * 60 + s;
}

function cleanSubtitleText(text) {
  return String(text || '')
    .replace(/\{\\.*?\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function parseCueBlock(block) {
  const lines = block.split('\n');

  const timeIndex = lines.findIndex((line) => line.includes('-->'));

  if (timeIndex === -1) {
    return null;
  }

  const timing = lines[timeIndex].split('-->').map((value) => value.trim());

  if (timing.length < 2) {
    return null;
  }

  const start = parseTimestamp(timing[0].split(/\s+/)[0]);

  const end = parseTimestamp(timing[1].split(/\s+/)[0]);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  const text = cleanSubtitleText(lines.slice(timeIndex + 1).join('\n'));

  if (!text) {
    return null;
  }

  return {
    start,
    end,
    text,
  };
}

function parseSRT(text) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map(parseCueBlock)
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function parseVTT(text) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^WEBVTT(?:\s|$)/i.test(block))
    .filter((block) => !/^NOTE(?:\s|$)/i.test(block))
    .filter((block) => !/^STYLE(?:\s|$)/i.test(block))
    .filter((block) => !/^REGION(?:\s|$)/i.test(block));

  return blocks
    .map(parseCueBlock)
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

async function loadSubtitle(file) {
  if (!isSubtitleFile(file)) {
    return false;
  }

  try {
    const text = await file.text();

    const parsed = /\.vtt$/i.test(file.name) ? parseVTT(text) : parseSRT(text);

    if (!parsed.length) {
      subtitleStatus.textContent = 'زیرنویس قابل خواندن نیست';

      subtitleEnabled = false;

      subtitleToggle.classList.remove('active');

      subBtn.classList.remove('active');

      return false;
    }

    subtitles = parsed;
    subtitleFile = file;

    subtitleFileName.textContent = file.name;

    subtitleStatus.textContent = `${parsed.length} بخش زیرنویس · فعال`;

    subtitleEnabled = true;
    currentSubtitleIndex = -1;

    subtitleToggle.classList.add('active');

    subtitleToggle.setAttribute('aria-pressed', 'true');

    subBtn.classList.add('active');

    updateSubtitles();

    return true;
  } catch {
    subtitleStatus.textContent = 'خطا در خواندن زیرنویس';

    subtitleEnabled = false;

    subtitleToggle.classList.remove('active');

    subBtn.classList.remove('active');

    return false;
  }
}

function findSubtitleIndex(time) {
  let low = 0;
  let high = subtitles.length - 1;

  let candidate = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;

    const item = subtitles[mid];

    if (item.start <= time) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate >= 0 && time < subtitles[candidate].end) {
    return candidate;
  }

  return -1;
}

function updateSubtitleStyle() {
  const size = safeNumber(subtitleSize.value, 100, 70, 180);

  const position = safeNumber(subtitlePosition.value, 8, 3, 25);

  subtitleSize.value = String(size);

  subtitlePosition.value = String(position);

  subtitleSizeValue.textContent = `${size}%`;

  subtitlePositionValue.textContent = `${position}%`;

  subtitleLayer.style.bottom = `${position}%`;

  const element = subtitleLayer.querySelector('.subtitle-bubble');

  if (!element) {
    return;
  }

  element.style.fontSize = `calc(clamp(14px, 2.1vw, 28px) * ${size / 100})`;

  const showBackground = subBgToggleBtn.classList.contains('active');

  element.style.background = showBackground ? 'rgba(20, 18, 24, 0.88)' : 'transparent';

  element.style.textShadow = showBackground ? '0 2px 5px rgba(0, 0, 0, 0.95)' : '0 1px 4px #000, 0 0 12px #000';
}

function updateSubtitles() {
  if (!subtitleEnabled || !subtitles.length || !Number.isFinite(video.currentTime)) {
    subtitleLayer.classList.add('hidden');

    subtitleLayer.innerHTML = '';

    currentSubtitleIndex = -1;

    return;
  }

  const index = findSubtitleIndex(video.currentTime);

  if (index === currentSubtitleIndex) {
    return;
  }

  currentSubtitleIndex = index;

  if (index === -1) {
    subtitleLayer.classList.add('hidden');

    subtitleLayer.innerHTML = '';

    return;
  }

  const element = document.createElement('div');

  element.className = 'subtitle-bubble';

  element.textContent = subtitles[index].text;

  subtitleLayer.replaceChildren(element);

  subtitleLayer.classList.remove('hidden');

  updateSubtitleStyle();
}

function toggleSubtitle() {
  if (!subtitles.length) {
    subtitleInput.click();
    return;
  }

  subtitleEnabled = !subtitleEnabled;

  subtitleToggle.classList.toggle('active', subtitleEnabled);

  subtitleToggle.setAttribute('aria-pressed', String(subtitleEnabled));

  subBtn.classList.toggle('active', subtitleEnabled);

  if (subtitleEnabled) {
    subtitleStatus.textContent = `${subtitles.length} بخش زیرنویس · فعال`;

    currentSubtitleIndex = -1;

    updateSubtitles();
  } else {
    subtitleStatus.textContent = 'زیرنویس خاموش است';

    subtitleLayer.classList.add('hidden');

    subtitleLayer.innerHTML = '';
  }
}

/* =========================================================
   SPEED
========================================================= */

function cleanSpeed(value) {
  return safeNumber(value, currentPlaybackRate || 1, MIN_SPEED, MAX_SPEED);
}

function formatSpeed(value) {
  const speed = cleanSpeed(value);

  return Number.isInteger(speed) ? `${speed}x` : `${Number(speed.toFixed(2))}x`;
}

function updateSpeedUI(value) {
  const speed = cleanSpeed(value);

  if (speedInput) {
    speedInput.value = String(speed);
  }

  if (speedRange) {
    speedRange.value = String(speed);
  }

  if (speedValue) {
    speedValue.textContent = formatSpeed(speed);
  }

  if (speedPreview) {
    speedPreview.textContent = Number(speed.toFixed(2));
  }
}

function setPlaybackRate(value) {
  const speed = cleanSpeed(value);

  /*
   * Keep speed in JS memory.
   * This is what allows us to restore
   * the speed after changing video.src.
   */
  currentPlaybackRate = speed;

  video.playbackRate = speed;

  ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch'].forEach((property) => {
    if (property in video) {
      video[property] = true;
    }
  });

  storeValue(STORAGE_SPEED, speed);

  updateSpeedUI(speed);
}

function applySelectedSpeed() {
  setPlaybackRate(speedInput.value);

  closeSpeedMenu();

  showControls();
}

function openSpeedMenu() {
  closeSubtitleMenu();

  speedMenu.classList.add('open');

  speedBtn.classList.add('active');

  clearControlsTimer();

  updateSpeedUI(currentPlaybackRate);
}

function closeSpeedMenu() {
  speedMenu.classList.remove('open');

  speedBtn.classList.remove('active');

  if (!video.paused) {
    scheduleHideControls();
  }
}

/* =========================================================
   SUBTITLE / SPEED MENUS
========================================================= */

function openSubtitleMenu() {
  closeSpeedMenu();

  subtitleMenu.classList.add('open');

  subBtn.classList.add('active');

  clearControlsTimer();
}

function closeSubtitleMenu() {
  subtitleMenu.classList.remove('open');

  if (!subtitleEnabled) {
    subBtn.classList.remove('active');
  }

  if (!video.paused) {
    scheduleHideControls();
  }
}

/* =========================================================
   PLAY / TIME
========================================================= */

function togglePlay() {
  if (video.paused || video.ended) {
    safePlay();
  } else {
    video.pause();
  }
}

function formatTime(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0));

  const h = Math.floor(total / 3600);

  const m = Math.floor((total % 3600) / 60);

  const s = total % 60;

  const mm = String(m).padStart(2, '0');

  const ss = String(s).padStart(2, '0');

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* =========================================================
   PROGRESS
========================================================= */

function updateProgress() {
  const current = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;

  const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

  currentTime.textContent = formatTime(current);

  duration.textContent = formatTime(total);

  const percent = total > 0 ? clamp((current / total) * 100, 0, 100) : 0;

  progressBar.style.width = `${percent}%`;

  progressThumb.style.left = `${percent}%`;

  if (video.buffered.length && total > 0) {
    try {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);

      const bufferedPercent = clamp((bufferedEnd / total) * 100, 0, 100);

      bufferBar.style.width = `${bufferedPercent}%`;
    } catch {
      bufferBar.style.width = '0%';
    }
  } else {
    bufferBar.style.width = '0%';
  }
}

/* =========================================================
   SEEK
========================================================= */

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) {
    return;
  }

  video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);

  updateProgress();
  updateSubtitles();
  showControls();
}

function seekToPointerEvent(event) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return;
  }

  const rect = progressArea.getBoundingClientRect();

  if (!rect.width) {
    return;
  }

  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);

  video.currentTime = ratio * video.duration;

  updateProgress();
  updateSubtitles();
}

function showSeekFeedback(direction) {
  const element = direction === 'left' ? seekLeftFeedback : seekRightFeedback;

  if (!element) {
    return;
  }

  element.classList.add('show');

  clearTimeout(element.timer);

  element.timer = setTimeout(() => {
    element.classList.remove('show');
  }, 600);
}

/* =========================================================
   CONTROL VISIBILITY
========================================================= */

function clearControlsTimer() {
  if (controlsTimer) {
    clearTimeout(controlsTimer);

    controlsTimer = null;
  }
}

function scheduleHideControls() {
  clearTimeout(controlsTimer);

  if (video.paused || video.ended || speedMenu.classList.contains('open') || subtitleMenu.classList.contains('open') || livePlaylistDrawer.classList.contains('open')) {
    return;
  }

  controlsTimer = setTimeout(() => {
    if (!video.paused && !video.ended && !speedMenu.classList.contains('open') && !subtitleMenu.classList.contains('open') && !livePlaylistDrawer.classList.contains('open')) {
      playerStage.classList.add('hide-controls');
    }
  }, HIDE_DELAY);
}

function showControls() {
  playerStage.classList.remove('hide-controls');

  clearControlsTimer();

  if (!video.paused && !video.ended) {
    scheduleHideControls();
  }
}

/*
 * Compatibility helper.
 * Older versions used resetControlsTimer().
 */
function resetControlsTimer() {
  showControls();
}

/* =========================================================
   LOADING
========================================================= */

function setLoading(active) {
  videoLoader?.classList.toggle('active', active);
}

/* =========================================================
   VOLUME
========================================================= */

function updateVolumeUI() {
  const volumeCluster = document.querySelector('.volume-cluster');

  const muted = video.muted || video.volume === 0;

  volumeCluster?.classList.toggle('muted', muted);

  if (volumeSlider) {
    volumeSlider.value = String(video.volume);
  }
}

function setVolume(value, { persist = true } = {}) {
  const volume = safeNumber(value, lastVolume || 1, 0, 1);

  video.volume = volume;

  if (volume > 0) {
    lastVolume = volume;

    video.muted = false;
  } else {
    video.muted = true;
  }

  if (persist && volume > 0) {
    storeValue(STORAGE_VOLUME, volume);
  }

  updateVolumeUI();
}

/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (!playerStage.requestFullscreen) {
      showPlayerStatus('تمام‌صفحه در این مرورگر پشتیبانی نمی‌شود.', {
        error: true,
      });

      return;
    }

    await playerStage.requestFullscreen();
  } catch {
    showPlayerStatus('ورود به حالت تمام‌صفحه انجام نشد.', {
      error: true,
    });
  }
}

function syncFullscreenUI() {
  const active = document.fullscreenElement === playerStage;

  playerStage.classList.toggle('is-fullscreen', active);

  showControls();
}

/* =========================================================
   PICTURE IN PICTURE
========================================================= */

async function togglePiP() {
  if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') {
    showPlayerStatus('تصویر در تصویر توسط این مرورگر پشتیبانی نمی‌شود.', {
      error: true,
    });

    return;
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  } catch {
    showPlayerStatus('ورود به حالت تصویر در تصویر ممکن نشد.', {
      error: true,
    });
  }
}

/* =========================================================
   FOLDER INPUT
========================================================= */

folderInput?.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);

  if (!files.length) {
    return;
  }

  const entries = files.map((file) => ({
    file,
    folder: getFolderFromRelativePath(file),
  }));

  processScannedFiles(entries);

  returnToExplorer(false);

  event.target.value = '';
});

/* =========================================================
   DRAG & DROP
========================================================= */

dropZone?.addEventListener('dragenter', (event) => {
  event.preventDefault();

  dragDepth += 1;

  dropZone.classList.add('dragover');
});

dropZone?.addEventListener('dragover', (event) => {
  event.preventDefault();

  event.dataTransfer.dropEffect = 'copy';

  dropZone.classList.add('dragover');
});

dropZone?.addEventListener('dragleave', (event) => {
  event.preventDefault();

  dragDepth = Math.max(0, dragDepth - 1);

  if (!dragDepth) {
    dropZone.classList.remove('dragover');
  }
});

dropZone?.addEventListener('drop', async (event) => {
  event.preventDefault();

  dragDepth = 0;

  dropZone.classList.remove('dragover');

  const entries = [];

  const items = Array.from(event.dataTransfer?.items || []);

  if (items.length) {
    for (const item of items) {
      if (item.kind !== 'file') {
        continue;
      }

      const entry = item.webkitGetAsEntry?.();

      if (entry) {
        await traverseEntry(entry, '', entries);
      } else {
        const file = item.getAsFile?.();

        if (file) {
          entries.push({
            file,
            folder: 'فایل‌های دراگی',
          });
        }
      }
    }
  } else {
    for (const file of Array.from(event.dataTransfer?.files || [])) {
      entries.push({
        file,
        folder: 'فایل‌های دراگی',
      });
    }
  }

  if (entries.length) {
    processScannedFiles(entries);
  }
});

/* =========================================================
   SINGLE FILE
========================================================= */

singleFileBtn?.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

fileInput?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];

  event.target.value = '';

  if (!file || !isVideoFile(file)) {
    return;
  }

  const item = {
    file,
    name: file.name,
    baseName: file.name.replace(/\.[^/.]+$/, ''),
    cleanName: normalizeName(file.name),
    subFiles: [],
  };

  library = [
    {
      folderName: 'فایل‌های تکی',
      videos: [item],
    },
  ];

  buildFlatPlaylist();

  randomQueue = [];

  playIndex(0, [item]);
});

/* =========================================================
   EXPLORER SEARCH
========================================================= */

searchInput?.addEventListener('input', renderExplorer);

/* =========================================================
   FILTERS
========================================================= */

function setActiveFilter(filter, button) {
  document.querySelectorAll('.m3-chip').forEach((chip) => {
    chip.classList.remove('active');
  });

  button?.classList.add('active');

  activeFilter = filter;

  renderExplorer();
}

filterAll?.addEventListener('click', (event) => {
  setActiveFilter('all', event.currentTarget);
});

filterSubbed?.addEventListener('click', (event) => {
  setActiveFilter('subbed', event.currentTarget);
});

filterNoSub?.addEventListener('click', (event) => {
  setActiveFilter('nosub', event.currentTarget);
});

/* =========================================================
   OPEN FOLDER
========================================================= */

openFolderBtn?.addEventListener('click', handleDirectoryPicker);

fabSelectFolder?.addEventListener('click', handleDirectoryPicker);

topBackBtn?.addEventListener('click', () => returnToExplorer(true));

/* =========================================================
   PLAY CONTROLS
========================================================= */

playBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  togglePlay();
});

centerPlay?.addEventListener('click', (event) => {
  event.stopPropagation();
  togglePlay();
});

video.addEventListener('click', (event) => {
  event.stopPropagation();
  togglePlay();
});

prevVideoBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  playPrevVideo();
});

nextVideoBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  playNextVideo();
});

randomModeBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  toggleRandomPlayback();

  showControls();
});

/* =========================================================
   DRAWER BUTTON
========================================================= */

toggleDrawerBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  livePlaylistDrawer.classList.add('open');

  showControls();
});

closeDrawerBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  livePlaylistDrawer.classList.remove('open');

  showControls();
});

/* =========================================================
   VIDEO EVENTS
========================================================= */

video.addEventListener('play', () => {
  playerStage.classList.add('playing');

  playBtn?.classList.add('playing');

  hidePlayerStatus();

  /*
   * Reapply persistent speed
   * whenever playback begins.
   */
  if (video.playbackRate !== currentPlaybackRate) {
    video.playbackRate = currentPlaybackRate;
  }

  resetControlsTimer();
});

video.addEventListener('pause', () => {
  playerStage.classList.remove('playing');

  playBtn?.classList.remove('playing');

  playerStage.classList.remove('hide-controls');

  setLoading(false);

  clearControlsTimer();
});

video.addEventListener('ended', playNextVideo);

video.addEventListener('timeupdate', () => {
  updateProgress();
  updateSubtitles();
});

video.addEventListener('progress', updateProgress);

video.addEventListener('durationchange', updateProgress);

video.addEventListener('loadedmetadata', () => {
  /*
   * Some browsers reset playbackRate
   * during metadata/source changes.
   */
  video.playbackRate = currentPlaybackRate;

  updateProgress();
  updateVolumeUI();

  hidePlayerStatus();
});

video.addEventListener('waiting', () => setLoading(true));

video.addEventListener('stalled', () => setLoading(true));

video.addEventListener('seeking', () => setLoading(true));

video.addEventListener('seeked', () => setLoading(false));

video.addEventListener('canplay', () => setLoading(false));

video.addEventListener('playing', () => setLoading(false));

video.addEventListener('ratechange', () => {
  if (video.playbackRate !== currentPlaybackRate) {
    /*
     * Ignore browser internal
     * resets only when we know
     * our intended rate.
     */
    if (Number.isFinite(video.playbackRate) && video.playbackRate > 0) {
      currentPlaybackRate = cleanSpeed(video.playbackRate);

      updateSpeedUI(currentPlaybackRate);
    }
  }
});

video.addEventListener('error', () => {
  setLoading(false);

  const code = video.error?.code;

  let message = 'پخش این فایل ممکن نیست.';

  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    message = 'فرمت یا کُدک این فایل توسط مرورگر پشتیبانی نمی‌شود. برای وب، MP4/H.264/AAC یا WebM را استفاده کنید.';
  } else if (code === MediaError.MEDIA_ERR_DECODE) {
    message = 'فایل قابل شناسایی است اما کُدک یا دادهٔ ویدیو قابل decode نیست.';
  } else if (code === MediaError.MEDIA_ERR_NETWORK) {
    message = 'خواندن فایل ویدیو با خطا مواجه شد.';
  }

  showPlayerStatus(message, {
    error: true,
    timeout: 9000,
  });
});

/* =========================================================
   SEEK BUTTONS
========================================================= */

backBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  seekBy(-SEEK_STEP);

  showSeekFeedback('left');
});

forwardBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  seekBy(SEEK_STEP);

  showSeekFeedback('right');
});

/* =========================================================
   TIMELINE
========================================================= */

progressArea?.addEventListener('pointerdown', seekToPointerEvent);

progressArea?.addEventListener('click', (event) => {
  seekToPointerEvent(event);
});

/* =========================================================
   CONTROL VISIBILITY POINTER EVENTS
========================================================= */

playerStage?.addEventListener('pointermove', showControls);

playerStage?.addEventListener('pointerdown', showControls);

/* =========================================================
   SUBTITLE MENU
========================================================= */

subBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  if (subtitleMenu.classList.contains('open')) {
    closeSubtitleMenu();
  } else {
    openSubtitleMenu();
  }
});

closeSubtitle?.addEventListener('click', (event) => {
  event.stopPropagation();
  closeSubtitleMenu();
});

subtitleToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleSubtitle();
});

subBgToggleBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  subBgToggleBtn.classList.toggle('active');

  updateSubtitleStyle();
});

subtitleSize?.addEventListener('input', updateSubtitleStyle);

subtitlePosition?.addEventListener('input', updateSubtitleStyle);

removeSubtitle?.addEventListener('click', (event) => {
  event.stopPropagation();
  clearCurrentSubtitle();
});

subtitleUploadBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  subtitleInput.value = '';

  subtitleInput.click();
});

subtitleInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];

  event.target.value = '';

  if (file) {
    await loadSubtitle(file);
  }
});

/* =========================================================
   SPEED MENU
========================================================= */

speedBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  if (speedMenu.classList.contains('open')) {
    closeSpeedMenu();
  } else {
    openSpeedMenu();
  }
});

closeSpeed?.addEventListener('click', (event) => {
  event.stopPropagation();
  closeSpeedMenu();
});

speedRange?.addEventListener('input', () => {
  updateSpeedUI(speedRange.value);
});

speedInput?.addEventListener('input', () => {
  const value = Number.parseFloat(speedInput.value);

  if (!Number.isFinite(value)) {
    return;
  }

  const clean = clamp(value, MIN_SPEED, MAX_SPEED);

  speedRange.value = String(clean);

  speedPreview.textContent = Number(clean.toFixed(2));
});

applySpeed?.addEventListener('click', (event) => {
  event.stopPropagation();

  applySelectedSpeed();
});

/* =========================================================
   OUTSIDE CLICK
========================================================= */

document.addEventListener('click', (event) => {
  if (!event.target.closest('#subtitleMenu') && !event.target.closest('#subtitleBtn')) {
    closeSubtitleMenu();
  }

  if (!event.target.closest('#speedMenu') && !event.target.closest('#speedBtn')) {
    closeSpeedMenu();
  }

  if (!event.target.closest('#livePlaylistDrawer') && !event.target.closest('#toggleDrawerBtn')) {
    livePlaylistDrawer.classList.remove('open');
  }
});

/* =========================================================
   VOLUME
========================================================= */

volumeSlider?.addEventListener('input', (event) => {
  setVolume(event.target.value);
});

muteBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  if (video.muted || video.volume === 0) {
    const restore = lastVolume > 0 ? lastVolume : 0.5;

    video.volume = restore;

    video.muted = false;

    storeValue(STORAGE_VOLUME, restore);
  } else {
    lastVolume = video.volume;

    video.muted = true;
  }

  updateVolumeUI();
});

/* =========================================================
   FULLSCREEN
========================================================= */

fullscreenBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  toggleFullscreen();
});

document.addEventListener('fullscreenchange', syncFullscreenUI);

/* =========================================================
   PICTURE IN PICTURE
========================================================= */

pipBtn?.addEventListener('click', (event) => {
  event.stopPropagation();

  togglePiP();
});

if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') {
  if (pipBtn) {
    pipBtn.disabled = true;

    pipBtn.setAttribute('aria-disabled', 'true');

    pipBtn.title = 'تصویر در تصویر در این مرورگر پشتیبانی نمی‌شود';
  }
}

/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener('keydown', (event) => {
  if (!playerWorkspace.classList.contains('active')) {
    return;
  }

  const target = event.target;

  const tag = target?.tagName;

  const interactive = target?.closest?.("button, input, textarea, select, a, [contenteditable='true']");

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || interactive) {
    if (event.key === 'Escape') {
      closeSubtitleMenu();
      closeSpeedMenu();

      livePlaylistDrawer.classList.remove('open');
    }

    return;
  }

  switch (event.key.toLowerCase()) {
    case ' ':
    case 'k':
      event.preventDefault();
      togglePlay();
      break;

    case 'arrowleft':
      event.preventDefault();

      seekBy(-SEEK_STEP);

      showSeekFeedback('left');

      break;

    case 'arrowright':
      event.preventDefault();

      seekBy(SEEK_STEP);

      showSeekFeedback('right');

      break;

    case 'f':
      event.preventDefault();

      toggleFullscreen();

      break;

    case 'm':
      event.preventDefault();

      muteBtn?.click();

      break;

    case 'n':
      event.preventDefault();

      playNextVideo();

      break;

    case 'p':
      event.preventDefault();

      playPrevVideo();

      break;

    case 'r':
      event.preventDefault();

      toggleRandomPlayback();

      break;

    case 'escape':
      closeSubtitleMenu();
      closeSpeedMenu();

      livePlaylistDrawer.classList.remove('open');

      break;
  }
});

/* =========================================================
   INITIAL UI
========================================================= */

updateSpeedUI(currentPlaybackRate);

updateVolumeUI();

updateSubtitleStyle();

updateRandomModeUI();

/*
 * Make sure the initial rate is applied.
 */
video.playbackRate = currentPlaybackRate;
