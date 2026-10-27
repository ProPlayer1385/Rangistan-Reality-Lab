// Rangistan Reality Lab: entry point.
import { state, resetAll } from './state.js';
import { createRenderer } from './renderer.js';
import { createMapper } from './mapping.js';
import { startCamera, stopCamera, listCameras, checkCameraSupport, CameraError, IS_MOBILE } from './camera.js';
import { createTracker } from './tracker.js';
import { createTouchEngine } from './touch.js';
import { createFx } from './fx.js';
import { createGuide } from './guide.js';
import { initUI, ui, setHidden, popFx, info, setMode } from './ui.js';

window.__rrlBooted = true;

const $ = (id) => document.getElementById(id);
const video = $('video');
const view = $('view');
const cam = { facing: 'user', deviceId: null, devices: [], track: null, starting: false };
let renderer = null, tracker = null, trackerState = 'off';
let hands = [];                     // latest detections
let lastHandsAt = 0, liveSince = 0, lastNoHandHint = 0, lastLightCheck = 0, darkWarned = 0;
let soundOn = true;
try { soundOn = localStorage.getItem('rrl.sound') !== 'off'; } catch (_) {}

// ---------- toast / status ----------
let toastTimer = 0;
function toast(msg, kind = 'info', ms = 4200) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast is-' + kind; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
window.__rrlToast = toast;
function setStatus(text, mode) { $('statusText').textContent = text; $('status').dataset.mode = mode; }

// ---------- core pieces ----------
const isMirrored = () => cam.facing !== 'environment';
const mapper = createMapper({ viewEl: view, video, isMirrored });
const fx = createFx($('fx'), mapper);
fx.setSound(soundOn);
const touch = createTouchEngine({
  mapper,
  onTap: (el, pt) => { popFx(el, pt); el.click(); },
});
const guide = createGuide({
  getHands: () => hands,
  getTrackerState: () => trackerState,
  popFx,
  onDone: () => { setHidden(false); info('Filters', 'Touch a bubble on the right to recolour your whole world.'); },
});

initUI({
  fx,
  onGuide: () => guide.start(),
  onSound: () => { soundOn = !soundOn; fx.setSound(soundOn); paintSound(); try { localStorage.setItem('rrl.sound', soundOn ? 'on' : 'off'); } catch (_) {} },
  onCamera: switchCamera,
  onFullscreen: () => toggleFullscreen(),
});
function paintSound() { $('soundBtn').classList.toggle('is-off', !soundOn); }
paintSound();

const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
if (!fsSupported) { $('fsBtn').hidden = true; $('fsCheck').closest('label').hidden = true; }

// ---------- start ----------
const unsupported = checkCameraSupport();
if (unsupported) showCamError(unsupported);
const startBtn = $('startBtn');
startBtn.disabled = false;
startBtn.querySelector('span').textContent = 'Enter the mirror';
startBtn.addEventListener('click', start);

function showCamError(e) {
  $('camError').hidden = false;
  $('camError').querySelector('[data-title]').textContent = e.title;
  $('camError').querySelector('[data-hint]').textContent = e.hint || '';
}

async function openCamera(opts) {
  cam.starting = true;
  try {
    const res = await startCamera(video, opts);
    cam.facing = res.facing; cam.deviceId = res.deviceId; cam.track = res.track;
    watchTrack(res.track);
    $('camPause').hidden = true;
    cam.devices = await listCameras();
    $('camBtn').hidden = cam.devices.length < 2;
    return res;
  } finally { cam.starting = false; }
}

async function start() {
  fx.unlockAudio(); // must happen inside the click
  const wantFs = $('fsCheck').checked && fsSupported;
  if (wantFs) enterFullscreen(); // request inside the click, before the permission prompt
  $('camError').hidden = true;
  startBtn.disabled = true;
  startBtn.querySelector('span').textContent = 'Allow the camera…';
  setStatus('Requesting camera…', 'loading');
  try {
    await openCamera({ facing: 'user' });
  } catch (err) {
    console.error('[camera]', err);
    if (document.fullscreenElement) document.exitFullscreen?.();
    showCamError(err instanceof CameraError ? err : new CameraError('The camera could not start.', err?.message || String(err)));
    startBtn.disabled = false;
    startBtn.querySelector('span').textContent = 'Try again';
    setStatus('Camera off', 'error');
    return;
  }
  try { renderer = createRenderer(view, video, { isMirrored }); }
  catch (err) {
    console.error('[renderer]', err);
    view.style.display = 'none'; video.classList.add('is-fallback');
    renderer = { mode: 'none', scale: 1, render: () => false, resize() {} };
    toast('Colour effects are not available on this graphics driver. Showing the plain camera.', 'error', 8000);
  }
  document.body.classList.remove('is-intro');
  document.body.classList.add('is-live');
  liveSince = performance.now();
  requestAnimationFrame(loop);
  loadTracker();
  guide.start();
}

async function loadTracker() {
  trackerState = 'loading';
  setStatus('Waking up hand tracking…', 'loading');
  try {
    tracker = await createTracker(video, (m) => setStatus(m, 'loading'));
    tracker.onResult = (h) => { hands = h; if (h.length) lastHandsAt = performance.now(); onHands(); };
    trackerState = 'ready';
    setStatus('Show your hands', 'search');
    console.info('[tracker]', tracker.mode, tracker.delegate);
  } catch (err) {
    console.error('[tracker]', err);
    trackerState = 'failed';
    setStatus('Tap mode', 'touch');
    toast('Hand tracking is not available here (' + (err.message || err) + '). Tap the bubbles on the screen instead.', 'info', 8000);
  }
}

function onHands() {
  const now = performance.now();
  touch.update(hands, now);
  fx.setHands(hands);
  if (hands.length) setStatus(hands.length === 2 ? 'Two hands' : 'Hand found', 'track');
  else setStatus('Show your hands', 'search');
}

// ---------- frame loop ----------
function loop(now) {
  requestAnimationFrame(loop);
  if (video.readyState < 2) return;
  mapper.refresh();
  renderer.render(state, {});
  if (tracker && !window.RRL?.pauseTracking) tracker.pump(now);
  fx.draw(true);
  guide.tick(now);
  if (!guide.active && trackerState === 'ready') helpers(now);
}

// Practical helpers for real rooms: darkness and "where are my hands?"
const probe = document.createElement('canvas');
probe.width = 32; probe.height = 18;
const pctx = probe.getContext('2d', { willReadFrequently: true });
function helpers(now) {
  if (now - lastLightCheck > 1500) {
    lastLightCheck = now;
    try {
      pctx.drawImage(video, 0, 0, 32, 18);
      const d = pctx.getImageData(0, 0, 32, 18).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
      const lum = s / (d.length / 4) / 255;
      if (lum < 0.16 && now - darkWarned > 20000) { darkWarned = now; toast('It is quite dark. Face a window or lamp so the camera can see your hands.', 'info', 6000); }
    } catch (_) {}
  }
  if (!hands.length && now - Math.max(lastHandsAt, liveSince) > 9000 && now - lastNoHandHint > 25000 && !ui.hidden) {
    lastNoHandHint = now;
    toast('Can’t see your hands. Raise them with palms toward the screen, or step back a little.', 'info', 6000);
  }
}

// ---------- camera switching + interruptions ----------
async function switchCamera() {
  if (cam.starting) return;
  const hasFacing = IS_MOBILE || cam.devices.some((d) => /back|rear|environment/i.test(d.label));
  let opts;
  if (hasFacing) opts = { facing: cam.facing === 'user' ? 'environment' : 'user' };
  else { const i = cam.devices.findIndex((d) => d.deviceId === cam.deviceId); opts = { deviceId: cam.devices[(i + 1) % cam.devices.length]?.deviceId }; }
  try {
    hands = []; onHands();
    await openCamera(opts);
    toast(cam.facing === 'environment' ? 'Rear camera (not mirrored)' : 'Front camera (mirror)', 'info', 1800);
  } catch (err) {
    toast('Could not switch camera: ' + (err.title || err.message), 'error');
    try { await openCamera({ facing: 'user' }); } catch (_) { showPause('Camera unavailable', 'Press Resume to try again.'); }
  }
}
function watchTrack(track) {
  if (!track) return;
  let muteTimer = 0;
  track.addEventListener('ended', () => { if (track === cam.track) showPause('Camera disconnected', 'The camera stopped (unplugged, used by another app, or access was removed).'); });
  track.addEventListener('mute', () => { if (track === cam.track) muteTimer = setTimeout(() => showPause('Camera paused', 'Another app or a call is using the camera, or the page was in the background.'), 1500); });
  track.addEventListener('unmute', () => { clearTimeout(muteTimer); if (track === cam.track) $('camPause').hidden = true; });
}
function showPause(title, text) {
  $('camPauseTitle').textContent = title; $('camPauseText').textContent = text;
  $('camPause').hidden = false;
  hands = []; onHands();
  setStatus('Camera paused', 'error');
}
async function resumeCamera() {
  try { await openCamera({ facing: cam.facing }); toast('Camera is back.', 'info', 1500); }
  catch (err) { showPause(err.title || 'Camera unavailable', err.hint || err.message || 'Press Resume to try again.'); }
}
$('camResumeBtn').addEventListener('click', resumeCamera);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !document.body.classList.contains('is-live') || cam.starting) return;
  if (!cam.track || cam.track.readyState === 'ended' || !video.srcObject) resumeCamera();
  else if (video.paused) video.play().catch(() => {});
});

// ---------- fullscreen + keys ----------
function enterFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(el)).catch(() => {});
}
function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else enterFullscreen();
}
window.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('is-intro') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'h') setHidden(!ui.hidden);
  else if (k === 'f') toggleFullscreen();
  else if (k === 'r') resetAll();
  else if (k === 'escape' && guide.active) guide.finish();
  else if (['1', '2', '3', '4'].includes(k)) setMode(['filters', 'light', 'harmony', 'adjust'][+k - 1]);
  else return;
  e.preventDefault();
});
window.addEventListener('resize', () => renderer?.resize());
window.addEventListener('pagehide', () => stopCamera(video));
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });

// Test hooks (used by automated tests; harmless otherwise).
window.RRL = {
  state, ui, mapper, touch, guide, cam,
  get tracker() { return tracker; }, get trackerState() { return trackerState; }, get renderer() { return renderer; },
  // feed synthetic hands through the exact same path as real detections
  feedHands(h) { hands = h; if (h.length) lastHandsAt = performance.now(); onHands(); },
};
