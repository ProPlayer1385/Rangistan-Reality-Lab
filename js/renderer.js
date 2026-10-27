// Full-viewport camera renderer.
// The whole camera frame (face, hair, clothes, walls, background) is processed per pixel in a
// WebGL fragment shader. The image is mirrored and "cover"-fitted: it fills the viewport edge to
// edge without distortion, cropping the overflow evenly on both sides. Geometry comes from
// mapping.js so the picture and the hand cursors can never disagree.

import { harmonyHues, hueSwatch } from './color.js';
import { coverGeometry } from './mapping.js';

const VERT = `
attribute vec2 aPos;
varying vec2 vPos;
void main() {
  vPos = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vPos;
uniform sampler2D uTex;
uniform vec2  uScale;     // fraction of the video visible on each axis (cover fit)
uniform float uSat, uBri, uCon, uTemp, uGray, uInv, uPalAmt, uSplit, uPalN, uMirror;
uniform vec2  uHue;       // cos, sin of hue rotation
uniform vec3  uMix;       // RGB light mixer gains
uniform vec3  uPal[4];    // harmony palette
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 hueRotate(vec3 c, float co, float si) {
  // Same matrix the CSS hue-rotate() filter uses (luminance preserving).
  vec3 r = vec3(0.213 + co*0.787 - si*0.213, 0.715 - co*0.715 - si*0.715, 0.072 - co*0.072 + si*0.928);
  vec3 g = vec3(0.213 - co*0.213 + si*0.143, 0.715 + co*0.285 + si*0.140, 0.072 - co*0.072 - si*0.283);
  vec3 b = vec3(0.213 - co*0.213 - si*0.787, 0.715 - co*0.715 + si*0.715, 0.072 + co*0.928 + si*0.072);
  return vec3(dot(r, c), dot(g, c), dot(b, c));
}

void main() {
  vec2 s = vec2(vPos.x, 1.0 - vPos.y);          // screen coords, origin top-left
  vec2 uv = (s - 0.5) * uScale + 0.5;          // cover fit
  uv.x = mix(uv.x, 1.0 - uv.x, uMirror);       // mirror (front camera)
  vec3 src = texture2D(uTex, uv).rgb;
  if (s.x < uSplit) { gl_FragColor = vec4(src, 1.0); return; }   // compare mode: left = original

  vec3 c = src * uMix;                                        // additive light mixer
  c = hueRotate(c, uHue.x, uHue.y);                           // hue shift
  c = mix(vec3(dot(c, LUMA)), c, uSat);                       // saturation
  c = mix(c, vec3(dot(c, LUMA)), uGray);                      // grayscale
  c *= vec3(1.0 + 0.30*uTemp, 1.0 + 0.05*uTemp, 1.0 - 0.30*uTemp); // warm / cool
  c *= uBri;                                                  // brightness
  c = (c - 0.5) * uCon + 0.5;                                 // contrast
  c = clamp(c, 0.0, 1.0);

  if (uPalAmt > 0.0) {                                        // paint with harmony palette
    float l = dot(c, LUMA);
    float x = l * (uPalN - 1.0);
    vec3 p = uPal[0];
    for (int i = 0; i < 3; i++) {
      if (float(i) < uPalN - 1.0) p = mix(p, uPal[i + 1], clamp(x - float(i), 0.0, 1.0));
    }
    p *= l / max(dot(p, LUMA), 0.05);                         // keep the scene's light and shade
    c = mix(c, clamp(p, 0.0, 1.0), uPalAmt);
  }

  c = mix(c, 1.0 - c, uInv);                                  // inversion
  gl_FragColor = vec4(c, 1.0);
}`;

export function createRenderer(canvas, video, { isMirrored = () => true } = {}) {
  const opts = { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  const r = gl ? createGL(gl, canvas, video, isMirrored) : create2D(canvas, video, isMirrored);
  r.mode = gl ? 'webgl' : 'canvas2d';
  return r;
}

const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function baseApi(canvas) {
  const api = {
    // Adaptive resolution: 1 = full device pixels (capped), lowered automatically when frames are slow.
    scale: 1,
    resize() {
      const dprCap = IS_MOBILE ? 1.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap) * api.scale;
      const r = canvas.getBoundingClientRect();
      const w = Math.max(2, Math.round((r.width || innerWidth) * dpr)), h = Math.max(2, Math.round((r.height || innerHeight) * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    },
  };
  return api;
}

function createGL(gl, canvas, video, isMirrored) {
  const api = baseApi(canvas);
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Shader link error: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const U = {};
  for (const n of ['uTex', 'uScale', 'uSat', 'uBri', 'uCon', 'uTemp', 'uGray', 'uInv', 'uPalAmt', 'uSplit', 'uPalN', 'uHue', 'uMix', 'uPal', 'uMirror'])
    U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uTex, 0);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; canvas.style.opacity = '0'; });

  api.render = (s, extra = {}) => {
    if (lost || video.readyState < 2 || !video.videoWidth) return false;
    api.resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const g = coverGeometry(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    gl.uniform2f(U.uScale, canvas.width / g.dw, canvas.height / g.dh);
    gl.uniform1f(U.uMirror, isMirrored() ? 1 : 0);
    gl.uniform1f(U.uSat, s.saturation / 100);
    gl.uniform1f(U.uBri, s.brightness / 100);
    gl.uniform1f(U.uCon, s.contrast / 100);
    gl.uniform1f(U.uTemp, s.temperature / 100);
    gl.uniform1f(U.uGray, s.grayscale / 100);
    gl.uniform1f(U.uInv, s.invert);
    const a = (s.hue * Math.PI) / 180;
    gl.uniform2f(U.uHue, Math.cos(a), Math.sin(a));
    if (s.tint) gl.uniform3f(U.uMix, s.r / 255, s.g / 255, s.b / 255);
    else gl.uniform3f(U.uMix, 1, 1, 1);
    const hues = harmonyHues(s.baseHue, s.scheme);
    const pal = new Float32Array(12);
    hues.forEach((h, i) => { const c = hueSwatch(h); pal.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3); });
    gl.uniform3fv(U.uPal, pal);
    gl.uniform1f(U.uPalN, hues.length);
    gl.uniform1f(U.uPalAmt, s.paletteAmount / 100);
    gl.uniform1f(U.uSplit, extra.split ?? -1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  };
  return api;
}

// Fallback for machines without WebGL: Canvas 2D filters (covers grading, grayscale, invert, tint).
function create2D(canvas, video, isMirrored) {
  const api = baseApi(canvas);
  const ctx = canvas.getContext('2d');
  api.render = (s, extra = {}) => {
    if (video.readyState < 2 || !video.videoWidth) return false;
    api.resize();
    const W = canvas.width, H = canvas.height;
    const g = coverGeometry(video.videoWidth, video.videoHeight, W, H);
    const draw = () => {
      ctx.save();
      if (isMirrored()) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, g.ox, g.oy, g.dw, g.dh);
      ctx.restore();
    };
    ctx.filter = [
      `saturate(${s.saturation}%)`, `brightness(${s.brightness}%)`, `contrast(${s.contrast}%)`,
      `hue-rotate(${s.hue}deg)`, `grayscale(${s.grayscale}%)`, `invert(${s.invert * 100}%)`,
    ].join(' ');
    draw();
    ctx.filter = 'none';
    if (s.tint && (s.r < 255 || s.g < 255 || s.b < 255)) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (s.temperature) {
      const t = s.temperature / 100;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = t > 0 ? `rgba(255,140,40,${t * 0.6})` : `rgba(60,140,255,${-t * 0.6})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (extra.split > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * extra.split, H); ctx.clip(); draw(); ctx.restore();
    }
    return true;
  };
  return api;
}
