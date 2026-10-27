// Colour maths shared by the UI and the renderer.

export const wrapHue = (h) => ((h % 360) + 360) % 360;

export function hslToRgb(h, s, l) {
  h = wrapHue(h) / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export const SCHEMES = {
  complementary: { label: 'Complementary', offsets: [0, 180] },
  analogous: { label: 'Analogous', offsets: [-30, 0, 30] },
  triadic: { label: 'Triadic', offsets: [0, 120, 240] },
  split: { label: 'Split-Complementary', offsets: [0, 150, 210] },
};

export const harmonyHues = (base, scheme) => SCHEMES[scheme].offsets.map((o) => wrapHue(base + o));

// Display colour for a hue in palettes / wheel markers.
export const hueSwatch = (h) => hslToRgb(h, 0.85, 0.55);

const HUE_NAMES = [
  [15, 'Red'], [40, 'Orange'], [65, 'Yellow'], [90, 'Lime'], [150, 'Green'], [180, 'Teal'],
  [200, 'Cyan'], [240, 'Blue'], [270, 'Indigo'], [300, 'Violet'], [335, 'Magenta'], [360, 'Red'],
];
export function hueName(h) {
  h = wrapHue(h);
  for (const [limit, name] of HUE_NAMES) if (h < limit) return name;
  return 'Red';
}

// Plain-language name for an additive RGB mix.
export function mixName(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 30) return 'No light (black)';
  if (max - min < 25) return max > 220 ? 'White light' : 'Grey light';
  const n = (v) => v / max > 0.6;
  const R = n(r), G = n(g), B = n(b);
  if (R && G && !B) return 'Red + Green = Yellow';
  if (R && B && !G) return 'Red + Blue = Magenta';
  if (G && B && !R) return 'Green + Blue = Cyan';
  if (R && !G && !B) return 'Red light';
  if (G && !R && !B) return 'Green light';
  if (B && !R && !G) return 'Blue light';
  return 'Mixed light';
}
