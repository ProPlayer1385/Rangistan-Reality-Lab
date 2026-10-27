// Immersive layer drawn over the camera: glowing rainbow fingertips with trails,
// bubble-pop particles and colour ripples, plus a tiny synthesized "pop" sound.

const TIP_IDS = [4, 8, 12, 16, 20];
const TIP_COLORS = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3dffa0', '#4d9dff']; // thumb..little finger
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export function createFx(canvas, mapper) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let hands = [];                 // latest landmarks in screen px
  const shown = new Map();        // eased positions for drawing only
  const trails = new Map();
  const particles = [];
  const ripples = [];
  let audio = null, soundOn = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  return {
    setHands(raw) {
      hands = raw.map((h) => h.landmarks.map((p) => mapper.toScreen(p.x, p.y)));
      if (!hands.length) { shown.clear(); trails.clear(); }
    },
    burst(x, y, colors) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, v = 2.5 + Math.random() * 5;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 1, r: 3 + Math.random() * 5, c: colors[i % colors.length] });
      }
      ripples.push({ x, y, t: 0, c: colors[0] });
    },
    setSound(on) { soundOn = on; },
    unlockAudio() {
      try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch (_) { audio = null; }
    },
    pop(pitch = 1) {
      if (!soundOn || !audio) return;
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(420 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(980 * pitch, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 0.2);
    },
    draw(skeleton = true) {
      resize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      hands.forEach((pts, hi) => {
        // ease the drawn hand toward the newest landmarks for a fluid look
        const key = 'h' + hi;
        const prev = shown.get(key);
        const cur = prev && prev.length === pts.length ? prev.map((p, i) => ({ x: p.x + (pts[i].x - p.x) * 0.55, y: p.y + (pts[i].y - p.y) * 0.55 })) : pts.map((p) => ({ ...p }));
        shown.set(key, cur);
        if (skeleton) {
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.28)';
          ctx.beginPath();
          for (const [a, b] of BONES) { ctx.moveTo(cur[a].x, cur[a].y); ctx.lineTo(cur[b].x, cur[b].y); }
          ctx.stroke();
        }
        TIP_IDS.forEach((id, k) => {
          const p = cur[id], tk = key + id;
          const tr = trails.get(tk) || [];
          tr.push({ x: p.x, y: p.y });
          if (tr.length > 10) tr.shift();
          trails.set(tk, tr);
          ctx.lineCap = 'round';
          for (let i = 1; i < tr.length; i++) {
            ctx.strokeStyle = TIP_COLORS[k];
            ctx.globalAlpha = (i / tr.length) * 0.5;
            ctx.lineWidth = 2 + (i / tr.length) * 6;
            ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22);
          g.addColorStop(0, '#fff'); g.addColorStop(0.25, TIP_COLORS[k]); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.fill();
        });
      });

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]; r.t += 0.035;
        if (r.t >= 1) { ripples.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - r.t;
        ctx.strokeStyle = r.c; ctx.lineWidth = 6 * (1 - r.t) + 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, 30 + r.t * 220, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.98; p.life -= 0.022;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
