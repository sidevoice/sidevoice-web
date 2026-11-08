// Acts: what a creature acts out, with toon effects around it, layered over its state (Creature3D.setAct). Ported from
// the frozen design reference (reference/2026-11-04/src/acts.js, SHA-256 a4264178…), its code, constants, curves and
// timings unchanged, line for line:
//   moods      reactions, not agent states: happy, laugh, love, surprised, angry, sad, confused, dizzy, excited, shy,
//              proud, scared. They layer over any state (the voice keeps the mouth while speaking); a host plays one by
//              name for a duration: creature.setAct('mood', name, { dur }) (host.ts playMood).
//   working    crank, hammer, files (T16), type and think (T39-era), hands-free: the tools move by themselves; the busy
//              cogs over the head in every one.
//   resting    the pastimes: stretch, water, juggle, soup, fish, bubbles, music, read (T15, T43-era) and nap.
// Which one shows, and for how long, is schedule.ts (the reference's lists and timings) and avatar-state.ts. Product
// edits, each marked "product:": the acts' hash and the fishing's bite pattern come from schedule.ts (one place, tested
// there). Not ported: the desk while working (sidevoice-web#476: the dormant `o.desk` branches of the working styles stay,
// as in the reference, and nothing sets them), the shell terminals and their desk variant (undecided), the microphone
// hero (the permissions step's) and the voice cue lines (decided off).
// Everything is built from the same toon materials and ink outline as the creatures, flat-coloured and chunky, and
// placed from the creature's own measures (head top, width, eyes, mouth) so it works on every body.
import * as THREE from 'three';
import { ACTS } from './rig.js';
import { geo } from './accessories.js';
import { hash, fishing } from './schedule'; // product: the noise and the fishing's bites, from one place

const { puffy, blob, tube, starPts, smooth2D, strand, revolve, roundSeat, profile, RoundedBoxGeometry } = geo;
const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const backOut = (t) => { t = clamp(t); const c = 1.8; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const pop = (k, k0 = 0, d = 0.35) => backOut((k - k0) / d); // 0 → overshoot → 1
const bump = (k, k0, d) => { const t = (k - k0) / d; return t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0; };
const show = (m, s) => { m.visible = s > 0.02; m.scale.setScalar(Math.max(0.001, s)); };

// The creator's camera (Stage front view at ZOOM), to keep things in front below the eyes or the mouth and inside the frame.
export const ZOOM = 1.26; // room around the creature for effects, and for the props beside it on the floor
const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60); cam.position.set(0, 0.6, 6.7 * ZOOM); cam.lookAt(0, 0.3 - (ZOOM - 1) * 0.55, 0); cam.updateMatrixWorld();
const sy = (y, z) => V(0, y, z).project(cam).y;
const xAt = (s, z) => s / V(1, 0.3, z).project(cam).x; // the x seen at screen x s (near y 0.3)
const yAt = (s, z) => { let lo = -4, hi = 4; for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (sy(m, z) < s) lo = m; else hi = m; } return lo; };

// Fixed colours: these items are what they are (gold, wood, steel), the rest takes the creature's accent.
const C = { ink: '#2a2433', white: '#fbf8f2', yellow: '#ffd84d', red: '#ef4f5f', pink: '#ff7aa8', blue: '#5aa9e6', sky: '#9fd6ec', steel: '#b4bec9', iron: '#6c7486', wood: '#c8925a', woodDk: '#a8743f', green: '#7cc95e', orange: '#f59a4a', cloud: '#eef2f8', rain: '#9aa6b8', silver: '#cfd4dc', silverDk: '#aab1bd' };

// ---------- 2D outlines for flat glyphs (extruded with a soft bevel: puffy toon stickers) ----------
const SH = {
  heart: (s) => Array.from({ length: 56 }, (_, i) => { const t = (i / 56) * TAU; return [(16 * Math.sin(t) ** 3) / 17 * s, ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.2) * s]; }),
  drop: (s) => smooth2D([[0, 0.62], [0.17, 0.3], [0.34, -0.02], [0.3, -0.3], [0, -0.42], [-0.3, -0.3], [-0.34, -0.02], [-0.17, 0.3]].map(([x, y]) => [x * s, y * s]), 40),
  sparkle: (s) => Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * TAU, c = Math.cos(t), n = Math.sin(t); return [c * c * c * s, n * n * n * s]; }), // an astroid: four sharp points, concave sides
  bar: (s) => smooth2D([[-0.15, 0.62], [0, 0.66], [0.15, 0.62], [0.08, -0.18], [-0.08, -0.18]].map(([x, y]) => [x * s, y * s]), 36),
  zed: (s) => [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.28], [-0.12, -0.28], [0.5, -0.28], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.28], [0.12, 0.28], [-0.5, 0.28]].map(([x, y]) => [x * s, y * s]),
  cog: (R, n) => { const p = [], w = Math.PI / n; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; for (const [da, r] of [[-w * 0.92, R * 0.76], [-w * 0.42, R], [w * 0.42, R], [w * 0.92, R * 0.76]]) p.push([Math.cos(a + da) * r, Math.sin(a + da) * r]); } return p; },
  circle: (r, n = 32) => Array.from({ length: n }, (_, i) => [Math.cos((-i / n) * TAU) * r, Math.sin((-i / n) * TAU) * r]),
  fish: (s) => smooth2D([[0.5, 0], [0.32, 0.2], [0, 0.24], [-0.3, 0.12], [-0.42, 0.04], [-0.62, 0.24], [-0.56, 0], [-0.62, -0.24], [-0.42, -0.04], [-0.3, -0.12], [0, -0.24], [0.32, -0.2]].map(([x, y]) => [x * s, y * s]), 56),
};

// ---------- builders over an act's kit K ----------
function kit(K) {
  const glyph = (pts, color, o = {}) => K.mesh(puffy(pts, o.depth ?? 0.05, o.bevel ?? 0.03, o.holes), color, { ol: 0.016, ...o });
  const twinkle = (s, color, to) => glyph(SH.sparkle(s), color, { to, depth: 0.02, bevel: 0.008, ol: 0.011 }); // sharp: a light bevel and line keep the points
  // a text sticker: bold letters with a thick ink edge, on a transparent plane (code bits, HA HA)
  const sticker = (text, o = {}) => {
    const W = o.w || 256, H = o.h || 128;
    const tex = K.canvasTex(W, H, (g) => {
      g.font = `bold ${o.px || 84}px "DejaVu Sans Mono", "DejaVu Sans", Menlo, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (o.bubble) { g.fillStyle = o.bubble; g.strokeStyle = K.line; g.lineWidth = 10; const r = H * 0.38; g.beginPath(); g.roundRect(8, H / 2 - r, W - 16, r * 2, r); g.fill(); g.stroke(); }
      g.strokeStyle = o.edge || C.ink; g.lineWidth = o.edgeW ?? 16; if (o.edgeW !== 0) g.strokeText(text, W / 2, H / 2 + 4);
      g.fillStyle = o.color || C.white; g.fillText(text, W / 2, H / 2 + 4);
    });
    const size = o.size || 0.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * (W / H), size), K.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    (o.to || K.fx()).add(m); return m;
  };
  // a cloud of overlapping puffs; the ink between the lobes draws the puffs
  const cloud = (color, s = 1, o = {}) => {
    const g = new THREE.Group(); (o.to || K.fx()).add(g);
    [[0, 0.06, 0.26], [-0.26, -0.03, 0.19], [0.27, -0.02, 0.2], [-0.1, -0.08, 0.2], [0.12, -0.09, 0.19]].forEach(([x, y, r]) => K.mesh(blob(r * s, r * s * 0.9, r * s * 0.8, 24, 16), color, { to: g, pos: [x * s, y * s, 0], ol: 0.02 }));
    return g;
  };
  const puff = (color, s = 1, to) => { const g = new THREE.Group(); (to || K.fx()).add(g); [[0, 0, 0.13], [0.1, 0.06, 0.09], [-0.09, 0.05, 0.08]].forEach(([x, y, r]) => K.mesh(blob(r * s, r * s, r * s * 0.85, 20, 14), color, { to: g, pos: [x * s, y * s, 0], ol: 0.016 })); return g; };
  const drop = (color, s, to) => { const g = new THREE.Group(); (to || K.fx()).add(g); glyph(SH.drop(s), color, { to: g, depth: 0.03 * s / 0.2, bevel: 0.02 }); K.mesh(blob(0.045 * s / 0.2, 0.07 * s / 0.2, 0.02, 12, 8), '#ffffff', { to: g, pos: [-0.05 * s / 0.2, -0.02 * s / 0.2, 0.035], basic: true, ol: 0 }); return g; };
  const note = (color, double, to) => {
    const n = new THREE.Group(); (to || K.fx()).add(n);
    const head = (x, y) => K.mesh(blob(0.085, 0.065, 0.05, 20, 12), color, { to: n, pos: [x, y, 0], rot: [0, 0, 0.35], ol: 0.014 });
    const stem = (x, y) => K.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), color, { to: n, pos: [x, y, 0], ol: 0.012 });
    head(0, 0); stem(0.075, 0.15);
    if (double) { head(0.26, 0.05); stem(0.335, 0.2); K.mesh(new RoundedBoxGeometry(0.3, 0.06, 0.04, 2, 0.015), color, { to: n, pos: [0.205, 0.33, 0], rot: [0, 0, 0.17], ol: 0.012 }); }
    else K.mesh(new RoundedBoxGeometry(0.13, 0.05, 0.03, 2, 0.012), color, { to: n, pos: [0.13, 0.27, 0], rot: [0, 0, -0.6], ol: 0.012 });
    return n;
  };
  // the head's top near its axis and a point on the surface from a direction (head space)
  const onHead = (x, y, z) => K.hit(V(x * 5, y * 5, z * 5), V(-x, -y, -z));
  // where a head decal (vein, blush, sweat) sits: on the surface, facing out, a little proud
  const place = (m, h, lift = 0.02, toCam = 0.4) => { const n = h.n.clone().lerp(V(0, 0, 1), toCam).normalize(); m.position.copy(h.p).addScaledVector(h.n, lift); m.lookAt(m.position.clone().add(n)); return m; };
  // in front of the body: the depth just clear of its front at height y
  const before = (y, x = 0, gap = 0.08) => K.front(y, x) + gap;
  const eyeBottom = K.face.ey - K.face.eyeH, mouth = K.face.mouthY;
  const sEye = sy(eyeBottom, K.front(eyeBottom, K.face.ex)), sMouth = sy(mouth - 0.05, K.front(mouth));
  // the desk: its top just under the mouth (as seen), at least a low table; the creature stands right behind it
  const deskY = clamp(Math.min(yAt(sMouth - 0.04, K.front(mouth) + 0.05), mouth - 0.2), K.minY + 0.22, K.minY + 0.55), deskZ = K.front(deskY) + 0.02;
  const top = (z = 0.3, margin = 0) => yAt(0.9, z) - margin; // the highest centre for something of half-height margin
  const over = (dy, half = 0.15, z = 0.3) => Math.min(Math.max(K.T + dy, K.top + dy * 0.5), top(z, half)); // over the head and whatever it wears, inside the frame
  // keep an effect of half-width half inside the frame at depth z
  const inX = (x, half = 0.15, z = 0.3) => { const r = xAt(0.9, z) - half; return clamp(x, -r, r); };
  return { inX, glyph, twinkle, sticker, cloud, puff, drop, note, onHead, place, before, eyeBottom, mouth, sEye, sMouth, deskY, deskZ, top, over };
}

function act(name, kind, label, timing, build) { ACTS[name] = { kind, label, dur: timing.dur ?? null, key: timing.key ?? 1, build: (K, o) => build(K, kit(K), o || {}) }; }

// ================================================================ moods ================================================================

act('happy', 'mood', 'happy', { dur: 3, key: 0.75 }, (K, X) => {
  // little twinkles popping round the head, a bouncy sway
  const g = K.fx(), spots = [[-K.W - 0.1, K.T * 0.55, 0.24], [K.W + 0.12, K.T * 0.35, 0.2], [K.W * 0.7, X.over(0.18), 0.18], [-K.W * 0.55, X.over(0.22), 0.14]];
  const tw = spots.map(([x, y, s], i) => { const m = X.twinkle(s * 1.15, i % 2 ? C.white : C.yellow, g); m.position.set(X.inX(x, s * 1.15), y, 0.3); return m; });
  return { frame(a) {
    const { k, env } = a;
    tw.forEach((m, i) => { const ph = fract(k * 0.9 + i * 0.27); show(m, env * pop(ph, 0, 0.25) * (1 - sstep(0.7, 1, ph))); m.rotation.z = ph * 0.6; });
    return { expr: 'happy', dy: -Math.abs(Math.sin(k * 6)) * 5 * env, tilt: Math.sin(k * 3) * 5 * env };
  } };
});

act('laugh', 'mood', 'laughing', { dur: 3, key: 0.42 }, (K, X) => {
  // HA HA stickers bouncing out at both sides, the body shaking with it, mouth wide open
  const g = K.fx();
  const has = [-1, 1].map((sx, i) => { const m = X.sticker('HA', { size: 0.46, color: C.yellow, to: g, px: 92 }); m.position.set(X.inX(sx * (K.W + 0.12), 0.48, 0.4), K.T * 0.5 + i * 0.12, 0.4); m.rotation.z = -sx * 0.22; return m; });
  const ticks = [-1, 1].flatMap((sx) => [0, 1, 2].map((j) => { const a = (j - 1) * 0.45; const m = K.mesh(new THREE.CapsuleGeometry(0.025, 0.14, 4, 8), C.ink, { to: g, ol: 0 }); m.position.set(sx * (K.W + 0.08 + Math.cos(a) * 0.12), K.face.ey + 0.2 + Math.sin(a) * 0.22, 0.3); m.rotation.z = -sx * (Math.PI / 2 - a); m.userData.sx = sx; return m; }));
  return { frame(a) {
    const { k, env } = a, beat = Math.abs(Math.sin(k * 11));
    has.forEach((m, i) => { const ph = fract(k * 1.2 + i * 0.5 + 0.2); show(m, env * pop(ph, 0, 0.18) * (1 - sstep(0.8, 1, ph))); m.position.y = K.T * 0.45 + i * 0.1 + ph * 0.22; });
    ticks.forEach((m) => show(m, env * (0.55 + 0.45 * beat)));
    return { expr: 'joy', mouth: (0.55 + 0.4 * beat) * env, squash: 0.035 * beat * env, dx: Math.sin(k * 30) * 1.1 * env, dy: -3 * env, tilt: Math.sin(k * 5) * 4 };
  } };
});

act('love', 'mood', 'love', { dur: 3.2, key: 1.25 }, (K, X) => {
  // hearts floating up round the head; heart eyes, a happy sway
  const g = K.fx(), N = 6;
  const hearts = Array.from({ length: N }, (_, i) => X.glyph(SH.heart(0.17 + 0.05 * (i % 3)), i % 2 ? C.pink : C.red, { to: g, depth: 0.05, bevel: 0.03 }));
  return { frame(a) {
    const { k, env } = a;
    hearts.forEach((m, i) => {
      const ph = fract(k * 0.55 + i / N), sx = i % 2 ? 1 : -1, x0 = X.inX(sx * (K.W * (0.55 + 0.35 * hash(i))), 0.4, 0.35);
      m.position.set(x0 + Math.sin(ph * 6 + i) * 0.12, K.T * 0.35 + ph * 1.05, 0.35);
      m.rotation.z = Math.sin(ph * 5 + i) * 0.25;
      show(m, env * pop(ph, 0, 0.2) * (1 - sstep(0.75, 1, ph)));
    });
    return { expr: 'love', tilt: Math.sin(k * 2.4) * 6 * env, breathe: Math.sin(k * 4.8) * 0.015 };
  } };
});

act('surprised', 'mood', 'surprised', { dur: 2.4, key: 0.32 }, (K, X) => {
  // a big "!" popping over the head with shock lines, and a jump
  const g = K.fx('fixed'), bang = new THREE.Group(); g.add(bang);
  X.glyph(SH.bar(0.55), C.red, { to: bang, depth: 0.07, bevel: 0.035 }).position.y = 0.1;
  K.mesh(blob(0.07, 0.07, 0.06, 20, 14), C.red, { to: bang, pos: [0, -0.16, 0], ol: 0.016 });
  bang.position.set(X.inX(K.W * 0.8, 0.2, 0.35), X.over(0.12, 0.5), 0.35); bang.rotation.z = -0.15;
  const lines = [-1, 1].flatMap((sx) => [-0.5, 0, 0.5].map((a) => { const m = K.mesh(new THREE.CapsuleGeometry(0.028, 0.16, 4, 8), C.ink, { to: g, ol: 0 }); const r = K.W + 0.2, ang = Math.PI / 2 - sx * (Math.PI / 2 - 0.55 + a * 0.5); m.position.set(Math.cos(ang) * r, K.face.ey + 0.15 + Math.sin(ang) * r * 0.75, 0.3); m.rotation.z = ang - Math.PI / 2; return m; }));
  return { frame(a) {
    const k = a.hold ? a.k % 2.4 : a.k, env = a.env;
    show(bang, env * pop(k, 0.05, 0.3)); bang.rotation.z = -0.15 + Math.sin(k * 24) * 0.12 * Math.exp(-k * 3);
    lines.forEach((m, i) => show(m, env * pop(k, 0.08 + (i % 3) * 0.04, 0.2) * (1 - sstep(0.9, 1.4, k))));
    const up = bump(k, 0, 0.55), land = bump(k, 0.55, 0.25);
    return { expr: 'surprised', dy: -up * 22, squash: land * 0.09 - up * 0.04 };
  } };
});

act('angry', 'mood', 'angry', { dur: 3, key: 0.62 }, (K, X) => {
  // a manga anger mark on the head, steam puffing out of the top, a cross little shake
  const head = K.fx('head'), g = K.fx();
  const vein = new THREE.Group(); head.add(vein);
  for (let q = 0; q < 4; q++) {
    const pts = [[0.42, 0.18], [0.24, 0.13], [0.13, 0.13], [0.13, 0.24], [0.18, 0.42]].map(([x, y]) => V(x, y, 0).applyAxisAngle(V(0, 0, 1), (q * Math.PI) / 2));
    K.mesh(strand(new THREE.CatmullRomCurve3(pts), (t) => 0.045 + 0.035 * Math.sin(t * Math.PI), 0.45, 32), C.red, { to: vein, ol: 0.014 });
  }
  const h = X.onHead(0.55, 0.72, 0.45); if (h) X.place(vein, h, 0.05, 0.5); vein.scale.setScalar(0.62);
  const puffs = [-1, 1].flatMap((sx) => [0, 1].map((j) => { const p = X.puff(C.white, 0.9, g); p.userData = { sx, j }; return p; }));
  return { frame(a) {
    const { k, env } = a;
    vein.scale.setScalar(0.62 * env * (1 + 0.12 * Math.sin(k * 11)));
    puffs.forEach((p) => { const { sx, j } = p.userData, ph = fract(k * 1.3 + j * 0.5 + (sx > 0 ? 0.25 : 0)); p.position.set(X.inX(sx * (K.W * 0.62 + ph * 0.45), 0.2, 0.1), Math.min(K.T * 0.78 + ph * 0.3, X.top(0.1, 0.2)), 0.1); show(p, env * Math.sin(ph * Math.PI) * 1.15); });
    return { expr: 'annoyed', gx: 0, gy: 0.05, lid: 0.38, dx: Math.sin(k * 38) * 1.6 * env, squash: Math.abs(Math.sin(k * 7)) * 0.025, tilt: Math.sin(k * 19) * 2 };
  } };
});

act('sad', 'mood', 'sad', { dur: 3.4, key: 1.3 }, (K, X) => {
  // a tiny rain cloud over the head and a tear rolling down
  const g = K.fx(), head = K.fx('head'), cy = Math.min(K.top + 0.32, X.top(0.05, 0.25));
  const cl = X.cloud(C.rain, 0.95, { to: g }); cl.position.set(0, cy, 0.05);
  const drops = Array.from({ length: 4 }, (_, i) => { const d = X.drop(C.blue, 0.11, g); d.userData.x = (i - 1.5) * 0.17; return d; });
  const tear = X.drop(C.sky, 0.13, head);
  const E = K.eyes.R; E.anchor.updateMatrixWorld(true);
  const t0 = E.anchor.localToWorld(V(E.W * 0.35, -E.H * 0.85, E.D * 0.6)), tz = t0.z + 0.06;
  return { frame(a) {
    const { k, env } = a;
    show(cl, env); cl.position.x = Math.sin(k * 1.4) * 0.06;
    drops.forEach((d, i) => { const ph = fract(k * 1.6 + i * 0.37); d.position.set(cl.position.x + d.userData.x, cy - 0.12 - ph * Math.max(0.3, cy - 0.12 - K.top), 0.05); show(d, env * (1 - sstep(0.75, 1, ph))); });
    const ph = fract(k * 0.45); tear.position.set(t0.x + ph * 0.05, t0.y - ph * 0.32, tz); show(tear, env * pop(ph, 0, 0.2) * (1 - sstep(0.8, 1, ph)));
    return { expr: 'sad', breathe: Math.sin(k * 1.5) * 0.012, tilt: Math.sin(k * 0.8) * 3 };
  } };
});

act('confused', 'mood', 'confused', { dur: 3, key: 0.9 }, (K, X) => {
  // question marks popping over the head, the head tilting one way then the other
  const g = K.fx();
  const qmark = (s) => { const q = new THREE.Group(); g.add(q); const pts = [[-0.2, 0.3], [-0.16, 0.47], [0, 0.55], [0.18, 0.47], [0.19, 0.29], [0.04, 0.17], [0, 0.0]].map(([x, y]) => V(x * s, y * s, 0)); K.mesh(tube(new THREE.CatmullRomCurve3(pts), () => 0.07 * s, 48, 14), C.blue, { to: q, ol: 0.016 }); K.mesh(blob(0.075 * s, 0.075 * s, 0.07 * s, 20, 14), C.blue, { to: q, pos: [0, -0.17 * s, 0], ol: 0.016 }); return q; };
  const qs = [[K.W * 0.8, X.over(0.05, 0.45), 0.85], [-K.W * 0.8, X.over(-0.05, 0.4), 0.7], [K.W * 0.1, X.over(0.28, 0.35), 0.55]].map(([x, y, s]) => { const q = qmark(s); q.position.set(X.inX(x, 0.25 * s, 0.25), y, 0.25); return q; });
  return { frame(a) {
    const { k, env } = a;
    qs.forEach((q, i) => { const ph = fract(k * 0.6 + i * 0.33); show(q, env * pop(ph, 0, 0.22) * (1 - sstep(0.8, 1, ph))); q.rotation.z = Math.sin(k * 3 + i) * 0.18; });
    return { expr: 'confused', tilt: Math.sin(k * 1.6) * 9 * env };
  } };
});

act('dizzy', 'mood', 'dizzy', { dur: 3.2, key: 0.75 }, (K, X) => {
  // spiral eyes and stars going round over the head
  const g = K.fx(), stars = [0, 1, 2, 3].map((i) => X.glyph(starPts(0.15, 0.065), i % 2 ? C.white : C.yellow, { to: g, depth: 0.05, bevel: 0.025 }));
  const ring = K.mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 64), C.ink, { to: g, ol: 0, basic: true, opacity: 0.25 }); ring.rotation.x = Math.PI / 2 - 0.35;
  return { frame(a) {
    const { k, env } = a, y0 = Math.min(Math.max(K.T + 0.16, K.top), X.top(0.2, 0.25));
    ring.position.set(0, y0, 0); show(ring, env);
    stars.forEach((m, i) => { const t = k * 2.6 + (i / 4) * TAU; m.position.set(Math.cos(t) * 0.62, y0 + Math.sin(t) * 0.62 * Math.sin(0.35), Math.sin(t) * 0.62 * Math.cos(0.35)); m.rotation.z = k * 4 + i; show(m, env * (0.85 + 0.25 * Math.sin(t))); });
    return { expr: 'dizzy', tilt: Math.sin(k * 5) * 9 * env, dx: Math.sin(k * 2.5) * 2.5 * env };
  } };
});

act('excited', 'mood', 'excited', { dur: 3, key: 0.55 }, (K, X) => {
  // star eyes, quick hops and a burst of sparkles all round
  const g = K.fx(), N = 7;
  const sp = Array.from({ length: N }, (_, i) => X.twinkle(0.15 + 0.09 * hash(i), i % 3 ? C.yellow : C.white, g));
  return { frame(a) {
    const { k, env } = a;
    sp.forEach((m, i) => { const ang = (i / N) * Math.PI * 1.15 - 0.08, ph = fract(k * 1.1 + i * 0.29), r = K.W + 0.12 + ph * 0.28; m.position.set(X.inX(Math.cos(ang) * r * (i % 2 ? 1 : -1), 0.26), Math.min(K.face.ey * 0.4 + Math.sin(ang) * r * 0.9 + 0.05, X.top(0.3, 0.12)), 0.3); show(m, env * Math.sin(ph * Math.PI) * 1.15); m.rotation.z = ph * 1.5; });
    return { expr: 'happy', bot: 0.16, eyeStyle: 'star', dy: -Math.abs(Math.sin(k * 9)) * 9 * env, squash: Math.max(0, -Math.cos(k * 18)) * 0.04 };
  } };
});

act('shy', 'mood', 'shy', { dur: 3.4, key: 1.2 }, (K, X) => {
  // looking away and down, blush with hatching on both cheeks, a sweat drop
  const head = K.fx('head');
  const blush = [-1, 1].map((sx) => {
    const h = K.hit(V(sx * (K.face.ex + 0.12) + K.face.fx0, Math.max(K.face.mouthY + 0.06, K.face.ey - K.face.eyeH * 0.95), 5), V(0, 0, -1)); if (!h) return null;
    const b = new THREE.Group(); head.add(b); X.place(b, h, 0.012, 0.2);
    K.mesh(new THREE.CircleGeometry(1, 32), C.pink, { to: b, basic: true, opacity: 0.8, ol: 0 }).scale.set(0.24, 0.13, 1);
    for (let i = 0; i < 3; i++) K.mesh(new THREE.CapsuleGeometry(0.014, 0.12, 3, 6), '#d94a7a', { to: b, basic: true, ol: 0, pos: [(i - 1) * 0.08, 0, 0.004], rot: [0, 0, -0.5] });
    return b;
  }).filter(Boolean);
  const sweat = X.drop(C.sky, 0.17, head); const hs = X.onHead(0.62, 0.62, 0.4); if (hs) X.place(sweat, hs, 0.06, 0.6); const s0 = sweat.position.clone();
  return { frame(a) {
    const { k, env } = a;
    blush.forEach((b) => show(b, env * (1 + 0.04 * Math.sin(k * 3))));
    const ph = fract(k * 0.5); sweat.position.copy(s0).add(V(0, -ph * 0.12, 0)); show(sweat, env * pop(ph, 0, 0.25) * (1 - sstep(0.85, 1, ph)));
    return { expr: 'neutral', gx: -0.5, gy: 0.45, lid: 0.12, sy: 0.97, tilt: -8 + Math.sin(k * 2) * 3, dx: Math.sin(k * 1.4) * 1.5, squash: 0.02 };
  } };
});

act('scared', 'mood', 'scared', { dur: 2.8, key: 0.5 }, (K, X) => {
  // tiny pupils, trembling, sweat flying off, gloom lines over the forehead
  const head = K.fx('head'), g = K.fx();
  const gloom = new THREE.Group(); head.add(gloom);
  const yTop = Math.min(K.T - 0.08, X.eyeBottom + K.face.eyeH * 2 + 0.25);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.15 + K.face.fx0, len = 0.2 + 0.12 * ((i * 7) % 3) / 2, h = K.hit(V(x, yTop - len / 2, 5), V(0, 0, -1)); if (!h) continue;
    const m = K.mesh(new THREE.CapsuleGeometry(0.022, len, 3, 6), '#6a5fb0', { to: gloom, basic: true, opacity: 0.7, ol: 0 }); m.position.copy(h.p).addScaledVector(h.n, 0.03);
  }
  const drops = [-1, 1, -1, 1].map((sx, i) => { const d = X.drop(C.sky, 0.13, g); d.userData = { sx, i }; return d; });
  return { frame(a) {
    const { k, env } = a;
    show(gloom, env);
    drops.forEach((d) => { const { sx, i } = d.userData, ph = fract(k * 1.4 + i * 0.25); d.position.set(X.inX(sx * (K.W * 0.7 + ph * 0.45), 0.1), K.T * 0.75 + Math.sin(ph * Math.PI) * 0.25 - ph * 0.2, 0.3); d.rotation.z = -sx * (0.4 + ph); show(d, env * (1 - sstep(0.7, 1, ph))); });
    return { expr: 'surprised', pr: 0.32, sy: 1.08, dx: Math.sin(k * 55) * 1.5 * env, squash: Math.abs(Math.sin(k * 27)) * 0.03, dy: -bump(k % 2.8, 0, 0.35) * 6 };
  } };
});

act('proud', 'mood', 'proud', { dur: 3.2, key: 0.85 }, (K, X) => {
  // chin up, eyes closed; a burst of light behind and a confetti pop
  const back = K.back('fixed'), g = K.fx();
  const rays = new THREE.Group(); back.add(rays); rays.position.set(0, K.face.ey + 0.1, -1.1);
  rays.userData.noFit = true; // a burst of light behind, meant to run off the frame: not part of the phone's footprint
  for (let i = 0; i < 14; i++) { const m = K.mesh(new THREE.CircleGeometry(2.4, 3, -0.07, 0.14), i % 2 ? '#ffe9a3' : '#fff4cf', { to: rays, basic: true, ol: 0 }); m.rotation.z = (i / 14) * TAU; }
  const COLS = [K.accent, C.yellow, C.pink, '#7fd6b0', C.blue];
  const bits = Array.from({ length: 22 }, (_, i) => { const m = K.mesh(new RoundedBoxGeometry(0.1, 0.05, 0.015, 1, 0.006), COLS[i % COLS.length], { to: g, ol: 0.01 }); m.userData = { vx: (i % 2 ? 1 : -1) * (0.6 + hash(i) * 1.3), vy: 0.9 + hash(i + 9) * 0.9, spin: (hash(i + 3) - 0.5) * 14 }; return m; });
  return { frame(a) {
    const { env } = a, k = a.hold ? a.k % 3.2 : a.k;
    show(rays, env * pop(a.k, 0, 0.5)); rays.rotation.z = a.k * 0.25;
    bits.forEach((m) => { const { vx, vy, spin } = m.userData, t = Math.max(0, k - 0.1); m.position.set(X.inX(vx * t * 0.8, 0.06, 0.4), Math.min(Math.max(K.T, K.top - 0.1), X.top(0.4, 0.55)) + vy * t - 1.6 * t * t, 0.4); m.rotation.set(t * spin * 0.5, t * spin * 0.3, t * spin); show(m, env * (t > 0 ? 1 : 0) * (1 - sstep(1.6, 2.2, t))); });
    return { expr: 'proud', breathe: 0.04 * env, dy: -4 };
  } };
});

// ================================================================ scene: the cogs ================================================================

// product: the desk that slides in while working (the reference's 'desk' scene act) is not ported: sidevoice-web#476.

// Gear outline: n chunky teeth with flat, rounded tips (the bevel rounds them more), a tooth centred at angle 0.
// m is the tooth size: gears with the same m mesh at a centre distance of the sum of their pitch radii (m·n/2).
function gearPts(n, m) {
  const rp = (m * n) / 2, ra = rp + m * 0.95, rd = rp - m * 1.05, N = n * 18, pts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU, u = Math.abs(fract((a / TAU) * n + 0.5) - 0.5), r = rd + (ra - rd) * (1 - sstep(0.14, 0.3, u)); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return pts;
}
// A cluster of meshing gears in a group's local xy plane: [teeth, colour, material opts] each, the second meshing the
// first at angle a1. spin(angle): counter-rotation at matched speeds (∝ 1/teeth), with a phase offset so a tooth
// always meets a gap; box: its extent.
function gearCluster(X, to, specs, m, a1, o = {}) {
  const rp = specs.map(([n]) => (m * n) / 2), n = specs.map(([k]) => k), ra = rp.map((r) => r + m);
  const at = [V(0, 0, 0), V(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(rp[0] + rp[1])];
  const c1 = (a1 * n[0] + (a1 + Math.PI) * n[1] - Math.PI) / n[1];
  const gears = specs.map(([k, col, mo], i) => { const g3 = X.glyph(gearPts(k, m), col, { to, depth: o.depth ?? 0.063, bevel: o.bevel ?? 0.022, holes: [SH.circle(rp[i] * 0.3, 24)], ol: o.ol ?? 0.02, ...mo }); g3.position.copy(at[i]); g3.position.z = i * 0.01; return g3; });
  const spin = (ang) => { gears[0].rotation.z = ang; gears[1].rotation.z = -ang * n[0] / n[1] + c1; };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  at.forEach((q, i) => { minX = Math.min(minX, q.x - ra[i]); maxX = Math.max(maxX, q.x + ra[i]); minY = Math.min(minY, q.y - ra[i]); maxY = Math.max(maxY, q.y + ra[i]); });
  return { gears, at, ra, spin, box: { minX, maxX, minY, maxY } };
}

// The busy cue (the product's cog pair, in every working style): the same pair of toon gears, the same size on every
// creature, on top: over the head and whatever it wears, at its right, and never over the head or the face. With no
// room above (a tall hat), beside the top of the hat, still above the head. Inside the frame. They turn against each
// other at matched speeds, bob a little and now and then let off a puff.
act('cogs', 'scene', 'cogs', { key: 0.3 }, (K, X) => {
  const g = K.back(), inner = new THREE.Group(), sc = 0.66; g.add(inner); inner.scale.setScalar(sc);
  const C2 = gearCluster(X, inner, [[10, C.steel, { metal: 1 }], [7, K.accent, {}]], 0.052, 0.5);
  const { minX, maxX, minY, maxY } = C2.box, cw = (maxX - minX) * sc, ch = (maxY - minY) * sc, B = K.box, z0 = 0;
  const xr = xAt(0.9, z0), yt = X.top(z0, 0.05), bx = Math.max(B.max.x, -B.min.x) * 1.1; // the silhouette, a little wider (perspective)
  let x0, y0;
  if (B.max.y + 0.08 + ch <= yt) { x0 = Math.min(Math.max(0.05, bx * 0.35), xr - cw); y0 = B.max.y + 0.08; } // above it
  else { x0 = Math.min(bx + 0.06, xr - cw); y0 = Math.max(yt - ch, K.T + 0.05); } // beside the hat's top, above the head
  const cx = x0 - minX * sc, cy = y0 - minY * sc;
  const puff = X.puff(C.white, 0.5, K.fx());
  return { frame(a) {
    const { k } = a;
    C2.spin(-k * 1.5);
    g.position.set(cx, cy + Math.sin(k * 2.4) * 0.02, z0); inner.rotation.z = Math.sin(k * 1.2) * 0.04;
    const ph = fract(k / 2.6), p1 = C2.at[1]; puff.position.set(cx + (p1.x + 0.05 + ph * 0.1) * sc, cy + (p1.y + C2.ra[1] + ph * 0.4) * sc, z0 + 0.1); show(puff, a.still ? 0 : ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) * 0.9 : 0);
    show(g, a.still ? 1 : backOut(k / 0.4));
  } };
});

// ================================================================ working ================================================================
// The props are the same size on every creature, keep the front composition the product had, are proper volumes
// (thickness, bevels, the ink outline) and turn with the creature (the whole group turns as one); the eyes look at
// the point being worked on (K.gaze).

// Shared: the floor or the desk top under a prop, and the depth in front that keeps it inside the frame.
// side(K, w): the x of a prop w wide standing beside the body, as far out as the frame allows
const side = (K, w) => Math.min(1.33 - w / 2, K.W + 0.16 + w / 2);
const ground = (K, X, o) => (o.desk ? X.deskY : K.minY);
const inFrame = (obj, p) => { obj.updateMatrix(); return p.clone().applyMatrix4(obj.matrix); }; // a point in obj's space → its parent's
// the depth (from z0 forward) at which a point at height y, x shows under screen height s; a prop slides forward until
// its top is clear of the eyes
const clearAt = (y, s, z0, z1 = 1.6) => { let z = z0; while (z < z1 && sy(y, z) > s) z += 0.04; return Math.min(z, z1); };

// ---------- props beside the creature on the floor, clear of its silhouette as the creator's camera sees it ----------
// silOf: per screen row, how far out the creature reaches (body, eyes, ears, hats); besideFloor: the nearest spot on
// one side, on the floor, where a prop group (built round its own origin) stands clear of that silhouette and inside
// the frame, coming a little forward when the creature is wide (lower on screen, where bodies narrow). Sizes stay.
const silCache = new WeakMap();
function silOf(K) {
  if (silCache.has(K.body)) return silCache.get(K.body);
  const P = K.pts(), N = 64, xs = new Float32Array(N), v = V();
  for (let i = 0; i < P.length; i += 3) { v.set(P[i], P[i + 1], P[i + 2]).project(cam); const b = Math.floor(((v.y + 1) / 2) * N); if (b >= 0 && b < N) xs[b] = Math.max(xs[b], Math.abs(v.x)); }
  const r = { N, xs }; silCache.set(K.body, r); return r;
}
function localBox(g) {
  g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), m = new THREE.Matrix4(), b = new THREE.Box3();
  g.traverse((o) => { if (!o.isMesh || o.userData.outline || !o.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); });
  return b;
}
function besideFloor(K, g, sx, y0, B = localBox(g)) {
  const S = silOf(K), q = V();
  const test = (x, z) => {
    let x0 = Infinity, x1 = -Infinity, y0n = Infinity, y1n = -Infinity;
    for (const bx of [B.min.x, B.max.x]) for (const by of [B.min.y, B.max.y]) for (const bz of [B.min.z, B.max.z]) { q.set(x + bx, y0 + by, z + bz).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0n = Math.min(y0n, q.y); y1n = Math.max(y1n, q.y); }
    const b0 = Math.max(0, Math.floor(((y0n + 1) / 2) * S.N) - 1), b1 = Math.min(S.N - 1, Math.floor(((y1n + 1) / 2) * S.N) + 1);
    let sil = 0; for (let b = b0; b <= b1; b++) sil = Math.max(sil, S.xs[b]);
    return { gap: (sx > 0 ? x0 : -x1) - sil, outer: sx > 0 ? x1 : -x0, top: y1n, bottom: y0n };
  };
  let best = null;
  for (let z = 0.45; z <= 1.75; z += 0.05) for (let x = 0; x <= 2.4; x += 0.02) {
    const r = test(sx * x, z);
    if (r.outer > (B.margin || 0.92) || r.top > 0.92 || r.bottom < -0.97) break;
    if (r.gap >= 0.03) { g.position.set(sx * x, y0, z); return g.position; }
    if (!best || r.gap > best.gap) best = { gap: r.gap, x: sx * x, z };
  }
  g.position.set(best ? best.x : sx * 1.1, y0, best ? best.z : 0.9); // no clear spot: the least overlap
  return g.position;
}
// a point in a prop's space (child of g, g unrotated) → the fixed frame
const toFixed = (g, child, p) => inFrame(g, child === g ? p.clone() : inFrame(child, p));

// The laptop: aluminium, slim, rounded, the hinge at its far edge from the creature, so the lid's back faces us with
// the Sidevoice mark. (It evokes a MacBook with no Apple branding: our mark sits where a logo would.) One size for
// every creature.
const MARK = [[1.5, 9, 3, 6, '#4a2f6b'], [6, 6, 3, 12, '#4a2f6b'], [10.5, 1.5, 3, 21, '#4a2f6b'], [15, 6, 3, 12, '#e0a82e'], [19.5, 9, 3, 6, '#4a2f6b']]; // brand-resources/logo/mark/sidevoice-mark.svg (24×24, rx 1.5)
function markTex(K) { return K.canvasTex(256, 256, (g) => { const s = 256 / 24; for (const [x, y, w, h, c] of MARK) { g.fillStyle = c; g.beginPath(); g.roundRect(x * s, y * s, w * s, h * s, 1.5 * s); g.fill(); } }); }
const LAP = { lidH: 0.6, w: 1.08, tilt: 0.26 };
const screenTex = (K) => K.canvasTex(320, 200, (g) => { g.fillStyle = '#d9f6ff'; g.fillRect(0, 0, 320, 200); const cols = ['#4a2f6b', '#2a9d8f', '#e0a82e', '#5a7bd8']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; g.fillRect(24 + (i % 3) * 18, 20 + i * 21, 90 + ((i * 53) % 150), 9); } });
const haloTex = (K) => K.canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
function laptop(K, X, o, y0, z) {
  const g = new THREE.Group(); K.group(o.to || 'fixed').add(g); g.position.set(0, y0, z);
  const { lidH, w, tilt } = LAP, d = w * 0.64;
  K.mesh(new RoundedBoxGeometry(w, 0.06, d, 4, 0.026), C.silver, { to: g, pos: [0, 0.03, 0], cast: true, metal: 1 });
  K.mesh(new RoundedBoxGeometry(w * 0.86, 0.012, d * 0.5, 2, 0.005), '#3a3f4a', { to: g, pos: [0, 0.064, -d * 0.12], ol: 0 }); // the keys, toward the creature
  const hinge = new THREE.Group(); hinge.position.set(0, 0.06, d / 2 - 0.025); hinge.rotation.x = tilt; g.add(hinge);
  K.mesh(new RoundedBoxGeometry(w, lidH, 0.045, 4, 0.021), C.silver, { to: hinge, pos: [0, lidH / 2, 0], cast: true, metal: 1 });
  K.mesh(new RoundedBoxGeometry(w * 0.94, lidH * 0.9, 0.006, 2, 0.003), '#1d2230', { to: hinge, pos: [0, lidH / 2, -0.024], ol: 0 }); // the bezel
  // the screen, lit, toward the creature (code on a pale glowing ground), and its light: a soft additive glow
  const scr = K.mesh(new THREE.PlaneGeometry(w * 0.86, lidH * 0.8), K.own(new THREE.MeshBasicMaterial({ map: screenTex(K) })), { to: hinge, pos: [0, lidH / 2, -0.028], rot: [0, Math.PI, 0], ol: 0 });
  const halo = new THREE.Sprite(K.own(new THREE.SpriteMaterial({ map: haloTex(K), color: '#bff6ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
  halo.scale.set(w * 1.5, lidH * 1.4, 1); halo.position.set(0, lidH / 2, -0.12); hinge.add(halo);
  K.mesh(new THREE.PlaneGeometry(0.24 * lidH, 0.24 * lidH), K.own(new THREE.MeshBasicMaterial({ map: markTex(K), transparent: true })), { to: hinge, pos: [0, lidH * 0.52, 0.024], ol: 0 });
  const glow = K.mesh(new THREE.CircleGeometry(1, 32, 0, Math.PI), '#bff6ff', { to: hinge, basic: true, opacity: 0.4, ol: 0, pos: [0, lidH + 0.005, -0.035] }); glow.scale.set(w * 0.48, 0.13, 1);
  const screen = (x = 0, y = 0.55) => inFrame(g, inFrame(hinge, V(x * w * 0.4, lidH * y, -0.03)));
  return { g, hinge, glow, halo, scr, lidTop: y0 + 0.06 + lidH * Math.cos(tilt), d, w, screen };
}

// The screen's light on the creature: a copy of its body (in the creature's own space) lit additively by a soft cyan
// light from the screen's centre, falling off with distance and facing, so the face and body glow where they face
// the screen. Drawn with depth (back()), so the eyes and whatever stands in front cover it; it turns with the body.
function screenGlow(K) {
  const geo = K.body.geometry.clone(), g = K.back('head');
  const m = K.own(new THREE.ShaderMaterial({
    uniforms: { uS: { value: V() }, uC: { value: new THREE.Color('#9fe8ff') }, uK: { value: 0.5 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.004, 1.0); }',
    fragmentShader: 'uniform vec3 uS; uniform vec3 uC; uniform float uK; varying vec3 vP; varying vec3 vN; void main() { vec3 d = uS - vP; float l = length(d); float f = max(dot(normalize(vN), d / l), 0.0); float a = uK * f * f / (1.0 + l * l * 2.5); gl_FragColor = vec4(uC * a, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  const mesh = new THREE.Mesh(geo, m); g.add(mesh);
  // at: the screen's centre in the fixed frame; carried into the creature's own space each frame
  const w = V();
  return (at, k) => { at.parent.updateMatrixWorld(true); w.copy(at.p); at.parent.localToWorld(w); K.body.parent.worldToLocal(w); m.uniforms.uS.value.copy(w); m.uniforms.uK.value = 0.45 + 0.08 * Math.sin(k * 9) + 0.04 * Math.sin(k * 23); };
}

act('work-type', 'work', 'type', { key: 0.8 }, (K, X, o) => {
  // the laptop in front, the creature peeking over the lid at the screen; the screen is on: its light falls on the
  // creature's face and body, and bits of code fly out
  const y = ground(K, X, o), top = y + 0.06 + LAP.lidH * Math.cos(LAP.tilt);
  const z = o.desk ? X.deskZ + 0.28 : clearAt(top, X.sEye - 0.015, Math.min(1.2, X.before(y + 0.2, 0, 0.55)) + LAP.w * 0.32 - 0.25) - LAP.w * 0.32 + 0.25;
  const lap = laptop(K, X, o, y, z);
  const glow = screenGlow(K), gl = { parent: lap.g.parent, p: V() };
  const g = K.fx('fixed');
  const bits = [['</>', -1], ['{ }', 1], [';', -1], ['#', 1]].map(([t, sx], i) => { const m = X.sticker(t, { size: 0.22, color: i % 2 ? C.yellow : '#bff6ff', to: g }); m.userData = { sx, i }; return m; });
  return { frame(a) {
    const { k } = a;
    lap.glow.material.opacity = 0.32 + 0.12 * Math.sin(k * 9); lap.halo.material.opacity = 0.45 + 0.1 * Math.sin(k * 9);
    gl.p.copy(lap.screen(0, 0.5)); glow(gl, k);
    bits.forEach((m) => { const { sx, i } = m.userData, ph = fract(k * 0.55 + i * 0.25); m.position.set(sx * (lap.w * 0.4 + ph * 0.5), lap.lidTop + 0.05 + ph * 0.42 + Math.sin(ph * Math.PI) * 0.1, z + 0.1); m.rotation.z = -sx * ph * 0.4; show(m, pop(ph, 0, 0.15) * (1 - sstep(0.75, 1, ph))); });
    return { expr: 'neutral', ...K.gaze(lap.screen(Math.sin(k * 1.7) * 0.7, 0.62)), lid: 0, dy: -Math.abs(Math.sin(k * 13)) * 1.2 };
  } };
});

// a book page: cream with lines (one texture), on a plane laid just above the page block (no z-fighting)
const pageTex = (K) => K.canvasTex(256, 320, (g) => { g.fillStyle = '#fbf6e8'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#b9ae99'; for (let i = 0; i < 9; i++) g.fillRect(28, 34 + i * 30, i === 8 ? 110 : 200, 7); });

// Reading a book is a pastime now (operator, T15: "reading a book, relaxing"): rest-read. An open hardback, bigger than
// the laptop, lying open on the floor in front of the lower body (as on a lap), tipped toward us: the pages face up, so
// both we and the creature see them. It reads slowly, as real reading goes: along a line, a flick back, the next line;
// three lines a page, its left page (our right) then its right page (our left), each line from our right to our left;
// then a page lifts at the spine and turns over, between the covers. Nothing flies off. The lines it reads keep to the
// middle of each page, so the eyes stay on the book.
act('rest-read', 'rest', 'read', { key: 2.2 }, (K, X) => {
  const y = ground(K, X, {}), g = K.group('fixed');
  const pw = 0.56, ph = 0.64, th = 0.06, al = 0.2, accent = K.accent;
  // placed by each creature's own eyes, the same on every body (operator, 2026-11-04: on the floor it sat high on some,
  // low on others): its top a margin under the eyes on screen. It lies back as far as it needs (a: 0 upright, π/2 flat)
  // before it comes forward; where the eyes sit high (tall bodies) it is lifted off the floor, held at the lap, so it is
  // never far below them. Its size is the same for all.
  const T = X.sEye - 0.12, L = ph + 0.06, z0 = Math.max(0.34, X.before(y + 0.12, 0, 0.06));
  const top = (a, lift, z) => sy(y + 0.04 + lift + L * Math.cos(a), z + L * Math.sin(a));
  let a = 0.95, z = z0, lift = 0;
  while (a < 1.3 && top(a, 0, z) > T) a += 0.05;
  while (z < 1.6 && top(a, 0, z) > T) z += 0.04;
  while (lift < 0.2 && top(a, lift + 0.02, z) < T - 0.14) lift += 0.02;
  // as the creature holds it (T20): the pages face it, up and back toward its eyes; from the front we see the covers in a
  // V, the spine toward us, and the turning page rising over them
  const n = V(0, Math.sin(a), -Math.cos(a)), u = V(0, Math.cos(a), Math.sin(a)); // the pages' normal (toward the creature); the page's 'up'
  const stand = new THREE.Group(); g.add(stand); stand.position.set(0, y + 0.04 + lift, z); // resting at the lap, held by itself
  const book = new THREE.Group(); stand.add(book); book.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), u, n));
  const inner = new THREE.Group(); book.add(inner); inner.position.y = ph / 2 + 0.03;
  const tex = pageTex(K), pageMat = () => K.own(new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const halves = [-1, 1].map((sx) => {
    const h = new THREE.Group(); h.rotation.y = sx > 0 ? -al : al; inner.add(h);
    K.mesh(new RoundedBoxGeometry(pw + 0.04, ph + 0.06, 0.035, 3, 0.014), accent, { to: h, pos: [sx * (pw + 0.04) / 2, 0, -0.017], cast: true });
    K.mesh(new RoundedBoxGeometry(pw, ph, th, 2, 0.012), '#fbf6e8', { to: h, pos: [sx * (pw / 2 + 0.008), 0, th / 2], ol: 0.012 });
    K.mesh(new THREE.PlaneGeometry(pw - 0.04, ph - 0.04), pageMat(), { to: h, pos: [sx * (pw / 2 + 0.008), 0, th + 0.002], ol: 0 }).scale.x = sx;
    return h;
  });
  K.mesh(new THREE.CylinderGeometry(0.05, 0.05, ph + 0.06, 16, 1, false, Math.PI / 2, Math.PI), accent, { to: inner, pos: [0, 0, -0.014], cast: true }); // the spine, under the pages
  const hinge = new THREE.Group(); hinge.position.set(0, 0, th * Math.cos(al) + 0.008); inner.add(hinge);
  const leaf = new THREE.Group(); hinge.add(leaf);
  K.mesh(new THREE.BoxGeometry(pw - 0.02, ph - 0.02, 0.006), '#fbf6e8', { to: leaf, pos: [pw / 2, 0, 0], ol: 0 });
  K.mesh(new THREE.PlaneGeometry(pw - 0.05, ph - 0.05), pageMat(), { to: leaf, pos: [pw / 2, 0, 0.0035], ol: 0 });
  // a point on a page line, as we see the book: side -1 our left page, +1 our right; uu 0..1 along the line's middle
  // stretch; line 0..2 from the top of the page (as the creature sees it) down
  const onPage = (side, uu, line) => { const a = 0.16, b = pw - 0.14, wx = side < 0 ? -(b) + uu * (b - a) : a + uu * (b - a); return inFrame(stand, inFrame(book, inFrame(inner, inFrame(halves[side < 0 ? 1 : 0], V(-wx, 0.16 - line * 0.13, th))))); };
  const LINE = 1.6, RET = 0.24, PAGE = 3 * LINE, TURN = 1.1, CYC = 2 * PAGE + TURN;
  return { frame(a) {
    const { k } = a, t = k - Math.floor(k / CYC) * CYC, tt = (t - 2 * PAGE) / TURN;
    // the page turns from our left page over to our right (the creature's right to its left, as a reader turns it)
    hinge.rotation.y = -al - (Math.PI - 2 * al) * sstep(0, 1, tt); leaf.visible = tt > 0 && tt < 1;
    let p;
    if (tt >= 0) p = onPage(1, 0.8, 0.6); // during the turn: back to the top of its left page (our right)
    else { const side = t < PAGE ? 1 : -1, tp = t - (t < PAGE ? 0 : PAGE), line = Math.min(2, Math.floor(tp / LINE)), w = tp - line * LINE, uu = w < LINE - RET ? w / (LINE - RET) : 1 - (w - (LINE - RET)) / RET; p = onPage(side, 1 - uu, line); }
    return { expr: 'neutral', ...K.gaze(p), lid: 0.1 }; // relaxed: the lids a touch lower (no happy lower lid: it shows a patch)
  } };
});

// a sheet of a file or a doc: a title bar in the accent, then lines (code-ish indents), on one texture
const sheetTex = (K, accent) => K.canvasTex(256, 330, (g) => { g.fillStyle = '#fdfbf5'; g.fillRect(0, 0, 256, 330); g.fillStyle = accent; g.fillRect(24, 26, 120, 14); g.fillStyle = '#b9b2a6'; [[24, 190], [24, 160], [44, 150], [44, 120], [24, 180], [44, 130], [24, 100], [24, 170]].forEach(([x, w], i) => g.fillRect(x, 64 + i * 30, w, 8)); });

act('work-files', 'work', 'files', { key: 2.0 }, (K, X, o) => {
  // reading files or docs (operator, T16): a stack of papers beside the creature on one side, an empty-ish pile on the
  // other. The top sheet hops (low, never across the eyes) into its hold in front of it, facing it as it reads (we see the
  // back, the lines faintly showing through), its top kept below the eyes; the eyes run along its lines; then the sheet hops on over to the other pile, and the
  // next one comes. Hands-free: the sheets hop by themselves. Sizes are fixed for every creature.
  const y = ground(K, X, o), SW = 0.64, SH = 0.82, ST = 0.014, GAP = 0.007, N = 11, a = 0.78;
  const tex = sheetTex(K, K.accent), mat = () => K.own(new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const back = K.own(new THREE.MeshBasicMaterial({ map: K.canvasTex(256, 330, (g) => { g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, 256, 330); g.fillStyle = '#e4ddcf'; [[42, 190], [42, 160], [62, 150], [62, 120], [42, 180], [62, 130], [42, 100], [42, 170]].forEach(([x, w], i) => g.fillRect(256 - x - w, 64 + i * 30, w, 8)); g.fillStyle = '#ece4d6'; g.fillRect(112, 26, 120, 14); }), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const sheet = (to, face = true) => { const s = new THREE.Group(); to.add(s); K.mesh(new RoundedBoxGeometry(SW, ST, SH, 1, 0.004), '#fdfbf5', { to: s, ol: 0.012, cast: true }); if (face) { K.mesh(new THREE.PlaneGeometry(SW - 0.03, SH - 0.03), mat(), { to: s, pos: [0, ST / 2 + 0.001, 0], rot: [-Math.PI / 2, 0, 0], ol: 0 }); K.mesh(new THREE.PlaneGeometry(SW - 0.03, SH - 0.03), back, { to: s, pos: [0, -ST / 2 - 0.001, 0], rot: [Math.PI / 2, 0, 0], ol: 0 }); } return s; }; // the back: the lines showing through, faint
  // the two piles, beside the floor on each side, clear of the creature
  const piles = [-1, 1].map((sx) => {
    const g = K.group('fixed'); const st = new THREE.Group(); g.add(st);
    K.mesh(new RoundedBoxGeometry(SW + 0.06, 0.03, SH + 0.05, 2, 0.01), K.accent, { to: st, pos: [0, 0.015, 0], cast: true }); // a folder under each pile
    for (let i = 0; i < N; i++) { const s = sheet(st, i === N - 1); s.position.set((hash(i + sx * 7) - 0.5) * 0.04, 0.03 + ST / 2 + i * (ST + GAP), (hash(i * 5 + sx) - 0.5) * 0.03); s.rotation.y = (hash(i * 3 + sx) - 0.5) * 0.22; }
    if (o.desk) g.position.set(sx * side(K, SW), y, X.deskZ + 0.2); else { besideFloor(K, g, sx, y); g.position.x = sx * Math.min(1.33 - SW / 2, Math.abs(g.position.x) + 0.1); } // a clear gap from the body (T20)
    return { g, top: () => inFrame(g, V(0, 0.03 + ST / 2 + N * (ST + GAP), 0)) };
  });
  // the reading spot: in front of the lower body, a little above the floor, tipped toward us
  const sy0 = y + 0.3, z = o.desk ? X.deskZ + 0.2 : clearAt(sy0 + (SH / 2) * Math.cos(a), X.sEye - 0.02, Math.max(0.36, X.before(y + 0.15, 0, 0.08))), spot = V(0, sy0, z); // forward until its top is clear of the eyes
  const fly = sheet(K.group('fixed'));
  const LINES = 4, LINE = 1.2, RET = 0.2, HOP = 0.7, READ = LINES * LINE, CYC = HOP + READ + HOP + 0.4;
  // the sheet at the reading spot, as the creature holds it (T20): its face toward the creature, up and back toward its
  // eyes, the text upright for it; from the front we see its back, the lines faintly showing through
  const nS = V(0, Math.sin(a), -Math.cos(a)), uS = V(0, Math.cos(a), Math.sin(a));
  const qFlat = new THREE.Quaternion(), qRead = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), nS, uS.clone().negate())), qTmp = new THREE.Quaternion();
  const onSheet = (uu, line) => inFrame(fly, V((0.5 - uu) * (SW - 0.14), ST / 2, -SH / 2 + 0.17 + line * 0.1));
  const arc = (p0, p1, f, h) => p0.clone().lerp(p1, f).add(V(0, Math.sin(f * Math.PI) * h, Math.sin(f * Math.PI) * 0.3)); // low and forward: it never crosses the eyes
  return { frame(a) {
    const { k } = a, t = k - Math.floor(k / CYC) * CYC, from = piles[0].top(), to = piles[1].top();
    let look;
    if (t < HOP) { // off the left pile, over into view: a hop with a half flip that lands it face up, tipped
      const f = sstep(0, 1, t / HOP); fly.position.copy(arc(from, spot, f, 0.22)); qTmp.copy(qFlat).slerp(qRead, f); fly.quaternion.copy(qTmp); fly.rotateZ(Math.sin(f * Math.PI) * 0.6);
      look = fly.position.clone();
    } else if (t < HOP + READ) { // reading: along a line, a flick back, the next line; a gentle bob
      const tr = t - HOP, line = Math.min(LINES - 1, Math.floor(tr / LINE)), w = tr - line * LINE, uu = w < LINE - RET ? w / (LINE - RET) : 1 - (w - (LINE - RET)) / RET;
      fly.position.copy(spot).add(V(0, Math.sin(k * 2.1) * 0.012, 0)); fly.quaternion.copy(qRead);
      look = onSheet(1 - uu, line);
    } else { // onto the other pile
      const f = sstep(0, 1, Math.min(1, (t - HOP - READ) / HOP)); fly.position.copy(arc(spot, to, f, 0.2)); qTmp.copy(qRead).slerp(qFlat, f); fly.quaternion.copy(qTmp); fly.rotateZ(-Math.sin(f * Math.PI) * 0.6);
      look = t - HOP - READ < HOP ? fly.position.clone() : to.clone();
    }
    fly.visible = t < HOP + READ + HOP;
    return { expr: 'neutral', ...K.gaze(look), lid: 0, dy: t < HOP || (t > HOP + READ && t < HOP + READ + HOP) ? -2 : 0 };
  } };
});

act('work-think', 'work', 'think', { key: 1.6 }, (K, X) => {
  // thinking (the agent reasons before it acts): a thought cloud over the head, on the side away from the cogs, fed by
  // three little rising puffs; inside it the "…" dots pulse in turn, and now and then an idea pops: a light bulb. The
  // eyes look up toward the cloud, the head tilts a little. Nothing on the floor: thinking is the work.
  const f = K.fx(), z = 0.25;
  // a size smaller, off to one side and over the highest point (hats and ears included), so it never meets a hat
  // (operator, 2026-11-04); only where a tall hat leaves no room over it, beside the head; always inside the frame
  const S = 1.3, hw = 0.55 * S, hh = 0.26 * S, B = K.box, bx = Math.max(B.max.x, -B.min.x) * 1.1, yt = X.top(z, hh);
  let cx, cy;
  if (B.max.y + 0.12 + hh * 0.5 <= yt) { cx = X.inX(-(K.W * 0.5 + hw * 0.6), hw, z); cy = B.max.y + 0.12 + hh * 0.5; }
  else { cx = X.inX(-(bx + hw * 0.75), hw, z); cy = Math.max(yt - hh * 0.2, K.T); }
  const cloud = X.cloud(C.white, S, { to: f }); cloud.position.set(cx, cy, z);
  const start = V(-K.W * 0.42, K.T - 0.02, z), end = V(cx + hw * 0.35, cy - hh * 0.9, z);
  const trail = [0.08, 0.11, 0.14].map((r, i) => { const m = K.mesh(blob(r, r * 0.92, r * 0.8, 18, 12), C.white, { to: f, ol: 0.016 }); m.position.copy(start).lerp(end, 0.15 + i * 0.32); return m; });
  const dots = [-1, 0, 1].map((i) => K.mesh(blob(0.04, 0.04, 0.03, 14, 10), C.ink, { to: cloud, pos: [i * 0.13, 0.02, 0.36], ol: 0, basic: true })); // in front of the cloud's lobes
  // the idea: a little bulb (glass, a screw base, a glow ring of short rays), in the cloud in place of the dots (operator,
  // 2026-11-04: apart from it, it read as misplaced)
  const bulb = new THREE.Group(); cloud.add(bulb); bulb.position.set(0, 0.0, 0.36);
  K.mesh(blob(0.11, 0.12, 0.1, 20, 14), C.yellow, { to: bulb, pos: [0, 0.04, 0], ol: 0.014 });
  K.mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 14), C.steel, { to: bulb, pos: [0, -0.1, 0], ol: 0.012 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.mesh(new RoundedBoxGeometry(0.02, 0.07, 0.02, 1, 0.008), C.yellow, { to: bulb, pos: [Math.cos(a) * 0.2, 0.04 + Math.sin(a) * 0.2, 0], rot: [0, 0, a - Math.PI / 2], ol: 0.008 }); }
  const target = V(cx, cy, z);
  return { frame(a) {
    const { k } = a, IDEA = 6.5, ph = fract(k / IDEA) * IDEA, idea = ph > 4.6 ? pop(ph, 4.6, 0.35) * (1 - sstep(6.1, 6.5, ph)) : 0;
    show(cloud, a.still ? 1 : pop(k, 0.25, 0.4)); cloud.position.y = cy + Math.sin(k * 1.6) * 0.025;
    trail.forEach((m, i) => show(m, a.still ? 1 : pop(k, i * 0.12, 0.3) * (0.85 + 0.15 * Math.sin(k * 3 - i))));
    dots.forEach((d, i) => { const b = bump(fract(k / 1.2) * 1.2, i * 0.25, 0.5); d.position.y = 0.02 + b * 0.05; show(d, (1 - idea) * (0.85 + b * 0.25)); });
    show(bulb, idea * 0.95); bulb.rotation.z = Math.sin(k * 5) * 0.08 * idea;
    // eyes up at the cloud, a slow drift as if turning the thought over; brighter when the idea comes
    const g = K.gaze(target);
    return { expr: idea > 0.5 ? 'happy' : 'neutral', gx: g.gx + Math.sin(k * 0.7) * 0.08, gy: g.gy, lid: 0, tilt: -4 + Math.sin(k * 0.9) * 2, dy: -idea * 3 };
  } };
});

act('work-hammer', 'work', 'hammer', { key: 0.98 }, (K, X, o) => {
  // an anvil on a stump beside the creature on the floor (clear of it); a hammer swings by itself onto it: the face
  // lands exactly on the anvil's top face and bounces up a little, the body slams down on every hit, sparks fly
  // from the contact, nails jump off and gather in front of the anvil
  const y = ground(K, X, o), g = K.group('fixed'), sc = 0.9;
  const anvil = new THREE.Group(); g.add(anvil); anvil.scale.setScalar(sc);
  const prof = [[-0.24, 0.0], [0.17, 0.0], [0.17, 0.05], [0.09, 0.07], [0.06, 0.15], [0.14, 0.19], [0.33, 0.24], [0.33, 0.27], [-0.25, 0.27], [-0.25, 0.2], [-0.13, 0.15], [-0.1, 0.07], [-0.18, 0.05]];
  const lift = o.desk ? 0 : 0.12, bev = 0.03;
  K.mesh(puffy(prof.map(([px, py]) => [px * 1.15, py * 1.15]), 0.24, bev), C.iron, { to: anvil, pos: [0, lift, 0], cast: true, metal: 1 });
  if (!o.desk) K.mesh(new RoundedBoxGeometry(0.42, 0.12, 0.3, 2, 0.03), C.woodDk, { to: anvil, pos: [0, 0.06, 0], cast: true });
  const top = (lift + 0.27 * 1.15 + bev * 0.85) * sc, strike = V(-0.06, top, 0), hh = 0.26, L = 0.4, swing = 1.35;
  const pivot = V(strike.x + L, top + hh / 2, 0);
  const hammer = new THREE.Group(); g.add(hammer); hammer.position.copy(pivot); hammer.rotation.y = Math.PI;
  K.mesh(new THREE.CylinderGeometry(0.042, 0.047, L - 0.08, 12), '#d39a5c', { to: hammer, pos: [(L - 0.08) / 2, 0, 0], rot: [0, 0, Math.PI / 2], cast: true });
  K.mesh(new RoundedBoxGeometry(0.16, hh, 0.16, 3, 0.035), C.steel, { to: hammer, pos: [L, 0, 0], cast: true, metal: 1 });
  K.mesh(new RoundedBoxGeometry(0.18, 0.045, 0.18, 2, 0.018), '#8d96aa', { to: hammer, pos: [L, -hh / 2 + 0.0225, 0], ol: 0.012, metal: 1 }); // the striking face
  const nails = [0, 1, 2].map((i) => { const nl = new THREE.Group(); g.add(nl); nl.position.set(-0.05 + i * 0.11, 0.012, 0.25); nl.rotation.z = Math.PI / 2; K.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), C.steel, { to: nl, ol: 0.008 }); K.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 10), C.steel, { to: nl, pos: [0, 0.065, 0], ol: 0.008 }); return nl; });
  // stand it clear of the creature, measured with the hammer at the top of its swing
  hammer.rotation.z = swing; const B = localBox(g); hammer.rotation.z = 0;
  if (o.desk) g.position.set(side(K, B.max.x - B.min.x), y, X.deskZ + 0.3); else besideFloor(K, g, 1, y, B);
  const fx = K.fx('fixed'), star = X.glyph(starPts(0.15, 0.065, 8), '#fff6c2', { to: fx, depth: 0.03 });
  const sparks = [0, 1, 2, 3].map((i) => { const m = K.mesh(new THREE.CapsuleGeometry(0.017, 0.075, 3, 6), C.yellow, { to: fx, ol: 0 }); m.userData.a = 0.5 + i * 0.7; return m; });
  const strikeW = toFixed(g, g, strike);
  return { frame(a) {
    const { k } = a, cyc = 1.0, n = Math.floor(k / cyc), t = fract(k / cyc);
    const down = t < 0.62 ? sstep(0, 0.62, t) : t < 0.72 ? 1 - ((t - 0.62) / 0.1) ** 2 : 0;
    const bounce = t > 0.72 ? 0.16 * Math.abs(Math.sin(((t - 0.72) / 0.12) * Math.PI)) * Math.exp(-(t - 0.72) * 9) : 0;
    hammer.rotation.z = Math.max(0, down * swing + bounce);
    const hit = t > 0.72 ? Math.exp(-(t - 0.72) * 12) : 0;
    star.position.copy(strikeW).add(V(-0.1, 0.02, 0.12)); show(star, hit * 1.1); star.rotation.z = t * 2;
    sparks.forEach((s) => { const f = t > 0.72 ? (t - 0.72) / 0.28 : 0, a2 = s.userData.a; s.position.set(strikeW.x - 0.1 + Math.cos(a2) * f * 0.36, strikeW.y + 0.02 + Math.abs(Math.sin(a2)) * f * 0.3 - f * f * 0.12, strikeW.z + 0.12); s.rotation.z = a2 - Math.PI / 2; show(s, t > 0.72 ? 1 - f : 0); });
    nails.forEach((nl, i) => { const landed = (n % 6) > i * 2 || ((n % 6) === i * 2 && t > 0.95), jumping = (n % 6) === i * 2 && t > 0.72; const f = jumping ? (t - 0.72) / 0.28 : 1, tx = -0.05 + i * 0.11, tz = 0.25; nl.position.set(jumping ? strike.x + (tx - strike.x) * f : tx, jumping ? top + Math.sin(f * Math.PI) * 0.3 - top * f : 0.012, jumping ? tz * f : tz); nl.rotation.z = jumping ? f * 6 : Math.PI / 2; nl.visible = landed || jumping; });
    return { expr: 'neutral', ...K.gaze(strikeW), lid: 0, squash: hit * 0.1, dy: hit * 3 };
  } };
});

act('work-crank', 'work', 'crank', { key: 0.5 }, (K, X, o) => {
  // a little hand-cranked dynamo beside the creature on the floor (clear of it): its crank turns by itself, the bulb
  // on top glows with it; what pops out comes out of the machine: puffs from its little chimney, sparks off the bulb
  const y = ground(K, X, o), g = K.group('fixed'), sc = 1.0;
  const box = new THREE.Group(); g.add(box); box.scale.setScalar(sc); box.rotation.y = -0.22;
  K.mesh(new RoundedBoxGeometry(0.42, 0.36, 0.34, 4, 0.07), C.red, { to: box, pos: [0, 0.18, 0], cast: true });
  K.mesh(new RoundedBoxGeometry(0.3, 0.1, 0.03, 3, 0.012), '#ffffff', { to: box, pos: [0, 0.22, 0.17], ol: 0.008 });
  const needle = K.mesh(new THREE.CapsuleGeometry(0.008, 0.05, 2, 4), C.ink, { to: box, pos: [0, 0.2, 0.19], ol: 0 });
  K.mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.18, 10), C.iron, { to: box, pos: [0.04, 0.44, 0], ol: 0.008 });
  const bulb = K.mesh(blob(0.085, 0.1, 0.085, 20, 14), '#fff3b0', { to: box, pos: [0.04, 0.57, 0], emissive: '#fff3b0', ol: 0.014 });
  K.mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.14, 14), C.iron, { to: box, pos: [-0.13, 0.42, -0.06], ol: 0.01 }); // the chimney
  K.mesh(new THREE.TorusGeometry(0.042, 0.013, 8, 20), C.iron, { to: box, pos: [-0.13, 0.49, -0.06], rot: [Math.PI / 2, 0, 0], ol: 0.008 });
  const crank = new THREE.Group(); crank.position.set(0.23, 0.2, 0); crank.rotation.y = Math.PI / 2; box.add(crank);
  K.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 14), C.iron, { to: crank, rot: [Math.PI / 2, 0, 0], ol: 0.008 });
  const handle = new THREE.Group(); crank.add(handle);
  K.mesh(new RoundedBoxGeometry(0.05, 0.22, 0.035, 2, 0.014), C.steel, { to: handle, pos: [0, 0.09, 0.035], metal: 1 });
  K.mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.11, 14), C.woodDk, { to: handle, pos: [0, 0.18, 0.09], rot: [Math.PI / 2, 0, 0] });
  const Bc = localBox(g); Bc.margin = 0.84; // clear of the frame's edge, handle included
  if (o.desk) g.position.set(side(K, 0.42 * sc), y, X.deskZ + 0.3); else besideFloor(K, g, 1, y, Bc);
  const fxg = K.fx('fixed'), puffs = [0, 1, 2].map(() => X.puff(C.white, 0.5, fxg));
  const sparks = [0, 1, 2, 3].map((i) => { const m = K.mesh(new THREE.CapsuleGeometry(0.014, 0.06, 3, 6), C.yellow, { to: fxg, ol: 0 }); m.userData.a = (i / 4) * TAU + 0.4; return m; });
  const meter = toFixed(g, box, V(0, 0.22, 0.18)), chimney = toFixed(g, box, V(-0.13, 0.52, -0.06)), bulbW = toFixed(g, box, V(0.04, 0.6, 0));
  return { frame(a) {
    const { k } = a, sp = 5.2;
    handle.rotation.z = -k * sp;
    const glow = 0.6 + 0.4 * Math.abs(Math.sin(k * sp));
    bulb.material.uniforms && bulb.material.uniforms.uColor.value.set('#fff3b0').lerp(new THREE.Color('#ffe25a'), glow); needle.rotation.z = -0.8 + glow * 1.4;
    puffs.forEach((pf, i) => { const ph = fract(k * 0.8 + i / 3); pf.position.copy(chimney).add(V(Math.sin(ph * 4 + i) * 0.06, ph * 0.55, 0)); show(pf, a.still && i ? 0 : Math.sin(ph * Math.PI) * (0.6 + ph * 0.5)); });
    const sp2 = fract(k / 1.2); sparks.forEach((s) => { const f = sp2 / 0.35, a2 = s.userData.a; s.position.copy(bulbW).add(V(Math.cos(a2) * f * 0.2, Math.sin(a2) * f * 0.2 + 0.04, 0.05)); s.rotation.z = a2 - Math.PI / 2; show(s, f < 1 ? 1 - f : 0); });
    return { expr: 'neutral', ...K.gaze(meter), lid: 0, squash: Math.abs(Math.sin(k * sp)) * 0.04, tilt: Math.sin(k * sp) * 3 };
  } };
});

// product: the shell terminals (the reference's shell-read, -edit, -run, -search) and the desk's own working style
// (work-desk) are not ported: neither is a decided look (sidevoice-web#476).

// ================================================================ resting (pastimes) ================================================================

act('rest-stretch', 'rest', 'stretch', { dur: 3.2, key: 1.1 }, (K, X) => {
  // a big yawning stretch, up tall, then a wiggle and settle (once)
  const g = K.fx();
  const marks = [-1, 1].map((sx) => { const m = K.mesh(tube(new THREE.CatmullRomCurve3([V(0, -0.2, 0), V(sx * 0.07, 0, 0), V(0, 0.2, 0)]), () => 0.022, 16, 6), C.ink, { to: g, ol: 0 }); m.position.set(sx * (K.W + 0.15), K.face.ey + 0.25, 0.3); return m; });
  return { frame(a) {
    const { k } = a, up = sstep(0.1, 0.9, k) * (1 - sstep(1.6, 2.1, k)), wig = k > 1.9 ? Math.sin((k - 1.9) * 16) * Math.exp(-(k - 1.9) * 2.5) : 0;
    marks.forEach((m) => show(m, 0)); // no motion marks (operator): the stretch reads on its own
    return { expr: 'neutral', breathe: 0.2 * up, lid: 0.62 * up, bot: 0.35 * up, mouth: Math.sin(clamp((k - 0.25) / 1.5) * Math.PI) * 0.95, dy: -2 * up, gy: -0.2 * up, tilt: wig * 9 };
  } };
});

act('rest-water', 'rest', 'water', { dur: 5.5, key: 3.0 }, (K, X) => {
  // a potted sprout beside the creature on the floor (clear of it); a watering can floats over it, tips and pours
  // (the product's watering, hands-free), the sprout perks up: a heart. The eyes follow the water to the plant.
  const g = K.group('fixed'), sc = 1.0;
  const pot = new THREE.Group(); g.add(pot); pot.scale.setScalar(sc);
  K.mesh(revolve(roundSeat(0.17), profile([[0, 0], [0.13, 0, 0.02], [0.17, 0.24, 0.02], [0.2, 0.25, 0.02], [0.2, 0.31, 0.02], [0, 0.31]])), '#d9774a', { to: pot, cast: true });
  K.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24), '#6a4a34', { to: pot, pos: [0, 0.305, 0], ol: 0 });
  const sprout = new THREE.Group(); sprout.position.y = 0.3; pot.add(sprout);
  K.mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 8), '#5a9a3c', { to: sprout, pos: [0, 0.1, 0] });
  for (const sx of [-1, 1]) K.mesh(blob(0.11, 0.05, 0.03, 16, 10), C.green, { to: sprout, pos: [sx * 0.1, 0.2, 0], rot: [0, 0, sx * 0.4] });
  // the can: a round body, a handle, a long spout with a rose, floating at the pot's outer side, spout toward the plant
  const can = new THREE.Group(); g.add(can); can.position.set(-0.36, 0.78, 0.02); can.scale.setScalar(0.85);
  const tilt = new THREE.Group(); can.add(tilt);
  K.mesh(revolve(roundSeat(0.15), profile([[0, -0.12], [0.14, -0.12, 0.03], [0.15, 0.1, 0.03], [0.12, 0.12, 0.02], [0, 0.12]])), '#5aa9e6', { to: tilt, cast: true });
  K.mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24, Math.PI), '#4a8fcf', { to: tilt, pos: [-0.04, 0.1, 0], rot: [0, 0, 0.25] });
  const spoutPts = [V(0.12, -0.06, 0), V(0.24, 0.02, 0), V(0.34, 0.12, 0)];
  K.mesh(tube(new THREE.CatmullRomCurve3(spoutPts), (t) => 0.035 - 0.012 * t, 16, 10), '#4a8fcf', { to: tilt });
  K.mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.04, 16), '#4a8fcf', { to: tilt, pos: [0.355, 0.14, 0], rot: [0, 0, -0.6], ol: 0.012 }); // the rose
  besideFloor(K, g, -1, K.minY); // left of the creature
  const f = K.fx('fixed'), drops = Array.from({ length: 6 }, () => X.drop(C.blue, 0.07, f));
  const heart = X.glyph(SH.heart(0.18), C.red, { to: f });
  const plantW = toFixed(g, pot, V(0, 0.48, 0));
  return { frame(a) {
    const { k } = a, pour = sstep(0.4, 0.9, k) * (1 - sstep(3.4, 3.9, k));
    tilt.rotation.z = -0.75 * pour; can.position.y = 0.78 + Math.sin(k * 2) * 0.02; show(can, pop(k, 0, 0.4) * (1 - sstep(4.6, 5.2, k)));
    const rose = toFixed(g, can, inFrame(tilt, V(0.37, 0.15, 0)));
    drops.forEach((d, i) => { const ph = fract(k * 1.9 + i / 6); d.position.copy(rose).lerp(plantW, ph).add(V(0, -Math.sin(ph * Math.PI) * 0.06, 0.02)); show(d, pour * (ph < 0.9 ? 1 : 0)); });
    { const grow = 0.75 + 0.35 * sstep(1.5, 3.6, k); sprout.scale.set(1, grow, 1); sprout.rotation.z = Math.sin(k * 3) * 0.05; }
    show(heart, pop(k, 3.6, 0.4) * (1 - sstep(4.8, 5.3, k))); heart.position.copy(plantW).add(V(0.12, 0.15 + sstep(3.6, 5.3, k) * 0.25, 0.1));
    return { expr: k > 3.6 ? 'happy' : 'neutral', ...K.gaze(pour > 0.2 ? rose.clone().lerp(plantW, 0.6) : plantW), lid: 0 };
  } };
});

act('rest-juggle', 'rest', 'juggle', { key: 0.62 }, (K, X) => {
  // a three-ball cascade, hands-free, as the product's juggling: each ball is tossed up from one side, arcs over in
  // front of the body and is caught low on the other side, which scoops it in and tosses it back. Throws alternate
  // sides every beat, so the paths cross over the head as in real juggling (they rise along the body's sides, clear
  // of the eyes); the eyes follow the highest ball.
  const g = K.fx(), cols = [K.accent, C.red, C.yellow], r = 0.13;
  const balls = cols.map((c) => K.mesh(blob(r, r, r, 24, 16), c, { to: g, ol: 0.018 }));
  balls.forEach((b) => K.mesh(new THREE.TorusGeometry(r, 0.016, 6, 24), '#ffffff', { to: b, rot: [Math.PI / 2 - 0.4, 0, 0.3], basic: true, ol: 0 }));
  const y0 = Math.max(K.minY + 0.3, X.mouth - 0.1), inner = K.W * 0.92, outer = Math.min(1.32, K.W + 0.38), zb = 0.45;
  const H = Math.max(0.6, Math.min(K.top + 0.22, X.top(zb, r + 0.03)) - y0), beat = 0.38, air = 2.3; // a calm cascade
  return { frame(a) {
    const { k } = a; let hi = balls[0];
    balls.forEach((b, i) => {
      const u = k / beat - i + 6, n = Math.floor(u / 3), s = u - n * 3, from = (i + n) % 2 ? -1 : 1;
      if (s < air) { const f = s / air; b.position.set(from * inner - from * (inner + outer) * f, y0 + 4 * H * f * (1 - f), zb); }
      else { const f = (s - air) / (3 - air); b.position.set(-from * (outer - (outer - inner) * f), y0 - 0.1 * Math.sin(f * Math.PI), zb); } // the scoop
      b.rotation.z = k * 5 + i;
      if (b.position.y > hi.position.y) hi = b;
    });
    const tossed = fract(k / beat), bob = tossed < 0.25 ? Math.sin((tossed / 0.25) * Math.PI) : 0;
    return { expr: 'neutral', gx: Math.max(-0.7, Math.min(0.7, hi.position.x * 0.6)), gy: Math.max(-0.75, -(hi.position.y - K.face.ey) * 0.6), lid: 0, pr: 1.1, squash: bob * 0.025, tilt: Math.sin((k / beat) * Math.PI) * 2.5 };
  } };
});

act('rest-soup', 'rest', 'soup', { key: 1.1 }, (K, X) => {
  // a little cauldron beside the creature on the floor (clear of it); the ladle stirs by itself, bubbles pop, steam
  // rises; the eyes look into the pot
  const sc = 1.0, g = K.group('fixed');
  const pot = new THREE.Group(); g.add(pot); pot.scale.setScalar(sc);
  K.mesh(revolve(roundSeat(0.22), profile([[0, 0.05], [0.2, 0.06, 0.06], [0.27, 0.22, 0.08], [0.22, 0.38, 0.03], [0.25, 0.4, 0.02], [0.25, 0.44, 0.02], [0.2, 0.44], [0.2, 0.4], [0, 0.4]])), '#3a3540', { to: pot, cast: true });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; K.mesh(blob(0.04, 0.06, 0.04, 12, 8), '#3a3540', { to: pot, pos: [Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15] }); }
  K.mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.02, 32), '#9ad15a', { to: pot, pos: [0, 0.405, 0], ol: 0 });
  const ladle = new THREE.Group(); pot.add(ladle); ladle.position.y = 0.4;
  const stick = new THREE.Group(); ladle.add(stick); stick.position.x = 0.1; stick.rotation.z = -0.35;
  K.mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), '#d39a5c', { to: stick, pos: [0, 0.22, 0] });
  const bubbles = [0, 1, 2].map(() => K.mesh(blob(0.045, 0.045, 0.045, 12, 8), '#c4ea8a', { to: pot, ol: 0.01 }));
  besideFloor(K, g, 1, K.minY);
  const steam = [0, 1, 2].map(() => X.puff(C.white, 0.5, K.fx('fixed'))), rim = toFixed(g, pot, V(0, 0.42, 0));
  return { frame(a) {
    const { k } = a;
    ladle.rotation.y = k * 2.2;
    bubbles.forEach((b, i) => { const ph = fract(k * 0.9 + i * 0.33), ang = i * 2.1 + Math.floor(k * 0.9 + i * 0.33) * 1.3; b.position.set(Math.cos(ang) * 0.11, 0.42, Math.sin(ang) * 0.11); show(b, Math.sin(ph * Math.PI) * (ph < 0.85 ? 1 : 0)); });
    steam.forEach((s, i) => { const ph = fract(k * 0.45 + i / 3); s.position.copy(rim).add(V(Math.sin(ph * 4 + i) * 0.08, 0.2 + ph * 0.6, 0)); show(s, Math.sin(ph * Math.PI) * 1.0); });
    return { expr: 'neutral', ...K.gaze(rim), lid: 0, pr: 1.06, tilt: Math.sin(k * 1.4) * 3 }; // into the pot
  } };
});

act('rest-fish', 'rest', 'fish', { key: 6.6 }, (K, X) => {
  // a puddle beside the creature on the floor (clear of it), a rod standing at its outer side leaning over it, the
  // float bobbing; now and then the float dips and a fish leaps out and back in (operator, 2026-11-04: much rarer, and
  // quicker when it comes): in slots of 5 s, a 0.7 s leap; the first bite in the third slot (10–15 s in), then about one
  // slot in three, at random each time it fishes (a fixed pattern left it without a bite for 25 s, every time)
  const g = K.group('fixed');
  const pud = K.mesh(new THREE.CircleGeometry(1, 40), '#7fc3e8', { to: g, pos: [0, 0.006, 0], rot: [-Math.PI / 2, 0, 0], ol: 0, receive: false }); pud.scale.set(0.34, 0.24, 1);
  const ring = K.mesh(new THREE.RingGeometry(0.78, 0.88, 40), '#bfe6f8', { to: g, basic: true, ol: 0, pos: [0, 0.01, 0], rot: [-Math.PI / 2, 0, 0] }); ring.scale.set(0.34, 0.24, 1);
  // the rod a size up (operator, 2026-11-04: "a bit small")
  const tipP = V(-0.06, 1.08, -0.02), base = V(0.42, 0.05, -0.08), seed = Math.random() * 97;
  K.mesh(tube(new THREE.CatmullRomCurve3([base, base.clone().lerp(tipP, 0.5).add(V(0.08, 0.1, 0)), tipP]), (t) => 0.042 - 0.02 * t, 24, 8), '#b07a4a', { to: g, cast: true });
  K.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.075, 14), C.iron, { to: g, pos: [0.38, 0.28, -0.07], rot: [0, 0, -0.45] }); // the reel
  const float = new THREE.Group(); g.add(float);
  K.mesh(blob(0.055, 0.045, 0.055, 16, 10), C.red, { to: float, pos: [0, 0.02, 0] }); K.mesh(blob(0.055, 0.035, 0.055, 16, 10), '#ffffff', { to: float, pos: [0, -0.025, 0] });
  float.position.set(-0.04, 0.03, 0.04);
  const line = K.mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), C.ink, { to: g, ol: 0 });
  const fish = new THREE.Group(); g.add(fish); X.glyph(SH.fish(0.32), C.orange, { to: fish, depth: 0.05 }); K.mesh(blob(0.023, 0.023, 0.02, 10, 8), C.ink, { to: fish, pos: [0.11, 0.03, 0.05], basic: true, ol: 0 });
  fish.position.set(0, 0.46, 0.1); const B = localBox(g); fish.visible = false; // measured with the fish at the top of its leap
  besideFloor(K, g, 1, K.minY, B);
  const splash = [0, 1, 2].map(() => X.drop(C.sky, 0.07, g));
  return { frame(a) {
    const { k } = a, { dip, jump, up, splash: f } = fishing(k, seed); // product: the slots and the leap (0.7 s) are schedule.ts's fishing()
    float.position.y = 0.03 + Math.sin(k * 3) * 0.015 + (dip ? -0.03 : 0);
    const mid = tipP.clone().add(float.position).multiplyScalar(0.5), len = tipP.distanceTo(float.position); line.position.copy(mid); line.scale.set(1, len, 1); line.quaternion.setFromUnitVectors(V(0, 1, 0), tipP.clone().sub(float.position).normalize());
    fish.visible = up; fish.position.set(0.15 - jump * 0.34, Math.sin(jump * Math.PI) * 0.46, 0.1); fish.rotation.z = Math.PI * 0.35 - jump * Math.PI * 0.7; fish.scale.setScalar(up ? 1 : 0.001);
    splash.forEach((d, i) => { d.position.set(-0.24 + (i - 1) * 0.08 * f, 0.05 + Math.sin(Math.min(1, f / 2) * Math.PI) * 0.15, 0.1); show(d, f > 0 && f < 2 ? 1 - f / 2 : 0); });
    return { expr: up ? 'surprised' : 'neutral', ...K.gaze(toFixed(g, g, up ? fish.position : float.position)), lid: 0 }; // the float, or the fish as it leaps
  } };
});

act('rest-bubbles', 'rest', 'bubbles', { key: 1.75 }, (K, X) => {
  // a bubble wand floats beside the face, its ring by the mouth; the creature puffs, a bubble swells on the ring,
  // lets go and drifts up and away (outwards, clear of the eyes), wobbling, then pops with a twinkle. The eyes
  // follow the newest bubble in the air.
  const g = K.fx(), period = 1.5, N = 3;
  const rx = Math.min(K.W * 0.8, K.face.ex + K.face.eyeW * 0.75) + K.face.fx0, ry = X.mouth + 0.04, rz = K.front(X.mouth, rx) + 0.12;
  const wand = new THREE.Group(); g.add(wand); wand.position.set(rx, ry, rz); wand.rotation.set(0, -0.5, -0.35);
  K.mesh(new THREE.TorusGeometry(0.12, 0.024, 10, 36), K.accent, { to: wand, ol: 0.016 });
  K.mesh(tube(new THREE.CatmullRomCurve3([V(0.02, -0.12, 0), V(0.06, -0.3, 0), V(0.12, -0.52, 0)]), () => 0.024, 16, 8), K.accent, { to: wand, ol: 0.016 });
  const film = K.mesh(new THREE.CircleGeometry(0.11, 28), '#dff6ff', { to: wand, basic: true, opacity: 0.45, ol: 0 });
  const bubs = Array.from({ length: N }, (_, i) => { const b = K.mesh(blob(1, 1, 1, 24, 16), '#eefcff', { to: g, basic: true, opacity: 0.4, ol: 0.03, ink: '#6fa8c8' }); K.mesh(blob(0.22, 0.32, 0.1, 10, 8), '#ffffff', { to: b, pos: [-0.38, 0.4, 0.85], rot: [0, 0, 0.6], basic: true, ol: 0 }); b.userData.s = 0.14 + 0.06 * hash(i + 4); return b; });
  const pops = Array.from({ length: N }, () => X.twinkle(0.12, C.white, g));
  const clear = K.face.ex + K.face.eyeW + 0.2 + K.face.fx0;
  return { frame(a) {
    const { k } = a; let look = null;
    wand.position.y = ry + Math.sin(k * 2.2) * 0.015; wand.rotation.z = -0.35 + Math.sin(k * 1.7) * 0.06;
    bubs.forEach((b, i) => {
      const ph = fract(k / (period * N) + i / N) * N; // 0..N: its life, one bubble blown every period
      const blow = clamp(ph / 0.35), fly = clamp((ph - 0.35) / 2.2), s = b.userData.s * (0.35 + 0.65 * blow);
      const x = rx + fly * 0.75, y = ry + 0.05 + Math.max(0, x - clear) * 1.5 + fly * fly * 0.6 + Math.sin(fly * 9 + i) * 0.03; // out past the eye, then up the side
      b.position.set(x + Math.sin(fly * 6 + i) * 0.03, y, rz + 0.05); b.scale.set(s * (1 + 0.06 * Math.sin(k * 9 + i)), s * (1 - 0.06 * Math.sin(k * 9 + i)), s);
      b.visible = ph < 2.55;
      const p = pops[i]; p.position.copy(b.position); show(p, ph > 2.55 && ph < 2.85 ? Math.sin(((ph - 2.55) / 0.3) * Math.PI) : 0);
      if (fly > 0.02 && fly < 1 && (!look || fly < look.f)) look = { f: fly, x, y };
    });
    const puffing = fract(k / period) < 0.3; show(film, puffing ? 1 : 0.6);
    const L = look || { x: rx, y: ry };
    return { expr: 'neutral', lid: 0, pr: 1.1, mouth: puffing ? 0.3 : 0.12, gx: clamp((L.x - K.face.fx0) * 0.55, -0.75, 0.75), gy: clamp(-(L.y - K.face.ey) * 0.55, -0.75, 0.6) };
  } };
});

act('rest-music', 'rest', 'music', { key: 0.62 }, (K, X) => {
  // a boombox beside the creature on the floor (clear of it); grooving to the beat, notes floating up from it
  const sc = 0.95, g = K.group('fixed');
  const box = new THREE.Group(); g.add(box); box.rotation.y = 0.35; box.scale.setScalar(sc);
  K.mesh(new RoundedBoxGeometry(0.6, 0.36, 0.22, 3, 0.06), K.accent, { to: box, pos: [0, 0.18, 0], cast: true });
  K.mesh(tube(new THREE.CatmullRomCurve3([V(-0.2, 0.34, 0), V(-0.18, 0.46, 0), V(0.18, 0.46, 0), V(0.2, 0.34, 0)]), () => 0.022, 24, 8), C.iron, { to: box });
  const cones = [-1, 1].map((sx) => { const c = new THREE.Group(); c.position.set(sx * 0.17, 0.17, 0.115); box.add(c); K.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24), '#2b2f3c', { to: c, rot: [Math.PI / 2, 0, 0] }); K.mesh(blob(0.06, 0.06, 0.03, 16, 10), '#5b6276', { to: c, pos: [0, 0, 0.02], ol: 0.008 }); return c; });
  K.mesh(new RoundedBoxGeometry(0.12, 0.07, 0.02, 2, 0.01), '#fffaf0', { to: box, pos: [0, 0.27, 0.115], ol: 0.008 });
  besideFloor(K, g, -1, K.minY);
  const notes = [0, 1, 2, 3].map((i) => X.note([C.blue, C.pink, C.yellow, '#7fd6b0'][i], i % 2 === 1, K.fx())), src = toFixed(g, box, V(0, 0.5, 0));
  return { frame(a) {
    const { k } = a, beat = k * 2 * Math.PI * 1.9, thump = Math.max(0, Math.cos(beat)) ** 6;
    cones.forEach((c) => c.scale.setScalar(1 + thump * 0.18)); box.position.y = thump * 0.015;
    notes.forEach((n, i) => { const ph = fract(k * 0.42 + i / 4); n.position.set(X.inX(src.x + Math.sin(ph * 6 + i) * 0.15 + (i % 2 ? 1 : -1) * 0.1, 0.25, src.z), Math.min(src.y + 0.15 + ph * 1.0, X.top(src.z, 0.25)), src.z); n.rotation.z = Math.sin(ph * 5 + i) * 0.3; show(n, Math.sin(ph * Math.PI) * 1.0); });
    const on = Math.floor(k * 1.9) % 4 < 2;
    return { expr: on ? 'neutral' : 'joy', lid: 0, tilt: Math.sin(beat / 2) * 8, dy: -Math.abs(Math.sin(beat / 2)) * 4, squash: thump * 0.03 };
  } };
});

act('rest-nap', 'rest', 'nap', { key: 1.3 }, (K, X) => {
  // eyes shut, a slow breath, Zzz drifting up and a sleep bubble at the nose
  const g = K.fx(), zs = [0, 1, 2].map(() => X.glyph(SH.zed(1), '#cfe0ff', { to: g, depth: 0.06, bevel: 0.03 }));
  const bub = K.mesh(blob(1, 1, 1, 24, 16), '#eefcff', { to: g, basic: true, opacity: 0.45, ol: 0.03, ink: '#6fa8c8' }); K.mesh(blob(0.22, 0.3, 0.1, 10, 8), '#ffffff', { to: bub, pos: [-0.35, 0.4, 0.85], basic: true, ol: 0 });
  const bx = K.face.fx0 + 0.12, bz = K.front(X.mouth + 0.06) + 0.06;
  return { frame(a) {
    const { k } = a;
    zs.forEach((z, i) => { const ph = fract(k * 0.35 + i / 3); z.position.set(K.W * 0.55 + ph * 0.5, Math.min(K.T * 0.7 + ph * 0.75, X.top(0.25, 0.15)), 0.25); z.rotation.z = 0.3 - ph * 0.35; show(z, (0.14 + ph * 0.2) * (1 - sstep(0.88, 1, ph))); });
    const br = 0.5 + 0.5 * Math.sin(k * 1.4); const s = 0.04 + 0.12 * br;
    bub.position.set(bx + s * 0.6, X.mouth + 0.08, bz + s * 0.3); show(bub, s);
    return { expr: 'neutral', blink: 1, breathe: Math.sin(k * 1.4) * 0.03, dy: 2 };
  } };
});

// product: the microphone permission hero ('mic') comes with the permissions step (C3); the voice cue lines ('voice-lines')
// are decided off. The menus and timings the reference exports here are schedule.ts's.

export { ACTS };

// ================================================================ the microphone permission hero ================================================================
// product: the reference's 'mic' act (reference/2026-11-04/src/acts.js, the block under this title), unchanged, in a block
// of its own after the export, so the moods, working styles and pastimes come over above it without touching it. Its
// one helper (inFrame, which the reference shares with the working styles) is its own here. The hero that plays it is
// mic-hero.ts.

// Setup's permissions step and Settings › Permissions (sidevoice-web features/permissions): the person's creature over
// the microphone's row. The new creatures have no hands, so the microphone floats by the mouth: a toon handheld mic.
//   prompt     not asked yet: calm, looking down at the row's Allow button; no mic
//   requesting an attentive lean, eyes up toward where the browser or the computer asks
//   granted    the mic pops in by the mouth, a hop once, happy, little sound arcs off the mic
//   denied     blocked: the mic greyed and struck through; a droop, sad (the page also desaturates it, as the product)
//   missing    none found: a droop, looking round for it, a "?"
// The product does the lean, the hop and the droop on a wrapper (its engine had no expressions); here they are the
// creature's own pose and expressions.
act('mic', 'scene', 'microphone', { key: 1.3 }, (K, X, o) => {
  const inFrame = (obj, p) => { obj.updateMatrix(); return p.clone().applyMatrix4(obj.matrix); }; // product: a point in obj's space → its parent's (the reference's shared helper)
  // a handheld toon mic floating beside the mouth, its head toward it, in front of the cheek and clear of the eyes;
  // allowed: in colour, with sound arcs; blocked: grey with a red no-sign; none found: grey with a "?" over it
  const state = o.state || 'prompt', g = K.fx('fixed');
  const grey = state === 'denied' || state === 'missing', shown = state === 'granted' || grey;
  const f = K.face, eyeBottom = f.ey - f.eyeH, r = 0.14;
  const mx = f.fx0 + f.ex * 0.95 + 0.06, my = Math.min(f.mouthY - 0.04, eyeBottom - 0.2 - r), mz = K.front(my, mx) + 0.24;
  const mic = new THREE.Group(); g.add(mic); mic.position.set(mx, my, mz); mic.rotation.z = 0.6; mic.visible = shown; // the head leans toward the mouth
  const head = new THREE.Group(); mic.add(head); // the head's centre is the group's origin: it sits at (mx, my)
  const silver = grey ? '#c4c7ce' : C.silver, handle = grey ? '#7d818c' : '#3a3f4a', collar = grey ? '#a6a9b2' : K.accent;
  K.mesh(blob(r, r * 1.12, r, 28, 20), silver, { to: head, metal: 1 });
  for (const [yy, rr] of [[-0.06, 0.88], [0, 1], [0.06, 0.88]]) K.mesh(new THREE.TorusGeometry(r * rr, 0.008, 6, 32), grey ? '#9a9ea8' : '#8a92a6', { to: head, pos: [0, yy, 0], rot: [Math.PI / 2, 0, 0], basic: true, ol: 0 });
  K.mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.66, 0.05, 28), collar, { to: mic, pos: [0, -r * 1.12 - 0.02, 0], ol: 0.014 });
  K.mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.34, 0.3, 24), handle, { to: mic, pos: [0, -r * 1.12 - 0.19, 0], ol: 0.016 });
  K.mesh(blob(r * 0.34, r * 0.2, r * 0.34, 16, 10), handle, { to: mic, pos: [0, -r * 1.12 - 0.34, 0], ol: 0.012 });
  const tipW = inFrame(mic, V(0, 0, 0)); // the mic's head
  const arcs = state === 'granted' ? [0, 1].map((i) => { const ar = K.mesh(new THREE.TorusGeometry(0.13 + i * 0.09, 0.02, 6, 24, 1.3), K.accent, { to: g, ol: 0.012 }); ar.position.copy(tipW).add(V(0.04, 0.04, 0.02)); ar.rotation.z = -0.25; return ar; }) : [];
  let no = null, q = null;
  if (state === 'denied') { no = new THREE.Group(); g.add(no); no.position.copy(tipW).add(V(0, 0, 0.18)); K.mesh(new THREE.TorusGeometry(r * 1.45, 0.035, 10, 40), C.red, { to: no, ol: 0.014 }); K.mesh(new THREE.CapsuleGeometry(0.033, r * 2.5, 4, 10), C.red, { to: no, rot: [0, 0, Math.PI / 4], ol: 0.014 }); }
  if (state === 'missing') {
    q = new THREE.Group(); g.add(q); q.position.copy(tipW).add(V(0.27, -0.02, 0.1)); // beside the mic's head, on the outer side: below the eye
    const pts = [[-0.2, 0.3], [-0.16, 0.47], [0, 0.55], [0.18, 0.47], [0.19, 0.29], [0.04, 0.17], [0, 0.0]].map(([x, y]) => V(x * 0.55, y * 0.55, 0));
    K.mesh(tube(new THREE.CatmullRomCurve3(pts), () => 0.04, 48, 12), '#8a92a6', { to: q, ol: 0.012 }); K.mesh(blob(0.045, 0.045, 0.04, 16, 12), '#8a92a6', { to: q, pos: [0, -0.09, 0], ol: 0.012 });
  }
  return { frame(a) {
    const { k } = a;
    if (state === 'granted') {
      show(mic, backOut(k / 0.45)); mic.position.y = my + Math.sin(k * 2.2) * 0.015; mic.rotation.z = 0.6 + Math.sin(k * 1.6) * 0.05;
      arcs.forEach((ar, i) => { const ph = fract(k * 0.9 - i * 0.3); show(ar, a.still ? 1 : Math.sin(ph * Math.PI)); });
      const hop = a.still ? 0 : bump(k, 0.1, 0.55), land = a.still ? 0 : bump(k, 0.65, 0.2);
      return { expr: 'happy', bot: 0.2, gx: 0.12, gy: 0.12, dy: -hop * 14, squash: land * 0.07 - hop * 0.03 }; // back at us, pleased
    }
    if (state === 'requesting') return { expr: 'curious', gx: -0.35, gy: -0.5, tilt: 7 + Math.sin(k * 1.4) * 1.5, dx: 1.5 };
    if (state === 'denied') { mic.position.y = my - 0.03; const gz = K.gaze(tipW); return { expr: 'sad', gx: gz.gx * 0.55, gy: gz.gy * 0.55, dy: 4, tilt: -5, squash: 0.03 }; } // a glance at the mic
    if (state === 'missing') { q.rotation.z = Math.sin(k * 2) * 0.15; mic.position.y = my - 0.03; return { expr: 'sad', gx: Math.sin(k * 1.3) * 0.5, gy: 0.2, dy: 4, tilt: -4, squash: 0.03 }; }
    return { expr: 'neutral', gx: 0.05, gy: 0.3, lid: 0 };
  } };
});
