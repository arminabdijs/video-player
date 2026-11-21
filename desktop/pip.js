'use strict';

const canvas = document.getElementById('pipCanvas');
const context = canvas?.getContext('2d', { alpha: false, desynchronized: true });
const playButton = document.getElementById('pipPlay');
const playIcon = document.getElementById('pipPlayIcon');
const closeButton = document.getElementById('pipClose');
const backButton = document.getElementById('pipBack');
const forwardButton = document.getElementById('pipForward');
const seekSlider = document.getElementById('pipSeek');
const timeLabel = document.getElementById('pipTime');
const statusLabel = document.getElementById('pipStatus');

let playbackState = {
  currentTime: 0,
  duration: 0,
  paused: true,
  loaded: false,
};
let isSeeking = false;
let lastFrameAt = 0;

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (part) => String(part).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}` : `${pad(minutes)}:${pad(remainder)}`;
}

function updateControls() {
  const { currentTime, duration, paused } = playbackState;
  if (playIcon) {
    playIcon.innerHTML = paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  }
  playButton?.setAttribute('title', paused ? 'پخش' : 'توقف موقت');
  if (timeLabel) timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  if (seekSlider && !isSeeking) {
    const progress = duration > 0 ? Math.round(Math.min(1, currentTime / duration) * 1000) : 0;
    seekSlider.value = String(progress);
    seekSlider.disabled = !(duration > 0);
  }
}

async function sendCommand(command) {
  try {
    await window.auraPip?.command(command);
  } catch (error) {
    if (statusLabel) statusLabel.textContent = error?.message || 'فرمان کنترل پخش ناموفق بود.';
  }
}

window.auraPip?.onFrame((frame) => {
  if (!context || !frame?.data || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16_777_216) return;

  const source = frame.data instanceof ArrayBuffer
    ? new Uint8ClampedArray(frame.data)
    : ArrayBuffer.isView(frame.data)
      ? new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
      : null;
  if (!source || source.byteLength !== frame.width * frame.height * 4) return;

  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  context.putImageData(new ImageData(source, frame.width, frame.height, { colorSpace: 'srgb' }), 0, 0);
  lastFrameAt = Date.now();
  if (statusLabel?.textContent === 'در انتظار فریم ویدئو…') statusLabel.textContent = '';
});

window.auraPip?.onState((state) => {
  if (!state) return;
  if (state.type === 'state') {
    playbackState = {
      ...playbackState,
      currentTime: Number.isFinite(Number(state.time)) ? Math.max(0, Number(state.time)) : playbackState.currentTime,
      duration: Number.isFinite(Number(state.duration)) ? Math.max(0, Number(state.duration)) : playbackState.duration,
      paused: state.paused === undefined ? playbackState.paused : Number(state.paused) !== 0,
      loaded: playbackState.loaded || Number(state.duration) > 0,
    };
    updateControls();
  } else if (state.type === 'event' && state.eventName === 'loaded') {
    playbackState.loaded = true;
    if (statusLabel) statusLabel.textContent = '';
  } else if (state.type === 'event' && state.eventName === 'ended') {
    playbackState.paused = true;
    updateControls();
    if (statusLabel) statusLabel.textContent = 'پخش به پایان رسید';
  } else if (state.type === 'error' || state.type === 'process-exit') {
    if (statusLabel) statusLabel.textContent = state.message || state.reason || 'موتور پخش متوقف شد.';
  }
});

playButton?.addEventListener('click', () => {
  void sendCommand({ type: 'toggle-pause' });
});
backButton?.addEventListener('click', () => {
  void sendCommand({ type: 'seek', seconds: Math.max(0, playbackState.currentTime - 10) });
});
forwardButton?.addEventListener('click', () => {
  const target = playbackState.currentTime + 10;
  void sendCommand({ type: 'seek', seconds: playbackState.duration > 0 ? Math.min(playbackState.duration, target) : target });
});
closeButton?.addEventListener('click', () => {
  void window.auraPip?.close();
});
canvas?.addEventListener('click', () => {
  void sendCommand({ type: 'toggle-pause' });
});
seekSlider?.addEventListener('pointerdown', () => { isSeeking = true; });
seekSlider?.addEventListener('input', () => {
  const fraction = Number(seekSlider.value) / 1000;
  if (timeLabel && playbackState.duration > 0) {
    timeLabel.textContent = `${formatTime(fraction * playbackState.duration)} / ${formatTime(playbackState.duration)}`;
  }
});
seekSlider?.addEventListener('change', () => {
  const fraction = Number(seekSlider.value) / 1000;
  isSeeking = false;
  if (playbackState.duration > 0) {
    void sendCommand({ type: 'seek', seconds: fraction * playbackState.duration });
  }
  updateControls();
});
window.addEventListener('keydown', (event) => {
  if (event.target === seekSlider) return;
  if (event.code === 'Space') {
    event.preventDefault();
    void sendCommand({ type: 'toggle-pause' });
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    void sendCommand({ type: 'seek', seconds: Math.max(0, playbackState.currentTime - 10) });
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    void sendCommand({ type: 'seek', seconds: Math.min(playbackState.duration || Number.MAX_SAFE_INTEGER, playbackState.currentTime + 10) });
  } else if (event.key === 'Escape') {
    void window.auraPip?.close();
  }
});

updateControls();
if (lastFrameAt === 0 && statusLabel) statusLabel.textContent = 'در انتظار فریم ویدئو…';
