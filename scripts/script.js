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
const embeddedSubtitleSection = document.getElementById('embeddedSubtitleSection');
const embeddedSubtitleTracksList = document.getElementById('embeddedSubtitleTracks');
const embeddedSubtitleCount = document.getElementById('embeddedSubtitleCount');
const embeddedSubtitleMessage = document.getElementById('embeddedSubtitleMessage');

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
const quickMenuBtn = document.getElementById('quickMenuBtn');

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
const aspectBtn = document.getElementById('aspectBtn');
const aspectModeLabel = document.getElementById('aspectModeLabel');
const fullscreenBtn = document.getElementById('fullscreenBtn');

const seekLeftFeedback = document.getElementById('seekLeftFeedback');
const seekRightFeedback = document.getElementById('seekRightFeedback');

const livePlaylistDrawer = document.getElementById('livePlaylistDrawer');
const drawerVideosList = document.getElementById('drawerVideosList');
const drawerFolderTitle = document.getElementById('drawerFolderTitle');
const drawerNowPlaying = document.getElementById('drawerNowPlaying');
const drawerPlaybackLabel = document.getElementById('drawerPlaybackLabel');
const drawerPlaybackName = document.getElementById('drawerPlaybackName');
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
const AUTO_PRELOAD_MAX_BYTES = 768 * 1024 * 1024;
const PROGRESS_UI_INTERVAL_MS = 120;
const HIGH_SPEED_STALL_NOTICE_MS = 1400;
const EXTREME_SPEED_RATE = 8;

const SEEK_STEP = 10;
const HIDE_DELAY = 2500;

const VIDEO_REGEX = /\.(mp4|webm|mkv|mov|avi|m4v|ts|ogv)$/i;
const SUB_REGEX = /\.(srt|vtt)$/i;

const STORAGE_VOLUME = 'aura_volume';
const STORAGE_SPEED = 'aura_speed';
const STORAGE_ASPECT = 'aura_aspect_ratio';

/* =========================================================
   STATE
========================================================= */

let library = [];
let flatPlaylist = [];
let flatPlaylistIndexByFile = new Map();

let currentPlaylistIndex = -1;
let currentFolderVideos = [];

let subtitles = [];
let subtitleEnabled = false;
let subtitleFile = null;
let currentSubtitleIndex = -1;
let activeSubtitleSource = 'none';
let externalSubtitleEntry = null;
let embeddedSubtitleTracks = [];
let matroskaSubtitleTracks = [];
let nativeSubtitleTracks = [];
let selectedEmbeddedSubtitleKey = null;
let embeddedSubtitleScanController = null;
let embeddedSubtitleScanGeneration = 0;
let embeddedSubtitleScanProgress = 0;
let nativeTextTrackListenerAttached = false;
let embeddedSubtitleNotice = '';

let activeObjectURL = null;
let pendingMatroskaFile = null;
let matroskaScanStarted = false;

let activeFilter = 'all';

let controlsTimer = null;
let statusTimer = null;

let dragDepth = 0;

let lastVolume = 1;

let randomPlayback = false;
let randomQueue = [];

let currentPlaybackRate = 1;

// Advanced interaction state.
let wheelDeltaAccumulator = 0;
let wheelDeltaTimer = null;
let osdTimer = null;
let scrubState = null;
let playerContextMenu = null;
let keyboardHelpPanel = null;
let aspectRatioMode = 'contain';
let searchRenderTimer = null;
let lastProgressUiUpdateAt = 0;
let progressUpdateFrame = 0;
let lastProgressLabel = '';
let lastDurationLabel = '';
let lastProgressAriaText = '';
let lastProgressPercent = -1;
let lastBufferPercent = -1;
let highSpeedStallTimer = null;
let highSpeedStallNoticeShown = false;

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
   ADVANCED PLAYER FEEDBACK + ACTIONS
========================================================= */

function ensurePlayerOSD() {
  let osd = document.getElementById('playerOSD');
  if (osd) return osd;

  osd = document.createElement('div');
  osd.id = 'playerOSD';
  osd.className = 'player-osd hidden';
  osd.setAttribute('role', 'status');
  osd.setAttribute('aria-live', 'polite');

  const title = document.createElement('strong');
  title.className = 'player-osd-title';
  const value = document.createElement('span');
  value.className = 'player-osd-value';
  const meter = document.createElement('div');
  meter.className = 'player-osd-meter';
  const fill = document.createElement('i');
  meter.appendChild(fill);
  osd.append(title, value, meter);
  playerStage.appendChild(osd);
  return osd;
}

function showPlayerOSD(title, value, percent = null) {
  const osd = ensurePlayerOSD();
  osd.querySelector('.player-osd-title').textContent = title;
  osd.querySelector('.player-osd-value').textContent = value;
  const meter = osd.querySelector('.player-osd-meter');
  meter.hidden = percent === null;
  if (percent !== null) {
    meter.firstElementChild.style.width = `${clamp(percent, 0, 100)}%`;
  }
  osd.classList.remove('hidden');
  clearTimeout(osdTimer);
  osdTimer = window.setTimeout(() => osd.classList.add('hidden'), 1050);
}

function adjustVolume(delta) {
  const base = video.muted || video.volume === 0
    ? (lastVolume > 0 ? lastVolume : 0.5)
    : video.volume;
  const next = clamp(base + delta, 0, 1);
  setVolume(next);
  showPlayerOSD('میزان صدا', `${Math.round(next * 100)}%`, next * 100);
}

function adjustPlaybackRate(delta) {
  const next = clamp(Math.round((currentPlaybackRate + delta) * 100) / 100, MIN_SPEED, MAX_SPEED);
  setPlaybackRate(next);
  showPlayerOSD('سرعت پخش', formatSpeed(next));
}

function toggleLoopPlayback() {
  video.loop = !video.loop;
  refreshPlayerContextMenu();
  showPlayerOSD('تکرار ویدیو', video.loop ? 'روشن' : 'خاموش');
  return video.loop;
}

const ASPECT_RATIO_MODES = [
  { value: 'contain', short: 'کامل', label: 'نمایش کامل', description: 'نمایش کل تصویر بدون برش' },
  { value: 'cover', short: 'پرکردن', label: 'پرکردن قاب', description: 'پرکردن قاب با احتمال برش لبه‌ها' },
  { value: 'fill', short: 'کشیده', label: 'کشیده', description: 'پرکردن قاب با تغییر نسبت تصویر' },
];

function getAspectRatioMode() {
  return ASPECT_RATIO_MODES.find((mode) => mode.value === aspectRatioMode) || ASPECT_RATIO_MODES[0];
}

try {
  const savedAspectMode = localStorage.getItem(STORAGE_ASPECT);
  if (ASPECT_RATIO_MODES.some((mode) => mode.value === savedAspectMode)) {
    aspectRatioMode = savedAspectMode;
  }
} catch {
  // Local storage may be blocked; use the default mode.
}

function updateAspectRatioUI() {
  const mode = getAspectRatioMode();
  video.style.objectFit = mode.value;

  if (aspectModeLabel) aspectModeLabel.textContent = mode.short;
  if (aspectBtn) {
    aspectBtn.dataset.mode = mode.value;
    aspectBtn.title = `حالت نمایش: ${mode.label} — ${mode.description} (A)`;
    aspectBtn.setAttribute('aria-label', `تغییر حالت نمایش تصویر؛ حالت فعلی: ${mode.label}`);
    aspectBtn.classList.toggle('is-active', mode.value !== 'contain');
  }
  refreshPlayerContextMenu();
}

function cycleAspectRatio() {
  const index = ASPECT_RATIO_MODES.findIndex((mode) => mode.value === aspectRatioMode);
  aspectRatioMode = ASPECT_RATIO_MODES[(index + 1) % ASPECT_RATIO_MODES.length].value;
  storeValue(STORAGE_ASPECT, aspectRatioMode);
  updateAspectRatioUI();
  showPlayerOSD('حالت نمایش تصویر', getAspectRatioMode().label);
}

function getCurrentVideoFileName() {
  const item = flatPlaylist[currentPlaylistIndex];
  return item?.file?.name || 'video';
}

async function captureVideoFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    showPlayerStatus('برای ثبت تصویر، ابتدا پخش ویدیو را شروع کنید.', { error: true });
    return;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Screenshot encoding failed')), 'image/png');
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const baseName = getCurrentVideoFileName().replace(/\.[^/.]+$/, '') || 'video';
    anchor.href = url;
    anchor.download = `${baseName}-${formatTime(video.currentTime).replaceAll(':', '-')}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showPlayerOSD('تصویر ثبت شد', `${canvas.width} × ${canvas.height}`);
  } catch (error) {
    showPlayerStatus('ثبت تصویر در این مرورگر ممکن نشد.', { error: true });
  }
}

function getPlayerOverlayHost() {
  return document.fullscreenElement === playerStage ? playerStage : document.body;
}

function mountPlayerOverlay(element) {
  if (!element) return;
  const fullscreen = document.fullscreenElement === playerStage;
  const host = fullscreen ? playerStage : document.body;
  if (element.parentElement !== host) host.appendChild(element);
  element.style.position = fullscreen ? 'absolute' : 'fixed';
}

function getPlayerOverlayViewport() {
  if (document.fullscreenElement === playerStage) {
    const rect = playerStage.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, fullscreen: true };
  }

  const visualViewport = window.visualViewport;
  const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
  return {
    // visualViewport offsets matter when a phone is pinch-zoomed or its
    // on-screen keyboard changes the visible portion of the layout viewport.
    left: visualViewport?.offsetLeft || 0,
    top: visualViewport?.offsetTop || 0,
    width: Math.min(layoutWidth, visualViewport?.width || window.innerWidth),
    height: visualViewport?.height || window.innerHeight,
    fullscreen: false,
  };
}

function isCompactOverlayViewport(viewport = getPlayerOverlayViewport()) {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return viewport.width <= 760 || (viewport.width <= 900 && coarsePointer);
}

function sizePlayerOverlayForViewport(element, bounds) {
  const compact = isCompactOverlayViewport(bounds);
  const gutter = compact ? 20 : 24;
  const availableWidth = Math.max(0, bounds.width - gutter);
  const availableHeight = Math.max(0, bounds.height - gutter);
  element.style.left = '0px';
  element.style.top = '0px';
  if (element.classList.contains('player-context-menu')) {
    element.style.setProperty('width', `${Math.min(compact ? 360 : 420, availableWidth)}px`, 'important');
  } else if (element.classList.contains('player-keyboard-help')) {
    element.style.setProperty('width', `${Math.min(compact ? 560 : 700, availableWidth)}px`, 'important');
  } else if (element.classList.contains('subtitle-menu')) {
    element.style.setProperty('width', `${Math.min(compact ? 330 : 340, availableWidth)}px`, 'important');
  } else if (element.classList.contains('speed-menu')) {
    element.style.setProperty('width', `${Math.min(compact ? 292 : 300, availableWidth)}px`, 'important');
  }
  element.style.setProperty('max-width', `${availableWidth}px`, 'important');
  element.style.setProperty('max-height', `${availableHeight}px`, 'important');
}

function getPlayerOverlayBounds(viewport = getPlayerOverlayViewport()) {
  const stage = playerStage?.getBoundingClientRect();
  if (!stage) {
    return { left: viewport.fullscreen ? 0 : viewport.left, top: viewport.fullscreen ? 0 : viewport.top, width: viewport.width, height: viewport.height };
  }

  if (viewport.fullscreen) {
    return { left: 0, top: 0, width: stage.width, height: stage.height };
  }

  const left = Math.max(viewport.left, stage.left);
  const top = Math.max(viewport.top, stage.top);
  const right = Math.min(viewport.left + viewport.width, stage.right);
  const bottom = Math.min(viewport.top + viewport.height, stage.bottom);
  if (right - left < 180 || bottom - top < 160) {
    return { left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height };
  }
  return { left, top, width: right - left, height: bottom - top };
}

function positionPlayerOverlayCentered(element) {
  if (!element) return;
  mountPlayerOverlay(element);
  const viewport = getPlayerOverlayViewport();
  const bounds = getPlayerOverlayBounds(viewport);
  sizePlayerOverlayForViewport(element, bounds);
  const rect = element.getBoundingClientRect();
  element.style.setProperty('left', `${bounds.left + Math.max(8, (bounds.width - rect.width) / 2)}px`, 'important');
  element.style.setProperty('right', 'auto', 'important');
  element.style.setProperty('top', `${bounds.top + Math.max(8, (bounds.height - rect.height) / 2)}px`, 'important');
  element.style.setProperty('bottom', 'auto', 'important');
}

function positionPlayerOverlayAtPoint(element, clientX, clientY) {
  mountPlayerOverlay(element);
  const viewport = getPlayerOverlayViewport();
  const bounds = getPlayerOverlayBounds(viewport);
  sizePlayerOverlayForViewport(element, bounds);
  if (isCompactOverlayViewport(bounds)) {
    positionPlayerOverlayCentered(element);
    return;
  }

  const rect = element.getBoundingClientRect();
  const localX = clientX - bounds.left;
  const localY = clientY - bounds.top;
  const left = clamp(localX, 8, Math.max(8, bounds.width - rect.width - 8));
  const top = clamp(localY, 8, Math.max(8, bounds.height - rect.height - 8));
  element.style.setProperty('left', `${bounds.left + left}px`, 'important');
  element.style.setProperty('right', 'auto', 'important');
  element.style.setProperty('top', `${bounds.top + top}px`, 'important');
  element.style.setProperty('bottom', 'auto', 'important');
}

function positionPlayerOverlayNear(element, trigger, preferred = 'above') {
  if (!element || !trigger) return;
  mountPlayerOverlay(element);
  const viewport = getPlayerOverlayViewport();
  const bounds = getPlayerOverlayBounds(viewport);
  sizePlayerOverlayForViewport(element, bounds);
  const anchor = trigger.getBoundingClientRect();
  const panel = element.getBoundingClientRect();
  const left = clamp(
    anchor.left - bounds.left + (anchor.width - panel.width) / 2,
    8,
    Math.max(8, bounds.width - panel.width - 8),
  );
  const above = anchor.top - bounds.top - panel.height - 12;
  const below = anchor.bottom - bounds.top + 12;
  const canFitAbove = above >= 8;
  const canFitBelow = below + panel.height <= bounds.height - 8;
  let top;
  if (preferred === 'below') top = canFitBelow ? below : (canFitAbove ? above : 8);
  else top = canFitAbove ? above : (canFitBelow ? below : 8);
  element.style.setProperty('left', `${bounds.left + left}px`, 'important');
  element.style.setProperty('right', 'auto', 'important');
  element.style.setProperty('top', `${bounds.top + clamp(top, 8, Math.max(8, bounds.height - panel.height - 8))}px`, 'important');
  element.style.setProperty('bottom', 'auto', 'important');
}

function repositionOpenPlayerOverlays() {
  if (playerContextMenu?.classList.contains('open')) {
    const viewport = getPlayerOverlayViewport();
    const anchor = playerContextMenuAnchor || { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
    positionPlayerOverlayAtPoint(playerContextMenu, anchor.x, anchor.y);
  }
  if (keyboardHelpPanel?.classList.contains('open')) {
    positionPlayerOverlayCentered(keyboardHelpPanel);
  }
  if (speedMenu?.classList.contains('open')) positionPlayerOverlayNear(speedMenu, speedBtn);
  if (subtitleMenu?.classList.contains('open')) positionPlayerOverlayNear(subtitleMenu, subBtn);
}

let playerContextMenuAnchor = null;

function closePlayerContextMenu() {
  if (!playerContextMenu) return;
  playerContextMenu.classList.remove('open');
  playerContextMenu.setAttribute('aria-hidden', 'true');
  quickMenuBtn?.setAttribute('aria-expanded', 'false');
}

function refreshPlayerContextMenu() {
  if (!playerContextMenu) return;

  const isPlaying = !video.paused && !video.ended;
  const isMuted = video.muted || video.volume === 0;
  const playItem = playerContextMenu.querySelector('[data-action="toggle-play"] .player-context-label');
  const playIconPath = playerContextMenu.querySelector('[data-action="toggle-play"] .player-context-icon path');
  const muteItem = playerContextMenu.querySelector('[data-action="mute"] .player-context-label');
  const speedItem = playerContextMenu.querySelector('[data-action="speed"] .player-context-label');
  const aspectItem = playerContextMenu.querySelector('[data-action="aspect"] .player-context-label');
  const subtitleItem = playerContextMenu.querySelector('[data-action="subtitles"] .player-context-label');
  const playbackStatus = playerContextMenu.querySelector('[data-status="playback"]');
  const speedStatus = playerContextMenu.querySelector('[data-status="speed"]');

  if (playItem) playItem.textContent = isPlaying ? 'توقف ویدیو' : 'ادامه پخش';
  if (playIconPath) {
    playIconPath.setAttribute('d', isPlaying
      ? 'M6 5h4v14H6zm8 0h4v14h-4z'
      : 'M8 5v14l11-7-11-7Z');
  }
  if (muteItem) muteItem.textContent = isMuted ? 'فعال‌کردن صدا' : 'بی‌صدا کردن';
  if (speedItem) speedItem.textContent = `سرعت پخش · ${formatSpeed(currentPlaybackRate)}`;
  if (aspectItem) aspectItem.textContent = `حالت تصویر · ${getAspectRatioMode().short}`;
  if (subtitleItem) subtitleItem.textContent = subtitleEnabled ? 'خاموش‌کردن زیرنویس' : 'روشن‌کردن زیرنویس';

  if (playbackStatus) {
    playbackStatus.dataset.state = isPlaying ? 'playing' : 'paused';
    const statusText = playbackStatus.querySelector('.player-context-status-text');
    if (statusText) statusText.textContent = isPlaying ? 'در حال پخش' : 'متوقف';
  }
  if (speedStatus) {
    const statusText = speedStatus.querySelector('.player-context-status-text');
    if (statusText) statusText.textContent = formatSpeed(currentPlaybackRate);
  }

  playerContextMenu.querySelector('[data-action="mute"]')?.setAttribute('aria-pressed', String(isMuted));
  playerContextMenu.querySelector('[data-action="aspect"]')?.setAttribute('aria-pressed', String(aspectRatioMode !== 'contain'));
}

function ensurePlayerContextMenu() {
  if (playerContextMenu) return playerContextMenu;

  const menu = document.createElement('div');
  menu.id = 'playerContextMenu';
  menu.className = 'player-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-hidden', 'true');
  menu.setAttribute('aria-label', 'کنترل‌های سریع پلیر');

  const header = document.createElement('div');
  header.className = 'player-context-header';

  const heading = document.createElement('div');
  heading.className = 'player-context-heading';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'player-context-eyebrow';
  eyebrow.textContent = 'AURA PLAYER';
  const title = document.createElement('strong');
  title.textContent = 'کنترل‌های سریع';
  const description = document.createElement('small');
  description.textContent = 'فرمان‌های پرکاربرد پلیر';

  const statusBar = document.createElement('div');
  statusBar.className = 'player-context-statusbar';
  const playbackStatus = document.createElement('span');
  playbackStatus.className = 'player-context-status';
  playbackStatus.dataset.status = 'playback';
  const playbackDot = document.createElement('i');
  playbackDot.setAttribute('aria-hidden', 'true');
  const playbackText = document.createElement('span');
  playbackText.className = 'player-context-status-text';
  playbackStatus.append(playbackDot, playbackText);

  const speedStatus = document.createElement('span');
  speedStatus.className = 'player-context-status player-context-speed-status';
  speedStatus.dataset.status = 'speed';
  const speedText = document.createElement('span');
  speedText.className = 'player-context-status-text';
  speedStatus.append(speedText);
  statusBar.append(playbackStatus, speedStatus);
  heading.append(eyebrow, title, description, statusBar);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'player-context-close';
  closeButton.setAttribute('aria-label', 'بستن منوی کنترل‌های سریع');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closePlayerContextMenu);
  header.append(heading, closeButton);
  menu.appendChild(header);

  const iconPaths = {
    play: 'M8 5v14l11-7-11-7Z',
    back: 'M11 5v4l-6-5v16l6-5v4l9-7-9-7Z',
    forward: 'M13 5v4l6-5v16l-6-5v4l-9-7 9-7Z',
    sound: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-3-4.24v8.48a4.5 4.5 0 0 0 3-4.24ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54Z',
    speed: 'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm1 4h-2v6l5 3 1-1.7-4-2.3V7Z',
    fit: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM6 6v12h12V6H6Zm2 2h8v8H8V8Z',
    subtitles: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v10h16V7H4Zm2 3h5v2H6v-2Zm7 0h5v2h-5v-2Zm-7 3h3v2H6v-2Zm5 0h7v2h-7v-2Z',
    fullscreen: 'M3 3h7v2H5v5H3V3Zm11 0h7v7h-2V5h-5V3ZM3 14h2v5h5v2H3v-7Zm16 0h2v7h-7v-2h5v-5Z',
    help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-.1-5.3a1.15 1.15 0 1 0 .01 2.3 1.15 1.15 0 0 0-.01-2.3ZM12 6.2c-1.8 0-3.1 1.1-3.3 2.8l1.9.3c.1-.9.6-1.4 1.4-1.4 1 0 1.5.5 1.5 1.3 0 .6-.3.9-1 1.5-1 .7-1.4 1.4-1.4 2.5v.4H13v-.3c0-.6.2-.9 1-1.5.9-.7 1.4-1.4 1.4-2.6 0-1.8-1.4-3-3.4-3Z',
  };

  const actions = [
    ['toggle-play', 'پخش / توقف', 'Space', 'play', 'primary'],
    ['backward', '۱۰ ثانیه عقب', '←', 'back', ''],
    ['forward', '۱۰ ثانیه جلو', '→', 'forward', ''],
    ['mute', 'قطع / وصل صدا', 'M', 'sound', ''],
    ['speed', 'سرعت پخش', '[ / ]', 'speed', ''],
    ['aspect', 'حالت نمایش تصویر', 'A', 'fit', ''],
    ['subtitles', 'زیرنویس', 'C', 'subtitles', ''],
    ['fullscreen', 'تمام‌صفحه', 'F', 'fullscreen', 'wide'],
  ];

  const actionGrid = document.createElement('div');
  actionGrid.className = 'player-context-actions';
  actionGrid.setAttribute('aria-label', 'فرمان‌های پرکاربرد');

  for (const [action, label, shortcut, iconName, variant] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-context-item';
    if (variant) button.dataset.variant = variant;
    button.dataset.action = action;
    button.setAttribute('role', 'menuitem');
    if (action === 'mute' || action === 'aspect') button.setAttribute('aria-pressed', 'false');
    if (action === 'toggle-play') button.setAttribute('aria-keyshortcuts', 'Space');

    const icon = createSvgIcon(iconPaths[iconName]);
    icon.classList.add('player-context-icon');
    const text = document.createElement('span');
    text.className = 'player-context-label';
    text.textContent = label;
    const key = document.createElement('kbd');
    key.textContent = shortcut;
    button.append(icon, text, key);
    actionGrid.appendChild(button);
  }
  menu.appendChild(actionGrid);

  const footer = document.createElement('div');
  footer.className = 'player-context-footer';
  const allShortcuts = document.createElement('button');
  allShortcuts.type = 'button';
  allShortcuts.className = 'player-context-help-button';
  allShortcuts.dataset.action = 'all-shortcuts';
  allShortcuts.setAttribute('role', 'menuitem');
  const helpIcon = createSvgIcon(iconPaths.help);
  helpIcon.classList.add('player-context-help-icon');
  allShortcuts.append(helpIcon, document.createTextNode('نمایش همه میانبرها'));
  const helpKey = document.createElement('kbd');
  helpKey.textContent = '?';
  allShortcuts.appendChild(helpKey);

  const hint = document.createElement('span');
  hint.className = 'player-context-navigation-hint';
  hint.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd> پیمایش <b>·</b> <kbd>Enter</kbd> اجرا <b>·</b> <kbd>Esc</kbd> بستن';
  footer.append(allShortcuts, hint);
  menu.appendChild(footer);

  menu.addEventListener('click', (event) => {
    event.stopPropagation();
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    closePlayerContextMenu();
    switch (action) {
      case 'toggle-play': togglePlay(); break;
      case 'backward': seekBy(-10); showSeekFeedback('left'); break;
      case 'forward': seekBy(10); showSeekFeedback('right'); break;
      case 'mute': muteBtn?.click(); break;
      case 'speed': openSpeedMenu(); break;
      case 'aspect': cycleAspectRatio(); break;
      case 'subtitles': cycleSubtitleTrack(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'all-shortcuts': toggleKeyboardHelp(true); break;
      default: break;
    }
  });

  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    const current = buttons.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      closePlayerContextMenu();
      return;
    }
    if (next !== null && buttons[next]) {
      event.preventDefault();
      buttons[next].focus({ preventScroll: true });
    }
  });

  getPlayerOverlayHost().appendChild(menu);
  menu.style.position = document.fullscreenElement === playerStage ? 'absolute' : 'fixed';
  playerContextMenu = menu;
  refreshPlayerContextMenu();
  return menu;
}

function openPlayerContextMenu(event) {
  closeSpeedMenu();
  closeSubtitleMenu();
  if (keyboardHelpPanel?.classList.contains('open')) keyboardHelpPanel.classList.remove('open');
  event.preventDefault?.();
  event.stopPropagation?.();
  const menu = ensurePlayerContextMenu();
  refreshPlayerContextMenu();
  playerContextMenuAnchor = { x: event.clientX, y: event.clientY };
  mountPlayerOverlay(menu);
  menu.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
  quickMenuBtn?.setAttribute('aria-expanded', 'true');
  positionPlayerOverlayAtPoint(menu, event.clientX, event.clientY);
  menu.querySelector('.player-context-item')?.focus({ preventScroll: true });
  showControls();
}

function toggleKeyboardHelp(forceOpen = null) {
  if (!keyboardHelpPanel) {
    const panel = document.createElement('section');
    panel.id = 'playerKeyboardHelp';
    panel.className = 'player-keyboard-help';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'همه میانبرها و کنترل‌های پلیر');

    const header = document.createElement('div');
    header.className = 'player-help-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'player-help-title-wrap';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'player-help-eyebrow';
    eyebrow.textContent = 'AURA PLAYER · COMPLETE SHORTCUTS';
    const title = document.createElement('strong');
    title.textContent = 'همه میانبرها و کنترل‌ها';
    const description = document.createElement('p');
    description.textContent = 'فهرست کامل فرمان‌های صفحه‌کلید و کنترل با ماوس؛ میانبرها هنگام فوکوس روی فیلدهای ورودی غیرفعال‌اند.';
    titleWrap.append(eyebrow, title, description);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'بستن فهرست میانبرها');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => panel.classList.remove('open'));
    header.append(titleWrap, closeButton);
    panel.appendChild(header);

    const searchWrap = document.createElement('label');
    searchWrap.className = 'player-help-search';
    const searchIcon = createSvgIcon('M11 3a8 8 0 1 0 4.9 14.32l4.39 4.39 1.42-1.42-4.39-4.39A8 8 0 0 0 11 3Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z');
    searchIcon.setAttribute('aria-hidden', 'true');
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'جست‌وجوی عملکرد یا کلید میانبر…';
    searchInput.setAttribute('aria-label', 'جست‌وجو در میانبرها');
    searchWrap.append(searchIcon, searchInput);
    panel.appendChild(searchWrap);

    const helpGroups = [
      {
        title: 'پخش و جابه‌جایی',
        items: [
          ['پخش / توقف', 'Space یا K'],
          ['۱۰ ثانیه عقب / جلو', '← / →'],
          ['۳۰ ثانیه عقب / جلو', 'Shift + ← / →'],
          ['۱ دقیقه عقب / جلو', 'Ctrl + ← / →'],
          ['پرش ۱۰ ثانیه‌ای عقب / جلو', 'J / L'],
          ['رفتن به ابتدا / انتهای ویدیو', 'Home / End'],
          ['رفتن به درصد مشخص از ویدیو', '0 تا 9'],
        ],
      },
      {
        title: 'صدا و سرعت پخش',
        items: [
          ['افزایش / کاهش صدا', '↑ / ↓'],
          ['قطع / وصل صدا', 'M'],
          ['کاهش سرعت پخش', '[ یا ,'],
          ['افزایش سرعت پخش', '] یا .'],
          ['بازگردانی سرعت عادی', '= یا +'],
        ],
      },
      {
        title: 'تصویر و پنجره',
        items: [
          ['تغییر حالت نمایش تصویر', 'A'],
          ['تصویر در تصویر', 'I'],
          ['تمام‌صفحه', 'F یا دوبار کلیک'],
          ['ثبت تصویر از فریم فعلی', 'Ctrl + S'],
          ['روشن / خاموش‌کردن زیرنویس', 'C'],
          ['نمایش / بستن همه میانبرها', '?'],
          ['بستن منوها / خروج از تمام‌صفحه', 'Esc'],
        ],
      },
      {
        title: 'فهرست پخش و حالت‌های پخش',
        items: [
          ['ویدیوی بعدی / قبلی', 'N / P'],
          ['روشن / خاموش‌کردن پخش تصادفی', 'R'],
          ['روشن / خاموش کردن تکرار', 'Shift + L'],
        ],
      },
      {
        title: 'کنترل با ماوس',
        items: [
          ['تنظیم صدا، هر پله ۵٪', 'چرخ ماوس'],
          ['جابه‌جایی ۱۰ / ۶۰ ثانیه‌ای', 'Shift + چرخ'],
          ['تغییر سرعت با گام ۰٫۰۵x', 'Ctrl / Alt + چرخ'],
          ['بازکردن کنترل‌های سریع', 'کلیک راست روی ویدیو'],
          ['ورود / خروج از تمام‌صفحه', 'دوبار کلیک روی ویدیو'],
        ],
      },
    ];

    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'player-help-sections';
    for (const groupData of helpGroups) {
      const group = document.createElement('section');
      group.className = 'player-help-group';
      const groupTitle = document.createElement('h3');
      groupTitle.textContent = groupData.title;
      group.appendChild(groupTitle);
      const list = document.createElement('div');
      list.className = 'player-help-grid';
      for (const [label, shortcut] of groupData.items) {
        const row = document.createElement('div');
        row.className = 'player-help-row';
        row.dataset.searchText = `${label} ${shortcut}`.toLocaleLowerCase();
        const text = document.createElement('span');
        text.textContent = label;
        const key = document.createElement('kbd');
        key.textContent = shortcut;
        row.append(text, key);
        list.appendChild(row);
      }
      group.appendChild(list);
      groupsContainer.appendChild(group);
    }
    panel.appendChild(groupsContainer);

    const emptyState = document.createElement('p');
    emptyState.className = 'player-help-empty';
    emptyState.textContent = 'میانبری با این عبارت پیدا نشد.';
    emptyState.hidden = true;
    panel.appendChild(emptyState);

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLocaleLowerCase();
      let visibleCount = 0;
      for (const group of groupsContainer.children) {
        let groupHasMatch = false;
        for (const row of group.querySelectorAll('.player-help-row')) {
          const matches = !query || row.dataset.searchText.includes(query);
          row.hidden = !matches;
          if (matches) groupHasMatch = true;
        }
        group.hidden = !groupHasMatch;
        if (groupHasMatch) visibleCount += 1;
      }
      emptyState.hidden = visibleCount > 0;
    });

    getPlayerOverlayHost().appendChild(panel);
    panel.style.position = document.fullscreenElement === playerStage ? 'absolute' : 'fixed';
    keyboardHelpPanel = panel;
  }

  const shouldOpen = forceOpen === null ? !keyboardHelpPanel.classList.contains('open') : forceOpen;
  if (shouldOpen) {
    closeSpeedMenu();
    closeSubtitleMenu();
  }
  keyboardHelpPanel.classList.toggle('open', shouldOpen);
  closePlayerContextMenu();
  if (shouldOpen) {
    positionPlayerOverlayCentered(keyboardHelpPanel);
    showControls();
    keyboardHelpPanel.querySelector('input[type="search"]')?.focus({ preventScroll: true });
  }
}

function isPlayerControlTarget(target) {
  return Boolean(target?.closest?.('.stage-controls, .stage-top-bar, .subtitle-menu, .speed-menu, .player-drawer-overlay, .player-context-menu, .player-keyboard-help, button, input, select, textarea, a'));
}

function handlePlayerWheel(event) {
  if (!playerWorkspace.classList.contains('active') || isPlayerControlTarget(event.target)) return;
  event.preventDefault();
  showControls();

  const rawDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
  if (event.shiftKey) {
    const direction = rawDelta > 0 ? 1 : -1;
    const amount = event.ctrlKey ? 60 : 10;
    seekBy(direction * amount);
    showPlayerOSD('جابه‌جایی زمان', `${direction > 0 ? '+' : '−'}${amount} ثانیه`);
    return;
  }
  if (event.ctrlKey || event.altKey) {
    const direction = rawDelta > 0 ? -1 : 1;
    adjustPlaybackRate(direction * 0.05);
    return;
  }

  wheelDeltaAccumulator += rawDelta;
  clearTimeout(wheelDeltaTimer);
  const threshold = 65;
  if (Math.abs(wheelDeltaAccumulator) >= threshold) {
    const steps = Math.min(5, Math.floor(Math.abs(wheelDeltaAccumulator) / threshold));
    const direction = wheelDeltaAccumulator > 0 ? -1 : 1;
    wheelDeltaAccumulator -= Math.sign(wheelDeltaAccumulator) * steps * threshold;
    adjustVolume(direction * steps * 0.05);
  }
  wheelDeltaTimer = window.setTimeout(() => { wheelDeltaAccumulator = 0; }, 180);
}

function getSeekTimeFromPointer(event) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return null;
  const rect = progressArea.getBoundingClientRect();
  if (!rect.width) return null;
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  return { time: ratio * video.duration, ratio };
}

function ensureSeekTooltip() {
  let tooltip = document.getElementById('seekTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'seekTooltip';
  tooltip.className = 'seek-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  progressArea.appendChild(tooltip);
  return tooltip;
}

function updateSeekPreview(event) {
  const position = getSeekTimeFromPointer(event);
  if (!position) return;
  const tooltip = ensureSeekTooltip();
  tooltip.textContent = formatTime(position.time);
  tooltip.style.left = `${position.ratio * 100}%`;
  tooltip.classList.add('visible');
  if (scrubState) {
    progressBar.style.width = `${position.ratio * 100}%`;
    progressThumb.style.left = `${position.ratio * 100}%`;
  }
  return position;
}

function startTimelineScrub(event) {
  if (event.button !== 0) return;
  const position = getSeekTimeFromPointer(event);
  if (!position) return;
  event.preventDefault();
  scrubState = { pointerId: event.pointerId, originalTime: video.currentTime, position };
  progressArea.classList.add('is-scrubbing');
  progressArea.setPointerCapture?.(event.pointerId);
  updateSeekPreview(event);
  showControls();
}

function moveTimelineScrub(event) {
  if (scrubState && scrubState.pointerId === event.pointerId) {
    scrubState.position = updateSeekPreview(event) || scrubState.position;
  } else if (!scrubState) {
    updateSeekPreview(event);
  }
}

function finishTimelineScrub(event, commit = true) {
  if (!scrubState || scrubState.pointerId !== event.pointerId) return;
  const state = scrubState;
  const position = updateSeekPreview(event) || state.position;
  scrubState = null;
  progressArea.classList.remove('is-scrubbing');
  document.getElementById('seekTooltip')?.classList.remove('visible');
  if (commit && position) {
    video.currentTime = position.time;
    updateProgress();
    updateSubtitles();
  } else {
    updateProgress();
  }
}

function cycleSubtitleTrack() {
  if (subtitles.length || activeSubtitleSource === 'embedded') {
    toggleSubtitle();
    showPlayerOSD('زیرنویس', subtitleEnabled ? 'روشن' : 'خاموش');
  } else {
    showPlayerStatus('برای فعال‌کردن زیرنویس، ابتدا فایل یا ترک زیرنویس را انتخاب کنید.');
    openSubtitleMenu();
  }
}

/* =========================================================
   POSTER GENERATION
   Sequential / Ordered
========================================================= */

const posterQueue = [];
const posterQueued = new WeakSet();
const posterCache = new Map();
const MAX_CACHED_POSTERS = 96;
const POSTER_WIDTH = 320;
const POSTER_HEIGHT = 180;
const EXPLORER_BATCH_SIZE = 60;
const DRAWER_BATCH_SIZE = 80;

let posterWorkerRunning = false;
let activePosterCleanup = null;
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
          rootMargin: '100px 0px',
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
    // Poster decoding is secondary work: never compete with active playback.
    if (playerWorkspace?.classList.contains('active')) {
      break;
    }

    const card = posterQueue.shift();

    if (!card || !card.isConnected || !card._videoFile || card._thumbnailLoaded) {
      continue;
    }

    card.dataset.posterState = 'loading';
    const taskGeneration = posterGenerationToken;

    try {
      await loadPosterForCard(card, card._videoFile);
    } catch {
      // Keep placeholder if the browser cannot decode the file.
    }

    if (taskGeneration === posterGenerationToken && card.isConnected) {
      card.dataset.posterState = 'done';
      card._thumbnailLoaded = true;
    } else {
      posterQueued.delete(card);
      if (card.isConnected) card.dataset.posterState = 'idle';
    }

    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  }

  posterWorkerRunning = false;
}

function resetPosterQueue() {
  posterGenerationToken += 1;

  for (const card of posterQueue) {
    posterQueued.delete(card);
    if (card?.isConnected) card.dataset.posterState = 'idle';
  }

  posterQueue.length = 0;
  activePosterCleanup?.();
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

      if (activePosterCleanup === cleanup) activePosterCleanup = null;
      if (generation !== posterGenerationToken) posterQueued.delete(card);

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

        // Keep decoded thumbnail memory small; full-resolution frames are wasteful in a library grid.
        const outW = POSTER_WIDTH;
        const outH = POSTER_HEIGHT;

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
        rememberPoster(card);
      } catch {
        // Keep default placeholder.
      } finally {
        cleanup();
      }
    }

    activePosterCleanup = cleanup;
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

function rememberPoster(card) {
  if (!card?.isConnected) return;

  posterCache.delete(card);
  posterCache.set(card, true);

  while (posterCache.size > MAX_CACHED_POSTERS) {
    const oldestCard = posterCache.keys().next().value;
    posterCache.delete(oldestCard);

    const oldCanvas = oldestCard?.querySelector('.poster-canvas');
    if (!oldCanvas) continue;

    posterQueued.delete(oldestCard);
    oldCanvas.remove();
    oldestCard._thumbnailLoaded = false;

    const wrapper = oldestCard.querySelector('.poster-thumb-wrapper');
    if (wrapper && !wrapper.querySelector('.poster-placeholder')) {
      const placeholder = createSvgIcon('M8 5v14l11-7Z');
      placeholder.classList.add('poster-placeholder');
      wrapper.appendChild(placeholder);
    }

    // Thumbnails are regenerated only when the card comes back near the viewport.
    if (oldestCard.isConnected && thumbObserver) observeCard(oldestCard);
  }
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

    // Walk directories in a predictable order to avoid opening too many local files at once.
    for (const child of children) {
      await traverseEntry(child, folderPath, output);
    }
  }

  return output;
}

/* =========================================================
   FILE / FOLDER PROCESSING
========================================================= */

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
  const subtitlesByFolder = new Map();

  /* -------------------------------------------------------
     Index subtitles once instead of comparing every video
     with every subtitle (quadratic work on large folders).
  ------------------------------------------------------- */

  for (const subtitle of subtitleFiles) {
    let index = subtitlesByFolder.get(subtitle.folder);

    if (!index) {
      index = { byName: new Map(), byPrefix: new Map() };
      subtitlesByFolder.set(subtitle.folder, index);
    }

    const exactMatches = index.byName.get(subtitle.cleanName) || [];
    exactMatches.push(subtitle);
    index.byName.set(subtitle.cleanName, exactMatches);

    const words = subtitle.cleanName.split(' ').filter(Boolean);
    for (let wordCount = 1; wordCount < words.length; wordCount += 1) {
      const prefix = words.slice(0, wordCount).join(' ');
      const prefixMatches = index.byPrefix.get(prefix) || [];
      prefixMatches.push(subtitle);
      index.byPrefix.set(prefix, prefixMatches);
    }
  }

  /* -------------------------------------------------------
     Match subtitles using exact and word-boundary indexes.
  ------------------------------------------------------- */

  for (const videoItem of videoFiles) {
    if (!foldersMap.has(videoItem.folder)) {
      foldersMap.set(videoItem.folder, []);
    }

    const index = subtitlesByFolder.get(videoItem.folder);
    const matches = new Map();

    if (index) {
      const addMatches = (items, score) => {
        for (const subtitle of items || []) {
          const previous = matches.get(subtitle);
          if (!previous || score > previous.score) {
            matches.set(subtitle, { sub: subtitle, score });
          }
        }
      };

      addMatches(index.byName.get(videoItem.cleanName), 100);
      addMatches(index.byPrefix.get(videoItem.cleanName), 60);

      const words = videoItem.cleanName.split(' ').filter(Boolean);
      for (let wordCount = 1; wordCount < words.length; wordCount += 1) {
        const shorterName = words.slice(0, wordCount).join(' ');
        addMatches(index.byName.get(shorterName), 60);
      }
    }

    const matchedSubs = [...matches.values()].sort(
      (a, b) => b.score - a.score || naturalCompare(a.sub.name, b.sub.name),
    );

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
      // Reuse library entries; cache normalized search text for repeated filtering.
      item.folderName = group.folderName;
      item.searchName = String(item.name || '').toLocaleLowerCase('fa');
      flatPlaylist.push(item);
    }
  }

  flatPlaylistIndexByFile = new Map();
  for (let index = 0; index < flatPlaylist.length; index += 1) {
    flatPlaylistIndexByFile.set(flatPlaylist[index].file, index);
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

function createVideoCard(item, group, index) {
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
    badges.appendChild(document.createElement('span'));
  }

  const sizeBadge = document.createElement('span');
  sizeBadge.className = 'badge-size';
  sizeBadge.textContent = `${(item.file.size / (1024 * 1024)).toFixed(1)} MB`;
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
  const globalIndex = flatPlaylistIndexByFile.get(item.file);
  if (Number.isInteger(globalIndex)) card.dataset.playIndex = String(globalIndex);

  observeCard(card);
  return card;
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
  gridEl.addEventListener('click', (event) => {
    const card = event.target.closest('.video-poster-card[data-play-index]');
    if (!card || !gridEl.contains(card)) return;
    const globalIndex = Number(card.dataset.playIndex);
    if (Number.isSafeInteger(globalIndex)) playIndex(globalIndex, group.videos);
  });

  const moreWrap = document.createElement('div');
  moreWrap.className = 'folder-load-more-wrap';

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'folder-load-more-btn';

  let renderedCount = 0;
  const appendBatch = () => {
    const nextEnd = Math.min(renderedCount + EXPLORER_BATCH_SIZE, filteredVideos.length);
    const fragment = document.createDocumentFragment();

    for (let index = renderedCount; index < nextEnd; index += 1) {
      fragment.appendChild(createVideoCard(filteredVideos[index], group, index));
    }

    gridEl.appendChild(fragment);
    renderedCount = nextEnd;

    const remaining = filteredVideos.length - renderedCount;
    moreButton.textContent = `نمایش ویدیوهای بیشتر · ${remaining.toLocaleString('fa-IR')} باقی‌مانده`;
    moreWrap.classList.toggle('hidden', remaining <= 0);
  };

  moreButton.addEventListener('click', appendBatch);
  moreWrap.appendChild(moreButton);
  appendBatch();

  groupEl.append(headEl, gridEl, moreWrap);
  return groupEl;
}

function renderExplorer() {
  resetPosterQueue();
  posterCache.clear();

  foldersContainer.innerHTML = '';

  const query = String(searchInput?.value || '')
    .toLocaleLowerCase('fa')
    .trim();

  let totalVideos = 0;
  const fragment = document.createDocumentFragment();

  for (const group of library) {
    const filteredVideos = group.videos.filter((item) => {
      const matchSearch = (item.searchName || String(item.name || '').toLocaleLowerCase('fa')).includes(query);

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

    fragment.appendChild(createFolderElement(group, filteredVideos));
  }

  foldersContainer.appendChild(fragment);

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

  // Stop thumbnail decoding immediately when the user starts a video.
  resetPosterQueue();
  currentPlaylistIndex = index;

  if (randomPlayback) {
    randomQueue = randomQueue.filter((queueIndex) => queueIndex !== index);
  }

  if (folderVideosList) {
    // Folder playlists are already naturally sorted during library indexing.
    currentFolderVideos = folderVideosList;
  } else {
    const parentFolder = library.find((group) => group.folderName === item.folderName);
    currentFolderVideos = parentFolder?.videos || [item];
  }

  closeSubtitleMenu();
  closeSpeedMenu();

  livePlaylistDrawer.classList.remove('open');

  clearControlsTimer();

  playerStage.classList.remove('hide-controls');

  hidePlayerStatus();

  window.clearTimeout(highSpeedStallTimer);
  highSpeedStallNoticeShown = false;

  releaseActiveVideoSource();

  activeObjectURL = URL.createObjectURL(item.file);

  // Small/medium local files can be read ahead aggressively. Keep metadata-only
  // for very large files to avoid unnecessary memory pressure on low-RAM devices.
  video.preload = item.file.size <= AUTO_PRELOAD_MAX_BYTES ? 'auto' : 'metadata';
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
  video.defaultPlaybackRate = currentPlaybackRate;
  video.playbackRate = currentPlaybackRate;

  applyPlaybackPerformanceProfile(currentPlaybackRate);

  setPlayerView(true);

  renderLiveDrawer();

  resetSubtitlesForVideo();
  pendingMatroskaFile = /\.mkv$/i.test(item.file.name || '') ? item.file : null;

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
   DRAWER — CURRENTLY PLAYING INDICATOR
========================================================= */

function syncDrawerPlaybackState() {
  const currentItem = flatPlaylist[currentPlaylistIndex] || null;
  const isPlaying = Boolean(currentItem && !video.paused && !video.ended);

  if (drawerNowPlaying) {
    drawerNowPlaying.hidden = !currentItem;
    drawerNowPlaying.dataset.state = isPlaying ? 'playing' : 'current';
  }

  if (drawerPlaybackLabel) {
    drawerPlaybackLabel.textContent = isPlaying ? 'اکنون در حال پخش' : 'ویدیوی فعلی';
  }

  if (drawerPlaybackName) {
    drawerPlaybackName.textContent = currentItem?.name || '';
    drawerPlaybackName.title = currentItem?.name || '';
  }

  drawerVideosList?.querySelectorAll('.drawer-v-item').forEach((row) => {
    const rowIndex = Number(row.dataset.playlistIndex);
    const isCurrent = Number.isInteger(rowIndex) && rowIndex === currentPlaylistIndex;
    const rowIsPlaying = isCurrent && isPlaying;
    const state = row.querySelector('.drawer-v-state');
    const name = row.querySelector('.drawer-v-name');

    row.classList.toggle('active', isCurrent);
    row.classList.toggle('is-playing', rowIsPlaying);
    row.dataset.playbackState = isCurrent ? (isPlaying ? 'playing' : 'current') : 'idle';
    row.setAttribute('aria-current', isCurrent ? 'true' : 'false');

    if (state) {
      state.hidden = !isCurrent;
      state.textContent = rowIsPlaying ? 'در حال پخش' : 'ویدیوی فعلی';
    }

    if (name) {
      const suffix = isCurrent ? (isPlaying ? '، در حال پخش' : '، ویدیوی فعلی') : '';
      row.setAttribute('aria-label', `${name.textContent}${suffix}`);
    }
  });
}

function renderLiveDrawer() {
  const currentItem = flatPlaylist[currentPlaylistIndex];
  const playlist = currentFolderVideos;

  drawerFolderTitle.textContent = currentItem?.folderName || '';
  drawerVideosList.replaceChildren();

  let renderedCount = 0;
  const appendBatch = () => {
    const nextEnd = Math.min(renderedCount + DRAWER_BATCH_SIZE, playlist.length);
    const fragment = document.createDocumentFragment();

    for (let index = renderedCount; index < nextEnd; index += 1) {
      const vid = playlist[index];
      const row = document.createElement('div');
      row.className = 'drawer-v-item';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      const globalIndex = flatPlaylistIndexByFile.get(vid.file);
      if (Number.isInteger(globalIndex)) row.dataset.playlistIndex = String(globalIndex);
      if (vid.file === currentItem?.file) row.classList.add('active');

      const icon = createSvgIcon('M8 5v14l11-7Z');
      icon.classList.add('drawer-v-icon');

      const name = document.createElement('span');
      name.className = 'drawer-v-name';
      name.title = vid.name;
      name.textContent = vid.name;

      const state = document.createElement('span');
      state.className = 'drawer-v-state';
      state.hidden = true;
      state.textContent = 'ویدیوی فعلی';

      row.append(icon, name, state);

      const selectVideo = (event) => {
        event.stopPropagation();
        if (Number.isInteger(globalIndex)) playIndex(globalIndex, playlist);
      };

      row.addEventListener('click', selectVideo);
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectVideo(event);
      });

      fragment.appendChild(row);
    }

    drawerVideosList.insertBefore(fragment, moreButton);
    renderedCount = nextEnd;

    const remaining = playlist.length - renderedCount;
    moreButton.textContent = `نمایش موارد بعدی · ${remaining.toLocaleString('fa-IR')} باقی‌مانده`;
    moreButton.classList.toggle('hidden', remaining <= 0);
    syncDrawerPlaybackState();
  };

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'drawer-load-more-btn';
  moreButton.addEventListener('click', appendBatch);
  drawerVideosList.appendChild(moreButton);

  appendBatch();
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


  resetSubtitlesForVideo();

  setPlayerView(false);

  // Re-observe cards whose poster work was cancelled for playback.
  foldersContainer?.querySelectorAll('.video-poster-card').forEach(observeCard);
  processPosterQueue();
}

/* =========================================================
   SUBTITLES
========================================================= */

function disableNativeSubtitleTracks() {
  try {
    const tracks = video.textTracks;
    for (let index = 0; tracks && index < tracks.length; index += 1) {
      try {
        if (tracks[index]) tracks[index].mode = 'disabled';
      } catch {
        // Some browsers expose read-only or incomplete native track objects.
      }
    }
  } catch {
    // TextTrackList is optional in older browsers.
  }
}

function resetSubtitlesForVideo() {
  embeddedSubtitleScanGeneration += 1;
  embeddedSubtitleScanController?.abort();
  embeddedSubtitleScanController = null;
  pendingMatroskaFile = null;
  matroskaScanStarted = false;
  disableNativeSubtitleTracks();

  subtitles = [];
  subtitleEnabled = false;
  subtitleFile = null;
  currentSubtitleIndex = -1;
  activeSubtitleSource = 'none';
  externalSubtitleEntry = null;
  embeddedSubtitleTracks = [];
  matroskaSubtitleTracks = [];
  nativeSubtitleTracks = [];
  selectedEmbeddedSubtitleKey = null;
  embeddedSubtitleScanProgress = 0;
  embeddedSubtitleNotice = '';

  subtitleLayer.innerHTML = '';
  subtitleLayer.classList.add('hidden');
  subtitleToggle.classList.remove('active');
  subtitleToggle.setAttribute('aria-pressed', 'false');
  subBtn.classList.remove('active');
  subtitleFileName.textContent = 'زیرنویسی انتخاب نشده';
  subtitleStatus.textContent = 'زیرنویس خاموش است';
  subtitleInput.value = '';
  renderEmbeddedSubtitleTracks();
}

function clearCurrentSubtitle() {
  subtitles = [];
  subtitleEnabled = false;
  subtitleFile = null;
  currentSubtitleIndex = -1;
  activeSubtitleSource = 'none';
  externalSubtitleEntry = null;
  selectedEmbeddedSubtitleKey = null;

  subtitleLayer.innerHTML = '';
  subtitleLayer.classList.add('hidden');
  subtitleToggle.classList.remove('active');
  subtitleToggle.setAttribute('aria-pressed', 'false');
  subBtn.classList.remove('active');
  subtitleFileName.textContent = 'زیرنویسی انتخاب نشده';
  subtitleStatus.textContent = 'زیرنویس خاموش است';
  renderEmbeddedSubtitleTracks();
}

function refreshEmbeddedSubtitleTracks() {
  // Keep the Matroska parser's track objects first; browser-native text tracks
  // are included for media containers/browsers that expose them via TextTrackList.
  const combined = [...matroskaSubtitleTracks];
  const existingKeys = new Set(combined.map((track) => track.key));
  for (const track of nativeSubtitleTracks) {
    if (!existingKeys.has(track.key)) combined.push(track);
  }
  embeddedSubtitleTracks = combined;
  renderEmbeddedSubtitleTracks();
}

function renderEmbeddedSubtitleTracks() {
  if (!embeddedSubtitleTracksList || !embeddedSubtitleSection) return;

  embeddedSubtitleTracksList.replaceChildren();
  let visibleCount = embeddedSubtitleTracks.length;

  if (externalSubtitleEntry && embeddedSubtitleTracks.length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'embedded-subtitle-track';
    button.classList.toggle('active', activeSubtitleSource === 'external');
    button.setAttribute('aria-pressed', String(activeSubtitleSource === 'external'));

    const label = document.createElement('span');
    label.className = 'embedded-subtitle-track-label';
    label.textContent = `فایل جداگانه: ${externalSubtitleEntry.file.name}`;
    button.appendChild(label);

    const state = document.createElement('span');
    state.className = 'embedded-subtitle-track-state';
    state.textContent = activeSubtitleSource === 'external' ? 'فعال' : 'انتخاب';
    button.appendChild(state);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectExternalSubtitle();
    });
    embeddedSubtitleTracksList.appendChild(button);
    visibleCount += 1;
  }

  for (const track of embeddedSubtitleTracks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'embedded-subtitle-track';
    const active = activeSubtitleSource === 'embedded' && selectedEmbeddedSubtitleKey === track.key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));

    const label = document.createElement('span');
    label.className = 'embedded-subtitle-track-label';
    label.textContent = track.label || `ترک ${track.number || ''}`;
    button.appendChild(label);

    const state = document.createElement('span');
    state.className = 'embedded-subtitle-track-state';
    state.textContent = active ? 'فعال' : (track.isDefault ? 'پیش‌فرض' : 'انتخاب');
    button.appendChild(state);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectEmbeddedSubtitleTrack(track.key);
    });
    embeddedSubtitleTracksList.appendChild(button);
  }

  embeddedSubtitleCount.textContent = visibleCount ? `${visibleCount} ترک` : '';
  embeddedSubtitleMessage.textContent = embeddedSubtitleNotice || '';
  embeddedSubtitleSection.classList.toggle('hidden', visibleCount === 0 && !embeddedSubtitleNotice);
}

function selectExternalSubtitle() {
  if (!externalSubtitleEntry) return;

  activeSubtitleSource = 'external';
  selectedEmbeddedSubtitleKey = null;
  subtitleFile = externalSubtitleEntry.file;
  subtitles = externalSubtitleEntry.cues;
  subtitleEnabled = true;
  currentSubtitleIndex = -1;

  subtitleFileName.textContent = subtitleFile.name;
  subtitleStatus.textContent = `${subtitles.length} بخش زیرنویس · فعال`;
  subtitleToggle.classList.add('active');
  subtitleToggle.setAttribute('aria-pressed', 'true');
  subBtn.classList.add('active');
  renderEmbeddedSubtitleTracks();
  updateSubtitles();
}

function selectEmbeddedSubtitleTrack(key) {
  const track = embeddedSubtitleTracks.find((entry) => entry.key === key);
  if (!track) return;

  if (track.nativeTrack) {
    try {
      track.nativeTrack.mode = 'hidden';
    } catch {
      // Use the cues already exposed by the browser when mode cannot be changed.
    }
    track.cues = readNativeSubtitleCues(track.nativeTrack);
  }

  activeSubtitleSource = 'embedded';
  selectedEmbeddedSubtitleKey = track.key;
  subtitleFile = null;
  subtitles = track.cues || [];
  subtitleEnabled = true;
  currentSubtitleIndex = -1;

  subtitleFileName.textContent = track.label || 'زیرنویس داخلی';
  subtitleStatus.textContent = subtitles.length
    ? `${subtitles.length} بخش زیرنویس داخلی · فعال`
    : 'ترک شناسایی شد؛ در حال خواندن زیرنویس…';
  subtitleToggle.classList.add('active');
  subtitleToggle.setAttribute('aria-pressed', 'true');
  subBtn.classList.add('active');
  renderEmbeddedSubtitleTracks();
  updateSubtitles();

  if (track.nativeTrack && !subtitles.length) {
    window.setTimeout(() => {
      if (activeSubtitleSource !== 'embedded' || selectedEmbeddedSubtitleKey !== track.key) return;
      track.cues = readNativeSubtitleCues(track.nativeTrack);
      subtitles = track.cues;
      currentSubtitleIndex = -1;
      subtitleStatus.textContent = subtitles.length
        ? `${subtitles.length} بخش زیرنویس داخلی · فعال`
        : 'مرورگر متن این ترک را در دسترس قرار نداد.';
      updateSubtitles();
    }, 180);
  }
}

function readNativeSubtitleCues(textTrack) {
  let cueList = null;
  try {
    cueList = textTrack?.cues;
  } catch {
    return [];
  }
  if (!cueList) return [];

  const result = [];
  for (let index = 0; index < cueList.length; index += 1) {
    const cue = cueList[index];
    const text = cleanSubtitleText(cue?.text || '');
    const start = Number(cue?.startTime);
    const end = Number(cue?.endTime);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    result.push({ start, end, text });
  }
  return result.sort((a, b) => a.start - b.start);
}


function attachNativeSubtitleTrackEvents() {
  if (nativeTextTrackListenerAttached || !video.textTracks) return;
  const trackList = video.textTracks;
  if (typeof trackList.addEventListener !== 'function') return;

  const scheduleDiscovery = () => {
    const generation = embeddedSubtitleScanGeneration;
    window.setTimeout(() => discoverNativeSubtitleTracks(generation), 0);
  };
  trackList.addEventListener('addtrack', scheduleDiscovery);
  trackList.addEventListener('removetrack', scheduleDiscovery);
  nativeTextTrackListenerAttached = true;
}

function discoverNativeSubtitleTracks(generation = embeddedSubtitleScanGeneration) {
  if (generation !== embeddedSubtitleScanGeneration || !video.textTracks) return;
  attachNativeSubtitleTrackEvents();

  const discovered = [];
  const trackList = video.textTracks;
  for (let index = 0; index < trackList.length; index += 1) {
    const textTrack = trackList[index];
    if (!textTrack) continue;
    const kind = String(textTrack.kind || '').toLowerCase();
    if (['chapters', 'metadata', 'descriptions'].includes(kind)) continue;
    if (kind && !['subtitles', 'captions'].includes(kind)) continue;

    try {
      textTrack.mode = 'hidden';
    } catch {
      // Some native tracks are exposed read-only.
    }

    const language = textTrack.language || 'und';
    const label = textTrack.label || (language === 'und' ? `زیرنویس داخلی ${index + 1}` : language);
    discovered.push({
      key: `native-${index}`,
      source: 'native',
      nativeTrack: textTrack,
      number: index + 1,
      language,
      label,
      isDefault: false,
      cues: readNativeSubtitleCues(textTrack),
      supported: true,
      loading: false,
    });
  }

  nativeSubtitleTracks = discovered;
  refreshEmbeddedSubtitleTracks();

  if (activeSubtitleSource === 'embedded' && selectedEmbeddedSubtitleKey?.startsWith('native-')) {
    const selectedNativeTrack = nativeSubtitleTracks.find((track) => track.key === selectedEmbeddedSubtitleKey);
    if (selectedNativeTrack) {
      subtitles = selectedNativeTrack.cues;
      currentSubtitleIndex = -1;
      if (subtitleEnabled) updateSubtitles();
      if (subtitleEnabled && subtitles.length) {
        subtitleStatus.textContent = `${subtitles.length} بخش زیرنویس داخلی · فعال`;
      }
    }
  }

  const currentFile = flatPlaylist[currentPlaylistIndex]?.file;
  const matroskaScanPending = /\.mkv$/i.test(currentFile?.name || '')
    && Boolean(embeddedSubtitleScanController)
    && matroskaSubtitleTracks.length === 0;

  if (activeSubtitleSource === 'none' && discovered.length && !matroskaScanPending) {
    selectEmbeddedSubtitleTrack(discovered[0].key);
  }
}

function startMatroskaSubtitleScan(file, generation) {
  if (!/\.mkv$/i.test(file?.name || '') || !window.AuraMatroskaSubtitleReader?.read) return;
  if (generation !== embeddedSubtitleScanGeneration || matroskaScanStarted) return;

  matroskaScanStarted = true;
  pendingMatroskaFile = null;
  const controller = new AbortController();
  embeddedSubtitleScanController = controller;
  embeddedSubtitleNotice = 'در حال بررسی ترک‌های زیرنویس داخل فایل…';
  renderEmbeddedSubtitleTracks();

  window.AuraMatroskaSubtitleReader.read(file, {
    signal: controller.signal,
    onTracks: (tracks, unsupportedTracks) => {
      if (generation !== embeddedSubtitleScanGeneration || controller.signal.aborted) return;

      matroskaSubtitleTracks = tracks.map((track) => ({
        key: `mkv-${track.number}`,
        source: 'matroska',
        number: track.number,
        label: track.label,
        language: track.language,
        codec: track.codec,
        isDefault: track.isDefault,
        isForced: track.isForced,
        cues: track.cues,
        readerTrack: track,
        supported: true,
        loading: true,
      }));

      const imageBased = unsupportedTracks.filter((track) => /PGS|VOBSUB/i.test(track.codec || ''));
      if (tracks.length) {
        embeddedSubtitleNotice = imageBased.length
          ? 'زیرنویس متنی قابل انتخاب است؛ این فایل یک ترک تصویری PGS/VobSub هم دارد که با این روش استخراج نمی‌شود.'
          : 'ترک‌های زیرنویس متنی داخل ویدئو شناسایی شدند.';
      } else if (imageBased.length) {
        embeddedSubtitleNotice = `زیرنویس این فایل تصویری است (${imageBased.map((track) => track.codec).join('، ')}). این نسخه استخراج ترک‌های تصویری را پشتیبانی نمی‌کند.`;
      } else if (unsupportedTracks.length) {
        embeddedSubtitleNotice = `ترک زیرنویس پیدا شد، اما قالب آن پشتیبانی نمی‌شود: ${unsupportedTracks.map((track) => track.codec || 'نامشخص').join('، ')}.`;
      } else {
        embeddedSubtitleNotice = 'ترک زیرنویس متنی داخل این فایل پیدا نشد.';
      }

      refreshEmbeddedSubtitleTracks();

      if (activeSubtitleSource === 'none' && matroskaSubtitleTracks.length) {
        const preferred = matroskaSubtitleTracks.find((track) => track.isDefault)
          || matroskaSubtitleTracks.find((track) => track.isForced)
          || matroskaSubtitleTracks[0];
        selectEmbeddedSubtitleTrack(preferred.key);
      } else if (activeSubtitleSource === 'none' && nativeSubtitleTracks.length) {
        selectEmbeddedSubtitleTrack(nativeSubtitleTracks[0].key);
      }
    },
    onCues: (readerTrack, batch, complete) => {
      if (generation !== embeddedSubtitleScanGeneration || controller.signal.aborted) return;
      const track = matroskaSubtitleTracks.find((entry) => entry.number === readerTrack.number);
      if (!track) return;

      track.cues = readerTrack.cues;
      track.loading = !complete;
      if (activeSubtitleSource === 'embedded' && selectedEmbeddedSubtitleKey === track.key) {
        subtitles = track.cues;
        currentSubtitleIndex = -1;
        if (subtitleEnabled) {
          subtitleStatus.textContent = complete
            ? `${subtitles.length} بخش زیرنویس داخلی · فعال`
            : `در حال استخراج زیرنویس… ${subtitles.length} بخش`;
          updateSubtitles();
        }
      }
      if (complete && readerTrack.hasSkippedLacedBlocks) {
        embeddedSubtitleNotice = `${readerTrack.label}: تعدادی از بخش‌های لِیس‌شده قابل خواندن نبودند.`;
        renderEmbeddedSubtitleTracks();
      }
    },
    onProgress: (processed, total) => {
      if (generation !== embeddedSubtitleScanGeneration || controller.signal.aborted) return;
      const percent = total ? Math.floor((processed / total) * 100) : 100;
      if (percent !== embeddedSubtitleScanProgress && (percent % 10 === 0 || percent === 100)) {
        embeddedSubtitleScanProgress = percent;
        if (activeSubtitleSource === 'embedded' && selectedEmbeddedSubtitleKey?.startsWith('mkv-')) {
          const activeTrack = embeddedSubtitleTracks.find((track) => track.key === selectedEmbeddedSubtitleKey);
          if (activeTrack?.loading) subtitleStatus.textContent = `در حال استخراج زیرنویس… ${percent}%`;
        }
      }
    },
  }).then((result) => {
    if (generation !== embeddedSubtitleScanGeneration || controller.signal.aborted || result?.aborted) return;
    embeddedSubtitleScanController = null;
    if (!matroskaSubtitleTracks.length && !nativeSubtitleTracks.length) {
      renderEmbeddedSubtitleTracks();
    }
  }).catch((error) => {
    if (generation !== embeddedSubtitleScanGeneration || controller.signal.aborted) return;
    embeddedSubtitleScanController = null;
    embeddedSubtitleNotice = error?.message
      ? `خواندن زیرنویس داخلی ناموفق بود: ${error.message}`
      : 'خواندن زیرنویس داخلی ناموفق بود.';
    renderEmbeddedSubtitleTracks();
    if (activeSubtitleSource === 'none' && nativeSubtitleTracks.length) {
      selectEmbeddedSubtitleTrack(nativeSubtitleTracks[0].key);
    }
  });
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

    externalSubtitleEntry = { file, cues: parsed };
    activeSubtitleSource = 'external';
    selectedEmbeddedSubtitleKey = null;
    subtitles = parsed;
    subtitleFile = file;

    subtitleFileName.textContent = file.name;

    subtitleStatus.textContent = `${parsed.length} بخش زیرنویس · فعال`;

    subtitleEnabled = true;
    currentSubtitleIndex = -1;

    subtitleToggle.classList.add('active');

    subtitleToggle.setAttribute('aria-pressed', 'true');

    subBtn.classList.add('active');

    renderEmbeddedSubtitleTracks();
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
    // Do not repeatedly mutate the DOM on every timeupdate when subtitles are off.
    if (currentSubtitleIndex !== -1 || subtitleLayer.childElementCount || !subtitleLayer.classList.contains('hidden')) {
      subtitleLayer.classList.add('hidden');
      subtitleLayer.replaceChildren();
      currentSubtitleIndex = -1;
    }
    return;
  }

  const time = video.currentTime;
  const activeCue = currentSubtitleIndex >= 0 ? subtitles[currentSubtitleIndex] : null;
  if (activeCue && time >= activeCue.start && time < activeCue.end) {
    return;
  }

  const index = findSubtitleIndex(time);
  if (index === currentSubtitleIndex) return;

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
  if (!subtitles.length && activeSubtitleSource !== 'embedded') {
    subtitleInput.click();
    return;
  }

  subtitleEnabled = !subtitleEnabled;

  subtitleToggle.classList.toggle('active', subtitleEnabled);

  subtitleToggle.setAttribute('aria-pressed', String(subtitleEnabled));

  subBtn.classList.toggle('active', subtitleEnabled);

  if (subtitleEnabled) {
    subtitleStatus.textContent = activeSubtitleSource === 'embedded'
      ? (subtitles.length ? `${subtitles.length} بخش زیرنویس داخلی · فعال` : 'در حال خواندن زیرنویس داخلی…')
      : `${subtitles.length} بخش زیرنویس · فعال`;

    currentSubtitleIndex = -1;

    updateSubtitles();
  } else {
    subtitleStatus.textContent = 'زیرنویس خاموش است';

    subtitleLayer.classList.add('hidden');

    subtitleLayer.innerHTML = '';
  }

  renderEmbeddedSubtitleTracks();
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

function applyPlaybackPerformanceProfile(value) {
  const speed = cleanSpeed(value);
  const fast = speed >= 2;
  const extreme = speed >= EXTREME_SPEED_RATE;

  // Keep overlays visually glassy, but reduce backdrop sampling cost while
  // the decoder is already under pressure at high playback rates.
  playerStage?.classList.toggle('is-fast-playback', fast);
  playerStage?.classList.toggle('is-extreme-playback', extreme);
  // Floating panels are portalled to <body>; mirror playback state on <html>
  // so their glass blur follows the same low-cost profile while playing fast.
  document.documentElement.classList.toggle('aura-fast-playback', fast);
  document.documentElement.classList.toggle('aura-extreme-playback', extreme);

  // Pitch correction is part of normal playback behavior and must not be
  // disabled at high rates. Let the browser's media engine time-stretch audio
  // at every supported rate instead of allowing pitch to rise from 4x onward.
  for (const property of ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch']) {
    if (property in video && video[property] !== true) {
      try {
        video[property] = true;
      } catch {
        // Some browser implementations expose a read-only vendor property.
      }
    }
  }
}

function getProgressUiInterval() {
  if (currentPlaybackRate >= EXTREME_SPEED_RATE) return 360;
  if (currentPlaybackRate >= 4) return 280;
  if (currentPlaybackRate >= 2) return 180;
  return PROGRESS_UI_INTERVAL_MS;
}

function setPlaybackRate(value) {
  const speed = cleanSpeed(value);

  /*
   * Keep speed in JS memory.
   * This is what allows us to restore
   * the speed after changing video.src.
   */
  currentPlaybackRate = speed;

  video.defaultPlaybackRate = speed;
  video.playbackRate = speed;

  applyPlaybackPerformanceProfile(currentPlaybackRate);

  storeValue(STORAGE_SPEED, speed);

  updateSpeedUI(speed);
}

function applySelectedSpeed() {
  setPlaybackRate(speedInput.value);

  closeSpeedMenu();

  showControls();
}

function openSpeedMenu() {
  closePlayerContextMenu();
  if (keyboardHelpPanel?.classList.contains('open')) toggleKeyboardHelp(false);
  closeSubtitleMenu();
  mountPlayerOverlay(speedMenu);
  speedMenu.classList.add('open');
  speedBtn.classList.add('active');
  clearControlsTimer();
  updateSpeedUI(currentPlaybackRate);
  positionPlayerOverlayNear(speedMenu, speedBtn);
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
  closePlayerContextMenu();
  if (keyboardHelpPanel?.classList.contains('open')) toggleKeyboardHelp(false);
  closeSpeedMenu();
  mountPlayerOverlay(subtitleMenu);
  subtitleMenu.classList.add('open');
  subBtn.classList.add('active');
  clearControlsTimer();
  positionPlayerOverlayNear(subtitleMenu, subBtn);

  // Embedded MKV subtitles are parsed only when the user opens subtitle settings.
  if (pendingMatroskaFile && !matroskaScanStarted) {
    startMatroskaSubtitleScan(pendingMatroskaFile, embeddedSubtitleScanGeneration);
  }
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
  const currentLabel = formatTime(current);
  const durationLabel = formatTime(total);

  if (currentTime && currentLabel !== lastProgressLabel) {
    currentTime.textContent = currentLabel;
    lastProgressLabel = currentLabel;
  }
  if (duration && durationLabel !== lastDurationLabel) {
    duration.textContent = durationLabel;
    lastDurationLabel = durationLabel;
  }

  const percent = total > 0 ? clamp((current / total) * 100, 0, 100) : 0;
  const ariaNow = String(Math.round(percent));
  const ariaText = `${currentLabel} از ${durationLabel}`;
  if (progressArea?.getAttribute('aria-valuenow') !== ariaNow) {
    progressArea?.setAttribute('aria-valuenow', ariaNow);
  }
  if (ariaText !== lastProgressAriaText) {
    progressArea?.setAttribute('aria-valuetext', ariaText);
    lastProgressAriaText = ariaText;
  }

  // Avoid style recalculation when the visible progress value did not change.
  if (!scrubState && Math.abs(percent - lastProgressPercent) >= 0.015) {
    progressBar.style.width = `${percent}%`;
    progressThumb.style.left = `${percent}%`;
    lastProgressPercent = percent;
  }
}

function updateBufferedProgress() {
  const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const ranges = video.buffered;
  if (!total || !ranges?.length) {
    if (lastBufferPercent !== 0) {
      bufferBar.style.width = '0%';
      lastBufferPercent = 0;
    }
    return;
  }

  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  let bufferedEnd = 0;
  let nearestStart = Infinity;
  for (let index = 0; index < ranges.length; index += 1) {
    let start = 0;
    let end = 0;
    try {
      start = ranges.start(index);
      end = ranges.end(index);
    } catch {
      continue;
    }
    if (current >= start - 0.05 && current <= end + 0.05) {
      bufferedEnd = end;
      nearestStart = -1;
      break;
    }
    if (start > current && start < nearestStart) {
      nearestStart = start;
      bufferedEnd = end;
    }
  }

  const percent = clamp((bufferedEnd / total) * 100, 0, 100);
  if (Math.abs(percent - lastBufferPercent) >= 0.05) {
    bufferBar.style.width = `${percent}%`;
    lastBufferPercent = percent;
  }
}

function updateProgressThrottled() {
  const now = performance.now();
  if (now - lastProgressUiUpdateAt < getProgressUiInterval()) return;
  lastProgressUiUpdateAt = now;
  if (progressUpdateFrame) return;
  progressUpdateFrame = window.requestAnimationFrame(() => {
    progressUpdateFrame = 0;
    updateProgress();
  });
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
  if (muteBtn) {
    const label = muted ? 'فعال‌کردن صدا' : `بی‌صدا کردن · ${Math.round(video.volume * 100)} درصد`;
    muteBtn.setAttribute('aria-label', label);
    muteBtn.setAttribute('aria-pressed', String(muted));
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
  repositionOpenPlayerOverlays();
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

searchInput?.addEventListener('input', () => {
  window.clearTimeout(searchRenderTimer);
  searchRenderTimer = window.setTimeout(renderExplorer, 110);
});

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

video.addEventListener('dblclick', (event) => {
  event.preventDefault();
  event.stopPropagation();
  toggleFullscreen();
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

  syncDrawerPlaybackState();
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
  syncDrawerPlaybackState();
  playerStage.classList.add('playing');
  refreshPlayerContextMenu();

  playBtn?.classList.add('playing');

  hidePlayerStatus();

  /*
   * Reapply persistent speed
   * whenever playback begins.
   */
  if (video.playbackRate !== currentPlaybackRate) {
    video.playbackRate = currentPlaybackRate;
  }

  showControls();
});

video.addEventListener('pause', () => {
  syncDrawerPlaybackState();
  playerStage.classList.remove('playing');
  refreshPlayerContextMenu();

  playBtn?.classList.remove('playing');

  playerStage.classList.remove('hide-controls');


  clearControlsTimer();
});

video.addEventListener('ended', () => {
  syncDrawerPlaybackState();
  playNextVideo();
});

video.addEventListener('timeupdate', () => {
  updateProgressThrottled();
  if (subtitleEnabled) updateSubtitles();
});

video.addEventListener('progress', () => {
  updateBufferedProgress();
});

video.addEventListener('durationchange', () => {
  updateProgress();
  updateBufferedProgress();
});

video.addEventListener('loadedmetadata', () => {
  /*
   * Some browsers reset playbackRate during metadata/source changes.
   */
  video.defaultPlaybackRate = currentPlaybackRate;
  video.playbackRate = currentPlaybackRate;
  applyPlaybackPerformanceProfile(currentPlaybackRate);

  updateProgress();
  updateBufferedProgress();
  updateVolumeUI();

  hidePlayerStatus();

  const subtitleGeneration = embeddedSubtitleScanGeneration;
  window.setTimeout(() => discoverNativeSubtitleTracks(subtitleGeneration), 0);
  window.setTimeout(() => discoverNativeSubtitleTracks(subtitleGeneration), 220);
  window.setTimeout(() => discoverNativeSubtitleTracks(subtitleGeneration), 800);
});

video.addEventListener('waiting', () => {
  window.clearTimeout(highSpeedStallTimer);

  if (!video.paused && currentPlaybackRate >= 2 && activeObjectURL && !highSpeedStallNoticeShown) {
    highSpeedStallTimer = window.setTimeout(() => {
      if (video.paused || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      highSpeedStallNoticeShown = true;
      showPlayerStatus('پخش سریع به محدودیت خواندن یا رمزگشایی این فایل رسیده است. برای پخش پیوسته‌تر، سرعت را کمتر کنید یا از نسخه H.264 استفاده کنید.', { timeout: 5200 });
    }, HIGH_SPEED_STALL_NOTICE_MS);
  }
});

video.addEventListener('playing', () => {
  syncDrawerPlaybackState();
  window.clearTimeout(highSpeedStallTimer);
});

video.addEventListener('ratechange', () => {
  if (video.playbackRate !== currentPlaybackRate) {
    /*
     * Ignore browser internal
     * resets only when we know
     * our intended rate.
     */
    if (Number.isFinite(video.playbackRate) && video.playbackRate > 0) {
      currentPlaybackRate = cleanSpeed(video.playbackRate);
      applyPlaybackPerformanceProfile(currentPlaybackRate);
      updateSpeedUI(currentPlaybackRate);
    }
  }
});

video.addEventListener('error', () => {

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

progressArea?.addEventListener('pointerdown', startTimelineScrub);
progressArea?.addEventListener('pointermove', moveTimelineScrub);
progressArea?.addEventListener('pointerup', (event) => finishTimelineScrub(event, true));
progressArea?.addEventListener('pointercancel', (event) => finishTimelineScrub(event, false));
progressArea?.addEventListener('pointerleave', () => {
  if (!scrubState) document.getElementById('seekTooltip')?.classList.remove('visible');
});
progressArea?.addEventListener('click', (event) => event.stopPropagation());

/* =========================================================
   CONTROL VISIBILITY POINTER EVENTS
========================================================= */

playerStage?.addEventListener('pointermove', showControls);

playerStage?.addEventListener('pointerdown', showControls);
playerStage?.addEventListener('wheel', handlePlayerWheel, { passive: false });
playerStage?.addEventListener('contextmenu', (event) => {
  if (!playerWorkspace.classList.contains('active') || isPlayerControlTarget(event.target)) return;
  openPlayerContextMenu(event);
});
quickMenuBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (playerContextMenu?.classList.contains('open')) {
    closePlayerContextMenu();
    return;
  }
  const rect = quickMenuBtn.getBoundingClientRect();
  openPlayerContextMenu({
    preventDefault() {},
    stopPropagation() {},
    clientX: rect.left + rect.width / 2,
    clientY: rect.bottom + 8,
  });
});
playerStage?.addEventListener('mousedown', (event) => {
  if (!playerWorkspace.classList.contains('active')) return;
  if (event.button === 3) {
    event.preventDefault();
    playPrevVideo();
  } else if (event.button === 4) {
    event.preventDefault();
    playNextVideo();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (playerContextMenu && !playerContextMenu.contains(event.target) && !quickMenuBtn?.contains(event.target)) closePlayerContextMenu();
  if (keyboardHelpPanel && !keyboardHelpPanel.contains(event.target) && event.target !== playerStage) {
    keyboardHelpPanel.classList.remove('open');
  }
});

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

  const active = subBgToggleBtn.classList.toggle('active');
  subBgToggleBtn.setAttribute('aria-pressed', String(active));

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
window.addEventListener('resize', repositionOpenPlayerOverlays, { passive: true });
window.visualViewport?.addEventListener('resize', repositionOpenPlayerOverlays, { passive: true });
window.visualViewport?.addEventListener('scroll', repositionOpenPlayerOverlays, { passive: true });

/* =========================================================
   PICTURE IN PICTURE
========================================================= */

aspectBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  cycleAspectRatio();
  showControls();
});

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
  if (!playerWorkspace.classList.contains('active')) return;

  const target = event.target;
  const tag = target?.tagName;
  const interactive = target?.closest?.("button, input, textarea, select, a, [contenteditable='true']");

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || interactive) {
    if (event.key === 'Escape') {
      closeSubtitleMenu();
      closeSpeedMenu();
      closePlayerContextMenu();
      keyboardHelpPanel?.classList.remove('open');
      livePlaylistDrawer.classList.remove('open');
    }
    return;
  }

  const key = event.key.toLowerCase();
  const seekDirection = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;

  if (seekDirection) {
    event.preventDefault();
    const amount = event.ctrlKey ? 60 : event.shiftKey ? 30 : SEEK_STEP;
    seekBy(seekDirection * amount);
    showSeekFeedback(seekDirection < 0 ? 'left' : 'right');
    return;
  }

  switch (key) {
    case ' ':
    case 'k':
      event.preventDefault();
      togglePlay();
      break;
    case 'arrowup':
      event.preventDefault();
      adjustVolume(0.05);
      break;
    case 'arrowdown':
      event.preventDefault();
      adjustVolume(-0.05);
      break;
    case 'j':
      event.preventDefault();
      seekBy(-10);
      showSeekFeedback('left');
      break;
    case 'l':
      event.preventDefault();
      if (event.shiftKey) toggleLoopPlayback();
      else {
        seekBy(10);
        showSeekFeedback('right');
      }
      break;
    case 'f':
      event.preventDefault();
      toggleFullscreen();
      break;
    case 'i':
      event.preventDefault();
      togglePiP();
      break;
    case 'm':
      event.preventDefault();
      muteBtn?.click();
      showPlayerOSD('صدا', video.muted ? 'بی‌صدا' : `${Math.round(video.volume * 100)}%`, video.muted ? 0 : video.volume * 100);
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
    case 'c':
      event.preventDefault();
      cycleSubtitleTrack();
      break;
    case 'a':
      event.preventDefault();
      cycleAspectRatio();
      break;
    case '[':
    case ',':
      event.preventDefault();
      adjustPlaybackRate(-0.1);
      break;
    case ']':
    case '.':
      event.preventDefault();
      adjustPlaybackRate(0.1);
      break;
    case '=':
    case '+':
      event.preventDefault();
      setPlaybackRate(1);
      showPlayerOSD('سرعت پخش', '1x');
      break;
    case 'home':
      event.preventDefault();
      video.currentTime = 0;
      updateProgress();
      updateSubtitles();
      break;
    case 'end':
      event.preventDefault();
      if (Number.isFinite(video.duration)) {
        video.currentTime = video.duration;
        updateProgress();
        updateSubtitles();
      }
      break;
    case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9': {
      event.preventDefault();
      if (Number.isFinite(video.duration) && video.duration > 0) {
        const percent = Number(key) * 10;
        video.currentTime = video.duration * percent / 100;
        updateProgress();
        updateSubtitles();
        showPlayerOSD('موقعیت ویدیو', `${percent}%`, percent);
      }
      break;
    }
    case '?':
      event.preventDefault();
      toggleKeyboardHelp();
      break;
    case 'escape':
      closeSubtitleMenu();
      closeSpeedMenu();
      closePlayerContextMenu();
      keyboardHelpPanel?.classList.remove('open');
      livePlaylistDrawer.classList.remove('open');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      break;
    default:
      if (event.ctrlKey && key === 's') {
        event.preventDefault();
        captureVideoFrame();
      }
      break;
  }
});

/* =========================================================
   INITIAL UI
========================================================= */

updateSpeedUI(currentPlaybackRate);
applyPlaybackPerformanceProfile(currentPlaybackRate);

updateAspectRatioUI();

updateVolumeUI();

updateSubtitleStyle();

updateRandomModeUI();
ensurePlayerOSD();

/*
 * Make sure the initial rate is applied.
 */
video.playbackRate = currentPlaybackRate;
