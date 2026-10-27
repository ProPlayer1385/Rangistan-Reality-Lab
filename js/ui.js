// Floating colour bubbles.
// Left rail = what to play with (modes). Right rail = the colours/actions of that mode.
// Both rails float at mid-height on the screen edges: away from your face, out of the corners.
// Every bubble is a real <button> (mouse / touch screen) AND a [data-touch] hand target.

import { state, set, tweenTo, resetAll, FILTERS, applyFilter, DEFAULTS, target } from './state.js';
import { hslToRgb, toHex, harmonyHues, SCHEMES, hueName, mixName, hueSwatch } from './color.js';

const $ = (id) => document.getElementById(id);
let fxRef = null;
export const ui = { mode: 'filters', page: 0, hidden: false, activeFilter: null };

const MODES = [
  { id: 'filters', label: 'Filters', colors: ['#ff2d95', '#ffb020', '#3ef2ff'], icon: '✦',
    info: ['Filters', 'Touch a bubble on the right to recolour your whole world.'] },
  { id: 'light', label: 'Light Mix', colors: ['#ff2a4a', '#2aff7a', '#2a7bff'], icon: '◐',
    info: ['Light Mixer', 'Red, green and blue light add up. Switch each light on or off.'] },
  { id: 'harmony', label: 'Harmony', colors: ['#ffe14d', '#8f6bff', '#ff6a00'], icon: '❖',
    info: ['Color Harmony', 'Pick a colour: the world is painted with colours that go well with it.'] },
  { id: 'adjust', label: 'Adjust', colors: ['#ffffff', '#9aa7ff', '#ff9ad5'], icon: '☀',
    info: ['Adjust', 'Make the scene brighter, warmer, more colourful, and more.'] },
  { id: 'reset', label: 'Reset', colors: ['#cfd3e6', '#7b8099'], icon: '↺', action: true },
];

const HUES = [[0, 'Red'], [60, 'Yellow'], [120, 'Green'], [180, 'Cyan'], [240, 'Blue'], [300, 'Magenta']];
const SCHEME_ORDER = ['complementary', 'analogous', 'triadic', 'split'];
const SCHEME_TEXT = {
  complementary: 'opposite colours on the wheel: strong contrast',
  analogous: 'neighbours on the wheel: calm and natural',
  triadic: 'three colours evenly spaced: lively and balanced',
  split: 'a colour plus the two beside its opposite',
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ADJUST = [
  { id: 'bright+', label: 'Brighter', icon: '☀', colors: ['#fffbe0', '#ffd34d'], key: 'brightness', step: 15, min: 30, max: 200, unit: '%' },
  { id: 'bright-', label: 'Darker', icon: '☾', colors: ['#3a3f66', '#11131f'], key: 'brightness', step: -15, min: 30, max: 200, unit: '%' },
  { id: 'sat+', label: 'More colour', icon: '✚', colors: ['#ff2d75', '#ffd400', '#00e0ff'], key: 'saturation', step: 35, min: 0, max: 300, unit: '%' },
  { id: 'sat-', label: 'Less colour', icon: '−', colors: ['#9aa', '#ccc'], key: 'saturation', step: -35, min: 0, max: 300, unit: '%' },
  { id: 'warm', label: 'Warmer', icon: '♨', colors: ['#ff6a00', '#ffc46b'], key: 'temperature', step: 25, min: -100, max: 100, unit: '' },
  { id: 'cool', label: 'Cooler', icon: '❄', colors: ['#2f7bff', '#bfe6ff'], key: 'temperature', step: -25, min: -100, max: 100, unit: '' },
  { id: 'con+', label: 'More contrast', icon: '◑', colors: ['#000', '#fff'], key: 'contrast', step: 25, min: 30, max: 250, unit: '%' },
  { id: 'con-', label: 'Less contrast', icon: '◌', colors: ['#888', '#aaa'], key: 'contrast', step: -25, min: 30, max: 250, unit: '%' },
  { id: 'hue', label: 'Shift hue', icon: '⟳', colors: ['#ff3b5c', '#ffe14d', '#3dffa0', '#4d9dff', '#c86bff'], key: 'hue', step: 45, wrap: true, unit: '°' },
  { id: 'gray', label: 'Grayscale', icon: '◧', colors: ['#222', '#ddd'], key: 'grayscale', toggle: 100, unit: '%' },
];
const KEY_NAMES = { brightness: 'Brightness', saturation: 'Saturation', temperature: 'Temperature', contrast: 'Contrast', hue: 'Hue shift', grayscale: 'Grayscale' };

// ---------- bubble factory ----------
function bubble({ label, colors, icon, small, title }) {
  const b = document.createElement('button');
  b.className = 'bubble' + (small ? ' is-small' : '');
  b.dataset.touch = '';
  b.setAttribute('aria-label', title || label);
  const c = colors.length === 1 ? [colors[0], colors[0]] : colors;
  b.style.setProperty('--fill', c.length > 2 ? `conic-gradient(from 210deg, ${c.join(', ')}, ${c[0]})` : `linear-gradient(140deg, ${c.join(', ')})`);
  b.style.setProperty('--glow', c[0]);
  b.style.setProperty('--float-delay', `${(Math.random() * -6).toFixed(2)}s`);
  b.dataset.colors = c.join(',');
  b._born = performance.now();
  b.innerHTML = `<span class="bubble-body"><span class="bubble-icon"></span><span class="bubble-shine"></span></span><span class="bubble-label"></span>`;
  b.querySelector('.bubble-icon').textContent = icon || '';
  b.querySelector('.bubble-label').textContent = label;
  // Pop effect for mouse / touch-screen taps too.
  b.addEventListener('pointerdown', (e) => { if (e.isTrusted) popFx(b, { x: e.clientX, y: e.clientY }); });
  return b;
}
export function popFx(el, pt) {
  const r = el.getBoundingClientRect();
  const p = pt || { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop');
  fxRef?.burst(p.x, p.y, (el.dataset.colors || '#fff').split(','));
  fxRef?.pop(0.8 + Math.random() * 0.5);
}

// ---------- info chip ----------
let infoTimer = 0;
export function info(title, text, swatches = null, sticky = false) {
  $('infoTitle').textContent = title;
  $('infoText').textContent = text;
  const sw = $('infoSwatches');
  sw.innerHTML = swatches ? swatches.map((s) => `<span style="--c:${s.c}"><i></i>${s.t ? `<em>${s.t}</em>` : ''}</span>`).join('') : '';
  const chip = $('info');
  chip.classList.remove('is-faded');
  chip.classList.remove('is-flash'); void chip.offsetWidth; chip.classList.add('is-flash');
  clearTimeout(infoTimer);
  if (!sticky) infoTimer = setTimeout(() => chip.classList.add('is-faded'), 5000);
}

// ---------- rails ----------
// One exact geometry model: bubble size b, label height, row pitch, one or two (honeycomb) columns.
const LABEL_H = 16;
const baseSize = () => clamp(Math.min(innerHeight * 0.115, innerWidth * 0.13), 46, 100);
const pitchOf = (b) => b + LABEL_H + 12;
// Vertical extent (top of first bubble .. bottom of last label) for n bubbles.
function extent(n, cols, b) {
  const p = pitchOf(b);
  const last = cols === 1 ? (n - 1) * p : Math.max((Math.ceil(n / 2) - 1) * p, (Math.floor(n / 2) - 1) * p + p / 2);
  return last + b + LABEL_H + 6;
}
function fits(n, cols, b, avail) { return extent(n, cols, b) <= avail; }
// Narrow portrait screens (phones) keep one column per side so the middle stays clear for your face.
const maxCols = () => (innerHeight > innerWidth && innerWidth < 700 ? 1 : 2);
function capacityFor(avail, b) {
  let n = 1;
  while (fits(n + 1, maxCols(), b, avail)) n++;
  return n;
}
const railWidths = { left: 0, right: 0 };

// Place bubbles centred at mid-height on one screen edge. Returns the size used.
function layoutRail(container, els, side, topReserve, bottomReserve, b) {
  const W = innerWidth, H = innerHeight, p = pitchOf(b);
  const edge = Math.max(10, Math.min(28, W * 0.02));
  const avail = H - topReserve - bottomReserve;
  const cols = fits(els.length, 1, b, avail) || maxCols() === 1 ? 1 : 2;
  const ext = extent(els.length, cols, b);
  const top = topReserve + Math.max(0, Math.min(H * 0.5 - ext / 2 - topReserve, avail - ext)); // centred, kept inside
  const outerX = side === 'left' ? edge + b / 2 : W - edge - b / 2;
  const colGap = b * 1.12 + 8;
  const innerX = side === 'left' ? outerX + colGap : outerX - colGap;
  els.forEach((el, i) => {
    const col = cols === 1 ? 0 : i % 2, row = cols === 1 ? i : Math.floor(i / 2);
    el.style.left = (col ? innerX : outerX) + 'px';
    el.style.top = (top + b / 2 + row * p + (col ? p / 2 : 0)) + 'px';
    el.style.setProperty('--i', i);
    el.style.setProperty('--b', b + 'px');
  });
  railWidths[side] = edge + b / 2 + (cols === 2 ? colGap : 0) + b * 0.62 + 10;
  document.documentElement.style.setProperty('--rail-w', Math.max(railWidths.left, railWidths.right) + 'px');
}

const reserves = () => {
  const portrait = innerHeight > innerWidth;
  const H = innerHeight;
  // keep clear of the brand (top-left) and out of the corners
  return { leftTop: portrait ? 100 : 92, rightTop: Math.max(14, H * 0.075), bottom: Math.max(10, H * 0.06) };
};

// Mode rail must show all five: shrink bubbles if needed rather than paginate.
function modeSize() {
  const r = reserves();
  let b = baseSize();
  while (b > 40 && !fits(MODES.length, maxCols(), b, innerHeight - r.leftTop - r.bottom)) b -= 2;
  return b;
}

let modeEls = [];
function buildModes() {
  const rail = $('modeRail');
  rail.innerHTML = '';
  modeEls = MODES.map((m) => {
    const b = bubble({ label: m.label, colors: m.colors, icon: m.icon });
    b.dataset.mode = m.id;
    b.addEventListener('click', () => {
      if (m.action) { resetAll(); ui.activeFilter = null; info('Reset', 'Back to the real colours of your world.'); setTimeout(renderOptions, 480); }
      else setMode(m.id);
    });
    rail.appendChild(b);
    return b;
  });
  layoutModes();
}
function layoutModes() {
  const r = reserves();
  layoutRail($('modeRail'), modeEls, 'left', r.leftTop, r.bottom, modeSize());
  modeEls.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === ui.mode));
}

export function setMode(id, quiet) {
  ui.mode = id; ui.page = 0; optKey = '';
  layoutModes();
  renderOptions();
  const m = MODES.find((x) => x.id === id);
  if (!quiet && m?.info) info(m.info[0], m.info[1], id === 'light' ? lightSwatches() : id === 'harmony' ? harmonySwatches() : null);
}

// ---------- options per mode ----------
function optionSpecs() {
  if (ui.mode === 'filters') {
    return [
      { label: 'Original', colors: ['#9aa0b5', '#e6e8f0'], icon: '◎', active: ui.activeFilter === null && isDefault(), run: () => { resetAll(); ui.activeFilter = null; info('Original', 'The real colours of your world.'); } },
      ...FILTERS.map((f) => ({ label: f.label, colors: f.color, active: ui.activeFilter === f.id, run: () => { applyFilter(f.id); ui.activeFilter = f.id; info(f.label, f.desc); } })),
    ];
  }
  if (ui.mode === 'light') {
    const L = (k, name, c) => ({
      label: `${name} ${target(k) > 127 ? 'on' : 'off'}`, colors: target(k) > 127 ? [c, '#ffffff'] : ['#222', '#444'], icon: target(k) > 127 ? '●' : '○', active: target(k) > 127,
      run: () => { tweenTo({ [k]: target(k) > 127 ? 0 : 255, tint: 1 }, 300); setTimeout(() => info('Light Mixer', mixName(state.r, state.g, state.b), lightSwatches()), 320); },
    });
    return [
      L('r', 'Red', '#ff2a4a'), L('g', 'Green', '#2aff7a'), L('b', 'Blue', '#2a7bff'),
      { label: 'White light', colors: ['#fff', '#ffe9f4', '#e3fbff'], icon: '✺', run: () => { tweenTo({ r: 255, g: 255, b: 255 }, 300); setTimeout(() => info('White light', 'Red + green + blue together make white.', lightSwatches()), 320); } },
    ];
  }
  if (ui.mode === 'harmony') {
    return [
      ...HUES.map(([h, n]) => ({
        label: n, colors: [toHex(hslToRgb(h, 0.95, 0.6)), toHex(hslToRgb(h, 0.9, 0.42))], active: state.paletteAmount > 0 && state.baseHue === h,
        run: () => { set({ baseHue: h }); tweenTo({ paletteAmount: 90, saturation: Math.max(state.saturation, 110) }); info(`${n} · ${SCHEMES[state.scheme].label}`, SCHEME_TEXT[state.scheme], harmonySwatches()); },
      })),
      { label: SCHEMES[state.scheme].label.replace('-Complementary', '-Comp.'), colors: harmonyHues(state.baseHue, state.scheme).map((h) => toHex(hueSwatch(h))), icon: '⟲',
        run: () => { const i = SCHEME_ORDER.indexOf(state.scheme); set({ scheme: SCHEME_ORDER[(i + 1) % SCHEME_ORDER.length] }); if (!state.paletteAmount) tweenTo({ paletteAmount: 90 }); info(SCHEMES[state.scheme].label, SCHEME_TEXT[state.scheme], harmonySwatches()); } },
      { label: 'Paint off', colors: ['#555', '#999'], icon: '✕', run: () => { tweenTo({ paletteAmount: 0 }); info('Paint off', 'Harmony painting switched off.'); } },
    ];
  }
  if (ui.mode === 'adjust') {
    return ADJUST.map((a) => ({
      label: a.label, colors: a.colors, icon: a.icon,
      run: () => {
        let v;
        const cur = target(a.key);
        if (a.toggle !== undefined) v = cur > 0 ? 0 : a.toggle;
        else if (a.wrap) { v = Math.round(cur) + a.step; if (v > 180) v -= 360; }
        else v = clamp(Math.round(cur) + a.step, a.min, a.max);
        tweenTo({ [a.key]: v }, 300);
        ui.activeFilter = null;
        const range = a.toggle !== undefined ? [0, 100] : a.wrap ? [-180, 180] : [a.min, a.max];
        info(`${KEY_NAMES[a.key]}: ${a.key === 'temperature' ? (v > 0 ? 'warm +' + v : v < 0 ? 'cool ' + v : 'neutral') : v + a.unit}`,
          a.key === 'hue' ? `Every colour moved ${v}° around the colour wheel.` : `Default is ${DEFAULTS[a.key]}${a.unit}.`,
          [{ c: `linear-gradient(90deg, var(--good) ${((v - range[0]) / (range[1] - range[0])) * 100}%, rgba(255,255,255,.15) 0)`, bar: true }]);
      },
    }));
  }
  return [];
}
const isDefault = () => ['saturation', 'brightness', 'contrast', 'hue', 'temperature', 'grayscale', 'invert', 'paletteAmount'].every((k) => Math.abs(state[k] - DEFAULTS[k]) < 0.5) && state.r === 255 && state.g === 255 && state.b === 255;

function lightSwatches() {
  const { r, g, b } = state, R = Math.round(r), G = Math.round(g), B = Math.round(b);
  return [{ c: `rgb(${R},0,0)`, t: 'R' }, { c: `rgb(0,${G},0)`, t: 'G' }, { c: `rgb(0,0,${B})`, t: 'B' }, { c: `rgb(${R},${G},${B})`, t: toHex([R, G, B]) }];
}
function harmonySwatches() {
  return harmonyHues(state.baseHue, state.scheme).map((h) => { const hex = toHex(hueSwatch(h)); return { c: hex, t: hex }; });
}

let optEls = [], optKey = '';
export function renderOptions() {
  const rail = $('optRail');
  const r = reserves();
  const specs = optionSpecs();
  const bsz = baseSize();
  const cap = capacityFor(innerHeight - r.rightTop - r.bottom, bsz);
  let shown = specs;
  if (specs.length > cap) {
    const per = Math.max(1, cap - 1);
    const pages = Math.ceil(specs.length / per);
    ui.page %= pages;
    shown = specs.slice(ui.page * per, ui.page * per + per);
    shown.push({ label: `More ${ui.page + 1}/${pages}`, colors: ['#ffffff', '#c9c4ff'], icon: '›', more: true, run: () => { ui.page = (ui.page + 1) % pages; renderOptions(); } });
  }
  // Same mode, page and count: update bubbles in place (no flicker, no re-arming under a hand).
  const key = `${ui.mode}|${ui.page}|${shown.length}|${innerWidth}x${innerHeight}`;
  if (key === optKey && optEls.length === shown.length) {
    shown.forEach((s, i) => updateBubble(optEls[i], s));
    return;
  }
  optKey = key;
  rail.innerHTML = '';
  optEls = shown.map((s) => {
    const b = bubble({ label: s.label, colors: s.colors, icon: s.icon });
    b._spec = s;
    b.classList.toggle('is-active', !!s.active);
    if (s.more) b.classList.add('is-more');
    b.addEventListener('click', () => { b._spec.run(); if (!b._spec.more) setTimeout(renderOptions, 340); });
    rail.appendChild(b);
    return b;
  });
  rail.dataset.mode = ui.mode;
  layoutRail(rail, optEls, 'right', r.rightTop, r.bottom, bsz);
}
function updateBubble(b, s) {
  b._spec = s;
  b.classList.toggle('is-active', !!s.active);
  if (b.querySelector('.bubble-label').textContent !== s.label) {
    b.querySelector('.bubble-label').textContent = s.label;
    b.setAttribute('aria-label', s.label);
  }
  b.querySelector('.bubble-icon').textContent = s.icon || '';
  const c = s.colors.length === 1 ? [s.colors[0], s.colors[0]] : s.colors;
  b.style.setProperty('--fill', c.length > 2 ? `conic-gradient(from 210deg, ${c.join(', ')}, ${c[0]})` : `linear-gradient(140deg, ${c.join(', ')})`);
  b.style.setProperty('--glow', c[0]);
  b.dataset.colors = c.join(',');
}

export function setHidden(h) {
  ui.hidden = h;
  document.body.classList.toggle('ui-hidden', h);
  $('showBubble').hidden = !h;
  for (const id of ['modeRail', 'optRail']) $(id).setAttribute('aria-hidden', h);
}

export function initUI({ fx, onGuide, onSound, onCamera, onFullscreen }) {
  fxRef = fx;
  buildModes();
  setMode('filters', true);
  $('guideBtn').addEventListener('click', onGuide);
  $('soundBtn').addEventListener('click', onSound);
  $('camBtn').addEventListener('click', onCamera);
  $('fsBtn').addEventListener('click', onFullscreen);
  $('hideBtn').addEventListener('click', () => setHidden(true));
  const show = bubble({ label: 'Show', colors: ['#ffffff', '#c9c4ff', '#3ef2ff'], icon: '👁', small: true, title: 'Show the bubbles' });
  show.id = 'showBubble'; show.hidden = true;
  show.addEventListener('click', () => setHidden(false));
  $('hud').after(show);
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { optKey = ''; layoutModes(); renderOptions(); }, 120); });
}
