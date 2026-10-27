// Webcam access with clear, human-readable errors.

export class CameraError extends Error {
  constructor(title, hint, cause) {
    super(title);
    this.title = title;
    this.hint = hint;
    this.cause = cause;
  }
}

function explain(err) {
  const name = err?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new CameraError(
        'Camera permission was blocked.',
        'Click the camera / lock icon at the left of the address bar, set Camera to "Allow", then press Retry. ' +
        'On Windows also check Settings > Privacy & security > Camera, and make sure camera access and ' +
        '"Let desktop apps access your camera" are on.', err);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new CameraError('No camera was found.', 'Connect a webcam (or enable the built-in one), then press Retry.', err);
    case 'NotReadableError':
    case 'TrackStartError':
      return new CameraError(
        'The camera is busy or blocked.',
        'Close other apps or tabs that may be using it (Zoom, Teams, Meet, the Camera app), then press Retry. ' +
        'If it persists, unplug and reconnect the webcam.', err);
    case 'NotSupportedError':
      return new CameraError('This browser mode cannot use the camera.', 'Open the page in a normal (not embedded or headless) Chrome or Edge window via http://localhost:8000.', err);
    case 'SecurityError':
      return new CameraError('Camera access is blocked by browser security settings.', 'Open the page from http://localhost or an https:// address.', err);
    case 'AbortError':
      return new CameraError('Camera start was interrupted.', 'Press Retry.', err);
    default:
      return new CameraError('The camera could not start.', (err && err.message) || 'Unknown error. Press Retry.', err);
  }
}

export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// In-app browsers (Instagram, Facebook, LinkedIn, Line, WeChat) frequently block the camera.
export function inAppBrowserName() {
  const ua = navigator.userAgent;
  const m = ua.match(/(FBAN|FBAV|Instagram|LinkedInApp|Line\/|MicroMessenger|Snapchat|TikTok)/i);
  return m ? m[1].replace('/', '') : '';
}

export function checkCameraSupport() {
  if (location.protocol === 'file:')
    return new CameraError('Opened as a file.', 'In the project folder run  python -m http.server 8000  and open http://localhost:8000');
  if (!window.isSecureContext)
    return new CameraError(
      'This address is not allowed to use the camera.',
      `Browsers only allow cameras on https:// or http://localhost. You opened ${location.origin}. ` +
      'Use http://localhost:8000 on this computer, or open the https link of the deployed site.');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const app = inAppBrowserName();
    return new CameraError(
      app ? `The ${app} in-app browser cannot use the camera.` : 'This browser does not support camera access.',
      app ? 'Open this link in Safari (iPhone/iPad) or Chrome (Android): use the ⋯ menu > "Open in browser".'
          : 'Use a current version of Chrome, Edge, Safari or Firefox.');
  }
  return null;
}

// facing: 'user' (front, default) | 'environment' (rear). deviceId overrides facing (desktop switching).
export async function startCamera(video, { facing = 'user', deviceId = null } = {}) {
  const unsupported = checkCameraSupport();
  if (unsupported) throw unsupported;
  stopCamera(video);

  // Adaptive capture size: phones get a lighter stream (faster tracking, less heat).
  const size = IS_MOBILE ? { width: { ideal: 960 }, height: { ideal: 540 } } : { width: { ideal: 1280 }, height: { ideal: 720 } };
  const primary = deviceId
    ? { deviceId: { exact: deviceId }, ...size, frameRate: { ideal: 30 } }
    : { facingMode: { ideal: facing }, ...size, frameRate: { ideal: 30 } };
  const attempts = [
    { video: primary, audio: false },
    { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: facing }, audio: false },
    { video: true, audio: false }, // last resort for cameras that reject every constraint
  ];
  let stream = null, lastErr = null;
  for (const c of attempts) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
    catch (e) {
      lastErr = e;
      if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(e.name)) break;
    }
  }
  if (!stream) throw explain(lastErr);

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  try { await video.play(); } catch (e) { /* muted autoplay is allowed; metadata wait below catches real failures */ }

  await new Promise((resolve, reject) => {
    if (video.videoWidth) return resolve();
    const t = setTimeout(() => reject(new CameraError('The camera started but sent no picture.', 'Press Retry, or try another camera.')), 8000);
    video.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve(); }, { once: true });
  });

  const track = stream.getVideoTracks()[0];
  const st = track?.getSettings?.() || {};
  // Desktop webcams report no facingMode: treat them as front-facing (mirrored).
  const actualFacing = st.facingMode || (deviceId ? 'user' : facing);
  return { stream, track, facing: actualFacing === 'environment' ? 'environment' : 'user', deviceId: st.deviceId || deviceId };
}

export async function listCameras() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  } catch (_) { return []; }
}

export function stopCamera(video) {
  const s = video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
