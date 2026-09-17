
const explorerView = document.getElementById('explorerView');
const playerWorkspace = document.getElementById('playerWorkspace');
const foldersContainer = document.getElementById('foldersContainer');
const videoCounter = document.getElementById('videoCounter');
const searchInput = document.getElementById('searchInput');
const searchFieldBox = document.getElementById('searchFieldBox');
const dropZone = document.getElementById('dropZone');
const filterChips = document.querySelectorAll('.m3-chip');

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
const volumeCluster = document.querySelector('.volume-cluster');
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

const MIN_SPEED = 0.1;
const MAX_SPEED = 16;
const SEEK_STEP = 10;
const HIDE_DELAY = 2500;

const VIDEO_REGEX = /\.(mp4|webm|mkv|mov|avi|m4v|ts|ogv)$/i;
const SUB_REGEX = /\.(srt|vtt)$/i;

let library = [];
let flatPlaylist = [];
let currentPlaylistIndex = -1;
let currentFolderVideos = [];

let subtitles = [];
let subtitleEnabled = false;
let subtitleFile = null;
let currentSubtitleIndex = -1;

let controlsTimer = null;
let activeObjectURL = null;
let activeFilter = 'all';
let lastVolume = 1;
let dragDepth = 0;
let statusTimer = null;

let randomPlayback = false;
let randomQueue = [];

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------

function resetRandomQueue() {
  randomQueue = [];

  if (randomPlayback && flatPlaylist.length > 1) {
    rebuildRandomQueue();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeName(filename) {
  return String(filename || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[._\-+]+/g, ' ')
    .replace(/\[|\]/g, ' ')
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

// -------------------------------------------------------------
// PLAYER STATUS
// -------------------------------------------------------------

function ensurePlayerStatus() {
  let status = document.getElementById('playerStatus');

  if (status) return status;

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

// -------------------------------------------------------------
// LOCAL STORAGE
// -------------------------------------------------------------

function loadStoredNumber(key, fallback, min, max) {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null || raw === '') {
      return fallback;
    }

    const n = Number(raw);

    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  } catch {
    return fallback;
  }
}

function storeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage may be disabled.
  }
}

lastVolume = loadStoredNumber('aura_volume', 1, 0, 1);

video.volume = lastVolume;

if (volumeSlider) {
  volumeSlider.value = String(lastVolume);
}

const storedSpeed = loadStoredNumber('aura_speed', 1, MIN_SPEED, MAX_SPEED);

video.playbackRate = storedSpeed;

// -------------------------------------------------------------
// POSTER GENERATION
// -------------------------------------------------------------

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
  if (posterWorkerRunning) return;

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
      // Unsupported codec.
    }

    if (card.isConnected) {
      card.dataset.posterState = 'done';
      card._thumbnailLoaded = true;
    }

    await new Promise((resolve) => requestAnimationFrame(resolve));
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

    const videoElem = document.createElement('video');

    videoElem.preload = 'metadata';
    videoElem.muted = true;
    videoElem.playsInline = true;
    videoElem.disablePictureInPicture = true;

    const url = URL.createObjectURL(file);
    const token = posterGenerationToken;

    let finished = false;
    let timeoutId = 0;

    const cleanup = () => {
      if (finished) return;

      finished = true;

      window.clearTimeout(timeoutId);

      URL.revokeObjectURL(url);

      videoElem.pause();
      videoElem.removeAttribute('src');
      videoElem.load();
      videoElem.remove();

      resolve();
    };

    const renderFrame = () => {
      if (finished) return;

      if (token !== posterGenerationToken || !card.isConnected) {
        cleanup();
        return;
      }

      try {
        if (!videoElem.videoWidth || !videoElem.videoHeight) {
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

        const sourceRatio = videoElem.videoWidth / videoElem.videoHeight;

        const targetRatio = outW / outH;

        let sx = 0;
        let sy = 0;
        let sw = videoElem.videoWidth;
        let sh = videoElem.videoHeight;

        if (sourceRatio > targetRatio) {
          sw = videoElem.videoHeight * targetRatio;

          sx = (videoElem.videoWidth - sw) / 2;
        } else if (sourceRatio < targetRatio) {
          sh = videoElem.videoWidth / targetRatio;

          sy = (videoElem.videoHeight - sh) / 2;
        }

        ctx.drawImage(videoElem, sx, sy, sw, sh, 0, 0, outW, outH);

        wrapper.querySelector('.poster-placeholder')?.remove();

        wrapper.querySelector('.poster-canvas')?.remove();

        wrapper.appendChild(canvas);
      } catch {
        // Keep placeholder.
      } finally {
        cleanup();
      }
    };

    timeoutId = window.setTimeout(cleanup, 5000);

    videoElem.addEventListener(
      'loadedmetadata',
      () => {
        if (finished) return;

        const durationValue = Number.isFinite(videoElem.duration) ? videoElem.duration : 0;

        const targetTime = durationValue > 0 ? Math.min(1.5, Math.max(0.1, durationValue * 0.1)) : 0;

        try {
          videoElem.currentTime = targetTime;
        } catch {
          renderFrame();
        }
      },
      { once: true },
    );

    videoElem.addEventListener('seeked', renderFrame, { once: true });

    videoElem.addEventListener('error', cleanup, { once: true });

    videoElem.addEventListener(
      'loadeddata',
      () => {
        if (videoElem.readyState >= 2 && !Number.isFinite(videoElem.duration)) {
          renderFrame();
        }
      },
      { once: true },
    );

    videoElem.src = url;
    videoElem.load();
  });
}

function observeCard(card) {
  if (!card?._videoFile) return;

  if (thumbObserver) {
    thumbObserver.observe(card);
  } else {
    enqueuePoster(card);
  }
}

// -------------------------------------------------------------
// FILE / FOLDER SCANNING
// -------------------------------------------------------------

function handleDirectoryPicker() {
  folderInput?.click();
}

function getFolderFromRelativePath(file) {
  if (!file?.webkitRelativePath) {
    return 'پوشه ویدیوها';
  }

  const parts = file.webkitRelativePath.split('/').filter(Boolean);

  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'پوشه ویدیوها';
}

if (folderInput) {
  folderInput.addEventListener('change', (e) => {
    const filesList = Array.from(e.target.files || []);

    if (!filesList.length) return;

    const fileEntries = filesList.map((file) => ({
      file,
      folder: getFolderFromRelativePath(file),
    }));

    processScannedFiles(fileEntries);

    returnToExplorer(true);

    folderInput.value = '';
  });
}

async function readDirectoryEntries(reader) {
  const entries = [];

  while (true) {
    const batch = await new Promise((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });

    if (!batch.length) break;

    entries.push(...batch);
  }

  return entries;
}

async function traverseEntry(entry, parentFolder = '', output = []) {
  if (!entry) return output;

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

if (dropZone) {
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();

    dragDepth += 1;

    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();

    e.dataTransfer.dropEffect = 'copy';

    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();

    dragDepth = Math.max(0, dragDepth - 1);

    if (!dragDepth) {
      dropZone.classList.remove('dragover');
    }
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();

    dragDepth = 0;

    dropZone.classList.remove('dragover');

    const filesMap = [];

    const items = Array.from(e.dataTransfer?.items || []);

    if (items.length) {
      for (const item of items) {
        if (item.kind !== 'file') {
          continue;
        }

        const entry = item.webkitGetAsEntry?.();

        if (entry) {
          await traverseEntry(entry, '', filesMap);
        } else {
          const file = item.getAsFile?.();

          if (file) {
            filesMap.push({
              file,
              folder: 'فایل‌های دراگی',
            });
          }
        }
      }
    } else {
      for (const file of Array.from(e.dataTransfer?.files || [])) {
        filesMap.push({
          file,
          folder: 'فایل‌های دراگی',
        });
      }
    }

    if (filesMap.length) {
      processScannedFiles(filesMap);
    }
  });
}

function isVideoFile(file) {
  return Boolean(file && VIDEO_REGEX.test(file.name || ''));
}

function isSubtitleFile(file) {
  return Boolean(file && SUB_REGEX.test(file.name || ''));
}

function subtitleMatchScore(videoItem, subtitleItem) {
  if (videoItem.folder !== subtitleItem.folder) {
    return 0;
  }

  const videoName = videoItem.cleanName;

  const subName = subtitleItem.cleanName;

  if (!videoName || !subName) {
    return 0;
  }

  if (videoName === subName) {
    return 100;
  }

  const startsVideo = subName.startsWith(`${videoName} `);

  const startsSubtitle = videoName.startsWith(`${subName} `);

  return startsVideo || startsSubtitle ? 60 : 0;
}

function processScannedFiles(fileList) {
  const videoFiles = [];
  const subtitleFiles = [];

  for (const entry of fileList || []) {
    const file = entry?.file;

    if (!file) continue;

    const folder = entry.folder || 'پوشه ویدیوها';

    const baseName = file.name.replace(/\.[^/.]+$/, '');

    const item = {
      file,
      folder,
      name: file.name,
      baseName,
      cleanName: normalizeName(file.name),
    };

    if (isVideoFile(file)) {
      videoFiles.push(item);
    } else if (isSubtitleFile(file)) {
      subtitleFiles.push(item);
    }
  }

  // -----------------------------------------------------------
  // SUBTITLE INDEX
  // -----------------------------------------------------------

  const exactSubtitles = new Map();
  const subtitlesByFolder = new Map();

  for (const subtitle of subtitleFiles) {
    const exactKey = `${subtitle.folder}\0${subtitle.cleanName}`;

    const exactList = exactSubtitles.get(exactKey);

    if (exactList) {
      exactList.push(subtitle);
    } else {
      exactSubtitles.set(exactKey, [subtitle]);
    }

    const folderList = subtitlesByFolder.get(subtitle.folder);

    if (folderList) {
      folderList.push(subtitle);
    } else {
      subtitlesByFolder.set(subtitle.folder, [subtitle]);
    }
  }

  const foldersMap = new Map();

  for (const videoItem of videoFiles) {
    if (!foldersMap.has(videoItem.folder)) {
      foldersMap.set(videoItem.folder, []);
    }

    const exactMatches = exactSubtitles.get(`${videoItem.folder}\0${videoItem.cleanName}`) || [];

    let matchedSubs = exactMatches.map((sub) => ({
      sub,
      score: 100,
    }));

    if (!matchedSubs.length) {
      const sameFolderSubs = subtitlesByFolder.get(videoItem.folder) || [];

      matchedSubs = sameFolderSubs
        .map((sub) => ({
          sub,
          score: subtitleMatchScore(videoItem, sub),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.sub.name.localeCompare(b.sub.name, undefined, {
              numeric: true,
            }),
        );
    }

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
    videos: videos.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    ),
  }));

  library.sort((a, b) =>
    a.folderName.localeCompare(b.folderName, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  buildFlatPlaylist();
  resetRandomQueue();
  renderExplorer();
}

function buildFlatPlaylist() {
  flatPlaylist = [];

  for (const group of library) {
    for (const item of group.videos) {
      flatPlaylist.push({
        ...item,
        folderName: group.folderName,
      });
    }
  }
}

// -------------------------------------------------------------
// EXPLORER
// -------------------------------------------------------------

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

  for (const [index, item] of filteredVideos.entries()) {
    const card = document.createElement('div');

    card.className = 'video-poster-card';

    card.dataset.order = String(index);

    card._videoFile = item.file;

    const sizeMB = (item.file.size / (1024 * 1024)).toFixed(1);

    const thumb = document.createElement('div');

    thumb.className = 'poster-thumb-wrapper';

    const badges = document.createElement('div');

    badges.className = 'poster-badges';

    if (item.subFiles.length > 0) {
      const subBadge = document.createElement('span');

      subBadge.className = 'badge-sub';

      subBadge.textContent = 'CC';

      badges.appendChild(subBadge);
    } else {
      badges.appendChild(document.createElement('span'));
    }

    const sizeBadge = document.createElement('span');

    sizeBadge.className = 'badge-size';

    sizeBadge.textContent = `${sizeMB} MB`;

    badges.appendChild(sizeBadge);

    const placeholder = createSvgIcon('M8 5v14l11-7Z');

    placeholder.classList.add('poster-placeholder');

    thumb.append(badges, placeholder);

    const meta = document.createElement('div');

    meta.className = 'poster-meta';

    const title = document.createElement('span');

    title.className = 'poster-title';

    title.title = item.name;

    title.textContent = item.name;

    meta.appendChild(title);

    card.append(thumb, meta);

    card.addEventListener('click', () => {
      const globalIdx = flatPlaylist.findIndex((v) => v.file === item.file);

      if (globalIdx !== -1) {
        playIndex(globalIdx, group.videos);
      }
    });

    observeCard(card);

    gridEl.appendChild(card);
  }

  groupEl.append(headEl, gridEl);

  return groupEl;
}

function renderEmptyExplorer(message) {
  const empty = document.createElement('div');

  empty.className = 'explorer-empty-state';

  const icon = createSvgIcon('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');

  empty.appendChild(icon);

  const text = document.createElement('span');

  text.textContent = message;

  empty.appendChild(text);

  foldersContainer.appendChild(empty);
}

function renderExplorer() {
  resetPosterQueue();

  foldersContainer.innerHTML = '';

  const query = searchInput.value.toLocaleLowerCase('fa').trim();

  let totalVideos = 0;

  for (const group of library) {
    const filteredVideos = group.videos.filter((item) => {
      const matchSearch = item.name.toLocaleLowerCase('fa').includes(query);

      let matchFilter = true;

      if (activeFilter === 'subbed') {
        matchFilter = item.subFiles.length > 0;
      }

      if (activeFilter === 'nosub') {
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

  videoCounter.textContent = `${totalVideos} ویدیو یافت شد`;

  if (!totalVideos) {
    if (!library.length) {
      renderEmptyExplorer('هنوز هیچ ویدیویی به کتابخانه اضافه نشده است.');
    } else {
      renderEmptyExplorer('با این فیلتر یا عبارت جستجو، ویدیویی پیدا نشد.');
    }
  }
}

// -------------------------------------------------------------
// PLAYER / PLAYLIST
// -------------------------------------------------------------

function releaseActiveVideoSource() {
  video.pause();

  video.removeAttribute('src');
  video.load();

  if (activeObjectURL) {
    URL.revokeObjectURL(activeObjectURL);

    activeObjectURL = null;
  }
}

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
  if (!Number.isInteger(index) || index < 0 || index >= flatPlaylist.length) {
    return;
  }

  const item = flatPlaylist[index];

  if (!item?.file) return;

  currentPlaylistIndex = index;

  if (randomPlayback && randomQueue.length) {
    randomQueue = randomQueue.filter((queuedIndex) => queuedIndex !== index);
  }

  if (folderVideosList) {
    currentFolderVideos = folderVideosList;
  } else {
    const parentFolder = library.find((group) => group.folderName === item.folderName);

    currentFolderVideos = parentFolder ? parentFolder.videos : [item];
  }

  closeSubtitleMenu();
  closeSpeedMenu();

  livePlaylistDrawer.classList.remove('open');

  clearControlsTimer();

  playerStage.classList.remove('hide-controls');

  hidePlayerStatus();

  videoLoader.classList.remove('active');

  releaseActiveVideoSource();

  activeObjectURL = URL.createObjectURL(item.file);

  video.src = activeObjectURL;

  setPlayerView(true);

  renderLiveDrawer();

  resetSubtitlesForVideo();

  // Important:
  // Playback begins immediately to preserve user gesture state.
  safePlay();

  if (item.subFiles?.length) {
    loadSubtitle(item.subFiles[0]);
  }

  updateProgress();
  resetControlsTimer();
}

function renderLiveDrawer() {
  const currentItem = flatPlaylist[currentPlaylistIndex];

  drawerFolderTitle.textContent = currentItem?.folderName || '';

  drawerVideosList.innerHTML = '';

  for (const vid of currentFolderVideos) {
    const row = document.createElement('div');

    row.className = `drawer-v-item ${vid.file === currentItem?.file ? 'active' : ''}`;

    const icon = createSvgIcon('M8 5v14l11-7Z');

    const name = document.createElement('span');

    name.className = 'drawer-v-name';

    name.title = vid.name;

    name.textContent = vid.name;

    row.append(icon, name);

    row.addEventListener('click', (e) => {
      e.stopPropagation();

      const idx = flatPlaylist.findIndex((v) => v.file === vid.file);

      if (idx !== -1) {
        playIndex(idx, currentFolderVideos);
      }
    });

    drawerVideosList.appendChild(row);
  }
}

// -------------------------------------------------------------
// RANDOM PLAYBACK
// -------------------------------------------------------------

function shuffleArray(items) {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function rebuildRandomQueue() {
  randomQueue = flatPlaylist.map((_, index) => index).filter((index) => index !== currentPlaylistIndex);

  randomQueue = shuffleArray(randomQueue);
}

function updateRandomModeUI() {
  if (!randomModeBtn) return;

  randomModeBtn.classList.toggle('active', randomPlayback);

  randomModeBtn.setAttribute('aria-pressed', String(randomPlayback));

  randomModeBtn.setAttribute('title', randomPlayback ? 'پخش رندوم: روشن' : 'پخش رندوم: خاموش');

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

  return Number.isInteger(nextIndex) ? nextIndex : -1;
}

function playNextVideo() {
  if (randomPlayback) {
    const randomIndex = getRandomNextIndex();

    if (randomIndex !== -1) {
      playIndex(randomIndex);
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

// -------------------------------------------------------------
// EXPLORER RETURN
// -------------------------------------------------------------

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

  videoLoader.classList.remove('active');

  resetSubtitlesForVideo();

  setPlayerView(false);
}

// -------------------------------------------------------------
// SUBTITLE STATE
// -------------------------------------------------------------

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

  subtitleInput.value = '';
}

// -------------------------------------------------------------
// SUBTITLE PARSER
// -------------------------------------------------------------

function parseTimestamp(value) {
  if (!value) return NaN;

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

  if (![h, m, s].every(Number.isFinite) || m < 0 || m > 59 || s < 0 || s >= 60 || h < 0) {
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

  const timeIdx = lines.findIndex((line) => line.includes('-->'));

  if (timeIdx === -1) {
    return null;
  }

  const timing = lines[timeIdx].split('-->').map((value) => value.trim());

  if (timing.length < 2) {
    return null;
  }

  const start = parseTimestamp(timing[0].split(/\s+/)[0]);

  const end = parseTimestamp(timing[1].split(/\s+/)[0]);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  const text = cleanSubtitleText(lines.slice(timeIdx + 1).join('\n'));

  if (!text) return null;

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

// -------------------------------------------------------------
// SUBTITLE UI
// -------------------------------------------------------------

function updateSubtitleStyle() {
  const size = safeNumber(subtitleSize.value, 100, 70, 180);

  const position = safeNumber(subtitlePosition.value, 8, 3, 25);

  subtitleSize.value = String(size);

  subtitlePosition.value = String(position);

  subtitleSizeValue.textContent = `${size}%`;

  subtitlePositionValue.textContent = `${position}%`;

  subtitleLayer.style.bottom = `${position}%`;

  const element = subtitleLayer.querySelector('.subtitle-bubble');

  if (!element) return;

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

// -------------------------------------------------------------
// SPEED
// -------------------------------------------------------------

function cleanSpeed(value) {
  return safeNumber(value, 1, MIN_SPEED, MAX_SPEED);
}

function formatSpeed(value) {
  const speed = cleanSpeed(value);

  return Number.isInteger(speed) ? `${speed}x` : `${Number(speed.toFixed(2))}x`;
}

function updateSpeedUI(value) {
  const speed = cleanSpeed(value);

  speedInput.value = String(speed);

  speedRange.value = String(speed);

  speedValue.textContent = formatSpeed(speed);

  speedPreview.textContent = Number(speed.toFixed(2));
}

function setPlaybackRate(value) {
  const speed = cleanSpeed(value);

  video.playbackRate = speed;

  ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch'].forEach((prop) => {
    if (prop in video) {
      video[prop] = true;
    }
  });

  storeValue('aura_speed', speed);

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
}

function closeSpeedMenu() {
  speedMenu.classList.remove('open');

  speedBtn.classList.remove('active');

  if (!video.paused) {
    scheduleHideControls();
  }
}

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

function togglePlay() {
  if (video.paused || video.ended) {
    safePlay();
  } else {
    video.pause();
  }
}

// -------------------------------------------------------------
// PROGRESS
// -------------------------------------------------------------

function formatTime(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0));

  const h = Math.floor(total / 3600);

  const m = Math.floor((total % 3600) / 60);

  const s = total % 60;

  const mm = String(m).padStart(2, '0');

  const ss = String(s).padStart(2, '0');

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function updateProgress() {
  const current = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;

  const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

  currentTime.textContent = formatTime(current);

  duration.textContent = formatTime(total);

  const pct = total > 0 ? clamp((current / total) * 100, 0, 100) : 0;

  progressBar.style.width = `${pct}%`;

  progressThumb.style.left = `${pct}%`;

  if (video.buffered.length && total > 0) {
    try {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);

      bufferBar.style.width = `${clamp((bufferedEnd / total) * 100, 0, 100)}%`;
    } catch {
      bufferBar.style.width = '0%';
    }
  } else {
    bufferBar.style.width = '0%';
  }
}

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

  if (!rect.width) return;

  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);

  video.currentTime = ratio * video.duration;

  updateProgress();
  updateSubtitles();
}

function showSeekFeedback(direction) {
  const el = direction === 'left' ? seekLeftFeedback : seekRightFeedback;

  el.classList.add('show');

  clearTimeout(el.timer);

  el.timer = setTimeout(() => el.classList.remove('show'), 600);
}

// -------------------------------------------------------------
// CONTROL VISIBILITY
// -------------------------------------------------------------

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

  clearTimeout(controlsTimer);

  if (!video.paused && !video.ended) {
    scheduleHideControls();
  }
}

function setLoading(active) {
  videoLoader.classList.toggle('active', active);
}

// -------------------------------------------------------------
// VOLUME
// -------------------------------------------------------------

function updateVolumeUI() {
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
    storeValue('aura_volume', volume);
  }

  updateVolumeUI();
}

// -------------------------------------------------------------
// FULLSCREEN / PIP
// -------------------------------------------------------------

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

function syncFullscreenUI() {
  const active = document.fullscreenElement === playerStage;

  playerStage.classList.toggle('is-fullscreen', active);

  showControls();
}

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------

openFolderBtn?.addEventListener('click', handleDirectoryPicker);

document.getElementById('fabSelectFolder')?.addEventListener('click', handleDirectoryPicker);

topBackBtn?.addEventListener('click', () => returnToExplorer(true));

singleFileBtn?.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

fileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];

  e.target.value = '';

  if (!file || !isVideoFile(file)) {
    return;
  }

  const singleObj = {
    file,
    name: file.name,
    baseName: file.name.replace(/\.[^/.]+$/, ''),
    cleanName: normalizeName(file.name),
    subFiles: [],
  };

  library = [
    {
      folderName: 'فایل‌های تکی',
      videos: [singleObj],
    },
  ];

  buildFlatPlaylist();
  resetRandomQueue();

  playIndex(0, [singleObj]);
});

searchInput?.addEventListener('input', renderExplorer);

document.getElementById('filterAll')?.addEventListener('click', (e) => {
  filterChips.forEach((chip) => chip.classList.remove('active'));

  e.currentTarget.classList.add('active');

  activeFilter = 'all';

  renderExplorer();
});

document.getElementById('filterSubbed')?.addEventListener('click', (e) => {
  filterChips.forEach((chip) => chip.classList.remove('active'));

  e.currentTarget.classList.add('active');

  activeFilter = 'subbed';

  renderExplorer();
});

document.getElementById('filterNoSub')?.addEventListener('click', (e) => {
  filterChips.forEach((chip) => chip.classList.remove('active'));

  e.currentTarget.classList.add('active');

  activeFilter = 'nosub';

  renderExplorer();
});

// -------------------------------------------------------------
// PLAY CONTROLS
// -------------------------------------------------------------

playBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

centerPlay?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

video.addEventListener('click', (e) => {
  if (e.target === video) {
    togglePlay();
  }
});

// -------------------------------------------------------------
// DRAWER
// -------------------------------------------------------------

toggleDrawerBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  livePlaylistDrawer.classList.add('open');

  showControls();
});

closeDrawerBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  livePlaylistDrawer.classList.remove('open');

  showControls();
});

// -------------------------------------------------------------
// VIDEO EVENTS
// -------------------------------------------------------------

video.addEventListener('play', () => {
  playerStage.classList.add('playing');

  playBtn.classList.add('playing');

  hidePlayerStatus();
  resetControlsTimer();
});

video.addEventListener('pause', () => {
  playerStage.classList.remove('playing');

  playBtn.classList.remove('playing');

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

video.addEventListener('error', () => {
  setLoading(false);

  const code = video.error?.code;

  let message = 'پخش این فایل ممکن نیست.';

  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    message = 'فرمت یا کُدک این فایل توسط مرورگر پشتیبانی نمی‌شود. برای وب، MP4/H.264/AAC یا WebM را استفاده کنید.';
  } else if (code === MediaError.MEDIA_ERR_DECODE) {
    message = 'فایل قابل شناسایی است اما کُدک/دادهٔ ویدیو قابل decode نیست.';
  } else if (code === MediaError.MEDIA_ERR_NETWORK) {
    message = 'خواندن فایل ویدیو با خطا مواجه شد.';
  }

  showPlayerStatus(message, {
    error: true,
    timeout: 9000,
  });
});

// -------------------------------------------------------------
// SEEK
// -------------------------------------------------------------

backBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  seekBy(-SEEK_STEP);
  showSeekFeedback('left');
});

forwardBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  seekBy(SEEK_STEP);
  showSeekFeedback('right');
});

// -------------------------------------------------------------
// PLAYLIST
// -------------------------------------------------------------

prevVideoBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  playPrevVideo();
});

nextVideoBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  playNextVideo();
});

// -------------------------------------------------------------
// RANDOM BUTTON
// -------------------------------------------------------------

randomModeBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleRandomPlayback();
});

// -------------------------------------------------------------
// PROGRESS BAR
// -------------------------------------------------------------

progressArea?.addEventListener('pointerdown', seekToPointerEvent);

// -------------------------------------------------------------
// CONTROL VISIBILITY
// -------------------------------------------------------------

playerStage?.addEventListener('pointermove', showControls);

playerStage?.addEventListener('pointerdown', showControls);

// -------------------------------------------------------------
// SUBTITLE MENU
// -------------------------------------------------------------

subBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  subtitleMenu.classList.contains('open') ? closeSubtitleMenu() : openSubtitleMenu();
});

closeSubtitle?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSubtitleMenu();
});

subtitleToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSubtitle();
});

subBgToggleBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  subBgToggleBtn.classList.toggle('active');

  updateSubtitleStyle();
});

subtitleSize?.addEventListener('input', updateSubtitleStyle);

subtitlePosition?.addEventListener('input', updateSubtitleStyle);

removeSubtitle?.addEventListener('click', (e) => {
  e.stopPropagation();
  clearCurrentSubtitle();
});

subtitleUploadBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  subtitleInput.value = '';
  subtitleInput.click();
});

subtitleInput?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];

  e.target.value = '';

  if (file) {
    await loadSubtitle(file);
  }
});

// -------------------------------------------------------------
// SPEED MENU
// -------------------------------------------------------------

speedBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  speedMenu.classList.contains('open') ? closeSpeedMenu() : openSpeedMenu();
});

closeSpeed?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSpeedMenu();
});

speedRange?.addEventListener('input', () => updateSpeedUI(speedRange.value));

speedInput?.addEventListener('input', () => {
  const val = Number.parseFloat(speedInput.value);

  if (!Number.isFinite(val)) {
    return;
  }

  const clean = clamp(val, MIN_SPEED, MAX_SPEED);

  speedRange.value = String(clean);

  speedPreview.textContent = Number(clean.toFixed(2));
});

applySpeed?.addEventListener('click', (e) => {
  e.stopPropagation();
  applySelectedSpeed();
});

// -------------------------------------------------------------
// GLOBAL CLICK
// -------------------------------------------------------------

document.addEventListener('click', (e) => {
  if (!e.target.closest('#subtitleMenu') && !e.target.closest('#subtitleBtn')) {
    closeSubtitleMenu();
  }

  if (!e.target.closest('#speedMenu') && !e.target.closest('#speedBtn')) {
    closeSpeedMenu();
  }

  if (!e.target.closest('#livePlaylistDrawer') && !e.target.closest('#toggleDrawerBtn')) {
    livePlaylistDrawer.classList.remove('open');
  }
});

// -------------------------------------------------------------
// VOLUME
// -------------------------------------------------------------

volumeSlider?.addEventListener('input', (e) => {
  setVolume(e.target.value);
});

muteBtn?.addEventListener('click', (e) => {
  e.stopPropagation();

  if (video.muted || video.volume === 0) {
    const restore = lastVolume > 0 ? lastVolume : 0.5;

    video.volume = restore;

    video.muted = false;

    storeValue('aura_volume', restore);
  } else {
    lastVolume = video.volume;

    video.muted = true;
  }

  updateVolumeUI();
});

// -------------------------------------------------------------
// FULLSCREEN
// -------------------------------------------------------------

fullscreenBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

// -------------------------------------------------------------
// PIP
// -------------------------------------------------------------

pipBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePiP();
});

document.addEventListener('fullscreenchange', syncFullscreenUI);

if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') {
  if (pipBtn) {
    pipBtn.disabled = true;

    pipBtn.setAttribute('aria-disabled', 'true');

    pipBtn.title = 'تصویر در تصویر در این مرورگر پشتیبانی نمی‌شود';
  }
}

// -------------------------------------------------------------
// KEYBOARD SHORTCUTS
// -------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (!playerWorkspace.classList.contains('active')) {
    return;
  }

  const target = e.target;

  const tag = target?.tagName;

  const interactive = target?.closest?.('button, input, textarea, select, a, [contenteditable="true"]');

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || interactive) {
    if (e.key === 'Escape') {
      closeSubtitleMenu();
      closeSpeedMenu();

      livePlaylistDrawer.classList.remove('open');
    }

    return;
  }

  switch (e.key.toLowerCase()) {
    case ' ':
    case 'k':
      e.preventDefault();
      togglePlay();
      break;

    case 'arrowleft':
      e.preventDefault();

      seekBy(-SEEK_STEP);

      showSeekFeedback('left');

      break;

    case 'arrowright':
      e.preventDefault();

      seekBy(SEEK_STEP);

      showSeekFeedback('right');

      break;

    case 'f':
      e.preventDefault();
      toggleFullscreen();
      break;

    case 'm':
      e.preventDefault();
      muteBtn.click();
      break;

    case 'n':
      e.preventDefault();
      playNextVideo();
      break;

    case 'p':
      e.preventDefault();
      playPrevVideo();
      break;

    case 'r':
      e.preventDefault();
      toggleRandomPlayback();
      break;

    case 'escape':
      closeSubtitleMenu();
      closeSpeedMenu();

      livePlaylistDrawer.classList.remove('open');

      break;
  }
});

// -------------------------------------------------------------
// INITIAL UI STATE
// -------------------------------------------------------------

updateSpeedUI(storedSpeed);

updateVolumeUI();

updateSubtitleStyle();

updateRandomModeUI();
