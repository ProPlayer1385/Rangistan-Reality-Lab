// "Touch the bubble": hand touches without pinching or holding.
//
// Every bubble with [data-touch] is a circle on screen. Each hand's five fingertips are converted
// to screen pixels with the SAME mapping that draws the camera, so a bubble fires exactly when
// your fingertip, as you see it in the mirror, enters it. No cursor, no calibration.
//
// Safety rules (no accidental or repeated taps):
//   - only extended fingers count, and each hand taps at most one bubble at a time
//   - a fingertip must be inside the bubble for 2 consecutive detections (filters glitches)
//   - a bubble fires once, then re-arms only after every fingertip has left it
//   - a hand must be tracked for a few frames before it can touch (no "appear inside" taps)
//   - a bubble that appears under a hand is not armed until the hand moves away
//   - short global cooldown between taps

const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]]; // [tip, middle joint] for index..little
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Only fingers that are stretched out can touch: a pointing hand touches with its index finger,
// an open palm with all fingers; curled fingers below a pointing finger never brush other bubbles.
function touchingTips(lm) {
  const wrist = lm[0], out = [];
  for (const [tip, pip] of FINGERS) if (d2(wrist, lm[tip]) > d2(wrist, lm[pip]) * 1.12) out.push(tip);
  // thumb counts only when the whole hand is open (all four fingers extended)
  if (out.length === 4 && d2(lm[4], lm[17]) > d2(lm[3], lm[17]) * 1.1) out.push(4);
  if (!out.length) out.push(8); // a fist still "pokes" with the index knuckle area
  return out;
}
const FRAMES_INSIDE = 2;
const HAND_WARMUP = 3;
const COOLDOWN_SAME = 650;
const COOLDOWN_ANY = 180;

export function createTouchEngine({ mapper, onTap }) {
  const st = new WeakMap();
  let handAge = 0, lastAny = -1e9, enabled = true, prevCount = 0;
  let nearEls = new Set();

  function visibleTargets() {
    const out = [];
    const body = document.body.classList;
    const now = performance.now();
    for (const el of document.querySelectorAll('[data-touch]')) {
      if (el.disabled || el.hidden || el.closest('[hidden], [aria-hidden="true"]')) continue;
      // While the guide runs only its bubble is live; while hidden only the "Show" bubble is live.
      if (body.contains('guiding') && el.id !== 'touchMe') continue;
      if (body.contains('ui-hidden') && el.id !== 'showBubble') continue;
      if (el._born && now - el._born < 450) continue;          // still popping in
      if (getComputedStyle(el).visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      // Centre from the live box; radius from the untransformed size, so hover-swell and
      // pop-in animations never change what counts as "inside".
      const rad = (el.offsetWidth || r.width) / 2;
      if (rad < 4 || r.bottom < 0 || r.top > innerHeight) continue;
      out.push({ el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: rad });
    }
    return out;
  }

  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) this.clear(); },
    clear() { for (const el of nearEls) { el.style.removeProperty('--near'); el.classList.remove('is-touching'); } nearEls.clear(); },

    // hands: [{ landmarks: [{x,y}] }] normalised camera coords. Returns fingertip screen points.
    update(hands, now = performance.now()) {
      handAge = hands.length ? handAge + 1 : 0;
      const pts = [];
      hands.forEach((h, hi) => { for (const id of touchingTips(h.landmarks)) pts.push({ ...mapper.toScreen(h.landmarks[id].x, h.landmarks[id].y), hand: hi }); });
      if (!enabled) return pts;
      const candidates = [];
      // A hand that has just come into view cannot tap whatever it appeared on top of.
      const newHand = hands.length > prevCount;
      prevCount = hands.length;

      const nextNear = new Set();
      for (const t of visibleTargets()) {
        let dmin = Infinity, hit = null;
        for (const p of pts) { const d = Math.hypot(p.x - t.cx, p.y - t.cy); if (d < dmin) { dmin = d; hit = p; } }
        const inside = dmin < t.r * 0.95 + 4;
        const away = dmin > t.r * 1.3;
        let s = st.get(t.el);
        if (!s) { s = { frames: 0, armed: !(dmin < t.r * 1.3), last: -1e9 }; st.set(t.el, s); }
        s.frames = inside ? s.frames + 1 : 0;
        if (away) s.armed = true;
        if (newHand && dmin < t.r * 1.3) s.armed = false;

        const near = Math.max(0, Math.min(1, 1 - (dmin - t.r) / (t.r * 1.4)));
        if (near > 0) { t.el.style.setProperty('--near', near.toFixed(2)); nextNear.add(t.el); }
        t.el.classList.toggle('is-touching', inside);

        if (inside && s.frames >= FRAMES_INSIDE && s.armed && handAge >= HAND_WARMUP && now - s.last > COOLDOWN_SAME)
          candidates.push({ t, s, hit, depth: dmin / t.r });
      }
      // One tap per hand per frame: the bubble that hand is most deeply inside.
      if (candidates.length && now - lastAny > COOLDOWN_ANY) {
        const fired = new Set();
        candidates.sort((a, b) => a.depth - b.depth);
        for (const c of candidates) {
          if (fired.has(c.hit.hand)) continue;
          fired.add(c.hit.hand);
          c.s.armed = false; c.s.last = now; lastAny = now;
          onTap(c.t.el, c.hit);
          break; // also keep it to one tap per frame overall: two simultaneous taps would fight
        }
      }
      for (const el of nearEls) if (!nextNear.has(el)) { el.style.removeProperty('--near'); el.classList.remove('is-touching'); }
      nearEls = nextNear;
      return pts;
    },
  };
}
