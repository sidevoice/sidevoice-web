// The stage's backdrops: ported from the frozen design reference (reference/2026-11-04/src/backdrops.js, SHA-256
// 642afa9e…), its code, constants and palettes unchanged, line for line, so it diffs against the reference. Product
// edit, marked "product:": the labels are English (the reference kept the old catalogue's Spanish ones; no label is
// shown to people). backdrops.d.ts declares what TypeScript reads of it; stage-paint.ts draws it on the stage. What
// follows is the reference's own header.
//
// The stage's backdrops: the product's catalogue (sidevoice-web, origin/main,
// apps/web/src/features/avatar/engine/backdrop.ts) redrawn on a canvas and adapted to the toon creatures.
//
// What is kept from the product: the ids and their order, the geometry (an 800 x 440 frame; horizon near y 300; a
// creature's feet on y ~357), the light and dark palettes, the seeded pick (a quarter keep the tone tint, the rest roll
// any other one), the soft vignette, and the rule that scenes sit behind the cast: no ink, muted, lower in contrast.
// What is adapted to the toon line: every ground shape (hills, ranges, the sea, the sand, the street, the floors) is
// a flat fill with a lit band along its top edge (the cel band the creatures have) instead of a gradient; round
// things (planet, moon) take a flat lit side and a flat shadow side. Gradients stay where the product's are light
// itself: the sky, glows, mist, the forest's and the sea's rays, the aurora. Static: the product's gentle CSS motion
// (drift, twinkle, sway) is not reproduced.
//
// Frame: scaled to cover the tile (the product's "xMidYMax slice"), centred, but never cropped inside its middle 420
// units (the product: "what matters stays in the middle ~420"): on a portrait tile (the phone) the middle 420 span the
// width, the scene keeps the scale it has next to the creature on the desktop, and the sky and the ground carry on above
// and below it. Its ground line (y 357) sits on the creature's feet when the host passes them, else on the product's
// place (the frame pinned to the tile's bottom). Every fill reaches the tile's edges. Plain kinds fill the tile.

const GROUND = 357;
let BOT = 460; // where shapes close at the bottom: below the frame's visible bottom, wherever the frame sits
let VIS = { x0: -40, x1: 840, y0: 0, y1: 440 }; // the frame's visible region, in frame units

// ---------- small kit ----------
const n = (v) => Math.round(v * 100) / 100;
function rngOf(name) {
  let h = 2166136261; for (const ch of name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + next() * (hi - lo), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p };
}
// colour mixing in Oklab, as the product's (CSS color-mix(in oklab, ...)), so the tone tint matches it
function mix(a, b, t) {
  const lab = (hex) => {
    const h = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '888', full = h.length === 3 ? [...h].map((ch) => ch + ch).join('') : h;
    const [r, g, bl] = [0, 2, 4].map((i) => { const v = parseInt(full.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const A = lab(a), B = lab(b), [L, M, S] = [0, 1, 2].map((i) => A[i] * t + B[i] * (1 - t));
  const l = (L + 0.3963377774 * M + 0.2158037573 * S) ** 3, m = (L - 0.1055613458 * M - 0.0638541728 * S) ** 3, s = (L - 0.0894841775 * M - 1.291485548 * S) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map((v) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'); }).join('');
}

// ---------- shapes: the product's path builders, as SVG path data (Path2D reads it), closed at BOT ----------
const range = (pts) => `M${pts[0][0]} ${BOT}${pts.map(([x, y]) => `L${x} ${y}`).join('')}L${pts[pts.length - 1][0]} ${BOT}Z`;
function caps(pts, idx, t = 0.3) {
  return idx.map((i) => {
    const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1];
    const ax = px + (lx - px) * t, ay = py + (ly - py) * t, bx = px + (rx - px) * t, by = py + (ry - py) * t, my = Math.max(ay, by);
    return `M${n(ax)} ${n(ay)}L${px} ${py}L${n(bx)} ${n(by)}L${n((bx * 3 + ax) / 4)} ${n(my + 5)}L${n((ax + bx) / 2)} ${n(my - 2)}L${n((ax * 3 + bx) / 4)} ${n(my + 6)}Z`;
  }).join('');
}
function ridge(ys) {
  const step = 880 / (ys.length - 1), x = (i) => n(-40 + i * step);
  let d = `M-40 ${BOT}L-40 ${ys[0]}`;
  for (let i = 0; i < ys.length - 1; i += 1) d += `Q${x(i)} ${ys[i]} ${n((x(i) + x(i + 1)) / 2)} ${n((ys[i] + ys[i + 1]) / 2)}`;
  return `${d}L840 ${ys[ys.length - 1]}L840 ${BOT}Z`;
}
const bump = (ax, ay, bx, by) => { const r = n(Math.hypot(bx - ax, by - ay) / 2); return `A${r} ${r} 0 0 1 ${n(bx)} ${n(by)}`; };
function cloud(x, y, w) {
  const pts = [[x - w / 2, y], [x - w * 0.26, y - w * 0.2], [x + w * 0.1, y - w * 0.3], [x + w * 0.34, y - w * 0.14], [x + w / 2, y]];
  let d = `M${n(pts[0][0])} ${n(y)}`;
  for (let i = 1; i < pts.length; i += 1) d += bump(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return `${d}Z`;
}
function scallops(r, y, w, jitter = 8) {
  let x = -40, py = y, d = `M-40 ${BOT}L-40 ${y}`;
  while (x < 840) { const nx = x + w * r.range(0.7, 1.3), ny = y + r.range(-jitter, jitter); d += bump(x, py, nx, ny); x = nx; py = ny; }
  return `${d}L${n(x)} ${BOT}Z`;
}
function treeline(r, base, hMin, hMax, step) {
  let d = `M-40 ${base}H840V${BOT}H-40Z`;
  for (let x = -40; x < 840; x += step * r.range(0.7, 1.3)) { const h = r.range(hMin, hMax), w = h * 0.26; d += `M${n(x - w)} ${base + 2}L${n(x)} ${n(base - h)}L${n(x + w)} ${base + 2}Z`; }
  return d;
}
function pine(x, base, h) {
  const w = h * 0.42, p = (dx, dy) => `${n(x + w * dx)} ${n(base - h * dy)}`;
  return `M${p(0, 1)}L${p(0.36, 0.64)}L${p(0.2, 0.64)}L${p(0.5, 0.3)}L${p(0.3, 0.3)}L${p(0.6, 0)}L${p(-0.6, 0)}L${p(-0.3, 0.3)}L${p(-0.5, 0.3)}L${p(-0.2, 0.64)}L${p(-0.36, 0.64)}Z`;
}
const sparkle = (x, y, s) => `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
const circle = (x, y, r) => `M${x + r} ${y}A${r} ${r} 0 1 0 ${x - r} ${y}A${r} ${r} 0 1 0 ${x + r} ${y}Z`;
const ellipse = (x, y, rx, ry) => `M${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}Z`;
// light beams from above: [top left x, top right x, top y, bottom left x, bottom right x, bottom y], their edges carried
// up past the visible top (the frame's top can be inside the tile)
const beams = (list) => list.map(([a, b, y0, c, d, y1]) => { const Y = Math.min(y0, VIS.y0 - 10), k = (Y - y0) / (y1 - y0); return `M${n(a + (c - a) * k)} ${n(Y)}L${n(b + (d - b) * k)} ${n(Y)}L${d} ${y1}L${c} ${y1}Z`; }).join('');
// a band across the whole visible width (the product's 800-wide rects), from y0 down (to the bottom by default)
const band = (y0, y1 = BOT) => `M${n(VIS.x0 - 5)} ${y0}H${n(VIS.x1 + 5)}V${y1}H${n(VIS.x0 - 5)}Z`;

// ---------- paint ----------
function fill(g, d, col, a = 1) { g.globalAlpha = a; g.fillStyle = col; g.fill(new Path2D(d)); g.globalAlpha = 1; }
function stroke(g, d, col, w, a = 1, dash = null) { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.lineCap = dash ? 'butt' : 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash); g.stroke(new Path2D(d)); g.setLineDash([]); g.globalAlpha = 1; }
// the toon ground: a flat fill and a lit band along its top edge (the shape again, k units lower, in the base); with
// k < 0, a band of the second colour along the bottom edge instead (a cloud's shade)
function toon(g, d, base, c, lit = null, k = 7) {
  const p = new Path2D(d);
  g.fillStyle = lit || (c.dark ? mix('#cfc8ee', base, 0.12) : mix('#ffffff', base, 0.24)); g.fill(p);
  g.save(); g.clip(p); g.translate(0, k); g.fillStyle = base; g.fill(p); g.restore();
}
// a product gradient pair [top, bottom] as a toon ground: its top colour lit, its body the pair's middle
const ground = (g, d, [top, bottom], c) => toon(g, d, mix(top, bottom, 0.5), c, c.dark ? mix('#cfc8ee', top, 0.12) : mix('#ffffff', top, 0.24));
// a round thing (planet, moon) in two flat tones: the shadow side, then the lit side from the upper left
function ball(g, x, y, r, lit, shade) { fill(g, circle(x, y, r), shade); g.save(); g.clip(new Path2D(circle(x, y, r))); fill(g, circle(x - r * 0.22, y - r * 0.22, r * 0.96), lit); g.restore(); }
function lin(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [o, col, a] of stops) gr.addColorStop(o, a == null || a === 1 ? col : col + Math.round(a * 255).toString(16).padStart(2, '0')); return gr; }
const alpha = (col, a) => col + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
// a soft glow: a colour fading to nothing at the edge of an ellipse
function glow(g, x, y, rx, ry, col, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, alpha(col, a)); gr.addColorStop(1, alpha(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
}
function sky(g, top, bottom, mid) { g.fillStyle = lin(g, 0, 440, mid ? [[0, top], [0.55, mid], [1, bottom]] : [[0, top], [1, bottom]]); g.fill(new Path2D(band(VIS.y0 - 10))); }
function mist(g, col, a, y0, y1) { g.fillStyle = lin(g, y0, y1, [[0, col, 0], [0.5, col, a], [1, col, 0]]); g.fill(new Path2D(band(y0, y1))); }
function stars(g, r, count, [x0, y0, x1, y1], col, maxR = 1.7, sparkles = 0) {
  g.fillStyle = col;
  for (let i = 0; i < count; i += 1) { g.globalAlpha = r.range(0.45, 1); g.beginPath(); g.arc(r.range(x0, x1), r.range(y0, y1), r.range(0.6, maxR), 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1; for (let i = 0; i < sparkles; i += 1) g.fill(new Path2D(sparkle(n(r.range(x0, x1)), n(r.range(y0, y1)), n(r.range(4, 6.5)))));
}

// ---------- the catalogue (the product's order: the seeded pick depends on it) ----------
const TILE = { dark: '#24232d', light: '#fbf8f1' };
export const BACKDROPS = {
  // today's tile tint, unchanged: radial-gradient(120% 90% at 50% 75%, color-mix(tone 26%, tile), tile)
  tone: { label: 'creature tone' /* product: */, kind: 'plain', flat: true, box(g, W, H, c) {
    const tile = c.dark ? TILE.dark : TILE.light;
    g.save(); g.translate(W * 0.5, H * 0.75); g.scale(1.2 * W, 0.9 * H);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, mix(c.tone, tile, 0.26)); gr.addColorStop(1, tile);
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  } },
  plain: { label: 'plain' /* product: */, kind: 'plain', box(g, W, H, c) { g.fillStyle = c.dark ? '#2a2933' : '#f1ede4'; g.fillRect(0, 0, W, H); } },
  sunset: { label: 'sunset gradient' /* product: */, kind: 'plain', box(g, W, H, c) {
    const s = c.dark ? [[0, '#262340'], [0.55, '#3f2b48'], [1, '#55363f']] : [[0, '#dcd3ee'], [0.5, '#f5d3d8'], [1, '#fbe2cc']];
    const gr = g.createLinearGradient(0, 0, 0.35 * W, H); s.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } },
  lagoon: { label: 'lagoon gradient' /* product: */, kind: 'plain', box(g, W, H, c) {
    const s = c.dark ? [[0, '#1b2546'], [1, '#173a40']] : [[0, '#d3e3f5'], [1, '#d3f0e6']];
    const gr = g.createLinearGradient(0, 0, 0.35 * W, H); s.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } },

  mountains: { label: 'mountains' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#1b2140', '#3d3459'], far: '#363d65', farSnow: '#535b88', mid: '#2a3154', midSnow: '#434b76', near: ['#242c47', '#1b2135'], haze: '#3d3459', cloud: '#4b4c76', sun: '#e7a58a' }
      : { sky: ['#b9d0ea', '#f3e9de'], far: '#b5c1dc', farSnow: '#e4e9f3', mid: '#9babc8', midSnow: '#d5dcea', near: ['#a7c1a4', '#8eab8b'], haze: '#f3e9de', cloud: '#ffffff', sun: '#fff1cf' };
    const far = [[-40, 236], [70, 196], [150, 228], [250, 160], [340, 222], [420, 184], [510, 230], [600, 168], [690, 214], [770, 186], [840, 214]];
    const mid = [[-40, 268], [60, 240], [160, 276], [240, 222], [330, 270], [400, 250], [470, 274], [560, 226], [650, 270], [740, 238], [840, 262]];
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) { glow(g, 400, 250, 420, 110, p.sun, 0.32); stars(g, rngOf('mountains'), 16, [190, 20, 610, 150], '#e9e6f5', 1.4); }
    else { glow(g, 560, 122, 110, 110, p.sun, 0.9); fill(g, circle(560, 122, 20), '#fffaf0', 0.85); }
    fill(g, cloud(268, 128, 104) + cloud(520, 78, 70), p.cloud, c.dark ? 0.5 : 0.75);
    toon(g, range(far), p.far, c); fill(g, caps(far, [3, 7, 5], 0.32), p.farSnow);
    mist(g, p.haze, 0.7, 196, 286);
    toon(g, range(mid), p.mid, c); fill(g, caps(mid, [3, 7], 0.28), p.midSnow);
    mist(g, p.haze, 0.5, 250, 330);
    ground(g, ridge([322, 306, 314, 300, 296, 304, 318, 308, 296, 312]), p.near, c);
  } },

  beach: { label: 'beach' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#1e2848', '#4b4470'], sea: ['#2a4064', '#2f4a6a'], wave: '#7189b2', sand: ['#4a4459', '#3a3447'], foam: '#8a9cc0', light: '#e8e2cc', palm: '#2c2f4a', frond: '#2f3a4e', boat: '#5a5f86' }
      : { sky: ['#bde0ef', '#f8eddb'], sea: ['#97cbd3', '#b7ddda'], wave: '#e3f4f2', sand: ['#f2dfbf', '#e6cba0'], foam: '#ffffff', light: '#fff3d2', palm: '#c9a47c', frond: '#93bd98', boat: '#e9e4dc' };
    const sun = c.dark ? [296, 112, 22] : [300, 208, 26];
    const waves = (y) => `M-40 ${y}${Array.from({ length: 22 }, () => 'q10-5 20 0t20 0').join('')}`;
    const frond = (a, len) => {
      const x0 = 560, y0 = 174, ra = (a * Math.PI) / 180, ex = x0 + Math.cos(ra) * len, ey = y0 + Math.sin(ra) * len + len * 0.28;
      const px = -Math.sin(ra) * len * 0.16, py = Math.cos(ra) * len * 0.16, mx = (x0 + ex) / 2, my = (y0 + ey) / 2 - len * 0.12;
      return `M${x0} ${y0}Q${n(mx + px)} ${n(my + py)} ${n(ex)} ${n(ey)}Q${n(mx - px)} ${n(my - py)} ${x0} ${y0}Z`;
    };
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) stars(g, rngOf('beach'), 14, [190, 16, 610, 170], '#e9e6f5', 1.3); else fill(g, cloud(470, 110, 90), '#ffffff', 0.7);
    glow(g, sun[0], sun[1], sun[2] * 4.5, sun[2] * 4.5, p.light, c.dark ? 0.22 : 0.85); fill(g, circle(sun[0], sun[1], sun[2]), p.light, 0.8);
    ground(g, band(262), p.sea, c);
    stroke(g, `M${sun[0] - 22} 268h44M${sun[0] - 30} 280h60M${sun[0] - 18} 292h36`, p.light, 3, c.dark ? 0.35 : 0.6);
    fill(g, 'M236 258h40l-6 6h-28zM256 256V232l14 22z', p.boat, 0.8);
    stroke(g, waves(284) + waves(304), p.wave, 3, c.dark ? 0.6 : 0.5);
    fill(g, ridge([338, 330, 324, 330, 326, 322, 330, 336, 330]), p.foam, 0.45);
    ground(g, ridge([344, 336, 330, 336, 332, 328, 336, 342, 336]), p.sand, c);
    stroke(g, 'M618 372Q606 262 562 176', p.palm, 14); stroke(g, 'M618 372Q606 262 562 176', p.sand[1], 14, 0.55, [2, 16]);
    fill(g, [-170, -135, -95, -50, -12, 25].map((a) => frond(a, 70)).join(''), p.frond);
  } },

  city: { label: 'city' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#121933', '#2c2749'], far: '#232a48', near: '#1a203d', win: '#f1cc7c', winA: [0.34, 0.1], street: ['#1b2038', '#141a2e'] }
      : { sky: ['#cadcef', '#f5e9e1'], far: '#bcc7da', near: '#a6b4cb', win: '#dfe6f1', winA: [0.6, 0.28], street: ['#b2bbcc', '#a1aabd'] };
    const r = rngOf('city');
    const skyline = (top, wMin, wMax, gap) => {
      let d = '';
      for (let x = -30; x < 830;) {
        const w = r.range(wMin, wMax), t = r.range(top[0], top[1]);
        d += `M${n(x)} ${BOT}V${n(t)}h${n(w)}V${BOT}Z`;
        if (r.chance(0.25)) d += `M${n(x + w / 2 - 1.5)} ${n(t)}v-16h3v16Z`;
        x += w + gap;
      }
      return d;
    };
    const far = skyline([150, 225], 34, 70, 0), near = skyline([196, 282], 40, 76, 6), [a1, a2] = p.winA;
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) stars(g, rngOf('city-stars'), 12, [190, 16, 610, 130], '#e6e3f2', 1.2); else fill(g, cloud(290, 120, 96) + cloud(560, 86, 64), '#ffffff', 0.7);
    fill(g, far, p.far); fill(g, near, p.near);
    // the windows: the product's 28 x 34 pattern, in frame units
    const tile = document.createElement('canvas'); tile.width = 28; tile.height = 34; const t = tile.getContext('2d'); t.fillStyle = p.win;
    for (const [x, y, a] of [[5, 6, a1], [17, 6, a2], [5, 23, a2], [17, 23, a1 * 0.7]]) { t.globalAlpha = a; t.fillRect(x, y, 6, 9); }
    g.fillStyle = g.createPattern(tile, 'repeat'); g.fill(new Path2D(near));
    if (c.dark) { fill(g, 'M231 240h6v9h-6zM533 262h6v9h-6zM300 290h6v9h-6z', p.win); }
    ground(g, band(326), p.street, c);
    stroke(g, 'M-40 368H840', p.far, 3, 0.6, [26, 22]);
    if (c.dark) for (let i = 0; i < 8; i += 1) { const x = r.range(190, 610), y = r.range(210, 330), rr = r.range(8, 20), warm = r.chance(0.6); glow(g, x, y, rr, rr, warm ? '#f3c27a' : '#8fb2f0', warm ? 0.3 : 0.24); }
  } },

  space: { label: 'space' /* product: */, kind: 'scene', hang: 'float', scene(g, c) {
    const p = c.dark
      ? { sky: ['#0d1026', '#241b40'], neb1: '#7a5ac4', neb2: '#3f8fa8', star: '#f2efff', planet: ['#dcae86', '#9c6650'], ring: '#d8c1a2', moon: '#8f95c2', ground: ['#353f7a', '#232955'], atmo: '#6f8fe6', crater: '#1e2450' }
      : { sky: ['#6f70ae', '#cbb7dd'], neb1: '#f2b6d6', neb2: '#9fdbe2', star: '#ffffff', planet: ['#f6d2b0', '#d49d86'], ring: '#fff0dc', moon: '#e6e2f6', ground: ['#9497cb', '#7a7eb7'], atmo: '#eceeff', crater: '#6b70a8' };
    sky(g, p.sky[0], p.sky[1]);
    glow(g, 250, 150, 230, 130, p.neb1, c.dark ? 0.3 : 0.4); glow(g, 590, 250, 200, 120, p.neb2, c.dark ? 0.22 : 0.35);
    stars(g, rngOf('space'), 34, [170, 10, 630, 330], p.star, 1.8, 4);
    ball(g, 546, 120, 24, p.planet[0], p.planet[1]);
    g.save(); g.translate(546, 120); g.rotate((-16 * Math.PI) / 180); stroke(g, ellipse(0, 0, 42, 10), p.ring, 3.5, 0.65); g.restore();
    fill(g, circle(236, 206, 9), p.moon, 0.85);
    stroke(g, circle(400, 1190, 872), p.atmo, 16, 0.12); stroke(g, circle(400, 1190, 862), p.atmo, 8, 0.22);
    ground(g, circle(400, 1190, 856), p.ground, c);
    fill(g, ellipse(250, 372, 26, 6) + ellipse(560, 360, 18, 4.5) + ellipse(470, 408, 30, 7), p.crater, 0.35);
  } },

  forest: { label: 'forest' /* product: */, kind: 'scene', hang: 'nail', scene(g, c) {
    const p = c.dark
      ? { sky: ['#14292a', '#22403a'], far: '#203d38', mid: '#1a342f', near: '#132a25', ground: ['#1a342d', '#122620'], haze: '#1f3a35' }
      : { sky: ['#d3e5d5', '#f1f0dd'], far: '#b9cfb8', mid: '#9cb99e', near: '#86a88b', ground: ['#a8c59b', '#95b689'], haze: '#f1f0dd' };
    const r = rngOf('forest');
    sky(g, p.sky[0], p.sky[1]);
    if (!c.dark) { g.fillStyle = lin(g, -10, 330, [[0, '#ffffff', 0.45], [1, '#ffffff', 0]]); g.fill(new Path2D(beams([[560, 606, -10, 430, 470, 330], [630, 656, -10, 516, 540, 330], [500, 518, -10, 370, 390, 300]]))); }
    fill(g, treeline(r, 252, 40, 78, 26), p.far);
    mist(g, p.haze, 0.75, 212, 290);
    fill(g, treeline(r, 300, 60, 120, 44), p.mid);
    mist(g, p.haze, 0.55, 262, 330);
    ground(g, ridge([330, 318, 312, 316, 310, 314, 320, 312, 324]), p.ground, c);
    fill(g, pine(204, 352, 230) + pine(612, 356, 250), p.near);
    if (c.dark) for (let i = 0; i < 9; i += 1) glow(g, r.range(200, 600), r.range(200, 330), 7, 7, '#e6f39a', 0.9);
  } },

  // the poster smaller, pinned on the wall between the window and the shelf, above the wainscot (operator, T14b)
  room: { label: 'room with a window' /* product: */, kind: 'scene', poster: { cx: 404, top: 66, bottom: 226 }, scene(g, c) {
    const p = c.dark
      ? { wall: ['#3b3142', '#2f2836'], wains: ['#342b3a', '#2a2330'], rail: '#463a4c', floor: ['#3b2e2d', '#2c2322'], frame: '#5c4e60', sill: '#4a3e4e', glass: ['#1f2a54', '#3a3c6e'], curtain: '#5b4054', pic: '#2b3554', hill: '#46507a', shelf: '#56443e', rug: '#6b4a52', lamp: '#e8c590', leaf: '#4f6a58', books: ['#6e4a48', '#41546e', '#7a6340'] }
      : { wall: ['#f1e5d6', '#e8d6c2'], wains: ['#e4d0b7', '#d9c1a5'], rail: '#d3ba9d', floor: ['#cfac88', '#ba9572'], frame: '#fbf6ee', sill: '#e2d2bd', glass: ['#c4e0f0', '#ebf3f3'], curtain: '#e8bcae', pic: '#dbe8ee', hill: '#a9c4b0', shelf: '#c9a37d', rug: '#dca08c', lamp: '#f3d39b', leaf: '#93bb94', books: ['#d39a8b', '#93aecb', '#e2c38e'] };
    fill(g, band(VIS.y0 - 10), mix(p.wall[0], p.wall[1], 0.5));
    if (!c.dark) glow(g, 270, 250, 200, 160, '#fff6e2', 0.5);
    ground(g, band(262), p.wains, c); fill(g, band(258, 265), p.rail);
    ground(g, band(346), p.floor, c); fill(g, band(342, 348), p.rail);
    fill(g, ellipse(400, 394, 220, 24), p.rug, 0.45);
    g.save(); g.translate(6, 0);
    g.fillStyle = p.frame; g.beginPath(); g.roundRect(196, 78, 108, 150, 5); g.fill();
    g.fillStyle = lin(g, 88, 218, [[0, p.glass[0]], [1, p.glass[1]]]); g.fillRect(206, 88, 88, 130);
    g.save(); g.beginPath(); g.rect(206, 88, 88, 130); g.clip();
    if (c.dark) { fill(g, circle(272, 114, 11), '#efe9d2', 0.9); fill(g, circle(277, 110, 10), p.glass[0]); stars(g, rngOf('room'), 7, [210, 92, 290, 210], '#e9e6f5', 1.3); }
    else { fill(g, cloud(238, 128, 40) + cloud(276, 176, 28), '#ffffff', 0.85); fill(g, 'M206 218l30-26 22 16 18-12 18 14v8z', '#b7d3bd', 0.8); }
    g.restore();
    fill(g, 'M248 88h4v130h-4zM206 151h88v4h-88z', p.frame);
    g.fillStyle = p.sill; g.beginPath(); g.roundRect(188, 226, 124, 10, 3); g.roundRect(176, 64, 148, 6, 3); g.fill();
    fill(g, 'M182 70H208Q200 150 214 244H174Q188 150 182 70ZM318 70H292Q300 150 286 244H326Q312 150 318 70Z', p.curtain);
    g.restore();
    g.fillStyle = p.shelf; g.beginPath(); g.roundRect(510, 92, 74, 56, 3); g.fill(); g.fillStyle = p.pic; g.fillRect(517, 99, 60, 42);
    fill(g, 'M517 141L537 116 549 128 559 119 577 141Z', p.hill);
    if (c.dark) glow(g, 524, 186, 150, 150, '#f6c37a', 0.26);
    g.fillStyle = p.shelf; g.beginPath(); g.roundRect(494, 206, 124, 8, 2); g.fill();
    fill(g, 'M506 184l7-20h22l7 20z', p.lamp); stroke(g, 'M522 184v22M514 206h16', p.sill, 4);
    p.books.forEach((b, i) => { g.fillStyle = b; g.beginPath(); g.roundRect(548 + i * 11, 170 + (i % 2) * 6, 10, 36 - (i % 2) * 6, 1.5); g.fill(); });
    fill(g, 'M586 206l3-16h16l3 16z', p.rug);
    for (const [x, y, rx, ry, a] of [[590, 182, 6, 11, -25], [604, 180, 6, 12, 25], [597, 176, 5, 12, 0]]) { g.save(); g.translate(x, y); g.rotate((a * Math.PI) / 180); fill(g, ellipse(0, 0, rx, ry), p.leaf); g.restore(); }
  } },

  clouds: { label: 'clouds' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#272c58', '#6b5a8a'], cloud: ['#6b6a96', '#4f4f7b'], floor: ['#5f5e8b', '#45456e'], floor2: ['#706e9a', '#55557f'], sun: '#f0b9a0' }
      : { sky: ['#a7cbee', '#eef4fa'], cloud: ['#ffffff', '#e2eaf6'], floor: ['#f4f7fc', '#d9e3f1'], floor2: ['#ffffff', '#e6edf7'], sun: '#fff3cf' };
    const r = rngOf('clouds');
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) stars(g, rngOf('clouds-stars'), 14, [190, 12, 610, 120], '#ecebf8', 1.3);
    if (c.dark) glow(g, 400, 300, 260, 260, p.sun, 0.35); else glow(g, 560, 112, 120, 120, p.sun, 0.9);
    // the clouds in two flat tones, the shade along their flat base (the product's opacity folded into the colours)
    const ca = c.dark ? 0.7 : 0.9;
    for (const [x, y, w] of [[250, 112, 110], [560, 184, 130], [330, 232, 80]]) toon(g, cloud(x, y, w), mix(p.cloud[0], p.sky[1], ca), c, mix(p.cloud[1], p.sky[1], ca), -w * 0.07);
    ground(g, scallops(r, 302, 70, 10), p.floor, c);
    ground(g, scallops(r, 346, 90, 8), p.floor2, c);
  } },

  night: { label: 'moonlit night' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#0d1230', '#232b57'], moon: ['#e6e0c6', '#bfb798'], crater: '#b3ab8c', far: '#1c2550', near: ['#171f42', '#111733'], tree: '#121a38', win: '#f2c97c', star: '#eeebfa' }
      : { sky: ['#5a69a6', '#aab3d9'], moon: ['#f4f0e2', '#d9d3bd'], crater: '#cbc3a8', far: '#7684b8', near: ['#6878ac', '#5a689c'], tree: '#56649a', win: '#f6d48e', star: '#ffffff' };
    const r = rngOf('night');
    sky(g, p.sky[0], p.sky[1]);
    stars(g, r, 26, [180, 10, 620, 250], p.star, 1.6, 3);
    glow(g, 566, 108, 120, 120, p.moon[0], c.dark ? 0.2 : 0.35);
    ball(g, 566, 108, 27, p.moon[0], p.moon[1]);
    fill(g, circle(557, 101, 4.5) + circle(574, 117, 3.2) + circle(571, 97, 2.3), p.crater, 0.7);
    toon(g, ridge([300, 270, 258, 276, 264, 250, 268, 280, 262, 286]), p.far, c);
    fill(g, 'M238 262l14-12 14 12v16h-28z', p.tree); fill(g, 'M247 266h7v7h-7z', p.win, 0.85);
    ground(g, ridge([330, 316, 306, 312, 320, 314, 304, 310, 322, 318]), p.near, c);
    fill(g, [[202, 316, 60], [226, 312, 44], [588, 312, 66], [612, 318, 46]].map(([x, b, h]) => pine(x, b, h)).join(''), p.tree);
  } },

  underwater: { label: 'sea floor' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sea: ['#13344f', '#0a1b2e'], ray: '#7cc2e0', rayA: 0.13, sand: ['#243646', '#1b2a37'], weed: '#20504a', weed2: '#2a5f50', rock: '#1f3342', coral: '#5e3b52', bubble: '#a8d6ea', fish: ['#c9995f', '#6a8fb8'] }
      : { sea: ['#bfe7ee', '#7cbacb'], ray: '#ffffff', rayA: 0.38, sand: ['#e6dabb', '#d3c3a0'], weed: '#7db59a', weed2: '#93c4a2', rock: '#9db4bb', coral: '#eaa9a4', bubble: '#ffffff', fish: ['#f4c48a', '#f3a59a'] };
    const r = rngOf('underwater');
    const weed = (x, base, h, col) => stroke(g, `M${x} ${base}q-12-${h / 6} 0-${h / 3}t0-${h / 3}t0-${h / 3}`, col, 9);
    const fish = (x, y, col) => fill(g, ellipse(x, y, 12, 6.5) + `M${x + 9} ${y}l10-7v14z`, col);
    sky(g, p.sea[0], p.sea[1]);
    g.fillStyle = lin(g, -10, 330, [[0, p.ray, p.rayA], [1, p.ray, 0]]); g.fill(new Path2D(beams([[250, 300, -10, 290, 360, 320], [420, 450, -10, 470, 520, 290], [540, 584, -10, 560, 624, 310]])));
    fish(300, 160, p.fish[0]); fish(520, 218, p.fish[1]);
    ground(g, ridge([344, 334, 338, 330, 334, 340, 332, 338, 346]), p.sand, c);
    toon(g, 'M176 360q6-40 40-38q30 4 34 40zM560 352q10-30 38-28q26 2 30 30z', p.rock, c, null, 5);
    stroke(g, 'M612 340c-2-30 6-44 0-62M612 312c10-8 14-20 12-32M612 300c-12-6-16-16-14-28', p.coral, 7);
    weed(214, 350, 150, p.weed); weed(234, 346, 110, p.weed2); weed(586, 344, 130, p.weed);
    for (let i = 0; i < 8; i += 1) { const d = circle(n(r.range(200, 600)), n(r.range(140, 400)), n(r.range(2.5, 6))); fill(g, d, p.bubble, 0.18); stroke(g, d, p.bubble, 1.5, 0.6); }
  } },

  candy: { label: 'candy land' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#36213f', '#5c3356'], cloud: ['#7a5a86', '#5e466f'], far: '#583a62', mid: '#3c5058', ground: ['#5a4356', '#463446'], pops: ['#a2607a', '#4f7a8c', '#8c7a4a'], stick: '#cdbfc8', gum: ['#4f7050', '#8a4f62', '#62558a'], sprinkle: ['#a87a8c', '#6f8fa0', '#a39a6a'] }
      : { sky: ['#ffd8e6', '#fff3e2'], cloud: ['#ffffff', '#ffe2ef'], far: '#f6c9dc', mid: '#c6eadb', ground: ['#f6d9b2', '#edc699'], pops: ['#f39cb8', '#97d3e6', '#f6d488'], stick: '#fffaf3', gum: ['#b5e2a6', '#f7b1c4', '#c9b7f0'], sprinkle: ['#ef9ab3', '#8fcbe0', '#f1cf7f'] };
    const r = rngOf('candy');
    const spiral = (x, y, s) => { let d = `M${x} ${y}`, dir = 1; for (let k = 2; k <= 7; k += 1) { d += `a${n((k * s) / 2)} ${n((k * s) / 2)} 0 0 1 ${n(dir * k * s)} 0`; dir = -dir; } return d; };
    const pop = (x, y, rr, col) => { stroke(g, `M${x} ${y}V${y + 120}`, p.stick, 6); fill(g, circle(x, y, rr), col); stroke(g, spiral(x, y, rr / 7.6), '#ffffff', 3.5, 0.6); };
    const gum = (x, y, col) => toon(g, `M${x - 14} ${y}q0-22 14-22q14 0 14 22z`, col, c, null, 4);
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) stars(g, r, 14, [190, 12, 610, 140], '#f3e6f2', 1.3);
    const ca = c.dark ? 0.6 : 0.9;
    for (const [x, y, w] of [[280, 112, 100], [548, 78, 76]]) toon(g, cloud(x, y, w), mix(p.cloud[0], p.sky[1], ca), c, mix(p.cloud[1], p.sky[1], ca), -w * 0.07);
    toon(g, ridge([260, 236, 250, 226, 246, 232, 222, 244, 230, 250]), p.far, c);
    toon(g, ridge([300, 282, 292, 276, 290, 296, 278, 286, 300, 290]), p.mid, c);
    pop(226, 196, 30, p.pops[0]); pop(578, 206, 24, p.pops[1]);
    ground(g, ridge([340, 330, 324, 330, 326, 322, 330, 336, 330]), p.ground, c);
    gum(262, 336, p.gum[0]); gum(560, 334, p.gum[1]); gum(586, 340, p.gum[2]);
    for (let i = 0; i < 11; i += 1) { const x = n(r.range(190, 610)), y = n(r.range(346, 420)), a = r.range(0, 180), col = r.pick(p.sprinkle); g.save(); g.translate(x + 4.5, y + 1.5); g.rotate((a * Math.PI) / 180); g.fillStyle = col; g.beginPath(); g.roundRect(-4.5, -1.5, 9, 3, 1.5); g.fill(); g.restore(); }
  } },

  aurora: { label: 'northern lights' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#0a1626', '#16303f'], a1: '#7ef0c0', a2: '#b48cf5', aA: [0.55, 0.4], far: '#1b2e42', snow: '#2f4a62', trees: '#12233a', ground: ['#27425c', '#1c3149'], star: '#e8f4f5' }
      : { sky: ['#c9e0ea', '#f1f5f2'], a1: '#58cfa5', a2: '#a68ef0', aA: [0.42, 0.32], far: '#a8bfd0', snow: '#eef4f8', trees: '#9cb4c3', ground: ['#f0f5f8', '#dbe6ee'], star: '#ffffff' };
    // a ribbon of even thickness: the same wave along its top and bottom edges; its curtain fades in toward the foot
    const ribbon = (y, amp, h) => `M-40 ${y}q100-${amp} 200 0t200 0t200 0t200 0t200 0v${h}q-100-${amp} -200 0t-200 0t-200 0t-200 0t-200 0z`;
    const curtain = (y, amp, h, col, a) => lin(g, y - amp / 2, y + h, [[0, col, 0], [0.6, col, a * 0.45], [0.88, col, a], [1, col, 0]]);
    const pk = [[-40, 290], [80, 236], [170, 276], [270, 214], [370, 270], [450, 240], [540, 280], [630, 222], [730, 268], [840, 246]];
    sky(g, p.sky[0], p.sky[1]);
    stars(g, rngOf('aurora'), c.dark ? 22 : 10, [170, 8, 630, 220], p.star, 1.5, c.dark ? 2 : 0);
    for (const [rot, cx, cy, tx, ty, a, y, amp, h, col, ca] of [[-4, 400, 80, -80, -34, 0.85, 50, 36, 90, p.a2, p.aA[1]], [-9, 400, 120, 0, 0, 1, 66, 46, 120, p.a1, p.aA[0]], [-13, 400, 100, 90, 52, 0.6, 70, 30, 70, p.a1, p.aA[0]]]) {
      g.save(); g.translate(cx, cy); g.rotate((rot * Math.PI) / 180); g.translate(-cx + tx, -cy + ty); g.globalAlpha = a; g.fillStyle = curtain(y, amp, h, col, ca); g.fill(new Path2D(ribbon(y, amp, h))); g.restore();
    }
    toon(g, range(pk), p.far, c); fill(g, caps(pk, [3, 7, 1, 5], 0.4), p.snow);
    fill(g, treeline(rngOf('aurora-trees'), 306, 22, 44, 22), p.trees);
    ground(g, ridge([326, 318, 314, 318, 312, 316, 322, 316, 326]), p.ground, c);
  } },

  // the poster standing on the floor between the two units, leant on the wall (operator, T14a)
  bookshelf: { label: 'bookshelf' /* product: */, kind: 'scene', hang: 'pin', poster: { cx: 400, top: 86, bottom: 262 }, scene(g, c) {
    const p = c.dark
      ? { wall: ['#2f2c39', '#25222d'], back: ['#3a3039', '#2c242c'], board: '#58463a', floor: ['#3a2e2b', '#2b2220'], books: ['#6e4a48', '#41546e', '#4f6448', '#7a6340', '#5a4a6e', '#6e5052'], leaf: '#4f6a58', pot: '#6b4a44', frame: '#6a5848', pic: '#33405e' }
      : { wall: ['#ece5da', '#e2d8ca'], back: ['#dac8af', '#ccb699'], board: '#c49d76', floor: ['#c8a886', '#b69570'], books: ['#cf9384', '#90abc8', '#a7c49a', '#e1c18b', '#b49cc6', '#d9aaa2'], leaf: '#93bb94', pot: '#d9907a', frame: '#b08a64', pic: '#dbe8ee' };
    const r = rngOf('bookshelf');
    const rect = (x, y, w, h, col, rr = 0) => { g.fillStyle = col; g.beginPath(); if (rr) g.roundRect(x, y, w, h, rr); else g.rect(x, y, w, h); g.fill(); };
    const unit = (x0) => {
      rect(x0, 50, 118, 296, mix(p.back[0], p.back[1], 0.5));
      for (const [k, shelf] of [122, 196, 270, 338].entries()) {
        rect(x0 - 4, shelf, 126, k === 3 ? 10 : 8, p.board);
        if (k === 3) break;
        let x = x0 + 8; const stop = x0 + 110, extra = (k + (x0 > 400 ? 1 : 0)) % 3;
        while (x < stop - 10) {
          if (extra === 1 && x > x0 + 66) {
            fill(g, `M${x + 8} ${shelf}l2-14h18l2 14z`, p.pot);
            for (const [ex, ey, rx, ry, a] of [[x + 13, shelf - 24, 5, 12, -25], [x + 25, shelf - 24, 5, 12, 25], [x + 19, shelf - 30, 4.5, 13, 0]]) { g.save(); g.translate(ex, ey); g.rotate((a * Math.PI) / 180); fill(g, ellipse(0, 0, rx, ry), p.leaf); g.restore(); }
            break;
          }
          if (extra === 2 && x > x0 + 60) { rect(x + 4, shelf - 44, 34, 44, p.frame, 2); rect(x + 9, shelf - 39, 24, 30, p.pic); break; }
          const w = r.int(9, 15), h = r.int(44, 62);
          rect(x, shelf - h, w, h, r.pick(p.books), 1.5);
          x += w + 1;
        }
      }
      rect(x0 - 6, 44, 130, 8, p.board); rect(x0 - 6, 44, 8, 304, p.board); rect(x0 + 116, 44, 8, 304, p.board);
    };
    fill(g, band(VIS.y0 - 10), mix(p.wall[0], p.wall[1], 0.5));
    glow(g, 400, 170, 250, 230, c.dark ? '#f3c27a' : '#fffaf0', c.dark ? 0.14 : 0.45);
    unit(184); unit(498);
    ground(g, band(350), p.floor, c); fill(g, band(346, 352), p.board);
  } },

  meadow: { label: 'meadow' /* product: */, kind: 'scene', scene(g, c) {
    const p = c.dark
      ? { sky: ['#252a4c', '#6a546f'], sun: '#eaa48a', far: '#334550', mid: ['#2b3d3e', '#243433'], near: ['#22322e', '#1a2724'], cloud: '#5a5a80', tree: '#294036', trunk: '#3d3330', flowers: ['#a77d92', '#a59a6e', '#8f94b8'] }
      : { sky: ['#cbe4f4', '#f7f0dc'], sun: '#fff2cc', far: '#c3dbb0', mid: ['#b1d19b', '#a5c78f'], near: ['#a1c68b', '#8db67a'], cloud: '#ffffff', tree: '#9cc18b', trunk: '#b49274', flowers: ['#f2b3c4', '#f6dc8a', '#ffffff'] };
    const r = rngOf('meadow');
    sky(g, p.sky[0], p.sky[1]);
    if (c.dark) { glow(g, 520, 270, 320, 120, p.sun, 0.35); stars(g, rngOf('meadow-stars'), 12, [190, 12, 610, 120], '#efecf8', 1.2); }
    else { glow(g, 560, 118, 120, 120, p.sun, 0.9); fill(g, circle(560, 118, 20), '#fffaf0', 0.85); }
    fill(g, cloud(290, 124, 96) + cloud(470, 70, 60), p.cloud, c.dark ? 0.45 : 0.8);
    toon(g, ridge([262, 248, 256, 244, 252, 260, 246, 254, 250]), p.far, c);
    ground(g, ridge([300, 286, 280, 290, 284, 278, 288, 294, 286]), p.mid, c);
    stroke(g, 'M228 300v-46', p.trunk, 9);
    toon(g, circle(228, 236, 30) + circle(208, 252, 20) + circle(250, 250, 22), p.tree, c, null, 5);
    ground(g, ridge([332, 322, 316, 322, 318, 314, 322, 328, 322]), p.near, c);
    const fl = Array.from({ length: c.dark ? 12 : 22 }, (_, i) => [r.range(180, 620), r.range(300, 420), r.range(2.2, 4), p.flowers[i % 3]]);
    g.globalAlpha = c.dark ? 0.35 : 0.85; for (const [x, y, rr, col] of fl) { g.fillStyle = col; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
    if (c.dark) for (let i = 0; i < 7; i += 1) glow(g, r.range(200, 600), r.range(220, 330), 6, 6, '#e6f39a', 0.85);
  } },
};

// The seed's backdrop, as the product's backdropFromSeed: a quarter keep the tone tint, the rest roll any other one.
// rand: the seed's stream (0 <= x < 1). The product's stream is SHA-256 + PCG32 of the conversation's seed; the
// creator has no conversation, so its own seeded stream stands in: the same rule, not the same draws.
export function backdropFromSeed(rand) {
  if (rand() < 0.25) return 'tone';
  const ids = Object.keys(BACKDROPS).filter((id) => id !== 'tone');
  return ids[Math.floor(rand() * ids.length)];
}

// ---------- mounts: what the offline poster hangs from (the product's `mount` layer and `hang` rule) ----------
// The product draws each mount in px around the tile's top centre, for its poster spanning x ±92, y 40-280 of a 440 px
// tall scene; the post, the lamp post and the cane stand on the ground just in front of the creature's feet (y ~394).
// The creator's poster is larger next to the scene (it fills ~80% of the tile), so the mounts are placed against the
// poster itself: x scales with the poster's width (u px per product unit), y follows the poster above its top (in u),
// across its height (its top and bottom at the product's 40 and 280), and below it down to the foot, which is the
// scene's own ground (y 394 of the frame) or, where the poster comes lower than that, a little under the poster. What
// runs past the tile's top (the trunk) runs off it. Toon line: flat fills with a lit band on the side the light comes
// from (upper left), the product's deep-colour edges (no ink: the mount belongs to the scene, behind the cast).
// hang: 'mount' (the scene draws what it hangs from), 'pin' (a wall: one tack in the poster's top-left
// corner, the poster drooping to the right around it), 'nail' (the forest's slim trunk: one nail at the poster's top
// centre), 'lean' (the bookshelf: on the floor against the wall), 'float' (space). A backdrop's 'poster' (frame units)
// places a smaller poster in its scene instead of the large centred one (room, bookshelf: operator review, T14).
export function frameOf(W, H, feet) { const s = Math.min(Math.max(W / 800, H / 440), W / 420); return { s, tx: W / 2 - 400 * s, ty: feet != null ? feet - GROUND * s : H - 440 * s }; }
export const hangOf = (id) => { const b = BACKDROPS[id]; return !b ? 'pin' : b.hang || (MOUNTS[id] ? 'mount' : 'pin'); };
const lit = (base, c) => (c.dark ? mix('#cfc8ee', base, 0.12) : mix('#ffffff', base, 0.24));
const pal = (c, light, dark) => (c.dark ? dark : light);
// a path through mapped points: segs is a list of ['M', x, y] | ['L', x, y] | ['Q', cx, cy, x, y] | ['C', ...] | ['Z'] in product units
function mapped(M, segs) { const p = new Path2D(); for (const [op, ...v] of segs) { const q = []; for (let i = 0; i < v.length; i += 2) q.push(M.X(v[i]), M.Y(v[i + 1])); if (op === 'M') p.moveTo(...q); else if (op === 'L') p.lineTo(...q); else if (op === 'Q') p.quadraticCurveTo(...q); else if (op === 'C') p.bezierCurveTo(...q); else if (op === 'Z') p.closePath(); } return p; }
// a toon fill: the lit colour, then the base colour shifted right by k px, clipped to the shape (a lit band at its left)
function toonL(g, path, base, c, k) { g.fillStyle = lit(base, c); g.fill(path); g.save(); g.clip(path); g.translate(k, 0); g.fillStyle = base; g.fill(path); g.restore(); }
// the product's wooden post (post(), backdrop.ts ~163): a plank planted in the ground, a tuft of grass at its foot. Its
// top rises a little above the poster (the product's starts behind it, at y 70): the creator's poster is larger and
// leaves little of the post showing under it, so the top says what holds it.
function post(g, M, wood, deep, grass) {
  const { X, Y, u, foot, c } = M, x0 = X(-8), w = 16 * u, y0 = Y(20), path = new Path2D(); path.roundRect(x0, y0, w, foot - y0, 3 * u);
  toonL(g, path, wood, c, w * 0.36);
  g.lineWidth = 3 * u; g.strokeStyle = deep; g.stroke(path);
  g.globalAlpha = 0.5; g.lineWidth = 1.5 * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(-3), Y(120)); g.lineTo(X(-3), foot - 20 * u); g.moveTo(X(3), Y(160)); g.lineTo(X(3), Math.max(Y(160), foot - 50 * u)); g.stroke();
  g.globalAlpha = 0.35; g.fillStyle = deep; g.beginPath(); g.ellipse(M.P.cx, foot, 30 * u, 6 * u, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.save(); g.translate(M.P.cx, foot); g.scale(u, u); stroke(g, 'M-20 0l5-13 3 13 5-16 4 16M8 0l4-12 3 12 5-9 2 9', grass, 3); g.restore();
}
const MOUNTS = {
  mountains: { draw: (g, M) => post(g, M, ...pal(M.c, ['#c49c74', '#8f6c4c', '#7f9f7c'], ['#4f4038', '#2f2622', '#3a4a52'])) },
  beach: { foot: 398, draw: (g, M) => post(g, M, ...pal(M.c, ['#c8a985', '#977a5b', '#9cbf8e'], ['#4f4552', '#2e2836', '#3e4a5a'])) },
  night: { draw: (g, M) => post(g, M, ...pal(M.c, ['#8a86a8', '#5f5b80', '#4f5d92'], ['#3a3448', '#221e2e', '#2b3556'])) },
  aurora: { draw: (g, M) => post(g, M, ...pal(M.c, ['#a99c8c', '#7c7062', '#8fa8b5'], ['#3c3a46', '#24222c', '#2c4458'])) },
  meadow: { draw: (g, M) => post(g, M, ...pal(M.c, ['#c49c74', '#8f6c4c', '#7fa86c'], ['#4a3e38', '#2c2522', '#34503f'])) },
  // the street lamp: the pole planted in the pavement, the lamp above the poster (lit at night, its glow round it)
  city: { foot: 396, draw(g, M) {
    const { P, u, foot, c } = M, [pole, lamp] = pal(c, ['#8c94aa', '#fbe7b4'], ['#3a4160', '#f6d58c']);
    const uh = Math.min(u, (P.top - 0.012 * M.H) / 41), hy = (y) => P.top + (y - 40) * uh; // the head: smaller if the tile's top is near
    if (c.dark) glow(g, P.cx, hy(18), 70 * uh, 70 * uh, '#f6d58c', 0.4);
    const pp = new Path2D(); pp.rect(P.cx - 4.5 * u, hy(30), 9 * u, foot - 4 * u - hy(30)); toonL(g, pp, pole, c, 3.4 * u);
    g.save(); g.translate(P.cx, foot); g.scale(u, u); g.fillStyle = pole; g.fill(new Path2D('M-14 0l4-10h20l4 10z')); g.restore();
    g.save(); g.translate(P.cx, P.top); g.scale(uh, uh); g.translate(0, -40);
    const glass = new Path2D('M-13 32l-3-22h32l-3 22z'); g.globalAlpha = c.dark ? 0.95 : 0.85; toonL(g, glass, lamp, c, 9); g.globalAlpha = 1;
    g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = pole; g.stroke(glass);
    g.fillStyle = pole; g.fill(new Path2D('M-20 11L0 -1 20 11z')); g.fillStyle = lit(pole, c); g.fill(new Path2D('M-20 11L0 -1 -6 11z'));
    g.restore();
  } },
  // a slim trunk (operator, T14c: the product's wide one covered too much) with root flares, running off the tile's top;
  // the poster is nailed to it at its top centre (hang 'nail')
  forest: { foot: 398, draw(g, M) {
    const { u, c, P } = M, [bark, deep] = pal(c, ['#b38f6d', '#8a6a4e'], ['#3a302b', '#251e1b']), top = Math.min(-10, 40 - (P.top + 6 * u) / u);
    const path = mapped(M, [['M', -30, top], ['C', -28, 120, -32, 330, -40, 384], ['Q', -48, 396, -72, 398], ['L', 72, 398], ['Q', 48, 396, 40, 384], ['C', 32, 330, 28, 120, 30, top], ['Z']]);
    toonL(g, path, bark, c, 20 * u);
    g.lineWidth = 3 * u; g.strokeStyle = deep; g.lineJoin = 'round'; g.stroke(path);
    g.globalAlpha = 0.6; g.lineCap = 'round';
    for (const [x, y, cx, cy, ex, ey] of [[-12, 30, 3, -14, 0, -30], [10, 0, -3, -14, 0, -30], [-14, 340, 3, -16, 0, -34], [12, 372, -3, -14, 0, -28]]) g.stroke(mapped(M, [['M', x, y], ['Q', x + cx, y + cy, x + ex, y + ey]]));
    g.globalAlpha = 1;
  } },
  // two balloons, their strings tied behind the poster's top corners; on a narrow tile they come in over the corners
  clouds: { draw(g, M) {
    const { X, Y, u, c, P, W } = M, [b0, b1, string] = pal(c, ['#f2a9b8', '#f4d58a', '#9aa7bd'], ['#c98a9c', '#c9b26e', '#9a98bb']);
    // they bob and drift a little, each on its own beat, while offline (operator, 2026-11-04: as space moves; M.t, seconds)
    for (const [i, [x, y, col, tx, ty]] of [[-132, 24, b0, -86, 46], [134, 30, b1, 86, 46]].entries()) {
      const t = M.t || 0, bx = Math.max(17 * u + 6, Math.min(W - 17 * u - 6, X(x) + Math.sin(t * 0.9 + i * 2.1) * 3 * u));
      let by = Y(y) + Math.sin(t * 1.3 + i * 1.4) * 4 * u;
      if (Math.abs(bx - P.cx) < P.half + 17 * u) by = Math.max(21 * u + 4, Math.min(by, P.top - 27 * u));
      const sx = X(tx), sy = Y(ty);
      g.lineWidth = 1.6 * u; g.strokeStyle = string; g.beginPath(); g.moveTo(bx, by + 25 * u); g.quadraticCurveTo((bx + sx) / 2, by + 40 * u, sx, sy); g.stroke();
      g.save(); g.translate(bx, by); g.scale(u, u);
      const shade = mix(col, c.dark ? '#1b1428' : '#7a5a7a', 0.8), e = new Path2D(ellipse(0, 0, 17, 21));
      g.fillStyle = shade; g.fill(e); g.save(); g.clip(e); g.fillStyle = col; g.fill(new Path2D(ellipse(-3.6, -4.4, 16.4, 20.2))); g.restore();
      g.fillStyle = shade; g.fill(new Path2D('M-3 23h6l-3-4z'));
      stroke(g, 'M-9 -8q2-7 8-9', '#ffffff', 3, 0.55);
      g.restore();
    }
  } },
  // the poster floats, tethered: a rope from its foot down to an anchor on the sea floor (a smaller anchor where the
  // tile leaves little room under the poster; where it leaves less, the anchor runs off the tile's foot)
  underwater: { draw(g, M) {
    const { P, u, c, H } = M, [rope, anchor] = pal(c, ['#bfa27c', '#7f8f9c'], ['#7d6a55', '#4d5d6d']);
    const room = H - 3 - P.bottom, ua = Math.min(u, Math.max(0.6 * u, room / 72)), aTop = Math.max(P.bottom + 10 * ua, H - 3 - 38 * ua), r0 = P.bottom - 10 * u;
    g.lineCap = 'round'; g.lineWidth = 4 * ua; g.strokeStyle = rope; g.beginPath(); g.moveTo(P.cx, r0);
    const L = (aTop - r0) / 3; for (let i = 0; i < 3; i += 1) g.quadraticCurveTo(P.cx + (i % 2 ? -9 : 9) * ua, r0 + L * (i + 0.5), P.cx, r0 + L * (i + 1)); g.stroke();
    g.save(); g.translate(P.cx, aTop - 365 * ua); g.scale(ua, ua); stroke(g, 'M5 370A5 5 0 1 0 -5 370A5 5 0 1 0 5 370M0 375v28M-9 383h18M-15 392q15 18 30 0', anchor, 5); stroke(g, 'M-2 377v22', lit(anchor, c), 1.6, 0.7); g.restore();
  } },
  // a candy cane planted in the ground, the poster hung on its crook
  candy: { foot: 396, draw(g, M) {
    const { X, Y, u, foot, c } = M, cane = pal(c, ['#fff6f2', '#ea8fa0', '#cf8b97'], ['#d9cdd2', '#a8556a', '#6d4a5c']);
    const p = new Path2D(); p.moveTo(X(0), foot); p.lineTo(X(0), Y(44)); p.arc(X(-26), Y(44), 26 * u, 0, Math.PI, true); p.lineTo(X(-52), Y(44) + 8 * u);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = cane[2]; g.lineWidth = 18 * u; g.stroke(p);
    g.strokeStyle = cane[0]; g.lineWidth = 12 * u; g.stroke(p);
    g.lineCap = 'butt'; g.setLineDash([9 * u, 9 * u]); g.strokeStyle = cane[1]; g.stroke(p); g.setLineDash([]);
  } },
};

// Draws backdrop id over a W x H tile. o: { tone (the creature's colour), dark, feet (the creature's feet, px from the
// tile's top; omitted: the frame is pinned to the tile's bottom, as in the product), poster (offline: the poster's box
// on the tile, { cx, top, bottom, half } in px, unrotated; the scene's mount is drawn for it, under the vignette) }.
export function drawBackdrop(g, W, H, id, o = {}) {
  const b = BACKDROPS[id] || BACKDROPS.tone, c = { dark: !!o.dark, tone: o.tone || '#888888' };
  g.save();
  if (b.box) b.box(g, W, H, c);
  if (b.scene) {
    const s = Math.min(Math.max(W / 800, H / 440), W / 420), ty = o.feet != null ? o.feet - GROUND * s : H - 440 * s, tx = W / 2 - 400 * s;
    VIS = { x0: -tx / s, x1: (W - tx) / s, y0: -ty / s, y1: (H - ty) / s }; BOT = Math.max(460, VIS.y1 + 20);
    g.save(); g.translate(tx, ty); g.scale(s, s); b.scene(g, c); g.restore();
    const m = MOUNTS[id];
    if (m && o.poster) {
      const P = o.poster, u = P.half / 92, f = m.foot || 394, foot = Math.min(H - 5 * u, Math.max(ty + f * s, P.bottom + 16 * u));
      const Y = (y) => (y <= 40 ? P.top + (y - 40) * u : y <= 280 ? P.top + ((y - 40) / 240) * (P.bottom - P.top) : P.bottom + ((y - 280) / (f - 280)) * (foot - P.bottom));
      g.save(); m.draw(g, { X: (x) => P.cx + x * u, Y, u, foot, P, W, H, c, t: o.t || 0 }); g.restore();
    }
  }
  // the vignette: edges fade toward paper in the light theme and sink a little in the dark one
  if (!b.flat) {
    g.save(); g.translate(W * 0.5, H * 0.45); g.scale(0.75 * W, 0.75 * H);
    const v = g.createRadialGradient(0, 0, 0, 0, 0, 1), col = c.dark ? '#07060c' : '#fffdf8', a = c.dark ? 0.42 : 0.45;
    v.addColorStop(0.55, alpha(col, 0)); v.addColorStop(1, alpha(col, a)); g.fillStyle = v; g.fillRect(-2, -2, 4, 4); g.restore();
  }
  g.restore();
}
