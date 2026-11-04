// The creature: a real-time 3D rig (three.js), ported from the frozen design reference
// (research/creature-void-design-2026-11-01/reference/2026-11-04/src/creature3d.js, SHA-256 0d66a0ff…). The product draws
// one look of it: the toon ink paint level 'v1' ("Simple ink": Stage('paint'), spec.level 'v1'). The file is kept as close
// to the reference as it can be, so the two can be diffed line by line: only what needed post-processing or an environment
// map (the 'glow' look's cinematic set, the 'render' look's room light) and the 2D generator's import are gone; the other
// looks' small branches stay, unused. Everything the 'v1' look runs is the reference's code, constants, shader and
// geometry, unchanged. Decisions carry their T<n> marker from the design record (DESIGN.md) where the reference has one.
// The creature is never named after the project that inspired its eyes.
//
// The eye language (big leaning ovals, lids, gaze, voice-driven pupils) is inspired by Void
// (https://github.com/PLAYER99-void/void, MIT, (c) 2026 PLAYER99-void). No Void code is used.
// three.js is MIT, (c) 2010-2026 three.js authors (see THIRD_PARTY_NOTICES.md).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- colour helpers, expressions and key poses (research/.../src/creature.js, the 2D sheets' generator) ----------
function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const shade = (c, t) => mix(c, '#1a1424', t);
const tint = (c, t) => mix(c, '#ffffff', t);
// Eye params: gx,gy gaze (-1..1); pr pupil radius factor; sy eye height factor; lid top cover (0..1); tilt (deg, + = inner corner down = cross)
// bot lower-lid cover (0..1, happy cheeks); kind: 'oval' | 'arc' (^ closed happy) | 'line' (closed) | 'x' | 'heart' | 'spiral'
const E = (o) => Object.assign({ gx: 0, gy: 0, pr: 1, sy: 1, sx: 1, lid: 0, tilt: 0, bot: 0, kind: 'oval' }, o);
const EXPR = {
  neutral: { L: E({}), R: E({}) },
  happy: { L: E({ bot: 0.36, lid: 0.04 }), R: E({ bot: 0.36, lid: 0.04 }) },
  joy: { L: E({ kind: 'arc' }), R: E({ kind: 'arc' }) },
  curious: { L: E({ gx: 0.45, gy: -0.15, sy: 1.08, lid: 0, pr: 1.05 }), R: E({ gx: 0.45, gy: -0.15, sy: 0.9, lid: 0.3, tilt: 10 }), tilt: 7 },
  surprised: { L: E({ sy: 1.14, sx: 1.06, lid: 0, pr: 0.62 }), R: E({ sy: 1.14, sx: 1.06, lid: 0, pr: 0.62 }), dy: -3 },
  confused: { L: E({ gx: -0.3, gy: -0.3, lid: 0.36, tilt: -14, sy: 0.92 }), R: E({ gx: -0.3, gy: -0.3, lid: 0, sy: 1.1 }), tilt: -6 },
  sad: { L: E({ gy: 0.45, lid: 0.32, tilt: -16, pr: 1.08 }), R: E({ gy: 0.45, lid: 0.32, tilt: -16, pr: 1.08 }), dy: 3 },
  sleepy: { L: E({ gy: 0.4, lid: 0.66, tilt: 0, sy: 0.92 }), R: E({ gy: 0.4, lid: 0.7, sy: 0.92 }), dy: 3 },
  focused: { L: E({ gy: 0.55, lid: 0.36, tilt: -3, pr: 0.92 }), R: E({ gy: 0.55, lid: 0.36, tilt: -3, pr: 0.92 }) },
  pleading: { L: E({ pr: 1.42, lid: 0.1, tilt: -18, sy: 1.04, gy: -0.1 }), R: E({ pr: 1.42, lid: 0.1, tilt: -18, sy: 1.04, gy: -0.1 }), shine: 2 },
  proud: { L: E({ kind: 'arc', gy: -0.4 }), R: E({ kind: 'arc', gy: -0.4 }), dy: -4, tilt: -4 },
  wink: { L: E({ bot: 0.3 }), R: E({ kind: 'arc' }), tilt: 5 },
  annoyed: { L: E({ gx: 0.5, lid: 0.48, tilt: 18, pr: 0.8 }), R: E({ gx: 0.5, lid: 0.48, tilt: 18, pr: 0.8 }) },
  love: { L: E({ kind: 'heart' }), R: E({ kind: 'heart' }) },
  error: { L: E({ kind: 'x' }), R: E({ kind: 'x' }) },
  dizzy: { L: E({ kind: 'spiral' }), R: E({ kind: 'spiral' }) },
  blink: { L: E({ kind: 'line' }), R: E({ kind: 'line' }) },
};
// Static key poses, a representative frame per state ([t, voice level]): a creature drawn still shows these
const KEY = { idle: [0.6, 0], listening: [0, 0.75], thinking: [0.3, 0], speaking: [0.4, 0.7], working: [0.4, 0], waiting: [0.3, 0], done: [0, 0] };

// ---------- bodies ----------
function lathe(pts) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const p = curve.getPoints(80).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  p[0].x = 0; p[p.length - 1].x = 0;
  const g = new THREE.LatheGeometry(p, 96);
  g.computeVertexNormals();
  return g;
}
const BODY = {
  round: () => new THREE.SphereGeometry(1, 96, 64),
  pear: () => lathe([[0, -0.95], [0.78, -0.9], [1.02, -0.58], [0.96, -0.18], [0.74, 0.25], [0.6, 0.6], [0.34, 0.88], [0, 0.95]]),
  pill: () => new THREE.CapsuleGeometry(0.66, 0.72, 24, 64),
  drop: () => lathe([[0, -0.95], [0.72, -0.86], [0.98, -0.45], [0.88, 0.05], [0.52, 0.55], [0.16, 0.98], [0, 1.12]]),
  dome: () => lathe([[0, -0.95], [0.88, -0.95], [1.0, -0.78], [1.0, -0.2], [0.86, 0.45], [0.5, 0.86], [0, 0.97]]),
  wide: () => { const g = new THREE.SphereGeometry(1, 96, 64); g.scale(1.25, 0.8, 1.05); g.computeVertexNormals(); return g; },
  blob: () => {
    const g = new THREE.SphereGeometry(1, 96, 64), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.07 * Math.sin(v.x * 3.1 + 1) * Math.cos(v.y * 2.3) + 0.05 * Math.sin(v.z * 2.7 + v.y * 1.9); v.multiplyScalar(k); if (v.y < -0.75) v.y = -0.75 - (v.y + 0.75) * 0.35; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  },
  box: () => new RoundedBoxGeometry(1.75, 1.78, 1.5, 8, 0.38),
  // ---- body catalogue (operator: design the creatures first; every body takes the same face and any colour)
  egg: () => lathe([[0, -0.95], [0.7, -0.88], [0.92, -0.5], [0.9, 0.05], [0.72, 0.55], [0.4, 0.9], [0, 1.02]]),
  bean: () => {
    const g = new THREE.CapsuleGeometry(0.62, 0.7, 24, 64), pp = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); const k = v.y / 1.0; v.x += -0.2 * (1 - k * k) + 0.06; pp.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  },
  onion: () => lathe([[0, -0.9], [0.8, -0.8], [1.0, -0.35], [0.92, 0.15], [0.55, 0.55], [0.22, 0.85], [0.06, 1.1], [0, 1.18]]),
  gumdrop: () => lathe([[0, -0.9], [0.98, -0.9], [1.0, -0.75], [0.88, -0.1], [0.6, 0.5], [0.25, 0.85], [0, 0.92]]),
  bell: () => lathe([[0, -0.9], [1.05, -0.88], [1.0, -0.7], [0.78, -0.4], [0.66, 0.1], [0.58, 0.5], [0.35, 0.85], [0, 0.95]]),
  slime: () => lathe([[0, -0.9], [1.18, -0.88], [1.14, -0.68], [0.95, -0.32], [0.68, 0.06], [0.34, 0.3], [0, 0.36]]),
  mochi: () => lathe([[0, -0.75], [0.9, -0.72], [1.12, -0.45], [1.08, -0.05], [0.85, 0.35], [0.45, 0.6], [0, 0.66]]),
  peanut: () => lathe([[0, -0.95], [0.6, -0.88], [0.72, -0.6], [0.56, -0.26], [0.6, -0.1], [0.88, 0.3], [0.86, 0.7], [0.5, 0.98], [0, 1.05]]),
  can: () => lathe([[0, -0.92], [0.68, -0.92], [0.8, -0.8], [0.8, 0.7], [0.68, 0.82], [0, 0.82]]),
  onigiri: () => {
    const sh = new THREE.Shape(), r = 0.32, P = [[0, 1.0], [1.0, -0.78], [-1.0, -0.78]];
    // rounded triangle: straight edges, quadratic corners
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let i = 0; i < 3; i++) { const a = P[(i + 2) % 3], b = P[i], c = P[(i + 1) % 3]; const lenAB = Math.hypot(b[0] - a[0], b[1] - a[1]), lenBC = Math.hypot(c[0] - b[0], c[1] - b[1]); const p1 = lerp2(b, a, r / lenAB), p2 = lerp2(b, c, r / lenBC); if (i === 0) sh.moveTo(...p1); else sh.lineTo(...p1); sh.quadraticCurveTo(b[0], b[1], ...p2); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.75, bevelEnabled: true, bevelThickness: 0.32, bevelSize: 0.24, bevelSegments: 10, curveSegments: 24 });
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const m = mergeVertices(g, 1e-4); m.center(); m.computeVertexNormals(); return m;
  },
  // ---- character bodies: still "all head", with a few built-in parts (see Creature3D.buildFeatures)
  bear: () => { const g = new THREE.SphereGeometry(1, 96, 64); g.scale(1.05, 0.95, 1); g.computeVertexNormals(); return g; },
  robot: () => new RoundedBoxGeometry(1.8, 1.62, 1.45, 8, 0.24),
  cat: () => lathe([[0, -0.95], [0.78, -0.88], [1.0, -0.45], [0.98, 0.1], [0.82, 0.55], [0.45, 0.85], [0, 0.9]]),
  bunny: () => lathe([[0, -0.95], [0.72, -0.88], [0.92, -0.5], [0.9, 0.05], [0.72, 0.55], [0.38, 0.86], [0, 0.92]]),
  frog: () => {
    const g = new THREE.SphereGeometry(1, 128, 96), pp = g.attributes.position, v = new THREE.Vector3();
    const bumps = [new THREE.Vector3(-0.48, 0.78, 0.42).normalize(), new THREE.Vector3(0.48, 0.78, 0.42).normalize()];
    for (let i = 0; i < pp.count; i++) {
      v.fromBufferAttribute(pp, i); const d = v.clone().normalize();
      let k = 1; for (const b of bumps) { const a = Math.acos(Math.min(1, d.dot(b))); k += 0.62 * Math.exp(-(a * a) / (2 * 0.27 * 0.27)); }
      v.multiplyScalar(k); v.x *= 1.22; v.y *= 0.74; if (v.y < -0.62) v.y = -0.62 - (v.y + 0.62) * 0.3; pp.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  },
  mushroom: () => lathe([[0, -0.95], [0.66, -0.9], [0.8, -0.6], [0.8, -0.1], [0.7, 0.3], [0.5, 0.42], [0, 0.45]]),
  ghost: () => {
    const prof = [[0.94, -0.82], [0.97, -0.5], [0.94, 0.1], [0.82, 0.55], [0.55, 0.88], [0.25, 1.02], [0, 1.05]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(60), 96), pp = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); if (v.y < -0.45) { const k = (-0.45 - v.y) / 0.37; v.y += Math.sin(Math.atan2(v.z, v.x) * 5) * 0.11 * k; v.x *= 1 + 0.04 * k; v.z *= 1 + 0.04 * k; } pp.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  },
  hood: () => {
    const g = lathe([[0, -0.95], [0.74, -0.86], [0.98, -0.45], [0.9, 0.05], [0.62, 0.5], [0.32, 0.95], [0.13, 1.32], [0, 1.5]]), pp = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); if (v.y > 0.3) { const k = (v.y - 0.3) / 1.2; v.x += 0.42 * k * k; v.y -= 0.12 * k * k * k; } pp.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  },
};
// eye placement per body: [y, x half-gap, size]
const EYES = { bear: [0.1, 0.36, 0.95], robot: [0.1, 0.4, 0.95, 0, 1.25], cat: [0.0, 0.37, 0.95], bunny: [0.05, 0.33, 0.9], frog: [0.66, 0.7, 0.74, 0, 1.1], mushroom: [-0.3, 0.3, 0.82, 0, 1.15], egg: [0.12, 0.33, 0.92], bean: [0.15, 0.27, 0.84, -0.12], onion: [-0.15, 0.35, 0.95], gumdrop: [-0.2, 0.37, 0.95], bell: [0.05, 0.29, 0.85], slime: [-0.3, 0.42, 0.85, 0, 1.15], mochi: [-0.05, 0.38, 0.95, 0, 1.15], peanut: [0.42, 0.3, 0.82], can: [0.0, 0.33, 0.95], onigiri: [-0.2, 0.33, 0.9], ghost: [0.3, 0.3, 0.95], hood: [-0.12, 0.31, 0.95], round: [0.08, 0.36, 1], pear: [-0.02, 0.31, 0.88], pill: [0.18, 0.3, 0.86], drop: [-0.12, 0.35, 0.95], wide: [0.0, 0.42, 1], dome: [0.05, 0.36, 1], blob: [0.06, 0.36, 0.98], box: [0.06, 0.38, 1] };

// ---------- textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Extension registries. A module registers entries on import (see accessories.js); this file never names them.
//   ACCESSORY_BUILDERS[name] = { slot: 'head' | 'ears' | 'face', label, build(ctx) }
//   EYE_STYLES[name] = { label, draw({ g, cx, cy, R, iris, pupil, look, shade, tint, mix }) }  — paints the iris area
const ACCESSORY_BUILDERS = {};
//   ACTS[name] = { kind: 'mood' | 'work' | 'rest', label, dur (s, or null: loops), key (s: the still frame), build(K) }
const ACTS = {};
const OVER = 1;
const _Y = new THREE.Vector3(0, 1, 0); // the render layer of act effects drawn in front of the creature (Stage.draw, second pass)

// ---------- eyes wide open (operator, 2026-11-03: "sometimes it looks stoned") ----------
// The resting gaze sits a little high in the eye; idle looks ahead and glances aside for under a second every few
// seconds; working looks down at its work with the lids up (the 2D 'focused' half-lid read as drowsy in 3D).
const GAZE_UP = 0.06;
const sstep3 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const blink3 = (t, period, off) => (((t + off) % period) / period > 0.965 ? 1 : 0);
const STATES3D = {
  idle: (t) => {
    const P = 5.4, k = t % P, n = Math.floor(t / P), side = [1, -1, 1, 0][n % 4], gl = sstep3(3.4, 3.55, k) * (1 - sstep3(4.25, 4.4, k));
    return { expr: 'neutral', gx: 0.5 * side * gl, gy: -0.12 * gl * (n % 3 === 2 ? 1 : 0), lid: 0, blink: blink3(t, 4.2, 0.5), breathe: Math.sin(t * 1.6) * 0.012 };
  },
  // the voice shows in the mouth and a slight squash, never in the pupils (pupils pulsing read as dazed)
  listening: (t, lvl) => ({ expr: 'neutral', gx: 0, gy: 0.04, pr: 1.06, sy: 1.04, lid: 0, blink: blink3(t, 5.5, 2), ring: 0.35 + lvl * 0.65, tilt: Math.sin(t * 0.7) * 3, dy: -2, breathe: lvl * 0.025 }),
  speaking: (t, lvl) => ({ expr: 'happy', bot: 0.16 + lvl * 0.08, gx: Math.sin(t * 0.9) * 0.15, gy: 0, blink: blink3(t, 3.6, 0.2), squash: lvl * 0.045, dy: -lvl * 2.5 }),
  working: (t) => { const p = (t * 0.7) % 1; return { expr: 'neutral', gx: -0.45 + 0.9 * (p < 0.85 ? p / 0.85 : 1 - (p - 0.85) / 0.15), gy: 0.35, lid: 0, blink: blink3(t, 5, 3), breathe: Math.sin(t * 2) * 0.006 }; },
};
// Lids are shaded as the skin they are, not as domes: shaded as domes, a lowered upper lid read as a heavy eyelid and
// a raised lower lid as an eye bag; shaded with one normal, a lid showed as a flat patch where the face's shadow band
// crosses the eye. Every lid vertex takes the body's own normal under it (sampled once per eye on a grid in the eye
// anchor's plane, NG × NG over ±1.5 of the eye), carried into the lid's frame: the lid continues the face's light
// and shadow. Recomputed only when the lid or the eye's shape moves.
const NG = 11, _lm3 = new THREE.Matrix3(), _lm4 = new THREE.Matrix4(), _sl = new THREE.Matrix4(), _lv = new THREE.Vector3(), _ln = new THREE.Vector3();
function sampleLidNormals(E, body) {
  const g = new Float32Array(NG * NG * 3), o = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1).transformDirection(E.anchor.matrixWorld);
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const x = (i / (NG - 1) * 2 - 1) * 1.5 * E.W, y = (j / (NG - 1) * 2 - 1) * 1.5 * E.H;
    o.set(x, y, 0); E.anchor.localToWorld(o);
    const h = surface(body, o.clone().addScaledVector(z, 1), z.clone().negate());
    const n = h ? h.n : E.nBody; g.set([n.x, n.y, n.z], (j * NG + i) * 3);
  }
  E.lidN = g;
}
function skinLid(E, lid) {
  const key = lid.rotation.x.toFixed(3) + lid.rotation.z.toFixed(3) + E.shape.scale.x.toFixed(3) + E.shape.scale.y.toFixed(3);
  if (lid.userData.skinKey === key) return; lid.userData.skinKey = key;
  E.anchor.updateMatrix(); E.shape.updateMatrix(); lid.updateMatrix();
  _sl.copy(E.shape.matrix).multiply(lid.matrix); _lm4.copy(E.anchor.matrix).multiply(_sl); _lm3.setFromMatrix4(_lm4).transpose();
  const pos = lid.geometry.attributes.position, nrm = lid.geometry.attributes.normal, G = E.lidN;
  for (let k = 0; k < pos.count; k++) {
    _lv.fromBufferAttribute(pos, k).applyMatrix4(_sl); // in the eye anchor's space
    const u = Math.max(0, Math.min(NG - 1.001, ((_lv.x / (1.5 * E.W)) * 0.5 + 0.5) * (NG - 1))), v = Math.max(0, Math.min(NG - 1.001, ((_lv.y / (1.5 * E.H)) * 0.5 + 0.5) * (NG - 1)));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = (j * NG + i) * 3, b = a + 3, c = a + NG * 3, d = c + 3;
    _ln.set(
      (G[a] * (1 - fu) + G[b] * fu) * (1 - fv) + (G[c] * (1 - fu) + G[d] * fu) * fv,
      (G[a + 1] * (1 - fu) + G[b + 1] * fu) * (1 - fv) + (G[c + 1] * (1 - fu) + G[d + 1] * fu) * fv,
      (G[a + 2] * (1 - fu) + G[b + 2] * fu) * (1 - fv) + (G[c + 2] * (1 - fu) + G[d + 2] * fu) * fv,
    ).applyMatrix3(_lm3).normalize();
    nrm.setXYZ(k, _ln.x, _ln.y, _ln.z);
  }
  nrm.needsUpdate = true;
}
const EYE_STYLES = {};
let EYE_STYLE = null; // set per creature while building/posing (same research shortcut as PAINT)
const eyeTexCache = new Map();
// Equirectangular eyeball texture: the iris is centred where the sphere's +z pole maps (u=.25, v=.5).
function eyeTex(iris, pupil, kind, look) {
  const key = [iris, pupil.toFixed(2), kind, look, EYE_STYLE || ''].join('|');
  if (eyeTexCache.has(key)) return eyeTexCache.get(key);
  const t = canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = look === 'cel' ? '#ffffff' : '#f7f1ea'; g.fillRect(0, 0, W, H);
    const cx = W * 0.25, cy = H * 0.5, R = W * (look === 'paint' ? 0.122 : 0.095); // paint: a bigger iris fills the eye (cute, alert)
    if (kind === 'heart') {
      g.save(); g.translate(cx, cy + R * 0.1); g.scale(R / 11, R / 11); g.fillStyle = '#e5486b';
      g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-6, 3, -11, 0, -11, -5); g.bezierCurveTo(-11, -9, -8, -11, -5.5, -11); g.bezierCurveTo(-3, -11, -1, -9.5, 0, -7.5); g.bezierCurveTo(1, -9.5, 3, -11, 5.5, -11); g.bezierCurveTo(8, -11, 11, -9, 11, -5); g.bezierCurveTo(11, 0, 6, 3, 0, 8); g.fill(); g.restore();
    } else if (kind === 'x') {
      g.strokeStyle = '#1a1220'; g.lineWidth = R * 0.32; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - R * 0.7, cy - R * 0.7); g.lineTo(cx + R * 0.7, cy + R * 0.7); g.moveTo(cx + R * 0.7, cy - R * 0.7); g.lineTo(cx - R * 0.7, cy + R * 0.7); g.stroke();
    } else if (kind === 'spiral') {
      g.strokeStyle = '#1a1220'; g.lineWidth = R * 0.16; g.beginPath();
      for (let i = 0; i <= 60; i++) { const a = i * 0.32, r = i * R * 0.016; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke();
    } else if (look === 'cel') {
      // toon iris: flat colour, one darker band, solid pupil, painted catchlight (Wind Waker paints its highlights)
      g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      g.fillStyle = shade(iris, 0.35); g.beginPath(); g.arc(cx, cy - R * 0.25, R * 0.95, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      g.fillStyle = '#140d16'; g.beginPath(); g.arc(cx, cy, R * pupil, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx + R * 0.38, cy - R * 0.42, R * 0.28, R * 0.22, 0, 0, 7); g.fill();
    } else if (EYE_STYLE && EYE_STYLES[EYE_STYLE]) {
      EYE_STYLES[EYE_STYLE].draw({ g, W, H, cx, cy, R, iris, pupil, look, shade, tint, mix });
    } else if (look === 'paint') {
      // painted iris: posterised rings (dark rim, body, light crescent at the bottom), no plastic gradient;
      // the catchlight is a separate mesh so it stays put while the eye rolls
      g.fillStyle = shade(iris, 0.55); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, 7); g.fill();
      // (no light crescent at the bottom: it read glassy, 'stoned')
      g.fillStyle = shade(iris, 0.3); g.beginPath(); g.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.92); g.arc(cx, cy - R * 0.12, R * 0.7, Math.PI * 1.92, Math.PI * 1.08, true); g.fill();
      g.fillStyle = '#140d16'; g.beginPath(); g.arc(cx, cy, R * pupil, 0, 7); g.fill();
    } else {
      const gr = g.createRadialGradient(cx, cy + R * 0.2, R * 0.05, cx, cy, R);
      gr.addColorStop(0, tint(iris, 0.45)); gr.addColorStop(0.5, iris); gr.addColorStop(0.88, shade(iris, 0.45)); gr.addColorStop(1, shade(iris, 0.8));
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      // radial fibres
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * pupil * 1.05, cy + Math.sin(a) * R * pupil * 1.05); g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); g.stroke(); }
      g.fillStyle = '#0e0910'; g.beginPath(); g.arc(cx, cy, R * pupil, 0, 7); g.fill();
    }
  });
  eyeTexCache.set(key, t);
  return t;
}
const glyphCache = new Map();
function glyphTex(kind) {
  if (glyphCache.has(kind)) return glyphCache.get(kind);
  const t = canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = '#0b0c12'; g.fillRect(0, 0, W, H);
    const cx = W * 0.25, cy = H * 0.5, R = W * 0.11; g.fillStyle = g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    if (kind === 'heart') { g.save(); g.translate(cx, cy + R * 0.1); g.scale(R / 11, R / 11); g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-6, 3, -11, 0, -11, -5); g.bezierCurveTo(-11, -9, -8, -11, -5.5, -11); g.bezierCurveTo(-3, -11, -1, -9.5, 0, -7.5); g.bezierCurveTo(1, -9.5, 3, -11, 5.5, -11); g.bezierCurveTo(8, -11, 11, -9, 11, -5); g.bezierCurveTo(11, 0, 6, 3, 0, 8); g.fill(); g.restore(); }
    else if (kind === 'x') { g.lineWidth = R * 0.3; g.beginPath(); g.moveTo(cx - R * 0.7, cy - R * 0.7); g.lineTo(cx + R * 0.7, cy + R * 0.7); g.moveTo(cx + R * 0.7, cy - R * 0.7); g.lineTo(cx - R * 0.7, cy + R * 0.7); g.stroke(); }
    else { g.lineWidth = R * 0.16; g.beginPath(); for (let i = 0; i <= 60; i++) { const a = i * 0.32, r = i * R * 0.016; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke(); }
  });
  glyphCache.set(kind, t); return t;
}
const blushTex = () => canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(240,110,135,.85)'); gr.addColorStop(1, 'rgba(240,110,135,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); });
let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  // three bands (shadow, mid, lit); a soft 4th step keeps it gentler than the game's hard two-tone
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 4, 1); toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter; toonRamp.needsUpdate = true;
  return toonRamp;
}

// ---------- painted cel shader (look 'paint') ----------
// Render-level form detail without plastic: four soft-edged tone bands with a brushy (noise-wobbled)
// terminator, shadows hue-shifted toward violet instead of black, ground occlusion as a band, a
// flat rim light on the far edge and a hard-edged stylised highlight. No environment reflections,
// no clearcoat. The light is fixed relative to the camera, so every creature is lit the same way.
const PAINT_VS = `
#include <common>
#include <shadowmap_pars_vertex>
varying vec3 vN; varying vec3 vWN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
void main() {
  vUv = uv; vP = position;
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vV = -mvPosition.xyz;
  vN = normalize(transformedNormal);
  vWN = inverseTransformDirection(transformedNormal, viewMatrix); // the world normal, right under non-uniform scale (mat3(modelMatrix) * normal tipped the eye lids' normals down into the ground-occlusion band: a dark patch under the eyes)
}`;
const PAINT_FS = `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uColor, uShade, uLight, uL, uRimColor, uSpecColor;
uniform float uRim, uSpec, uShine, uUseMap;
uniform float uSoft, uBrush, uDeep, uLit, uGrad, uRimSoft, uSpecSoft, uGrain;
uniform float uCast, uBounce, uTerm, uKeepN;
uniform sampler2D uMap;
varying vec3 vN; varying vec3 vWN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing && uKeepN < 0.5) N = -N; // lids keep the body's normal on both faces
  vec3 V = normalize(vV), L = normalize(uL);
  vec3 base = uColor, sh = uShade, lt = uLight;
  if (uUseMap > 0.5) { vec3 m = texture2D(uMap, vUv).rgb; base *= m; sh *= m; lt *= m; }
  float brush = n3(vP * 6.0) * 0.6 + n3(vP * 17.0) * 0.4;
  float t = dot(N, L) * 0.5 + 0.5 + (brush - 0.5) * uBrush;
  if (uCast > 0.5) { float lit = smoothstep(0.35, 0.65, getShadowMask()); t = mix(min(t, uTerm - 0.1), t, lit); }
  // banded: (deep shadow) -> shadow -> mid -> light, edge softness uSoft
  vec3 col = mix(sh, sh * vec3(0.78, 0.76, 0.86), (1.0 - smoothstep(0.265 - uSoft, 0.265 + uSoft, t)) * uDeep);
  col = mix(col, base, smoothstep(uTerm - uSoft, uTerm + uSoft, t));
  col = mix(col, lt, smoothstep(0.88 - uSoft, 0.88 + uSoft, t) * uLit);
  // smooth: the same colours as a continuous gradient; uGrad blends toward it (toward "render")
  vec3 smoothC = mix(mix(sh * vec3(0.86, 0.85, 0.92), sh, smoothstep(0.1, 0.35, t)), base, smoothstep(0.3, 0.68, t));
  smoothC = mix(smoothC, lt, smoothstep(0.72, 1.0, t) * uLit);
  col = mix(col, smoothC, uGrad);
  col = mix(mix(col, sh * 0.9, 0.5), col, smoothstep(-0.92, -0.5 + uSoft, vWN.y));  // occlusion toward the ground
  float frB = 1.0 - max(dot(N, V), 0.0);
  float bounce = smoothstep(0.42, 0.47, frB) * smoothstep(0.05, 0.3, -vWN.y) * (1.0 - smoothstep(uTerm - 0.02, uTerm + 0.02, t));
  col = mix(col, mix(sh, base, 0.45), bounce * uBounce);
  float fr = 1.0 - max(dot(N, V), 0.0);
  float rim = smoothstep(0.62 - uRimSoft, 0.62 + uRimSoft, fr) * smoothstep(0.05, 0.35, dot(N, normalize(vec3(0.85, 0.35, 0.0))));
  col = mix(col, uRimColor, rim * uRim);
  float s = pow(max(dot(N, normalize(L + V)), 0.0), uShine);
  col = mix(col, uSpecColor, smoothstep(0.46 - uSpecSoft, 0.46 + uSpecSoft, s) * uSpec);
  col *= 1.0 + (n3(vP * 38.0) * 0.6 + n3(vP * 90.0) * 0.4 - 0.5) * uGrain;                                   // fine canvas grain
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
// Painter-style shadow colour: darker and a little more saturated, with the hue pushed toward red for warm
// colours and toward blue/violet for cool ones (a flat violet mix turns yellows muddy brown).
function paintShadow(hex) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
  const deg = hsl.h * 360, warm = deg < 75 || deg > 330;
  if (hsl.s < 0.12) return mix(shade(hex, 0.32), "#6a5a9a", 0.22);
  const h = (((warm ? deg - 14 : deg + 18) % 360) + 360) % 360;
  c.setHSL(h / 360, Math.min(1, hsl.s * 0.95 + 0.03), Math.max(0, hsl.l * 0.76 - 0.02), THREE.SRGBColorSpace);
  return "#" + c.getHexString(THREE.SRGBColorSpace);
}
// Stylisation levels for the paint look, from "almost cel" (1) to "almost render" (4).
// soft: band edge width · brush: terminator wobble · deep: 4th (deep shadow) tone · lit: light band
// grad: blend toward a continuous gradient · rimSoft/specSoft: edge softness · grain: canvas texture
// outline: line thickness factor (0 = none) · rim/spec: strengths
const PAINT_LEVELS = {
  1: { name: 'Toon', soft: 0.004, brush: 0, deep: 0, lit: 0, grad: 0, rimSoft: 0.005, specSoft: 0.005, grain: 0, outline: 1.35, rim: 0, spec: 0.6 },
  2: { name: 'Painted', soft: 0.025, brush: 0.035, deep: 1, lit: 1, grad: 0, rimSoft: 0.04, specSoft: 0.04, grain: 0, outline: 0.7, rim: 0.38, spec: 0.5 },
  3: { name: 'Soft paint', soft: 0.09, brush: 0.1, deep: 1, lit: 1, grad: 0.4, rimSoft: 0.1, specSoft: 0.15, grain: 0.1, outline: 0.4, rim: 0.32, spec: 0.42 },
  4: { name: 'Illustrated', soft: 0.18, brush: 0.03, deep: 0.5, lit: 1, grad: 0.9, rimSoft: 0.22, specSoft: 0.4, grain: 0.05, outline: 0, rim: 0.3, spec: 0.4 },
};
// Toon variations (the operator's pick, level 1), each changing one thing:
// rim: hard anime rim band · 3-tone: hard light band · ink: thicker near-black line · deluxe: 4 hard tones + rim
Object.assign(PAINT_LEVELS, {
  // Toon ink with better shadows (after the operator picked ink): received cast shadows (ears, accessories,
  // lids, eyeballs), a contact shadow, tinted floor shadow; then bounce light; then two shadow-colour options
  v1: { ...PAINT_LEVELS[1], name: 'Simple ink', outline: 1.9, ink: true, cast: true, contact: true, spec: 0 },
  f0: { ...PAINT_LEVELS[1], name: 'Ink · flat (no shading)', outline: 1.9, ink: true, shadowSoft: 1, spec: 0 }, // shadow colour = body colour
  i1: { ...PAINT_LEVELS[1], name: 'Ink · cast shadows', outline: 1.9, ink: true, cast: true, contact: true },
  i2: { ...PAINT_LEVELS[1], name: 'Ink · cast + bounce', outline: 1.9, ink: true, cast: true, contact: true, bounce: 0.75 },
  i3: { ...PAINT_LEVELS[1], name: 'Ink · softer shadow', outline: 1.9, ink: true, cast: true, contact: true, bounce: 0.75, shadowSoft: 0.3 },
  i4: { ...PAINT_LEVELS[1], name: 'Ink · cool shadow', outline: 1.9, ink: true, cast: true, contact: true, bounce: 0.75, shadowSoft: 0.15, shadowCool: 0.3 },
  t1: { ...PAINT_LEVELS[1], name: 'Toon' },
  t2: { ...PAINT_LEVELS[1], name: 'Toon + rim', rim: 0.5 },
  t3: { ...PAINT_LEVELS[1], name: 'Toon 3-tone', lit: 0.8 },
  t4: { ...PAINT_LEVELS[1], name: 'Toon ink', outline: 1.9, ink: true },
  t5: { ...PAINT_LEVELS[1], name: 'Toon deluxe', deep: 1, lit: 0.8, rim: 0.45 },
});
// The level is set per creature while it is being built (research shortcut: mat() has no spec in scope).
let PAINT = PAINT_LEVELS[2];
function paintMat(color, opts = {}) {
  const P = PAINT;
  let shadow = opts.shadow || paintShadow(color);
  if (!opts.shadow && P.shadowSoft) shadow = mix(color, shadow, 1 - P.shadowSoft);
  if (!opts.shadow && P.shadowCool) shadow = mix(shadow, '#5f5b96', P.shadowCool);
  const light = opts.light || mix(tint(color, 0.22), '#fff3d6', 0.18);
  const m = new THREE.ShaderMaterial({
    vertexShader: PAINT_VS, fragmentShader: PAINT_FS, lights: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
      uCast: { value: P.cast ? 1 : 0 }, uBounce: { value: P.bounce || 0 }, uTerm: { value: P.term ?? 0.505 },
      uColor: { value: new THREE.Color(color) }, uShade: { value: new THREE.Color(opts.emissive ? mix(color, shadow, 0.3) : shadow) }, uLight: { value: new THREE.Color(light) },
      uL: { value: new THREE.Vector3(-0.62, 0.6, 0.5).normalize() },
      uRimColor: { value: new THREE.Color('#d6e6ff') }, uRim: { value: opts.rim ?? P.rim },
      uSpecColor: { value: new THREE.Color(opts.specColor || '#ffffff') }, uSpec: { value: opts.spec ?? (opts.metal ? 0.9 : P.spec) }, uShine: { value: opts.shine ?? (opts.metal ? 24 : 110) },
      uMap: { value: opts.map || null }, uUseMap: { value: opts.map ? 1 : 0 },
      uSoft: { value: P.soft }, uBrush: { value: opts.map ? 0 : P.brush }, uDeep: { value: P.deep }, uLit: { value: P.lit }, uGrad: { value: P.grad },
      uRimSoft: { value: P.rimSoft }, uSpecSoft: { value: P.specSoft }, uGrain: { value: opts.map ? 0 : P.grain },
    }]),
  });
  m.uniforms.uMap.value = opts.map || null; // merge() clones textures
  m.userData.followKey = !!P.cast; // light direction follows the shadow-casting key light
  m.userData.rimBase = opts.rim ?? P.rim;
  return m;
}

// ---------- materials ----------
// glow: eye colours (the creature's identity in the dark) and the dark body tint
const GLOWS = ['#f2f6ff', '#ffb347', '#8fe9ff', '#9dffc8', '#ff9bd2', '#ffd86b', '#ff8a6a', '#c9a8ff'];
const glowFor = (spec) => spec.glow || GLOWS[[...[spec.color, spec.iris, spec.body, spec.mouth].join('|')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % GLOWS.length];
// emissive colour scaled by luminance, so amber or pink eyes cross the bloom threshold like white ones do
const bright = (hex, k) => { const c = new THREE.Color(hex); const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return c.multiplyScalar(k / Math.max(0.45, lum)); };
function mat(look, color, opts = {}) {
  if (look === 'glow') return new THREE.MeshPhysicalMaterial({ color: mix(color, '#0a0b10', 0.88), roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(mix(color, '#9fb4ff', 0.55)), sheenRoughness: 0.32, clearcoat: 0.2, clearcoatRoughness: 0.45, side: THREE.DoubleSide, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: 1.2 } : {}) });
  if (look === 'paint') return paintMat(color, opts);
  if (look === 'cel') return new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...(opts.emissive ? { emissive: opts.emissive } : {}) });
  return new THREE.MeshPhysicalMaterial({ color, roughness: opts.rough ?? 0.42, clearcoat: opts.coat ?? 0.65, clearcoatRoughness: 0.22, sheen: opts.sheen ?? 0.12, sheenColor: new THREE.Color(tint(color, 0.6)), sheenRoughness: 0.5, metalness: opts.metal ?? 0, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: 0.6 } : {}) });
}
function addOutline(mesh, look, lineColor, thick = 0.028) {
  if (look === "render") return;
  if (look === "paint") { thick *= PAINT.outline; if (thick <= 0) return; } // thinner, coloured line: detail without the drawn look
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: lineColor, side: THREE.BackSide }));
  // pushed back a little in depth: where a part (an ear, a curl, a hat) enters the body, the body's hull never draws over
  // the part's root (with the head tipped back it came out just in front of it, as a thin line across the ears)
  o.material.polygonOffset = true; o.material.polygonOffsetFactor = 4; o.material.polygonOffsetUnits = 24;
  // inverted hull: push vertices out along normals in the vertex shader
  o.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thick.toFixed(3)};`); };
  o.userData.outline = true;
  mesh.add(o);
}

// ---------- temperament ----------
// Personality through the eyes: a seeded resting pose (lids, brow tilt, pupil size, gaze habit, head tilt)
// added on top of whatever state or expression is playing. Asymmetry is where most of the character is.
const TEMPERS = {
  calm: { lid: 0.1 },
  curious: { head: 8, gx: 0.2, gy: -0.15, pr: 1.1, L: { sy: 1.1 }, R: { lid: 0.2, tilt: 8, sy: 0.92 } },
  sleepy: { lid: 0.42, tilt: -7, gy: 0.18, pr: 0.95, head: -4 },
  grumpy: { lid: 0.3, tilt: 17, pr: 0.82, gy: 0.05 },
  shy: { lid: 0.18, gx: -0.45, gy: 0.35, pr: 1.15, head: -7 },
  cheeky: { head: 5, gx: 0.3, L: { lid: 0.34, tilt: 10 }, R: { lid: 0.04 } },
  excited: { sy: 1.08, sx: 1.04, pr: 1.3, gy: -0.1 },
};
const TEMPER_NAMES = Object.keys(TEMPERS);

// ---------- creature ----------
const ray = new THREE.Raycaster();
function surface(mesh, origin, dir) {
  ray.set(origin, dir.clone().normalize());
  const hit = (Array.isArray(mesh) ? ray.intersectObjects(mesh, false) : ray.intersectObject(mesh, false))[0];
  if (!hit) return null;
  const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  return { p: hit.point.clone(), n: nrm };
}

export class Creature3D {
  constructor(spec, look) {
    this.spec = spec; this.look = look;
    PAINT = PAINT_LEVELS[spec.level || 2];
    EYE_STYLE = spec.eyeStyle || null;
    const fill = spec.color || '#f2cf5b', accent = spec.accent || '#5aa9e6';
    // paint: the outline is a hue-shifted dark of the body colour rather than near-black ink
    const line = look === "paint" ? (PAINT.ink ? mix(shade(fill, 0.85), "#14101c", 0.55) : mix(shade(fill, 0.62), "#2d2350", 0.35)) : shade(fill, 0.8);
    this.root = new THREE.Group();
    // sq: squash and stretch, scaled about the feet (pose); fixed: act props that stay put while the body hops or shakes
    this.sq = new THREE.Group(); this.root.add(this.sq);
    this.pivot = new THREE.Group(); this.sq.add(this.pivot);
    // fixed: props that stay put while the body hops and turn with the creature's facing (its yaw, not the gaze);
    // ground: the scene in front (the desk), which neither hops nor turns
    this.fixed = new THREE.Group(); this.root.add(this.fixed);
    this.ground = new THREE.Group(); this.root.add(this.ground); this.deep = false;
    this.layers = {};
    this.colors = { fill, accent, line }; this.props = null;
    const bodyKey = spec.body || 'round';
    const geo = BODY[bodyKey]();
    geo.computeBoundingBox();
    const minY = geo.boundingBox.min.y;
    this.minY = minY;
    this.P = PAINT;
    this.skin = mat(look, bodyKey === 'mushroom' ? mix(fill, '#f3e6d0', 0.9) : fill);
    const body = new THREE.Mesh(geo, this.skin); body.castShadow = true; body.receiveShadow = true;
    this.pivot.add(body); this.body = body;
    addOutline(body, look, line, 0.032);
    if (look === 'paint' && PAINT.contact) {
      const w = Math.max(geo.boundingBox.max.x, geo.boundingBox.max.z);
      const tex = canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(40,30,70,.55)'); gr.addColorStop(0.55, 'rgba(40,30,70,.28)'); gr.addColorStop(1, 'rgba(40,30,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); });
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.1, w * 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = minY + 0.004; this.root.add(blob); this.contact = blob;
    }
    body.updateMatrixWorld(true);
    // markings
    if (spec.marking === 'belly') {
      // belly: a lighter flattened sphere sunk into the front of the body
      const patch = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat(look, tint(fill, 0.5)));
      const s = surface(body, new THREE.Vector3(0, -0.7, 5), new THREE.Vector3(0, 0, -1));
      if (s) { patch.position.copy(s.p).addScaledVector(s.n, -0.28); patch.scale.set(0.62, 0.34, 0.3); patch.lookAt(s.p.clone().add(s.n)); this.pivot.add(patch); }
    }
    if (spec.marking === 'spots') {
      [[-0.6, 0.25], [0.62, -0.1], [0.4, -0.5], [-0.45, -0.45]].forEach(([x, y], i) => {
        const s = surface(body, new THREE.Vector3(x, y, 5), new THREE.Vector3(-x * 0.4, 0, -1)); if (!s) return;
        const d = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat(look, shade(fill, 0.2)));
        d.position.copy(s.p).addScaledVector(s.n, -0.05); d.scale.set(0.11 + i * 0.015, 0.11 + i * 0.015, 0.07); d.lookAt(s.p.clone().add(s.n)); this.pivot.add(d);
      });
    }
    // eyes
    const [ey0, ex0, esz, fx0 = 0, esMax = 9] = EYES[bodyKey];
    const es = Math.min(spec.eyeScale || 1, esMax); // > 1: Void-like big eyes that take most of the face
    const ey = ey0 + (es - 1) * 0.1 * esz, ex = ex0 * (1 + (es - 1) * 0.5);
    const eyeSet = { rx: (spec.eyeRx || 20) / 20, ry: (spec.eyeRy || 30) / 30, gap: (spec.eyeGap || 0) / 60, lean: spec.lean != null ? spec.lean : 7 };
    this.eyes = {};
    this.iris = spec.iris || '#4f8a6a';
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const x = fx0 + sx * (ex + eyeSet.gap);
      const s = surface(body, new THREE.Vector3(x, ey, 5), new THREE.Vector3(0, 0, -1));
      const anchor = new THREE.Group();
      anchor.position.copy(s.p);
      const n = s.n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.55).normalize();
      anchor.lookAt(s.p.clone().add(n));
      anchor.rotateZ(THREE.MathUtils.degToRad(-sx * eyeSet.lean));
      this.pivot.add(anchor);
      const shape = new THREE.Group(); // non-uniform scale: the oval
      const gk = look === 'glow' ? [0.6, 0.78] : [1, 1];
      const W = 0.26 * esz * eyeSet.rx * gk[0] * es, H = 0.37 * esz * eyeSet.ry * gk[1] * es, D = 0.12 * esz * (1 + (es - 1) * 0.5);
      shape.scale.set(W, H, D);
      shape.position.z = look === 'glow' ? -D * 0.55 : -D * 0.45;
      anchor.add(shape);
      if (look === 'glow') this.glow = glowFor(spec);
      const ballMat = look === 'glow' ? new THREE.MeshBasicMaterial({ color: bright(this.glow, 1.7), toneMapped: false }) : look === "paint" ? paintMat("#ffffff", { map: eyeTex(this.iris, 0.36, "oval", look), shadow: "#f1eef6", light: "#ffffff", rim: 0, spec: 0.5, shine: 90 }) : look === "cel" ? new THREE.MeshToonMaterial({ map: eyeTex(this.iris, 0.5, 'oval', look), gradientMap: ramp() }) : new THREE.MeshPhysicalMaterial({ map: eyeTex(this.iris, 0.5, 'oval', look), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), ballMat); ball.castShadow = false; ball.receiveShadow = true;
      shape.add(ball);
      // lids share the skin; hemispheres slightly larger than the eyeball
      const lidMat = this.lidSkin ??= look === 'paint' ? (() => { const m = this.skin.clone(); m.uniforms.uKeepN = { value: 1 }; m.side = THREE.DoubleSide; return m; })() : this.skin;
      const lidT = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), lidMat); lidT.material.side = THREE.DoubleSide;
      const lidB = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
      lidT.rotation.order = lidB.rotation.order = 'ZYX';
      // the eye casts no shadow on the face: under a lowered or raised lid it read as a dark patch, an eye bag
      lidT.castShadow = lidB.castShadow = false; lidT.receiveShadow = lidB.receiveShadow = true;
      if (look === 'paint' || look === 'cel') {
        // ink line along each lid's rim: only visible where the lid crosses the eye, it makes squints and brows read
        // front half of the rim only (the back half would show as stray arcs around the eye)
        // the lower lid has none: with a rim, a raised lower lid read as an eye bag (operator, 2026-11-03)
        for (const lid of [lidT]) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.06, 8, 48, Math.PI), new THREE.MeshBasicMaterial({ color: line })); r.rotation.x = Math.PI / 2; lid.add(r); lid.userData.rim = r; }
      }
      shape.add(lidT, lidB);
      if (look === 'cel') {
        // ink ring around the eye opening (reads like the game's drawn eye outline)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: line }));
        ring.scale.set(1, 1, 0.35); shape.add(ring);
      }
      // catchlight (fixed to the anchor, does not roll with the eyeball) for the render look
      let glint = null;
      if (look !== "cel" && look !== 'glow') {
        glint = new THREE.Mesh(new THREE.CircleGeometry(0.052 * esz, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
        glint.position.set(W * 0.3, H * 0.34, D * 0.82); anchor.add(glint);
        // a second, small catchlight low on the other side: two highlights read lively and wet, one reads blank
        const g2 = new THREE.Mesh(new THREE.CircleGeometry(0.022 * esz, 16), glint.material); g2.position.set(-W * 0.26, -H * 0.2, D * 0.8); glint.add(g2); g2.position.sub(glint.position);
      }
      // closed eyes (blink, joy, proud) read as a curved ink stroke, not as shut lids — as in the 2D sheets
      const closed = new THREE.Mesh(new THREE.TorusGeometry(look === 'glow' ? W * 1.3 : W * 0.95, look === 'glow' ? 0.024 : 0.028, 8, 32, Math.PI * 0.8), look === 'glow' ? new THREE.MeshBasicMaterial({ color: bright(this.glow, 1.7), toneMapped: false }) : new THREE.MeshBasicMaterial({ color: line }));
      closed.rotation.z = Math.PI / 2 - Math.PI * 0.4; closed.position.set(0, -H * 0.35, D * 0.2); closed.visible = false; anchor.add(closed);
      this.eyes[side] = { anchor, shape, ball, lidT, lidB, glint, closed, W, H, D, z0: shape.position.z, nBody: s.n.clone() };
      if (look === 'paint') { anchor.updateMatrixWorld(true); sampleLidNormals(this.eyes[side], body); }
    }
    if (look === 'glow') {
      const front = surface(body, new THREE.Vector3(0, ey, 5), new THREE.Vector3(0, 0, -1));
      const pl = new THREE.PointLight(this.glow, 0.9, 2.8, 2); pl.position.set(0, ey - 0.4, (front ? front.p.z : 1) + 0.95); this.eyeLight = pl; // ahead and low: lights the floor/keys more than the body this.pivot.add(pl);
      // little round feet (as in the reference); the ghost floats instead
      if (bodyKey !== 'ghost' && spec.feet !== false) for (const fx of [-0.32, 0.32]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), this.skin); f.scale.set(1, 0.8, 1.15); f.position.set(fx, minY + 0.12, 0.42); f.castShadow = true; this.pivot.add(f); }
      this.float = bodyKey === 'ghost' ? 0.42 : 0;
    }
    // cheeks
    if (spec.cheeks !== false && look !== 'glow') {
      const bt = blushTex();
      for (const sx of [-1, 1]) {
        const s = surface(body, new THREE.Vector3(sx * (ex + 0.24), ey - 0.3 * esz, 5), new THREE.Vector3(0, 0, -1)); if (!s) continue;
        const c = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, opacity: look === "render" ? 0.55 : look === "paint" ? 0.65 : 0.75 }));
        c.position.copy(s.p).addScaledVector(s.n, 0.006); c.lookAt(s.p.clone().add(s.n)); c.scale.set(1, 0.62, 1); this.pivot.add(c);
      }
    }
    const mouthY = ey - 0.37 * esz * eyeSet.ry * es - 0.11 * esz;
    this.face = { ey, ex, esz, es, fx0, mouthY, minY, eyeW: 0.26 * esz * eyeSet.rx * es, eyeH: 0.37 * esz * eyeSet.ry * es };
    this.buildFeatures(spec.parts || [], fill, accent, line, this.face);
    // mouth anchor
    {
      const s = surface(this.mouthTarget || body, new THREE.Vector3(fx0, mouthY, 5), new THREE.Vector3(0, 0, -1));
      this.mouth = new THREE.Group(); this.mouth.position.copy(s.p); this.mouth.lookAt(s.p.clone().add(s.n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.4)));
      this.pivot.add(this.mouth);
      const dark = look === 'glow' ? new THREE.MeshBasicMaterial({ color: bright(this.glow, 1.3), toneMapped: false }) : new THREE.MeshBasicMaterial({ color: look !== "render" ? line : shade(fill, 0.86) });
      const kind = spec.mouth || 'smile';
      this.mouthLine = new THREE.Group();
      const arc = (r, a, x) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 24, a), dark); m.rotation.z = -Math.PI / 2 - a / 2; m.position.x = x; m.position.y = r * 0.55; return m; };
      if (kind === 'cat') { this.mouthLine.add(arc(0.05, Math.PI * 0.85, -0.05), arc(0.05, Math.PI * 0.85, 0.05)); }
      else { this.mouthLine.add(arc(0.09, Math.PI * 0.6, 0)); }
      if (kind === 'fang') { const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); f.rotation.z = Math.PI; f.position.set(0.035, -0.02, 0.005); this.mouthLine.add(f); }
      this.mouth.add(this.mouthLine);
      this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), look === 'glow' ? new THREE.MeshBasicMaterial({ color: bright(this.glow, 1.6), toneMapped: false }) : new THREE.MeshBasicMaterial({ color: '#3d1626' }));
      this.mouthOpen.position.z = -0.01; this.mouth.add(this.mouthOpen);
      // a big open grin (st.grin): a half disc with a flat top, an ink rim and a tongue
      this.mouthGrin = new THREE.Group(); this.mouthGrin.visible = false; this.mouth.add(this.mouthGrin);
      const half = new THREE.CircleGeometry(1, 40, Math.PI, Math.PI);
      const rimG = new THREE.Mesh(half, new THREE.MeshBasicMaterial({ color: line })); rimG.scale.set(0.2, 0.16, 1); rimG.position.set(0, 0.045, -0.004); this.mouthGrin.add(rimG);
      const inG = new THREE.Mesh(half, new THREE.MeshBasicMaterial({ color: '#3d1626' })); inG.scale.set(0.172, 0.135, 1); inG.position.set(0, 0.032, 0); this.mouthGrin.add(inG);
      const tongue = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#e8607a' })); tongue.scale.set(0.085, 0.045, 1); tongue.position.set(0, -0.07, 0.002); this.mouthGrin.add(tongue);
    }
    // accessory
    if (spec.accessory) this.buildAccessory(spec.accessory, fill, accent, line);
    // floor and listening glow are handled by the stage
    this.state = {};
  }

  // Parts that turn a plain body into a 'species' — usable on ANY body (operator, answer 17): ears, muzzle,
  // whiskers, robot bits, mushroom cap. Any other name falls back to the accessory catalogue (sprout, halo…).
  buildFeatures(parts, fill, accent, line, f) {
    const L = this.look, P = this.pivot, body = this.body, has = (k) => parts.includes(k);
    const add = (geo, color, pos, opts = {}) => { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(L, color, opts) : color); m.castShadow = m.receiveShadow = true; if (pos) m.position.set(...pos); addOutline(m, L, line, opts.ol || 0.024); P.add(m); return m; };
    const on = (x, y, z) => surface(body, new THREE.Vector3(x * 5, y * 5, z * 5), new THREE.Vector3(-x, -y, -z));
    const orient = (m, s, up = 0.45) => { const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.n.clone().lerp(new THREE.Vector3(0, 1, 0), up).normalize()); m.quaternion.copy(q); return q; };
    const inner = mix(fill, '#ffd6dc', 0.55);
    if (has('bear-ears')) {
      for (const sx of [-1, 1]) { const s = on(sx * 0.62, 0.78, 0.0); if (!s) continue; const e = add(new THREE.SphereGeometry(0.27, 40, 24), fill); e.scale.set(1, 1, 0.62); orient(e, s, 0.2); e.position.copy(s.p).addScaledVector(s.n, 0.06); const i = add(new THREE.CircleGeometry(0.15, 32), inner, null, { ol: 0 }); i.position.copy(e.position).add(new THREE.Vector3(0, 0, 0.17)); P.add(i); }
    }
    if (has('muzzle')) {
      // muzzle: a lighter oval; the mouth sits on it
      const s = surface(body, new THREE.Vector3(f.fx0, f.mouthY + 0.02, 5), new THREE.Vector3(0, 0, -1));
      if (s) { const m = add(new THREE.SphereGeometry(1, 48, 32), mix(fill, '#fff3e0', 0.55), null, { ol: 0.018 }); m.position.copy(s.p).addScaledVector(s.n, -0.06); m.scale.set(0.26, 0.17, 0.14); m.lookAt(s.p.clone().add(s.n)); m.updateMatrixWorld(true); this.mouthTarget = [m, body];
        const nose = add(new THREE.SphereGeometry(1, 24, 16), '#3a2a2e', null, { ol: 0 }); nose.scale.set(0.065, 0.045, 0.04); nose.position.copy(s.p).addScaledVector(s.n, 0.07).add(new THREE.Vector3(0, 0.07, 0)); }
    }
    if (has('robot-bits')) {
      const top = on(0, 1, 0); const T = top ? top.p.y : 0.8;
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 12), shade(fill, 0.45), [0, T + 0.16, 0]);
      add(new THREE.SphereGeometry(0.09, 24, 16), accent, [0, T + 0.36, 0], { emissive: accent });
      for (const sx of [-1, 1]) { const sd = on(sx, 0.02, 0), bx = sd ? sd.p.x - sx * 0.03 : sx * 0.93; const b = add(new THREE.SphereGeometry(0.22, 32, 16), shade(fill, 0.3), [bx, 0.02, 0]); b.scale.set(0.62, 1, 1); add(new THREE.SphereGeometry(0.07, 16, 12), accent, [bx + sx * 0.15, 0.02, 0], { ol: 0, emissive: accent }); }
    }
    for (const kind of ['cat', 'bunny'].filter((k) => has(k + '-ears'))) {
      for (const sx of [-1, 1]) {
        const s = on(sx * 0.5, 0.86, 0.05); if (!s) continue;
        const geo = kind === 'cat' ? lathe([[0, -0.24], [0.26, -0.22], [0.18, -0.02], [0.08, 0.16], [0.025, 0.23], [0, 0.245]]) : new THREE.CapsuleGeometry(0.13, 0.62, 8, 24);
        const e = add(geo, fill); e.scale.set(1, 1, 0.55); const q = orient(e, s, kind === 'cat' ? 0.35 : 0.6);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q); e.position.copy(s.p).addScaledVector(up, kind === 'cat' ? 0.12 : 0.4);
        if (kind === 'bunny') e.rotateZ(-sx * 0.12);
        const i = new THREE.Mesh(kind === 'cat' ? new THREE.CircleGeometry(0.1, 3) : new THREE.CapsuleGeometry(0.06, 0.42, 6, 16), mat(L, inner)); i.scale.set(1, kind === 'cat' ? 1.5 : 1, 0.2); i.rotation.z = kind === 'cat' ? Math.PI / 2 : 0; i.position.set(0, kind === 'cat' ? -0.02 : 0.02, 0.115); e.add(i);
      }
    }
    if (has('whiskers')) for (const sx of [-1, 1]) {
      const sw = surface(body, new THREE.Vector3(sx * (f.ex + 0.3), f.mouthY + 0.03, 5), new THREE.Vector3(0, 0, -1)); if (!sw) continue;
      for (const k of [0, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), new THREE.MeshBasicMaterial({ color: line })); w.rotation.z = Math.PI / 2 + sx * (0.08 - k * 0.16); w.position.copy(sw.p).add(new THREE.Vector3(sx * 0.1, -k * 0.06, 0.02)); P.add(w); }
    }
    if (has('mushroom-sprout')) {
      // a little mushroom growing from the head, like the leaf (the big cap read as stuck on)
      const top = on(0, 1, 0), T = top ? top.p.y : 0.9, m = new THREE.Group(); m.position.set(0.1, T - 0.05, 0); m.rotation.z = -0.2; m.scale.setScalar(1.5); P.add(m);
      const stem = new THREE.Mesh(lathe([[0, 0], [0.085, 0.0], [0.07, 0.12], [0.075, 0.22], [0, 0.24]]), mat(L, '#f3e6d0')); addOutline(stem, L, line, 0.016); stem.castShadow = true; m.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(L, accent)); cap.scale.set(1, 0.72, 1); cap.position.y = 0.17; addOutline(cap, L, line, 0.018); cap.castShadow = true; m.add(cap);
      [[0, 0.33, 0.1, 0.045], [-0.12, 0.27, 0.12, 0.035], [0.13, 0.27, 0.1, 0.035]].forEach(([x, y, z, r]) => { const d = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat(L, '#fbf5ea')); d.position.set(x, y, z); d.lookAt(x * 3, y + 0.5, z * 4 + 0.6); m.add(d); });
    }
    if (has('mushroom-cap')) {
      // the cap takes the accent colour and scales with the body's width
      const top = on(0, 1, 0), k = Math.max(0.72, Math.min(1.1, body.geometry.boundingBox.max.x));
      // sit on the head but never over the eyes (squat bodies like slime would otherwise lose their face)
      const T = Math.max(top ? top.p.y : 0.45, f.ey + 0.37 * f.esz * f.es + 0.2 * k);
      const cap = add(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.56), accent, [0, T - 0.16 * k, 0], { ol: 0.03 }); cap.scale.set(1.08 * k, 0.72 * k, 1.02 * k);
      const rim = add(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 64), mix(accent, '#000', 0.25), [0, T - 0.17 * k, 0], { ol: 0 }); rim.scale.set(1.05 * k, 1, 0.99 * k);
      cap.updateMatrixWorld(true);
      [[0, 0.95, 0.35, 0.17], [-0.62, 0.62, 0.48, 0.12], [0.6, 0.66, 0.45, 0.13], [-0.3, 0.98, -0.2, 0.1], [0.9, 0.3, 0.3, 0.1], [-0.9, 0.3, 0.25, 0.1]].forEach(([x, y, z, r]) => {
        const s = surface(cap, new THREE.Vector3(x * 5, y * 5 + T, z * 5), new THREE.Vector3(-x, -y * 0.75, -z)); if (!s) return; r *= k * 0.85;
        const d = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat(L, '#fbf5ea')); d.position.copy(s.p).addScaledVector(s.n, 0.004); d.lookAt(s.p.clone().add(s.n)); P.add(d);
      });
    }
    for (const name of parts) if (!['bear-ears', 'muzzle', 'robot-bits', 'cat-ears', 'bunny-ears', 'whiskers', 'mushroom-cap', 'mushroom-sprout'].includes(name)) this.buildAccessory(name, fill, accent, line);
  }

  buildAccessory(name, fill, accent, line) {
    const L = this.look, top = surface(this.body, new THREE.Vector3(0, 5, 0.1), new THREE.Vector3(0, -1, 0));
    const T = top ? top.p.y : 1;
    const g = new THREE.Group(); this.pivot.add(g);
    const add = (geo, color, pos, rot, scl, opts) => { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(L, color, opts) : color); m.castShadow = true; m.receiveShadow = true; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scl) m.scale.set(...scl); addOutline(m, L, line, 0.02); g.add(m); return m; };
    const onSurf = (x, y, z) => surface(this.body, new THREE.Vector3(x * 5, y * 5, z * 5), new THREE.Vector3(-x, -y, -z));
    const gold = '#f3c24a';
    const ext = ACCESSORY_BUILDERS[name];
    if (ext) {
      const side = surface(this.body, new THREE.Vector3(5, 0.1, 0), new THREE.Vector3(-1, 0, 0));
      ext.build({ THREE, look: L, group: g, add, onSurf, T, width: side ? side.p.x : 0.9, fill, accent, line, gold,
        surface: (origin, dir) => surface(this.body, origin, dir), mat: (c, o) => mat(L, c, o), addOutline: (m, t) => addOutline(m, L, line, t),
        eyes: this.eyes, face: this.face, body: this.body, lathe, shade, tint, mix, canvasTex });
      return;
    }
    switch (name) {
      case 'sprout': {
        add(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 12), '#6b8f3a', [0, T + 0.12, 0], [0, 0, -0.15]);
        add(new THREE.SphereGeometry(1, 32, 16), '#7ccf6a', [0.17, T + 0.3, 0], [0, 0, -0.5], [0.2, 0.07, 0.11]);
        add(new THREE.SphereGeometry(1, 32, 16), '#9ee08a', [-0.12, T + 0.26, 0], [0, 0, 0.5], [0.15, 0.06, 0.09]);
        break;
      }
      case 'catears': case 'bunny': case 'horns': case 'antenna': {
        for (const sx of [-1, 1]) {
          const s = onSurf(sx * 0.5, 0.86, 0.05); if (!s) continue;
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.n.clone().lerp(new THREE.Vector3(0, 1, 0), 0.45).normalize());
          let m;
          if (name === 'catears') m = add(lathe([[0, -0.21], [0.22, -0.2], [0.16, -0.02], [0.08, 0.14], [0.025, 0.2], [0, 0.215]]), fill, null, null, [1, 1, 0.55]); // rounded tip: cone tips fan the toon outline into slivers
          if (name === 'bunny') m = add(new THREE.CapsuleGeometry(0.11, 0.6, 8, 24), fill, null, null, [1, 1, 0.6]);
          if (name === 'horns') m = add(lathe([[0, -0.18], [0.09, -0.17], [0.06, 0], [0.025, 0.14], [0, 0.18]]), '#f1e6cc');
          if (name === 'antenna') { m = add(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), line); const b = add(new THREE.SphereGeometry(0.075, 24, 16), accent, null, null, null, { emissive: accent }); b.position.copy(s.p).addScaledVector(s.n.clone().lerp(new THREE.Vector3(0, 1, 0), 0.45).normalize(), 0.44); }
          const len = name === 'bunny' ? 0.38 : name === 'catears' ? 0.12 : 0.17;
          m.quaternion.copy(q); m.position.copy(s.p).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), len);
        }
        break;
      }
      case 'headphones': {
        const w = surface(this.body, new THREE.Vector3(5, 0.1, 0), new THREE.Vector3(-1, 0, 0)).p.x;
        const band = add(new THREE.TorusGeometry(w + 0.06, 0.05, 12, 48, Math.PI), accent, [0, 0.1, 0]);
        band.scale.set(1, (T - 0.1 + 0.08) / (w + 0.06), 1);
        for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 32), shade(accent, 0.15), [sx * (w + 0.04), 0.08, 0], [0, 0, Math.PI / 2]);
        break;
      }
      case 'halo': add(new THREE.TorusGeometry(0.4, 0.045, 12, 48), gold, [0, T + 0.3, 0], [Math.PI / 2 - 0.15, 0, 0], null, { emissive: '#ffcf4a', metal: 0.5, rough: 0.25 }); break;
      case 'beanie': case 'cap': {
        const s = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
        add(s, accent, [0, T - 0.24, 0], null, [0.74, 0.5, 0.74]);
        if (name === 'beanie') { add(new THREE.TorusGeometry(0.72, 0.07, 12, 48), shade(accent, 0.2), [0, T - 0.22, 0], [Math.PI / 2, 0, 0]); add(new THREE.SphereGeometry(0.12, 24, 16), tint(accent, 0.5), [0, T + 0.3, 0]); }
        else add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32, 1, false, -Math.PI / 2, Math.PI), shade(accent, 0.2), [0, T - 0.22, 0.42], null, [1, 1, 1.2]);
        break;
      }
      case 'party': add(new THREE.ConeGeometry(0.24, 0.6, 32), accent, [0.05, T + 0.24, 0], [0, 0, -0.15]); add(new THREE.SphereGeometry(0.07, 16, 12), '#ffd34d', [0.1, T + 0.56, 0]); break;
      case 'crown': {
        add(new THREE.CylinderGeometry(0.34, 0.3, 0.16, 40, 1, true), gold, [0, T + 0.0, 0], null, null, { metal: 0.6, rough: 0.25 }).material.side = THREE.DoubleSide;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.ConeGeometry(0.06, 0.18, 12), gold, [Math.sin(a) * 0.33, T + 0.16, Math.cos(a) * 0.33], null, null, { metal: 0.6, rough: 0.25 }); }
        add(new THREE.SphereGeometry(0.05, 16, 12), '#e5486b', [0, T + 0.02, 0.34]);
        break;
      }
      case 'bow': { const s = onSurf(0.45, 0.85, 0.3); if (!s) break; const b = new THREE.Group(); b.position.copy(s.p); g.add(b); for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 24), mat(L, accent)); c.rotation.z = sx * Math.PI / 2; c.position.x = sx * 0.11; c.scale.set(1, 1, 0.5); addOutline(c, L, line, 0.02); b.add(c); } const k = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mat(L, shade(accent, 0.2))); b.add(k); b.rotation.z = -0.4; break; }
      case 'glasses': {
        for (const side of ['L', 'R']) { const e = this.eyes[side]; const r = new THREE.Mesh(new THREE.TorusGeometry(Math.max(e.W, e.H) * 1.05, 0.022, 10, 48), mat(L, '#2a2230', { metal: 0.4 })); r.position.z = e.D * 0.9; e.anchor.add(r); }
        break;
      }
      case 'star': {
        const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.09 : 0.2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        add(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }), gold, [0, T + 0.22, -0.03], null, null, { metal: 0.4, rough: 0.3 });
        break;
      }
      case 'curl': {
        const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 3.2, r = 0.16 * (1 - t * 0.7); pts.push(new THREE.Vector3(Math.sin(a) * r * 0.9 + 0.02, T - 0.02 + t * 0.35 + (1 - Math.cos(a)) * r * 0.5, 0)); }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.035, 10), fill);
        break;
      }
    }
  }

  // apply a pose (same parameters as the SVG generator: gaze, pupil, lids, head)
  // ---- state props: things the creature uses in a state (laptop, thought dots, Zzz, book, music notes).
  // They hang from root (not the turning head) and animate with t in animateProps().
  setProps(kind) {
    if (this.props) { this.root.remove(this.props); this.props.traverse((o) => o.geometry && o.geometry.dispose()); }
    this.props = null; this.propKind = kind || null; if (!kind) return;
    PAINT = this.P; // materials for this creature's look level
    const L = this.look, { accent, line } = this.colors, g = new THREE.Group(); g.userData.parts = {};
    const bb = this.body.geometry.boundingBox, minY = bb.min.y, top = bb.max.y, front = bb.max.z, side = bb.max.x;
    const add = (geo, color, pos, opts = {}) => { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(L, color, opts) : color); m.castShadow = true; m.receiveShadow = true; if (pos) m.position.set(...pos); if (opts.ol !== 0) addOutline(m, L, line, opts.ol || 0.02); (opts.to || g).add(m); return m; };
    const P = g.userData.parts;
    if (kind === 'laptop') {
      // a toon laptop in front, lid facing the creature: it peeks over the lid at the screen
      const z = front + 0.42, base = add(new RoundedBoxGeometry(1.36, 0.07, 0.86, 3, 0.03), '#c7ccd6', [0, minY + 0.035, z]);
      const hinge = new THREE.Group(); hinge.position.set(0, minY + 0.07, z + 0.4); g.add(hinge); hinge.rotation.x = -0.5;
      add(new RoundedBoxGeometry(1.36, 0.62, 0.06, 3, 0.03), '#b6bcc8', [0, 0.31, 0], { to: hinge });
      add(new THREE.CircleGeometry(0.1, 32), accent, [0, 0.33, 0.035], { to: hinge, ol: 0 }); // sticker on the lid's back
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.05), new THREE.MeshBasicMaterial({ color: tint(accent, 0.35) })); glow.position.set(0, 0.63, -0.03); hinge.add(glow);
      P.glow = glow; P.hinge = hinge;
    }
    if (kind === 'thought') {
      P.dots = [[0.55, 0.07], [0.8, 0.1], [1.08, 0.15]].map(([x, r], i) => add(new THREE.SphereGeometry(r, 24, 16), '#f7f5f0', [side * 0.55 + x * 0.5, top + 0.05 + i * 0.22, 0.2]));
    }
    if (kind === 'zzz') {
      const zShape = new THREE.Shape([[-0.5, 0.5], [0.5, 0.5], [0.5, 0.3], [-0.15, -0.3], [0.5, -0.3], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.3], [0.15, 0.3], [-0.5, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
      const zg = new THREE.ExtrudeGeometry(zShape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
      P.zs = [0, 1, 2].map(() => add(zg, '#f7f5f0', [0, 0, 0]));
      P.zBase = [side * 0.6, top - 0.1];
    }
    if (kind === 'book') {
      // an open book held low in front, cover in the accent colour
      const z = front + 0.25, y = minY + 0.32, book = new THREE.Group(); book.position.set(0, y, z); book.rotation.x = -0.55; g.add(book);
      for (const sx of [-1, 1]) {
        const half = new THREE.Group(); half.rotation.y = sx * 0.32; book.add(half);
        add(new RoundedBoxGeometry(0.5, 0.66, 0.04, 2, 0.015), accent, [sx * 0.26, 0, -0.02], { to: half });
        add(new THREE.BoxGeometry(0.46, 0.6, 0.04), '#fbf7ee', [sx * 0.25, 0, 0.02], { to: half, ol: 0.012 });
        for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.018), new THREE.MeshBasicMaterial({ color: '#c9c2b4' })); l.position.set(sx * 0.25, 0.17 - i * 0.1, 0.045); half.add(l); }
      }
      P.book = book;
    }
    if (kind === 'notes') {
      const note = (double) => { const n = new THREE.Group(); add(new THREE.SphereGeometry(0.075, 20, 12), line, [0, 0, 0], { to: n, ol: 0 }).scale.set(1.25, 0.9, 0.7); add(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), line, [0.08, 0.15, 0], { to: n, ol: 0 }); if (double) { add(new THREE.SphereGeometry(0.075, 20, 12), line, [0.26, 0.05, 0], { to: n, ol: 0 }).scale.set(1.25, 0.9, 0.7); add(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), line, [0.34, 0.2, 0], { to: n, ol: 0 }); add(new THREE.BoxGeometry(0.28, 0.05, 0.02), line, [0.21, 0.32, 0], { to: n, ol: 0 }).rotation.z = 0.18; } else add(new THREE.BoxGeometry(0.1, 0.035, 0.02), line, [0.13, 0.27, 0], { to: n, ol: 0 }).rotation.z = -0.6; g.add(n); return n; };
      P.notes = [note(false), note(true), note(false)];
      P.nBase = [side * 0.7, top - 0.2];
    }
    this.root.add(g); this.props = g;
  }

  // ---- acts: what the creature acts out, with toon effects around it (registered by acts.js in ACTS).
  // Two layers: 'base' (a working style or a pastime, under the state) and 'mood' (a reaction overlay that wins).
  // An act builds its meshes once (build(K)) and returns frame(a, st): it animates them and returns pose overrides
  // (any pose field, plus expr and eyeStyle). a = { k: seconds since start, dur, hold, env: 0..1 pop in/out, still }.
  setAct(layer, name, opts = {}) {
    const old = this.layers[layer];
    if (old) for (const g of old.groups) { if (g.parent) g.parent.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    delete this.layers[layer];
    this.hasOver = Object.values(this.layers).some((x) => x.groups.some((g) => g.userData.over));
    const def = name && ACTS[name]; if (!def) return null;
    PAINT = this.P; // materials for this creature's look level
    const K = this.actKit(), inst = def.build(K, opts) || {};
    // everything an act draws is in front of the creature (overlay pass), except what asks to be behind (back())
    for (const g of K.groups) { g.userData.act = true; g.userData.over = !g.userData.behind; if (g.userData.over) g.traverse((o) => o.layers.set(this.deep && g.userData.anchor !== 'ground' ? 0 : OVER)); }
    const L = (this.layers[layer] = { name, def, inst, groups: K.groups, t0: null, hold: !!opts.hold, dur: opts.dur !== undefined ? opts.dur : def.dur });
    this.hasOver = Object.values(this.layers).some((x) => x.groups.some((g) => g.userData.over));
    return L;
  }
  act(layer) { return this.layers[layer] ? this.layers[layer].name : null; }
  // Facing the viewer, effects and props are drawn over the creature (nothing can slip behind an ear or a hat).
  // Turned past ~35°, they are drawn with depth, so what goes round the side can go behind the body.
  setDeep(deep) {
    if (this.deep === deep) return; this.deep = deep;
    for (const L of Object.values(this.layers)) for (const g of L.groups) if (g.userData.over && g.userData.anchor !== 'ground') g.traverse((o) => o.layers.set(deep ? 0 : OVER));
  }
  // Runs the layers for this frame: animates their meshes and folds their pose overrides into st (mood last).
  // Returns { expr, eyeStyle } and lists the layers that just ended in this.ended.
  actFrame(t, still, st, lvl = 0) {
    const out = { expr: null, eyeStyle: undefined }; this.ended = [];
    // every layer (base, the desk, the cogs, the microphone…), the mood last so it wins
    const order = Object.keys(this.layers).filter((l) => l !== 'mood').concat(this.layers.mood ? ['mood'] : []);
    for (const layer of order) {
      const A = this.layers[layer]; if (!A) continue;
      if (A.t0 == null) A.t0 = t;
      const k = still ? A.keyAt ?? A.def.key ?? 1 : t - A.t0, dur = A.dur;
      if (!still && dur && !A.hold && k > dur) { this.setAct(layer, null); this.ended.push(layer); continue; }
      const open = !dur || A.hold || still ? 1 : Math.min(1, (dur - k) / 0.35);
      const a = { k, dur, hold: A.hold || !dur, still, lvl, env: still ? 1 : Math.max(0, Math.min(1, k / 0.3, open)) };
      const p = A.inst.frame ? A.inst.frame(a, st) : null;
      if (p) { const { expr, eyeStyle, ...rest } = p; Object.assign(st, rest); if (expr) out.expr = expr; if (eyeStyle !== undefined) out.eyeStyle = eyeStyle; }
    }
    return out;
  }
  // The kit an act builds with: anchors, the creature's measures and materials in its look.
  actKit() {
    const c = this, L = this.look, groups = [], { fill, accent, line } = this.colors;
    const anchors = { head: this.pivot, float: this.root, fixed: this.fixed, ground: this.ground };
    const group = (to = 'float') => { const g = new THREE.Group(); (anchors[to] || to).add(g); g.userData.anchor = typeof to === 'string' ? to : 'other'; groups.push(g); return g; };
    // gaze toward a point in the creature's own frame (where 'fixed' props live, turning with it): the angles the
    // eyes and the head share (eyeball roll 0.75 / 0.62, head turn 0.42 / 0.22, per unit of gx / gy). turn: for a
    // point that does not turn with the creature (the desk), the creature's current yaw.
    const eyeC = this.eyes.L.anchor.position.clone().add(this.eyes.R.anchor.position).multiplyScalar(0.5), Yax = new THREE.Vector3(0, 1, 0);
    const look = (pt, turn = 0) => {
      const q = turn ? pt.clone().applyAxisAngle(Yax, -turn) : pt, dx = q.x - eyeC.x, dy = q.y - eyeC.y, dz = Math.max(0.05, q.z - eyeC.z);
      // moderate: the head turns toward the target too, and a pupil at the rim reads blank (operator: "stoned")
      const cl = (v, m) => m * Math.tanh(v / m); // soft: near the limit the eyes still move (a hard clamp froze them on the far page)
      return { gx: cl(Math.atan2(dx, dz) / 1.17, 0.5), gy: cl(Math.atan2(-dy, Math.hypot(dx, dz)) / 0.84, 0.62) };
    };
    const fx = group; // drawn in front of the creature (every act group is, by default)
    const back = (to = 'float') => { const g = group(to); g.userData.behind = true; return g; }; // drawn with the creature, so it can be behind it
    // the creature's real extent (body, eyes, ears, hats…), not counting act groups
    const box = new THREE.Box3(); this.pivot.updateMatrixWorld(true);
    const isAct = (o) => { for (let q = o; q; q = q.parent) if (q.userData.act) return true; return false; };
    // measured in the creature's rest frame (not the current head turn or hop), so what is placed by it does not move
    const inv = this.pivot.matrixWorld.clone().invert(), mtx = new THREE.Matrix4();
    this.pivot.traverse((o) => { if (!o.isMesh || o.userData.outline || !o.visible || isAct(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(mtx.multiplyMatrices(inv, o.matrixWorld))); });
    const hit = (o, d) => surface(c.body, o, d);
    const top = hit(new THREE.Vector3(0, 5, 0.1), new THREE.Vector3(0, -1, 0)), side = hit(new THREE.Vector3(5, this.face.ey, 0), new THREE.Vector3(-1, 0, 0));
    const ownMat = (m) => { m.userData.own = true; return m; };
    // a mesh in the creature's toon material (or a flat colour with basic: true), with the ink outline unless ol: 0
    const mesh = (geo, color, o = {}) => {
      const m = new THREE.Mesh(geo, typeof color === 'string' ? (o.basic ? ownMat(new THREE.MeshBasicMaterial({ color, transparent: o.opacity != null, opacity: o.opacity ?? 1, depthWrite: o.opacity == null, side: o.side || THREE.FrontSide })) : mat(L, color, o)) : color);
      m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false;
      if (o.ol !== 0) addOutline(m, L, o.ink || line, o.ol ?? 0.02);
      if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot);
      (o.to || group()).add(m); return m;
    };
    return {
      THREE, look: L, groups, group, mesh, hit, fill, accent, line, spec: c.spec, face: c.face, eyes: c.eyes, body: c.body,
      pts: () => (c._pts ??= (() => { const out = [], v = new THREE.Vector3(); this.pivot.traverse((o) => { if (!o.isMesh || o.userData.outline || !o.visible || isAct(o)) return; const pa = o.geometry.attributes.position, st2 = Math.max(1, Math.floor(pa.count / 3000)); mtx.multiplyMatrices(inv, o.matrixWorld); for (let i = 0; i < pa.count; i += st2) { v.fromBufferAttribute(pa, i).applyMatrix4(mtx); out.push(v.x, v.y, v.z); } }); return out; })()),
      T: top ? top.p.y : 1, W: side ? side.p.x : 0.9, minY: c.minY, bb: c.body.geometry.boundingBox, fx, back, gaze: look, eyeC, top: Math.max(box.max.y, top ? top.p.y : 1), box,
      front: (y, x = 0) => { const h = hit(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)); return h ? h.p.z : 0.5; },
      mat: (color, o) => mat(L, color, o), outline: (m, thick, ink) => addOutline(m, L, ink || line, thick), lathe, canvasTex, shade, tint, mix,
      own: ownMat, has: (part) => (c.spec.parts || []).includes(part) || c.spec.accessory === part,
    };
  }

  animateProps(t) {
    if (!this.props) return;
    const P = this.props.userData.parts;
    if (P.glow) P.glow.material.color.set(tint(this.colors.accent, 0.25 + 0.15 * Math.sin(t * 9)));
    if (P.dots) P.dots.forEach((d, i) => { d.position.y = d.userData.y0 ??= d.position.y; d.position.y = d.userData.y0 + Math.sin(t * 2.2 + i * 0.9) * 0.04; });
    if (P.zs) P.zs.forEach((z, i) => { const k = ((t * 0.35 + i / 3) % 1); const sc = 0.12 + k * 0.18; z.scale.set(sc, sc, sc); z.position.set(P.zBase[0] + k * 0.55, P.zBase[1] + k * 0.8, 0.1); z.rotation.z = 0.25 - k * 0.3; z.visible = k < 0.92; });
    if (P.book) P.book.rotation.z = Math.sin(t * 0.8) * 0.04;
    if (P.notes) P.notes.forEach((nn, i) => { const k = ((t * 0.3 + i / 3) % 1); nn.position.set(P.nBase[0] + Math.sin(k * 6 + i) * 0.15 - (i % 2) * 1.6 * P.nBase[0], P.nBase[1] + k * 0.9, 0.15); nn.scale.setScalar(0.7 + 0.5 * Math.sin(Math.min(1, k * 1.2) * Math.PI)); nn.visible = k < 0.95; });
  }

  pose(st, exName, lvl) {
    EYE_STYLE = this.eyeOverride !== undefined ? this.eyeOverride : this.spec.eyeStyle || null; // acts may swap the eyes (stars, hearts)
    const ex = EXPR[exName];
    const eyeFor = (side) => {
      const e = Object.assign({}, ex[side]);
      for (const k of ['gx', 'gy']) if (st[k] != null && e.kind === 'oval') e[k] = st[k];
      if (st.pr != null) e.pr *= st.pr;
      if (st.sy != null) e.sy *= st.sy;
      if (st.lid != null) e.lid = st.lid;
      if (st['lid' + side] != null) e.lid = st['lid' + side];
      if (st['tilt' + side] != null) e.tilt = st['tilt' + side];
      if (st.bot != null && e.kind === 'oval') e.bot = st.bot;
      if (st.blink && e.kind === 'oval') e.kind = 'line';
      if (this.spec.lidRest && e.kind === 'oval' && e.lid < this.spec.lidRest) e.lid = this.spec.lidRest;
      return e;
    };
    const T = TEMPERS[this.spec.temper] || null;
    let gxs = 0, gys = 0;
    for (const side of ['L', 'R']) {
      const e = eyeFor(side), E = this.eyes[side], sx = side === 'L' ? 1 : -1;
      if (T && e.kind === 'oval') {
        const t = Object.assign({}, T, T[side] || {});
        e.lid = Math.min(0.85, Math.max(0, e.lid + (T.lid || 0) + ((T[side] || {}).lid || 0)));
        e.tilt = (e.tilt || 0) + (T.tilt || 0) + ((T[side] || {}).tilt || 0);
        e.pr *= t.pr || 1; e.sy *= (T.sy || 1) * ((T[side] || {}).sy || 1); e.sx *= T.sx || 1;
        e.gx = Math.max(-0.85, Math.min(0.85, (e.gx || 0) + (T.gx || 0))); e.gy = Math.max(-0.85, Math.min(0.85, (e.gy || 0) + (T.gy || 0)));
      }
      let lid = e.lid, bot = e.bot, kind = e.kind === 'oval' ? 'oval' : e.kind;
      if (kind === 'line') { lid = 0.5; bot = 0.5; }
      if (kind === 'arc') { lid = 0.42; bot = 0.58; }
      const texKind = ['heart', 'x', 'spiral'].includes(kind) ? kind : 'oval';
      const pupil = Math.min(0.8, 0.36 * e.pr); // smaller resting pupil: big dark pupils read dazed
      if (this.look === 'glow') {
        const tex = texKind === 'oval' ? null : glyphTex(texKind); if (E.ball.material.map !== tex) { E.ball.material.map = tex; E.ball.material.needsUpdate = true; }
        E.shape.position.set((e.gx || 0) * E.W * 0.4, -(e.gy || 0) * E.H * 0.28, E.z0);
      } else { const tex = eyeTex(this.iris, Math.round(pupil * 20) / 20, texKind, this.look); if (E.ball.material.uniforms) E.ball.material.uniforms.uMap.value = tex; else { E.ball.material.map = tex; E.ball.material.needsUpdate = true; } }
      // gaze: roll the eyeball inside its oval (the oval is a non-uniformly scaled sphere, so the iris
      // foreshortens toward the rim, as if on a sphere)
      E.ball.rotation.set((e.gy - GAZE_UP) * 0.62, e.gx * 0.75, 0); // +x tips the front of the ball down: gy > 0 looks down (it was inverted)
      const gs = this.look === 'glow' ? 0.88 + 0.12 * e.pr : 1; // glow: dilation = the light grows
      E.shape.scale.set(E.W * e.sx * gs, E.H * e.sy * gs, E.D);
      E.lidT.rotation.set(-Math.PI / 2 + Math.min(1, lid) * Math.PI, 0, THREE.MathUtils.degToRad(-e.tilt * sx));
      E.lidB.rotation.set(Math.PI / 2 - Math.min(1, bot) * Math.PI, 0, 0);
      if (this.look === 'paint' && E.lidN) { skinLid(E, E.lidT); skinLid(E, E.lidB); }
      // the catchlights hide as soon as a lid covers them (operator, 2026-11-04: in the stretch they stayed over the
      // closed eye): the upper lid's edge sits at cos(lid·π) of the half height, the lower one's at −cos(bot·π); the big
      // one is at +0.34, the small one at −0.2
      if (E.glint) {
        const yt = Math.cos(Math.min(1, lid) * Math.PI), yb = -Math.cos(Math.min(1, bot) * Math.PI);
        E.glint.visible = kind === "oval" && yt > 0.42 && yb < 0.26;
        if (E.glint.children[0]) E.glint.children[0].visible = yt > -0.12 && yb < -0.28;
      }
      const shut = kind === "line" || kind === "arc";
      E.shape.visible = !shut; E.closed.visible = shut; E.closed.scale.set(1, kind === "line" ? -0.45 : 1, 1); if (shut) E.closed.position.y = kind === "line" ? -E.H * (0.08 + 0.1 * Math.max(0, Math.min(1, e.gy || 0))) : -E.H * 0.35; // a blink closes across the eye (a little lower as it looks down), not at its foot: on wide or flat bodies the low stroke read as the eyes vanishing (T19) if (E.glint && shut) E.glint.visible = false;
      gxs += e.gx || 0; gys += e.gy || 0;
    }
    // head: turn toward the gaze — this is what makes it read as a 3D creature, not a drawing
    const gx = gxs / 2, gy = gys / 2;
    const tilt = (ex.tilt || 0) + (st.tilt || 0) + (T ? T.head || 0 : 0), dy = (ex.dy || 0) + (st.dy || 0);
    this.pivot.rotation.set(gy * 0.22 + 0.04, gx * 0.42, THREE.MathUtils.degToRad(-tilt));
    const yaw = st.turn || 0; this.root.rotation.y = yaw; // everything turns together: creature, props, effects
    const sq = 1 + (st.breathe || 0) - (st.squash || 0), sqx = 1 - (st.breathe || 0) * 0.6 + (st.squash || 0);
    this.sq.scale.set(sqx, sq, sqx); this.sq.position.y = this.minY * (1 - sq); // grounded: the feet stay on the floor
    this.root.position.set((st.dx || 0) * 0.012, -dy * 0.012, 0); // dx: a shake (acts)
    // props stay put while the body hops or shakes (the counter-move, in the turned root's own space); the desk does
    // not turn either
    this.fixed.position.set(-this.root.position.x, -this.root.position.y, 0).applyAxisAngle(_Y, -yaw); this.ground.position.copy(this.fixed.position);
    this.ground.rotation.y = -yaw;
    this.setDeep(Math.abs(yaw) > 0.6);
    if (this.contact) { const up = Math.max(0, this.root.position.y), k = Math.max(0.45, 1 - up * 1.4); this.contact.position.set(-this.root.position.x, -this.root.position.y, 0).applyAxisAngle(_Y, -yaw); this.contact.position.y += this.minY + 0.004; this.contact.scale.set(k, k, 1); }
    // mouth (st.mouth: an act opens it, 0..1)
    const open = st.voice ? lvl : st.mouth != null ? st.mouth : st.squash != null ? lvl : 0;
    const happy = ['happy', 'joy', 'proud', 'love', 'wink'].includes(exName), sad = ['sad', 'error', 'annoyed'].includes(exName);
    const o = exName === 'surprised' && !st.voice ? Math.max(0.5, open) : open;
    this.mouthOpen.visible = o > 0.05;
    this.mouthLine.visible = !this.mouthOpen.visible;
    this.mouthGrin.visible = !!st.grin; if (st.grin) this.mouthOpen.visible = this.mouthLine.visible = false;
    if (this.mouthOpen.visible) this.mouthOpen.scale.set(0.075 + o * 0.04, 0.035 + o * 0.09, 0.03);
    this.mouthLine.scale.set(1, sad ? -0.8 : happy ? 1.3 : 1, 1);
    this.mouthLine.position.y = sad ? -0.03 : 0;
    this.ring = st.ring || 0;
  }
}

// ---------- stage: one renderer, many creatures blitted into 2D canvases ----------
export class Stage {
  constructor(look, px = 256, mode = '') {
    this.look = look; this.px = px; this.cine = mode === 'cine';
    const aspect = this.cine ? 16 / 9 : mode === 'wide' ? 3 / 2 : 1; this.w = Math.round(px * aspect); this.h = px; // wide: the app's stage tile (3:2)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(this.w, this.h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = look === "render" ? THREE.NeutralToneMapping : look === 'glow' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 60);
    this.camera.position.set(0, 0.6, 6.7); this.camera.lookAt(0, 0.3, 0);
    const key = new THREE.DirectionalLight(0xffffff, look === 'cel' ? 3.2 : 2.4); key.position.set(-2.2, 4.2, 5); key.castShadow = true;
    key.shadow.mapSize.set(px >= 1024 ? 2048 : 1024, px >= 1024 ? 2048 : 1024); key.shadow.radius = 6; key.shadow.camera.left = key.shadow.camera.bottom = -2.5; key.shadow.camera.right = key.shadow.camera.top = 2.5; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.07; this.key = key;
    // past the toon terminator: the body's own shadow comes from its two tones, not the shadow map (its self-shadow band ran ahead of the terminator and the eye lids, lit by the same tones, showed as light patches against it)
    this.scene.add(key); key.layers.enable(OVER); key.shadow.camera.layers.enable(OVER);
    this.fillLight = new THREE.HemisphereLight(0xfff4e6, 0x6b5a70, look === 'cel' ? 0.75 : 0.55); this.scene.add(this.fillLight); this.fillLight.layers.enable(OVER);
    this.rim = new THREE.DirectionalLight(0xbfd8ff, look === 'cel' ? 0.0 : 1.4); this.rim.position.set(2.5, 2, -4); this.scene.add(this.rim);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: look === 'cel' ? 0.22 : 0.28 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.scene.add(this.floor);
    this.items = [];
  }
  add(spec, canvas, opts = {}) {
    const c = new Creature3D(spec, this.look);
    c.root.visible = false;
    this.scene.add(c.root);
    const item = { c, canvas, spec, opts, off: opts.off ?? Math.random() * 10 };
    this.items.push(item);
    return item;
  }
  draw(item, t, lvl, isStatic) {
    const { c, spec, canvas, opts } = item;
    // the camera's aspect and the renderer's size follow the canvas: a creature is never stretched, whatever it is drawn into
    if (!this.cine) { const ar = canvas.width / canvas.height; if (Math.abs(ar - this.camera.aspect) > 1e-3) { this.camera.aspect = ar; this.camera.updateProjectionMatrix(); this.w = Math.round(this.h * ar); this.renderer.setSize(this.w, this.h); } }
    let st = {};
    if (spec.state) { const [kt, kl] = KEY[spec.state] || [0, 0]; st = STATES3D[spec.state](isStatic ? kt : t + item.off, isStatic ? kl : lvl); }
    if (spec.state === 'speaking') st.voice = true; // the mouth follows the voice whatever mood plays over it
    if (opts.turn != null) st = Object.assign({}, st, { turn: opts.turn });
    const acted = c.actFrame(t, isStatic, (st = Object.assign({}, st)), isStatic ? (KEY[spec.state] || [0, 0.6])[1] : lvl); // acts: working styles, pastimes, moods
    const x = opts.extra || {};
    if (opts.extra) { const { expr, eyeStyle, ...rest } = x; st = Object.assign({}, st, rest); } // live overrides (pointer gaze, reaction hops) from an interactive host
    c.eyeOverride = x.eyeStyle !== undefined ? x.eyeStyle : acted.eyeStyle;
    const exName = x.expr || acted.expr || spec.expr || st.expr || 'neutral';
    c.pose(st, exName, isStatic ? (KEY[spec.state] || [0, 0.6])[1] : lvl);
    c.animateProps(isStatic ? 0.35 : t + item.off);
    for (const it of this.items) it.c.root.visible = it === item;
    this.floor.position.y = c.minY - 0.005 - (this.cine ? 0.42 : 0); // under the keyboard on the cine set
    if (this.keys) this.keys.position.y = c.minY - 0.005;
    c.root.position.y += c.float || 0;
    // product: the camera is placed before the light is turned to follow it (the reference placed it after, so a frame lit
    // with the previous frame's camera: the same in a running loop, a stale light on a still drawn once after a reframing)
    if (this.cine) { const cp = opts.cam || [2.4, 0.9, 9.6]; this.camera.position.set(...cp); this.camera.lookAt(0, 0.45 + (c.float || 0) * 0.7, 0); if (this.bokeh) this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(new THREE.Vector3(0, 0.2, 0)); }
    else { const zm = opts.zoom || 1; this.camera.position.set(0, opts.fit ? 0.4 : 0.6, (opts.fit ? 5.0 : 6.7) * zm); this.camera.lookAt(0, opts.lookY != null ? opts.lookY : (opts.fit ? 0.02 : 0.3 + (c.float || 0) * 0.5) - (zm - 1) * 0.55, 0); } // zoom > 1: room around it (creator acts); lookY: an exact look height (a host's framing)
    // listening: the rim light takes the accent colour and grows with the voice
    if (this.look === 'render') { this.rim.color.set(c.ring > 0 ? (spec.accent || '#5aa9e6') : '#bfd8ff'); this.rim.intensity = 1.4 + c.ring * 4; }
    // cast-shadow variants use a higher, more lateral key so ears, hats and eyes throw shadows onto the body
    // cast-shadow variants: a key high enough for cast shadows (ears, hats on the body) and frontal enough that the
    // face stays lit; the terminator runs low on the body, not across the eyes and the mouth (operator, round 5)
    if (this.look === 'paint') { if (c.P && c.P.cast) this.key.position.set(-2.5, 4.4, 4.6); else this.key.position.set(-2.2, 4.2, 5); }
    if (this.look === 'paint') {
      this.camera.updateMatrixWorld();
      const ld = this.key.position.clone().normalize().transformDirection(this.camera.matrixWorldInverse);
      c.root.traverse((o) => { const m = o.material; if (m && m.userData && m.userData.followKey) m.uniforms.uL.value.copy(ld); });
      const tinted = c.P && c.P.cast;
      this.floor.material.color.set(tinted ? '#3b2f63' : '#000000'); this.floor.material.opacity = tinted ? 0.3 : 0.28;
    }
    if (this.look === "paint") c.root.traverse((o) => { const u = o.material && o.material.uniforms; if (!u || !u.uRim || !o.material.userData.rimBase) return; u.uRimColor.value.set(c.ring > 0 ? (spec.accent || "#5aa9e6") : "#d6e6ff"); u.uRim.value = c.ring > 0 ? 0.6 + c.ring * 0.4 : o.material.userData.rimBase; });
    else if (this.look === 'cel') { this.rim.color.set(spec.accent || '#5aa9e6'); this.rim.intensity = c.ring * 3; }
    else if (this.look === 'glow') { this.rim.color.set(c.ring > 0 ? c.glow : '#6f93ff'); this.rim.intensity = 4.5 + c.ring * 5; }
    if (c.eyeLight) { c.eyeLight.intensity = this.cine ? 2.6 : 0.9; c.eyeLight.distance = this.cine ? 3.6 : 2.8; } // wide shots: a warm pool on the keys
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    // act effects that must always read in front (hearts, "!", cogs, juggling balls…): a second pass on layer 1 over
    // the cleared depth, lit by the same lights and shadow map (props that stand in front by depth stay in pass one)
    if (c.hasOver && !this.composer) {
      const R = this.renderer, au = R.autoClear, su = R.shadowMap.autoUpdate;
      R.autoClear = false; R.shadowMap.autoUpdate = false; R.clearDepth();
      this.camera.layers.set(OVER); R.render(this.scene, this.camera); this.camera.layers.set(0);
      R.autoClear = au; R.shadowMap.autoUpdate = su;
    }
    const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }
}

export { EXPR, KEY, STATES3D, PAINT_LEVELS, TEMPER_NAMES, ACCESSORY_BUILDERS, EYE_STYLES, ACTS, mix, tint, shade };
