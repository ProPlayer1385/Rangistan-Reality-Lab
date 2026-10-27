// Hand tracking off the main thread (classic Web Worker).
// The page sends small ImageBitmaps of the camera; this worker runs MediaPipe Hand Landmarker
// and sends back landmarks. The UI never waits for the hand model.
/* global importScripts */

self.exports = {};
let landmarker = null;
let busy = false;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      importScripts(msg.lib);
      const { FilesetResolver, HandLandmarker } = self.exports;
      const fileset = await FilesetResolver.forVisionTasks(msg.wasm);
      const opts = (delegate) => ({
        baseOptions: { modelAssetBuffer: new Uint8Array(msg.model), delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      let delegate = 'GPU';
      try { landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch (err) { delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
      self.postMessage({ type: 'ready', delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  } else if (msg.type === 'frame') {
    const bmp = msg.bitmap;
    if (!landmarker || busy) { bmp.close(); return; }
    busy = true;
    const t0 = performance.now();
    try {
      const r = landmarker.detectForVideo(bmp, msg.ts);
      const hands = (r.landmarks || []).map((lm, i) => ({
        landmarks: lm.map((p) => ({ x: p.x, y: p.y })),
        score: r.handedness?.[i]?.[0]?.score ?? r.handednesses?.[i]?.[0]?.score ?? 0.9,
      }));
      self.postMessage({ type: 'result', hands, ms: performance.now() - t0, id: msg.id });
    } catch (err) {
      self.postMessage({ type: 'result', hands: [], ms: performance.now() - t0, id: msg.id, error: String(err && err.message || err) });
    } finally {
      bmp.close();
      busy = false;
    }
  }
};
