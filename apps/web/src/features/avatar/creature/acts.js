// Acts: what a creature acts out, with toon effects around it, layered over its state (Creature3D.setAct). Ported
// from the frozen design reference (reference/2026-11-04/src/acts.js, SHA-256 a4264178…): its shared kit (the camera it
// places by, the glyph shapes, the builders over an act's kit K, act()) unchanged, and so far the one act every working
// state shows: the busy cogs over the head ("scene"). The moods, the working styles and the pastimes come over from the
// same file with their rotation (they are not wired yet); the desk stays out (sidevoice-web#476).
// Everything is built from the same toon materials and ink outline as the creatures, flat-coloured and chunky, and
// placed from the creature's own measures (head top, width, eyes, mouth) so it works on every body.
import * as THREE from 'three';
import { ACTS } from './rig.js';
import { geo } from './accessories.js';

const { puffy, blob, tube, starPts, smooth2D, strand, revolve, roundSeat, profile, RoundedBoxGeometry } = geo;
const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const backOut = (t) => { t = clamp(t); const c = 1.8; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const pop = (k, k0 = 0, d = 0.35) => backOut((k - k0) / d); // 0 → overshoot → 1
const bump = (k, k0, d) => { const t = (k - k0) / d; return t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0; };
const hash = (i) => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);
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

export { ACTS };
