// The single camera -> screen mapping. The renderer draws the camera with this geometry and the
// touch engine converts hand landmarks with it, so a fingertip touches exactly what it is drawn on.
//   landmark (nx, ny) in the raw camera frame -> cover-fit (fill screen, crop overflow) -> mirror -> screen px

export function coverGeometry(vw, vh, W, H) {
  vw = vw || 1280; vh = vh || 720;
  const k = Math.max(W / vw, H / vh);
  const dw = vw * k, dh = vh * k;
  return { k, dw, dh, ox: (W - dw) / 2, oy: (H - dh) / 2 };
}

export function createMapper({ viewEl, video, isMirrored }) {
  let rect = { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const api = {
    refresh() {
      const r = viewEl.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width || innerWidth, height: r.height || innerHeight };
    },
    get rect() { return rect; },
    toScreen(nx, ny) {
      const g = coverGeometry(video.videoWidth, video.videoHeight, rect.width, rect.height);
      const mx = isMirrored() ? 1 - nx : nx;
      return { x: rect.left + g.ox + mx * g.dw, y: rect.top + g.oy + ny * g.dh };
    },
    toCamera(x, y) {
      const g = coverGeometry(video.videoWidth, video.videoHeight, rect.width, rect.height);
      const mx = (x - rect.left - g.ox) / g.dw;
      return { x: isMirrored() ? 1 - mx : mx, y: (y - rect.top - g.oy) / g.dh };
    },
  };
  return api;
}
