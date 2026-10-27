// Hand tracker client.
// Preferred: MediaPipe runs in a Web Worker on a downscaled frame (fast, never freezes the UI).
// Fallback: same model on the main thread (older browsers without worker ImageBitmap support).
// Both report hands as { landmarks: [{x,y}] (normalised to the camera frame), score }.

const LIB_WORKER = new URL('../vendor/mediapipe/vision_bundle_worker.js', import.meta.url).href;
const LIB_MODULE = new URL('../vendor/mediapipe/vision_bundle.js', import.meta.url).href;
const WASM = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const LOCAL_MODEL = new URL('../models/hand_landmarker.task', import.meta.url).href;
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const DETECT_WIDTH = 640; // frame width given to the model: big enough for hands 2 m away, small enough to be fast

async function loadModel() {
  for (const url of [LOCAL_MODEL, REMOTE_MODEL]) {
    try { const r = await fetch(url); if (r.ok) return await r.arrayBuffer(); } catch (_) {}
  }
  throw new Error('Could not load the hand model. Check the models folder or the internet connection.');
}

function detectSize(video) {
  const w = Math.min(DETECT_WIDTH, video.videoWidth || DETECT_WIDTH);
  return { w, h: Math.round(w * (video.videoHeight || 360) / (video.videoWidth || 640)) };
}

export async function createTracker(video, onStatus = () => {}) {
  if (typeof WebAssembly !== 'object') throw new Error('This browser has no WebAssembly, which hand tracking needs.');
  onStatus('Loading hand tracking…');
  const model = await loadModel();
  const canWorker = typeof Worker === 'function' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function' && !window.RRL_FORCE_MAIN_THREAD;
  if (canWorker) {
    try { return await workerTracker(video, model); }
    catch (e) { console.warn('[tracker] worker failed, using main thread', e); }
  }
  return mainThreadTracker(video, model);
}

function workerTracker(video, model) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hand-worker.js', import.meta.url));
    const t = setTimeout(() => { worker.terminate(); reject(new Error('worker init timeout')); }, 45000);
    let inFlight = false, id = 0;
    const api = {
      mode: 'worker', delegate: '?', ms: 0, onResult: null,
      // Call every animation frame; sends a frame only when the worker is free.
      async pump(ts) {
        if (inFlight || video.readyState < 2) return;
        inFlight = true;
        try {
          const { w, h } = detectSize(video);
          const bmp = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' });
          worker.postMessage({ type: 'frame', bitmap: bmp, ts, id: ++id }, [bmp]);
        } catch (e) { inFlight = false; }
      },
      dispose() { worker.terminate(); },
    };
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { clearTimeout(t); api.delegate = m.delegate; resolve(api); }
      else if (m.type === 'error') { clearTimeout(t); worker.terminate(); reject(new Error(m.message)); }
      else if (m.type === 'result') { inFlight = false; api.ms = api.ms * 0.8 + m.ms * 0.2; api.onResult?.(m.hands); }
    };
    worker.onerror = (e) => { clearTimeout(t); worker.terminate(); reject(new Error(e.message || 'worker error')); };
    worker.postMessage({ type: 'init', lib: LIB_WORKER, wasm: WASM, model }, [model]);
  });
}

async function mainThreadTracker(video, model) {
  const { FilesetResolver, HandLandmarker } = await import(LIB_MODULE);
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const opts = (delegate) => ({
    baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate }, runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let lm, delegate = 'GPU';
  try { lm = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch (_) { delegate = 'CPU'; lm = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let last = 0, lastTs = 0;
  const api = {
    mode: 'main', delegate, ms: 0, onResult: null,
    pump(ts) {
      if (video.readyState < 2) return;
      // Leave at least as much time free as detection takes, so the page stays smooth.
      if (ts - last < api.ms * 1.2) return;
      last = ts;
      const { w, h } = detectSize(video);
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(video, 0, 0, w, h);
      const t0 = performance.now();
      lastTs = Math.max(ts, lastTs + 1);
      const r = lm.detectForVideo(canvas, lastTs);
      api.ms = api.ms * 0.8 + (performance.now() - t0) * 0.2;
      api.onResult?.((r.landmarks || []).map((l, i) => ({ landmarks: l, score: r.handedness?.[i]?.[0]?.score ?? 0.9 })));
    },
    dispose() { lm.close?.(); },
  };
  return api;
}
