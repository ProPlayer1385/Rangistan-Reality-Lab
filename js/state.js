// Colour state for the whole camera frame, with smooth animated transitions.

export const DEFAULTS = Object.freeze({
  saturation: 100,   // %
  brightness: 100,   // %
  contrast: 100,     // %
  hue: 0,            // degrees
  temperature: 0,    // -100 cool .. 100 warm
  grayscale: 0,      // %
  invert: 0,         // 0..1
  r: 255, g: 255, b: 255, // light mixer (255,255,255 = white light)
  tint: 1,
  baseHue: 0,
  scheme: 'complementary',
  paletteAmount: 0,  // % "paint the world with the harmony palette"
});

export const state = { ...DEFAULTS };
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (patch) => listeners.forEach((fn) => fn(patch));

export function set(patch) {
  cancelTween();
  Object.assign(state, patch);
  emit(patch);
}

// Animate numeric values toward a target so every change washes over the scene.
let tween = null;
// Where a value is heading (so rapid repeated taps add up exactly, even mid-animation).
export const target = (k) => (tween && k in tween.to ? tween.to[k] : state[k]);
function cancelTween() {
  if (!tween) return;
  cancelAnimationFrame(tween.raf);
  for (const k in tween.to) state[k] = tween.to[k]; // jump to the end of the interrupted animation
  tween = null;
}
export function tweenTo(patch, ms = 450) {
  cancelTween();
  const from = {}, to = {};
  for (const k in patch) {
    if (typeof patch[k] === 'number' && typeof state[k] === 'number' && k !== 'baseHue') { from[k] = state[k]; to[k] = patch[k]; }
    else state[k] = patch[k];
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    for (const k in to) state[k] = from[k] + (to[k] - from[k]) * e;
    emit(patch);
    if (p < 1) tween.raf = requestAnimationFrame(step); else { for (const k in to) state[k] = to[k]; tween = null; emit(patch); }
  };
  tween = { raf: requestAnimationFrame(step), to };
}

export const resetAll = () => tweenTo({ ...DEFAULTS, baseHue: state.baseHue, scheme: state.scheme });

export const FILTERS = [
  { id: 'vivid', label: 'Vivid', desc: 'Saturation up: every colour gets stronger', color: ['#ff2d75', '#ffd400', '#00e0ff'], values: { saturation: 180, contrast: 115, brightness: 103 } },
  { id: 'rangistan', label: 'Rangistan', desc: 'Warm desert festival colours', color: ['#ff6a00', '#ff2d95', '#ffc400'], values: { temperature: 38, saturation: 150, hue: -10, contrast: 112, brightness: 104 } },
  { id: 'golden', label: 'Golden', desc: 'Warm light: more red and yellow', color: ['#ff9a3c', '#ffd27a'], values: { temperature: 60, saturation: 125, brightness: 106, contrast: 105 } },
  { id: 'arctic', label: 'Arctic', desc: 'Cool light: more blue', color: ['#2f9bff', '#e6f6ff'], values: { temperature: -65, saturation: 80, brightness: 108, contrast: 104 } },
  { id: 'noir', label: 'Noir', desc: 'No colour, only light and shadow', color: ['#111', '#eee'], values: { grayscale: 100, contrast: 150, brightness: 95 } },
  { id: 'sepia', label: 'Sepia', desc: 'Grayscale with a warm tone', color: ['#5b3a1a', '#e8c89a'], values: { grayscale: 100, temperature: 70, contrast: 106 } },
  { id: 'neon', label: 'Neon', desc: 'Magenta light, boosted colour', color: ['#ff00e6', '#5a00ff', '#00f0ff'], values: { r: 255, g: 90, b: 255, saturation: 170, contrast: 125 } },
  { id: 'popart', label: 'Pop Art', desc: 'World painted in a triadic palette', color: ['#ff1744', '#ffea00', '#2979ff'], values: { scheme: 'triadic', paletteAmount: 100, saturation: 140, contrast: 135 } },
  { id: 'xray', label: 'X-Ray', desc: 'Inverted colours: every colour becomes its opposite', color: ['#ffffff', '#123'], values: { invert: 1, grayscale: 100, contrast: 140 } },
  { id: 'dream', label: 'Dream', desc: 'Hue rotated 180°: colours swap to complements', color: ['#7cf', '#f7c'], values: { hue: 180, saturation: 130 } },
];

export function applyFilter(id) {
  const f = FILTERS.find((x) => x.id === id);
  if (f) tweenTo({ ...DEFAULTS, baseHue: state.baseHue, ...f.values });
  return f;
}
