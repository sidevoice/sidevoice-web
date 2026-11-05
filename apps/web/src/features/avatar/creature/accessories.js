// Accessories and eye styles in the creature style (toon ink), registered into rig.js's registries.
// Ported unchanged from the frozen design reference (reference/2026-11-04/src/accessories.js, SHA-256 2e1ae895…); only
// this header and the rig's file name differ. Imported for its registrations (creature/host.ts); rig.js does not know
// this module exists.
//
// Every accessory is fitted to the body it is built on: hats measure the head's section at their seat (a hat
// on the box body comes out rounded-square, one on the onion perches on the tip), never come down over the
// eyes and stay inside the stage frame. Shapes are chunky, rounded and flat-coloured. Geometry is built at true
// size (no mesh scale) so the ink outline has the same weight on every part, and every surface is closed or
// smooth (shared seams, rounded tips) so the inverted-hull outline never breaks into slivers.
//
// Names are generic on purpose. Some items evoke well-known characters (an aviator helmet, an afterlife halo,
// a straw hat, comma and ripple eyes, a lightning scar); none reproduces a logo or a character design.
// A few names replace the rig's built-ins on purpose (sprout, curl, antenna, bow, headphones): the registry is
// checked first, so the reworked versions are used everywhere.
import * as THREE from 'three';
import { ACCESSORY_BUILDERS, EYE_STYLES } from './rig.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export { ACCESSORY_BUILDERS, EYE_STYLES };

const TAU = Math.PI * 2;
const TOP = 1.7; // highest body-space y the stage camera shows without cropping
const CLEAR = 0.17; // a crown's top clears the head top by this (the body's ink hull is ~0.06, plus tilt)
const OL = 0.026; // ink outline for accessory parts (the body's is 0.032; paint 'v1' scales both by 1.9)
let X = THREE; // three.js namespace (the bundle has one instance; builds also pass it in their context)
const V = (x = 0, y = 0, z = 0) => new X.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Fixed colours, for items whose colour is the point (gold is gold, straw is straw)
const C = {
  gold: '#f3c24a', straw: '#f2cf6b', strawBand: '#d8433a', ink: '#2a2433', steel: '#b4bec9', brass: '#d9a441',
  ivory: '#f1e6cc', white: '#fbf8f2', leatherTan: '#b98149', lens: '#9fd6ec', red: '#e5484d', blue: '#4a8fe0', yellow: '#f6c445', scar: '#c8364f',
};

// ---------- geometry ----------
// Indexed grid of rows × cols points; columns wrap (shared seam, so normals and the ink hull are unbroken),
// rows wrap too when `ring` is set (a torus-like band). Rows whose points coincide (poles) are fine.
// core(i, j) is a point inside the surface near that vertex, used to make the faces point outward.
function grid(rows, cols, pt, core, ring = false) {
  const pos = new Float32Array(rows * cols * 3);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pos.set(pt(i, j), (i * cols + j) * 3);
  const idx = [];
  for (let i = 0; i < (ring ? rows : rows - 1); i++) for (let j = 0; j < cols; j++) {
    const i2 = (i + 1) % rows, j2 = (j + 1) % cols;
    const a = i * cols + j, b = i * cols + j2, c = i2 * cols + j2, d = i2 * cols + j;
    idx.push(a, b, d, b, c, d);
  }
  const g = new X.BufferGeometry();
  g.setAttribute('position', new X.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // outward check: normals should point away from the core
  const n = g.attributes.normal; let s = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j += 4) { const c = core(i, j); { const k = i * cols + j; s += n.getX(k) * (pos[k * 3] - c.x) + n.getY(k) * (pos[k * 3 + 1] - c.y) + n.getZ(k) * (pos[k * 3 + 2] - c.z); } }
  if (s < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

// Rounded polyline profile: [[r, y, fillet]], each filleted corner replaced by a quadratic arc; long segments
// are split so later deformations (brim curl, bent tips) stay smooth.
// `closed`: the profile is a loop (a ring's cross-section), every corner may be filleted.
function profile(pts, steps = 6, maxLen = 0.05, closed = false) {
  const out = [], L = pts.length;
  pts.forEach(([r, y, f = 0], i) => {
    if (!f || (!closed && (i === 0 || i === L - 1))) { out.push([r, y]); return; }
    const [pr, py] = pts[(i + L - 1) % L], [nr, ny] = pts[(i + 1) % L];
    const la = Math.hypot(pr - r, py - y), lb = Math.hypot(nr - r, ny - y);
    const fa = Math.min(f, la * 0.5), fb = Math.min(f, lb * 0.5);
    const a = [r + ((pr - r) * fa) / la, y + ((py - y) * fa) / la], b = [r + ((nr - r) * fb) / lb, y + ((ny - y) * fb) / lb];
    for (let k = 0; k <= steps; k++) { const t = k / steps, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * r + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]); }
  });
  const dense = [out[0]];
  for (let i = 1; i <= out.length - (closed ? 0 : 1); i++) {
    const [r0, y0] = out[i - 1], [r1, y1] = out[i % out.length], k = Math.ceil(Math.hypot(r1 - r0, y1 - y0) / maxLen);
    for (let s = 1; s <= k; s++) dense.push([r0 + ((r1 - r0) * s) / k, y0 + ((y1 - y0) * s) / k]);
  }
  if (closed) dense.pop(); // the loop closes on its first point
  return dense;
}

// Revolve a profile around a seat (see kit.seat). Radii are offset per azimuth by how far the head's section
// departs from its mean radius, fading to a plain scale toward the axis so the top still closes, and fading
// out again toward the brim's edge (a brim on the box body is rounded, not square).
// mod(local [x, y, z], r, phi) may deform the result (brim curl, bent tip, pleats).
// A closed profile makes a ring (band, brim roll).
function revolve(seat, prof, mod, closed = false) {
  const { n, rho, rref, c } = seat;
  const rc = prof.reduce((a, p) => a + p[0], 0) / prof.length, yc = prof.reduce((a, p) => a + p[1], 0) / prof.length;
  return grid(prof.length, n, (i, j) => {
    const [r, y] = prof[i], ph = (j / n) * TAU, R = r + (rho[j] - rref) * Math.min(1, r / rref) * (1 - 0.7 * sstep(rref + 0.08, rref + 0.4, r));
    let p = [Math.sin(ph) * R, y, Math.cos(ph) * R];
    if (mod) p = mod(p, r, ph);
    return [p[0] + c.x, p[1] + seat.y, p[2] + c.z];
  }, (i, j) => (closed ? V(c.x + Math.sin((j / n) * TAU) * (rc + rho[j] - rref), seat.y + yc, c.z + Math.cos((j / n) * TAU) * (rc + rho[j] - rref)) : V(c.x, seat.y + prof[i][1], c.z)), closed);
}
// A band ring of the given section (r0..r1 out from the axis, y0..y1), rounded corners
const bandRing = (seat, r0, r1, y0, y1, f = 0.022, r1top = r1) => revolve(seat, profile([[r0, y0, f * 0.5], [r1, y0, f], [r1top, y1, f], [r0, y1, f * 0.5]], 5, 0.05, true), null, true);
const roundSeat = (r = 0.3, n = 48) => ({ y: 0, c: V(), n, rho: new Float32Array(n).fill(r), rref: r });

// Sweep a circle of radius rf(t) along a curve, with rounded (hemispherical) ends.
function tube(curve, rf, segs = 40, radial = 14) {
  const fr = curve.computeFrenetFrames(segs, false), rows = [], capN = 5;
  const end = (t, sgn, i) => { const p = curve.getPointAt(t), tg = fr.tangents[i], r = rf(t); for (let k = 1; k <= capN; k++) { const a = (k / capN) * Math.PI / 2; rows[sgn < 0 ? 'unshift' : 'push']({ c: p.clone().addScaledVector(tg, sgn * r * Math.sin(a)), N: fr.normals[i], B: fr.binormals[i], r: r * Math.cos(a) }); } };
  for (let i = 0; i <= segs; i++) rows.push({ c: curve.getPointAt(i / segs), N: fr.normals[i], B: fr.binormals[i], r: rf(i / segs) });
  end(0, -1, 0); end(1, 1, segs);
  return grid(rows.length, radial, (i, j) => { const R = rows[i], a = (j / radial) * TAU; return [R.c.x + (R.N.x * Math.cos(a) + R.B.x * Math.sin(a)) * R.r, R.c.y + (R.N.y * Math.cos(a) + R.B.y * Math.sin(a)) * R.r, R.c.z + (R.N.z * Math.cos(a) + R.B.z * Math.sin(a)) * R.r]; }, (i) => rows[i].c);
}

// Ellipsoid with the size baked into the geometry (so the outline keeps its weight)
function blob(a, b, c, ws = 32, hs = 20) { const g = new X.SphereGeometry(1, ws, hs); g.scale(a, b, c); return g; }

// Extruded 2D shape with a soft bevel, vertices welded so the ink hull stays closed (as the onigiri body does)
function puffy(pts, depth, bevel, holes = []) {
  const sh = new X.Shape(pts.map(([x, y]) => new X.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new X.Path(h.map(([x, y]) => new X.Vector2(x, y))));
  const g = new X.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 5, curveSegments: 12 });
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4); m.translate(0, 0, -depth / 2); m.computeVertexNormals(); return m;
}
const starPts = (r1, r0, k = 5, rot = Math.PI / 2) => Array.from({ length: k * 2 }, (_, i) => { const a = (i / (k * 2)) * TAU + rot, r = i % 2 ? r0 : r1; return [Math.cos(a) * r, Math.sin(a) * r]; });

// Outward offset of a polygon with clamped miters (for an ink rim under a decal)
function inflate(pts, d) {
  const n = pts.length; let area = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const s = area > 0 ? 1 : -1;
  return pts.map(([x, y], i) => {
    const [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    let e1 = [x - ax, y - ay], e2 = [bx - x, by - y]; const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2); e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
    const n1 = [s * e1[1], -s * e1[0]], n2 = [s * e2[1], -s * e2[0]]; let m = [n1[0] + n2[0], n1[1] + n2[1]]; const lm = Math.hypot(...m) || 1; m = [m[0] / lm, m[1] / lm];
    const k = Math.min(d / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]), d * 2.2);
    return [x + m[0] * k, y + m[1] * k];
  });
}

// Split every triangle of a non-indexed geometry into four, `times` times (decals follow curvature better)
function subdivide(g, times) {
  for (let t = 0; t < times; t++) {
    const p = g.attributes.position.array, out = [];
    for (let i = 0; i < p.length; i += 9) {
      const a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
      const m = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2], ab = m(a, b), bc = m(b, c), ca = m(c, a);
      out.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
    }
    g = new X.BufferGeometry(); g.setAttribute('position', new X.Float32BufferAttribute(out, 3));
  }
  return g;
}

// ---------- fast rays against the body ----------
// three's raycast tests every triangle (bodies have ~12k), which made cap-based items take over a second to
// build. Most rays here aim at a fixed point inside the body, so triangles are binned by their direction from
// that point; local projections (decals) only test the triangles nearby.
const triCache = new WeakMap();
function bodyTris(body) {
  const g = body.geometry; if (triCache.has(g)) return triCache.get(g);
  const pa = g.attributes.position, ix = g.index, n = ix ? ix.count / 3 : pa.count / 3, P = new Float32Array(n * 9), v = new X.Vector3();
  body.updateMatrixWorld(true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pa, ix ? ix.getX(t * 3 + k) : t * 3 + k).applyMatrix4(body.matrixWorld); P[t * 9 + k * 3] = v.x; P[t * 9 + k * 3 + 1] = v.y; P[t * 9 + k * 3 + 2] = v.z; }
  triCache.set(g, P); return P;
}
// nearest hit of the ray o + s·d (d unit) among triangles list; normal faces the ray's origin
function castList(P, list, o, d) {
  let best = Infinity, bt = -1;
  for (const t of list) {
    const a = t * 9, e1x = P[a + 3] - P[a], e1y = P[a + 4] - P[a + 1], e1z = P[a + 5] - P[a + 2], e2x = P[a + 6] - P[a], e2y = P[a + 7] - P[a + 1], e2z = P[a + 8] - P[a + 2];
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, sx = o.x - P[a], sy = o.y - P[a + 1], sz = o.z - P[a + 2], u = (sx * px + sy * py + sz * pz) * inv;
    if (u < -1e-7 || u > 1 + 1e-7) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, w = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (w < -1e-7 || u + w > 1 + 1e-7) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (s > 0 && s < best) { best = s; bt = t; }
  }
  if (bt < 0) return null;
  const a = bt * 9, n = new X.Vector3().crossVectors(new X.Vector3(P[a + 3] - P[a], P[a + 4] - P[a + 1], P[a + 5] - P[a + 2]), new X.Vector3(P[a + 6] - P[a], P[a + 7] - P[a + 1], P[a + 8] - P[a + 2])).normalize();
  if (n.dot(d) > 0) n.negate();
  return { p: o.clone().addScaledVector(d, best), n };
}
// caster for rays from outside toward c
function towardCaster(body, c, NA = 72, NE = 36) {
  const P = bodyTris(body), nt = P.length / 9, bins = Array.from({ length: NA * NE }, () => []);
  const ang = (x, y, z) => { const dx = x - c.x, dy = y - c.y, dz = z - c.z, h = Math.hypot(dx, dz); return [Math.atan2(dx, dz), Math.atan2(dy, h), h / (Math.hypot(h, dy) || 1)]; };
  const ia = (a) => Math.floor(((a + Math.PI) / TAU) * NA), ie = (e) => clamp(Math.floor(((e + Math.PI / 2) / Math.PI) * NE), 0, NE - 1);
  for (let t = 0; t < nt; t++) {
    const A = [0, 1, 2].map((k) => ang(P[t * 9 + k * 3], P[t * 9 + k * 3 + 1], P[t * 9 + k * 3 + 2]));
    let as = A.map((q) => q[0]); if (Math.max(...as) - Math.min(...as) > Math.PI) as = as.map((x) => (x < 0 ? x + TAU : x)); // across the ±π seam
    const full = A.some((q) => q[2] < 0.05) || Math.max(...as) - Math.min(...as) > Math.PI / 2; // at the poles azimuth means nothing
    const e0 = Math.max(0, ie(Math.min(...A.map((q) => q[1]))) - 1), e1 = Math.min(NE - 1, ie(Math.max(...A.map((q) => q[1]))) + 1);
    const a0 = full ? 0 : ia(Math.min(...as)) - 1, a1 = full ? NA - 1 : ia(Math.max(...as)) + 1;
    for (let e = e0; e <= e1; e++) for (let k = a0; k <= a1; k++) bins[e * NA + (((k % NA) + NA) % NA)].push(t);
  }
  return (o, d) => { const [a, e] = ang(o.x, o.y, o.z); return castList(P, bins[ie(e) * NA + (((ia(a) % NA) + NA) % NA)], o, d.clone().normalize()); };
}
// caster for rays near p (within r)
function nearCaster(body, p, r) {
  const P = bodyTris(body), list = [];
  for (let t = 0; t < P.length / 9; t++) { const a = t * 9; if (Math.hypot((P[a] + P[a + 3] + P[a + 6]) / 3 - p.x, (P[a + 1] + P[a + 4] + P[a + 7]) / 3 - p.y, (P[a + 2] + P[a + 5] + P[a + 8]) / 3 - p.z) < r) list.push(t); }
  return (o, d) => castList(P, list, o, d.clone().normalize());
}

// ---------- per-build kit: measurements of this body and part constructors ----------
function kit(ctx) {
  const ray = new X.Raycaster();
  const hitOn = (target) => (o, d) => {
    target.updateWorldMatrix(true, false);
    ray.set(o, d.clone().normalize()); const h = ray.intersectObject(target, false)[0];
    return h ? { p: h.point.clone(), n: h.face.normal.clone().transformDirection(h.object.matrixWorld) } : null;
  };
  const hitBody = (o, d) => ctx.surface(o, d);
  const toward = (c) => towardCaster(ctx.body, c), near = (p, r) => nearCaster(ctx.body, p, r);
  // Highest point of either eye, lids included (body space; the pivot is identity at build time)
  const eyeTop = () => {
    let top = -9;
    for (const e of [ctx.eyes.L, ctx.eyes.R]) {
      e.anchor.updateMatrixWorld(true);
      for (let a = 0; a < TAU; a += TAU / 24) top = Math.max(top, e.shape.localToWorld(V(Math.cos(a) * 1.07, Math.sin(a) * 1.07, 0.3)).y);
    }
    return top;
  };
  const et = eyeTop();
  // Centre of the body's horizontal section at height y
  const axisAt = (y) => {
    const r = hitBody(V(5, y, 0), V(-1, 0, 0)), l = hitBody(V(-5, y, 0), V(1, 0, 0)), cx = r && l ? (r.p.x + l.p.x) / 2 : 0;
    const f = hitBody(V(cx, y, 5), V(0, 0, -1)), b = hitBody(V(cx, y, -5), V(0, 0, 1)), cz = f && b ? (f.p.z + b.p.z) / 2 : 0;
    return V(cx + 1.3e-4, y, cz + 0.9e-4); // nudged: rays aimed here never pass exactly through a pole vertex
  };
  // Seat of a hat: `depth` below the head top but never onto the eyes; the head's section there, as radii per
  // azimuth. `maxR` makes a perched hat: it moves up until the head fits (flat tops stop just under the top) and
  // never gets wider than maxR.
  const section = (y, c, n) => {
    const rho = new Float32Array(n), hit = n > 24 ? toward(c) : hitBody;
    for (let j = 0; j < n; j++) { const ph = (j / n) * TAU, dx = Math.sin(ph), dz = Math.cos(ph); const h = hit(V(c.x + dx * 5, y, c.z + dz * 5), V(-dx, 0, -dz)); rho[j] = h ? Math.hypot(h.p.x - c.x, h.p.z - c.z) : 0; }
    return rho;
  };
  const seat = (depth, { gap = 0.07, minR = 0.22, maxR = 9, n = 64, y: yForce } = {}) => {
    let y = yForce ?? Math.min(Math.max(ctx.T - depth, et + gap), ctx.T - 0.05);
    if (maxR < 9) {
      // widest point of the section, from the body's vertices in a thin slab (cheaper than casting rays)
      const P = bodyTris(ctx.body), c0 = axisAt(ctx.T - 0.1);
      const rmaxAt = (yy) => { let r = 0; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - yy) < 0.025) r = Math.max(r, Math.hypot(P[i] - c0.x, P[i + 2] - c0.z)); return r; };
      for (let i = 0; i < 20 && y < ctx.T - 0.03 && rmaxAt(y) > maxR; i++) y = Math.min(ctx.T - 0.03, y + 0.025);
    }
    const c = axisAt(y), rho = section(y, c, n).map((r) => clamp(r, minR, maxR));
    for (let pass = 0; pass < 3; pass++) { const r0 = rho.slice(); for (let j = 0; j < n; j++) rho[j] = (r0[(j + n - 1) % n] + 2 * r0[j] + r0[(j + 1) % n]) / 4; }
    const rref = rho.reduce((a, b) => a + b, 0) / n, rmax = Math.max(...rho);
    return { y, c, rho, n, rref, rmax, room: TOP - y };
  };
  // Cap that hugs the head above y0: rays toward the axis point at y0, at elevations aMin(phi) (rim) … 90° (crown),
  // pushed out by m(t) and lifted by lift(t). A negative aMin brings the rim down (a helmet's sides).
  const capGeo = (y0, m, lift = () => 0, aMin = () => 0, rows = 16, cols = 64) => {
    const Q = axisAt(y0), hit = toward(Q);
    const g = grid(rows + 1, cols, (i, j) => {
      const t = i / rows, ph = (j / cols) * TAU, a0 = aMin(ph > Math.PI ? ph - TAU : ph), a = a0 + t * (Math.PI / 2 - 0.002 - a0);
      const d = V(Math.cos(a) * Math.sin(ph), Math.sin(a), Math.cos(a) * Math.cos(ph));
      const h = hit(Q.clone().addScaledVector(d, 5), d.clone().negate());
      const p = h ? h.p : Q.clone().addScaledVector(d, 0.3);
      p.addScaledVector(d, m(t, ph)); p.y += lift(t, ph);
      return [p.x, p.y, p.z];
    }, () => Q);
    const pa = g.attributes.position; g.userData.top = V(pa.getX(pa.count - 1), pa.getY(pa.count - 1), pa.getZ(pa.count - 1)); g.userData.Q = Q;
    g.userData.rim = Array.from({ length: cols }, (_, j) => V(pa.getX(j), pa.getY(j), pa.getZ(j)));
    return g;
  };
  // A rolled edge along a cap's rim
  const rimRoll = (cap, r, out = 0) => {
    const Q = cap.userData.Q, pts = cap.userData.rim.map((p) => p.clone().add(V(p.x - Q.x, 0, p.z - Q.z).normalize().multiplyScalar(out)));
    return new X.TubeGeometry(new X.CatmullRomCurve3(pts, true), 128, r, 12, true);
  };
  // Closed band around a surface (hit), in the plane spanned by u, v through c: rays toward c give the ring;
  // the cross-section is an ellipse with half-height a (across the plane) and half-thickness b, its inner face
  // `gap` off the surface
  const ribbon = (hit, c, u, v, gap, a, b, n = 72, radial = 12) => {
    const w = V().crossVectors(u, v).normalize(), P = [];
    if (hit === hitBody) hit = toward(c);
    for (let j = 0; j < n; j++) { const ph = (j / n) * TAU, d = u.clone().multiplyScalar(Math.cos(ph)).addScaledVector(v, Math.sin(ph)); const h = hit(c.clone().addScaledVector(d, 5), d.clone().negate()); P.push(h ? h.p : c.clone().addScaledVector(d, 0.4)); }
    for (let pass = 0; pass < 2; pass++) { const Q = P.map((p) => p.clone()); for (let j = 0; j < n; j++) P[j].copy(Q[(j + n - 1) % n]).add(Q[j]).add(Q[j]).add(Q[(j + 1) % n]).multiplyScalar(0.25); }
    const N = P.map((p, j) => { const t = P[(j + 1) % n].clone().sub(P[(j + n - 1) % n]); const o = V().crossVectors(t, w).normalize(); return o.dot(p.clone().sub(c)) < 0 ? o.negate() : o; });
    const core = P.map((p, j) => p.clone().addScaledVector(N[j], gap + b));
    return grid(n, radial, (j, k) => { const th = (k / radial) * TAU, q = core[j].clone().addScaledVector(N[j], b * Math.cos(th)).addScaledVector(w, a * Math.sin(th)); return [q.x, q.y, q.z]; }, (j) => core[j], true);
  };
  const flat = () => [V(1, 0, 0), V(0, 0, 1)]; // plane of a horizontal band
  // Move a finished part forward (world z) until its back is in front of the parts already on the head at the
  // same place (ears, horns, robot bits…), so a bow or a flower ends up pinned on an ear instead of through it.
  // Parts are built before accessories, so they are already in the pivot.
  const inFront = (obj, margin = 0.015) => {
    const pv = ctx.group.parent; if (!pv) return;
    const others = pv.children.filter((o) => o.isMesh && o !== ctx.body); if (!others.length) return;
    pv.updateMatrixWorld(true);
    const own = []; obj.traverse((o) => { if (o.isMesh && !o.userData.outline) own.push(o); }); // outline hulls are back-faced
    const box = new X.Box3().setFromObject(obj); let dz = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const x = box.min.x + ((box.max.x - box.min.x) * i) / 8, y = box.min.y + ((box.max.y - box.min.y) * j) / 8;
      ray.set(V(x, y, -5), V(0, 0, 1)); const back = ray.intersectObjects(own, false)[0]; if (!back) continue;
      ray.set(V(x, y, 5), V(0, 0, -1)); const o = ray.intersectObjects(others, false)[0]; if (!o) continue;
      dz = Math.max(dz, o.point.z + margin - back.point.z);
    }
    obj.position.z += Math.min(dz, 0.5);
  };
  // the crown of the head: the top of the body near its axis
  const crown = () => { const c = axisAt(ctx.T - 0.08), h = hitBody(V(c.x, 5, c.z), V(0, -1, 0)); return { p: h ? h.p : V(c.x, ctx.T, c.z) }; };
  // A mesh with the creature's material and an ink outline; `ol: 0` for none, `parent` to hang it elsewhere
  const part = (geo, color, o = {}) => {
    const m = new X.Mesh(geo, typeof color === 'string' ? ctx.mat(color, o) : color);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    if (o.ol !== 0) ctx.addOutline(m, o.ol ?? OL);
    (o.parent || ctx.group).add(m);
    return m;
  };
  // Group that tilts its children about a point (hats worn at an angle)
  const tilt = (pivot, rx = 0, rz = 0, ry = 0) => {
    const h = new X.Group(); h.position.copy(pivot); h.rotation.set(rx, ry, rz); ctx.group.add(h);
    const inner = new X.Group(); inner.position.copy(pivot).negate(); h.add(inner); return inner;
  };
  return { hitOn, hitBody, near, et, axisAt, seat, capGeo, rimRoll, ribbon, flat, crown, inFront, part, tilt };
}

function acc(name, slot, label, build) {
  ACCESSORY_BUILDERS[name] = { slot, label, build: (ctx) => { X = ctx.THREE; build(ctx, kit(ctx)); } };
}

// ---------- hats ----------

// Knitted bobble hat: a puffy cap hugging the head, a rolled cuff and a pompom. Accent colour.
acc('bobble-hat', 'head', 'bobble hat', (ctx, k) => {
  const y0 = Math.min(Math.max(ctx.T - 0.5, k.et + 0.05), ctx.T - 0.12);
  const rp = clamp(0.17 * ctx.width, 0.12, 0.18), lift = clamp(TOP - 0.05 - 2 * rp - (ctx.T + 0.14), 0, 0.2);
  const cap = k.capGeo(y0, (t) => 0.06 + 0.08 * t, (t) => lift * Math.pow(t, 1.6));
  k.part(cap, ctx.accent);
  const [u, v] = k.flat();
  k.part(k.ribbon(k.hitBody, k.axisAt(y0 + 0.07), u, v, 0.04, 0.1, 0.075), ctx.mix(ctx.accent, '#ffffff', 0.22));
  const top = cap.userData.top;
  k.part(blob(rp, rp, rp), C.white).position.set(top.x, top.y + rp * 0.7, top.z);
});

// Straw hat with a red band: low rounded crown, wide brim with a slight droop, worn pushed back.
acc('straw-hat', 'head', 'straw hat', (ctx, k) => {
  const s = k.seat(0.27), rr = s.rref;
  const hc = clamp(ctx.T - s.y + CLEAR, 0.3, s.room - 0.05);
  const ext = clamp(0.45 + 0.22 * rr, 0.48, 1.42 - s.rmax);
  const prof = profile([[0, -0.03], [rr + 0.02, -0.03], [rr + ext - 0.05, -0.09], [rr + ext, -0.08, 0.03], [rr + ext - 0.04, -0.03, 0.02], [rr + 0.08, 0.03, 0.05], [rr + 0.05, 0.09], [rr + 0.04, hc - 0.12, 0.12], [0, hc]]);
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.14, 0.06);
  k.part(revolve(s, prof), C.straw, { parent: g });
  k.part(bandRing(s, rr + 0.03, rr + 0.09, 0.035, 0.15), C.strawBand, { parent: g });
});

// Wizard hat: wide brim, tall concave cone that droops at the tip, gold band and a little star. Accent colour.
acc('wizard-hat', 'head', 'wizard hat', (ctx, k) => {
  const s = k.seat(0.2), rr = s.rref;
  const H = clamp(1.1, ctx.T - s.y + 0.3, s.room + 0.06), ext = clamp(0.3 + 0.1 * rr, 0.32, 1.4 - s.rmax);
  const prof = profile([[0, -0.03], [rr + ext - 0.03, -0.04], [rr + ext, -0.02, 0.025], [rr + ext - 0.03, 0.015, 0.02], [rr + 0.06, 0.03, 0.04], [rr + 0.02, 0.07, 0.06], [rr * 0.5, H * 0.42, 0.2], [0.05, H - 0.04, 0.05], [0, H]], 6, 0.04);
  // the tip bends to the side and droops (the deformation grows with height, so the brim is untouched)
  const bend = (p) => { const t = sstep(0.35 * H, H, p[1]); return [p[0] + 0.3 * t * t, p[1] - 0.1 * t * t * t, p[2] - 0.05 * t * t]; };
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.06, -0.05);
  const cone = k.part(revolve(s, prof, bend), ctx.accent, { parent: g });
  k.part(bandRing(s, rr - 0.01, rr + 0.06, 0.05, 0.16, 0.022, rr + 0.04), C.gold, { parent: g });
  // star on the front of the cone
  const h = k.hitOn(cone)(V(s.c.x, s.y + 0.36 * H, 5), V(0, 0, -1));
  if (h) { const st = k.part(puffy(starPts(0.12, 0.055), 0.02, 0.02), C.gold, { parent: g, ol: 0.018 }); st.position.copy(h.p).addScaledVector(h.n, 0.02); st.lookAt(h.p.clone().add(h.n)); }
});

// Top hat: tall flared crown with an accent band, narrow brim curled up at the sides, perched at an angle.
acc('top-hat', 'head', 'top hat', (ctx, k) => {
  const s = k.seat(0.16, { minR: 0.3, maxR: 0.5 }), rr = s.rref;
  const H = clamp(0.52, ctx.T - s.y + CLEAR, s.room - 0.04), ext = 0.17;
  const prof = profile([[0, -0.03], [rr + ext - 0.02, -0.03], [rr + ext, 0, 0.025], [rr + ext - 0.03, 0.02, 0.02], [rr + 0.05, 0.03, 0.03], [rr + 0.03, 0.06], [rr + 0.08, H, 0.05], [0, H]]);
  const curl = (p, r) => (r > rr + 0.04 ? [p[0], p[1] + 0.09 * Math.pow(Math.abs(p[0]) / (rr + ext), 4), p[2]] : p);
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.05, -0.16);
  k.part(revolve(s, prof, curl), C.ink, { parent: g });
  k.part(bandRing(s, rr + 0.02, rr + 0.055, 0.06, 0.17, 0.018, rr + 0.07), ctx.accent, { parent: g });
});

// Cowboy hat: creased crown, brim curled up at the sides. Tan leather with an accent band.
acc('cowboy-hat', 'head', 'cowboy hat', (ctx, k) => {
  const s = k.seat(0.25), rr = s.rref;
  const H = clamp(0.46, ctx.T - s.y + CLEAR + 0.08, s.room - 0.1), ext = clamp(0.38 + 0.12 * rr, 0.4, 1.38 - s.rmax);
  const prof = profile([[0, -0.03], [rr + ext - 0.04, -0.04], [rr + ext, -0.015, 0.03], [rr + ext - 0.04, 0.015, 0.02], [rr + 0.06, 0.03, 0.04], [rr + 0.04, 0.07], [rr + 0.0, H - 0.08, 0.12], [0, H - 0.02]]);
  const shape = (p, r) => {
    let [x, y, z] = p;
    if (r > rr + 0.05) { const reach = (Math.abs(x) - rr * 0.6) / (ext + rr * 0.4); y += 0.3 * Math.pow(clamp(reach, 0, 1.2), 2) - 0.05 * Math.pow(z / (rr + ext), 2); }
    else if (y > H * 0.45) y -= 0.09 * Math.exp(-((x / 0.14) ** 2)) * sstep(H * 0.45, H, y); // the crease
    return [x, y, z];
  };
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.08, 0);
  k.part(revolve(s, prof, shape), C.leatherTan, { parent: g });
  k.part(bandRing(s, rr + 0.01, rr + 0.07, 0.06, 0.16, 0.02, rr + 0.06), ctx.accent, { parent: g });
});

// Chef's toque: a straight band and a cloud of puffs on top (overlapping blobs, so the ink draws the puffs). White.
acc('chef-hat', 'head', 'chef hat', (ctx, k) => {
  const s = k.seat(0.26), rr = s.rref, bh = 0.18, top = Math.min(ctx.T - s.y + 0.18, s.room - 0.36);
  k.part(bandRing(s, rr - 0.02, rr + 0.05, -0.02, bh, 0.02), C.white);
  k.part(revolve(s, profile([[0, 0], [rr + 0.02, 0], [rr + 0.02, bh + 0.06, 0.08], [0, Math.max(bh + 0.2, ctx.T - s.y + 0.06)]], 6, 0.04)), C.white, { ol: 0 });
  const pr = rr * 0.5, ry = Math.max(bh + 0.14, top * 0.6);
  for (let i = 0; i < 6; i++) {
    const ph = ((i + 0.5) / 6) * TAU, j = Math.round(((i + 0.5) / 6) * s.n) % s.n, R = (s.rho[j] - rr) * 0.8 + rr * 0.62;
    k.part(blob(pr, pr * 0.82, pr), C.white).position.set(s.c.x + Math.sin(ph) * R, s.y + ry, s.c.z + Math.cos(ph) * R);
  }
  k.part(blob(rr * 0.6, rr * 0.46, rr * 0.6), C.white).position.set(s.c.x, Math.min(s.y + ry + rr * 0.28, TOP - 0.06 - rr * 0.46), s.c.z);
});

// Pirate tricorn: the brim turned up on three sides, a point at the front, gold trim along the edge. Black.
acc('tricorn', 'head', 'pirate hat', (ctx, k) => {
  const s = k.seat(0.27), rr = s.rref;
  const hc = clamp(ctx.T - s.y + CLEAR, 0.26, s.room - 0.3), ext = clamp(0.34 + 0.12 * rr, 0.36, 1.4 - s.rmax), up = clamp(s.room - hc * 0.4 - 0.1, 0.2, 0.4);
  const prof = profile([[0, -0.03], [rr + ext - 0.03, -0.03], [rr + ext, 0, 0.02], [rr + ext - 0.03, 0.03, 0.02], [rr + 0.06, 0.035, 0.04], [rr + 0.04, 0.08], [rr + 0.02, hc - 0.1, 0.12], [0, hc]], 6, 0.035);
  // fold: between the three corners (front, ±120°) the brim turns up and pulls in toward the crown
  const fold = (p, r, ph) => {
    if (r <= rr + 0.04) return p;
    const u = clamp((r - rr - 0.04) / (ext - 0.04), 0, 1), w = Math.pow((1 - Math.cos(3 * ph)) / 2, 0.8), f = (r - 0.45 * (r - rr) * u * w) / r;
    return [p[0] * f, p[1] + up * Math.pow(u, 1.2) * w, p[2] * f];
  };
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.1, 0);
  const geo = revolve(s, prof, fold);
  k.part(geo, C.ink, { parent: g });
  // trim: a gold tube along the brim's edge row
  let ie = 0; prof.forEach((q, i) => { if (q[0] > prof[ie][0]) ie = i; });
  const pa = geo.attributes.position, edge = Array.from({ length: s.n }, (_, j) => V(pa.getX(ie * s.n + j), pa.getY(ie * s.n + j), pa.getZ(ie * s.n + j)));
  k.part(new X.TubeGeometry(new X.CatmullRomCurve3(edge, true), 192, 0.032, 10, true), C.gold, { parent: g, ol: 0.016 });
});

// Beret: a soft flat disc worn tilted, with a little stem. Accent colour.
acc('beret', 'head', 'beret', (ctx, k) => {
  const s = k.seat(0.17, { minR: 0.3, maxR: 0.6 }), rr = s.rref;
  const bt = Math.max(0.22, ctx.T - s.y + 0.12);
  const prof = profile([[0, -0.01], [rr + 0.12, 0.0, 0.05], [rr + 0.26, 0.09, 0.08], [rr * 0.55, bt - 0.01, 0.16], [0, bt]]);
  const g = k.tilt(V(s.c.x, s.y, s.c.z), -0.05, 0.26);
  k.part(revolve(s, prof), ctx.accent, { parent: g });
  k.part(revolve(roundSeat(0.04), profile([[0, 0], [0.04, 0, 0.01], [0.035, 0.09, 0.02], [0, 0.095]])), ctx.shade(ctx.accent, 0.25), { parent: g, ol: 0.016 }).position.set(s.c.x, s.y + bt - 0.02, s.c.z);
});

// Propeller cap: panels in accent and yellow, a two-blade propeller on a stem.
acc('propeller-cap', 'head', 'propeller cap', (ctx, k) => {
  const y0 = Math.min(Math.max(ctx.T - 0.38, k.et + 0.06), ctx.T - 0.1), cols = 64, panels = 6;
  const cap = k.capGeo(y0, (t) => 0.05 + 0.02 * t, () => 0, () => 0, 16, cols);
  // panels share the full cap's positions and normals (seamless shading); one hull outlines the whole cap
  const idx = cap.index.array, per = idx.length / cols / 6;
  for (let p = 0; p < panels; p++) {
    const sub = [];
    for (let i = 0; i < per; i++) for (let j = 0; j < cols; j++) if (Math.floor((j / cols) * panels + 0.5) % panels === p) { const o = (i * cols + j) * 6; sub.push(...idx.slice(o, o + 6)); }
    const g = new X.BufferGeometry(); g.setAttribute('position', cap.attributes.position); g.setAttribute('normal', cap.attributes.normal); g.setIndex(sub);
    k.part(g, p % 2 ? C.yellow : ctx.accent, { ol: 0 });
  }
  const hull = new X.Mesh(cap); ctx.addOutline(hull, OL); if (hull.children[0]) ctx.group.add(hull.children[0]);
  k.part(k.rimRoll(cap, 0.035, 0.02), ctx.shade(ctx.accent, 0.2), { ol: 0.02 });
  const top = cap.userData.top, hub = top.y + 0.15;
  k.part(revolve(roundSeat(0.032), profile([[0, 0], [0.032, 0, 0.01], [0.032, 0.17], [0, 0.17]])), C.ink, { ol: 0.015 }).position.set(top.x, top.y - 0.03, top.z);
  k.part(blob(0.065, 0.045, 0.065), C.red, { ol: 0.016 }).position.set(top.x, hub, top.z);
  for (const [sx, col] of [[1, C.red], [-1, C.blue]]) {
    const geo = blob(0.27, 0.026, 0.085); geo.translate(sx * 0.28, 0, 0); geo.rotateX(sx * 0.35); geo.rotateY(0.42);
    k.part(geo, col, { ol: 0.018 }).position.set(top.x, hub, top.z);
  }
});

// Mortarboard: skull cap, a square board seen corner-on, a gold tassel.
acc('mortarboard', 'head', 'mortarboard', (ctx, k) => {
  const y0 = Math.min(Math.max(ctx.T - 0.3, k.et + 0.06), ctx.T - 0.1);
  const cap = k.capGeo(y0, () => 0.045);
  k.part(cap, C.ink);
  k.part(k.rimRoll(cap, 0.045, 0.02), C.ink);
  const top = cap.userData.top, side = clamp(ctx.width * 1.5, 1.05, 1.45);
  const b = new X.Group(); b.position.set(top.x, top.y + 0.03, top.z); b.rotation.set(0.32, Math.PI / 4, 0); ctx.group.add(b);
  k.part(new RoundedBoxGeometry(side, 0.075, side, 3, 0.03), C.ink, { parent: b });
  k.part(blob(0.055, 0.032, 0.055), C.gold, { parent: b, ol: 0.016 }).position.y = 0.05;
  // tassel: cord to the right-hand corner, then hanging
  const corner = V(side / 2 - 0.05, 0.055, side / 2 - 0.05);
  k.part(tube(new X.CatmullRomCurve3([V(0, 0.055, 0), corner.clone().multiplyScalar(0.5).setY(0.065), corner]), () => 0.018, 16, 8), C.gold, { parent: b, ol: 0.012 });
  const cw = corner.clone().applyEuler(b.rotation).add(b.position);
  const hang = new X.CatmullRomCurve3([cw, cw.clone().add(V(0.02, -0.1, 0)), cw.clone().add(V(0.02, -0.25, 0))]);
  k.part(tube(hang, (t) => 0.02 + 0.035 * sstep(0.4, 0.75, t), 16, 10), C.gold, { ol: 0.014 });
});

// ---------- helmets, crowns, halos, bands ----------

// Aviator helmet: a padded leather-style helmet that frames the face (it comes down at the sides and back), ear
// pads, a seam over the top and goggles pushed up on the forehead. An evocation of a pilot, no logo. Accent colour.
acc('pilot-helmet', 'head', 'pilot helmet', (ctx, k) => {
  const y0 = Math.min(Math.max(k.et + 0.02, ctx.T - 0.62), ctx.T - 0.15);
  const window = (ph) => -0.72 * sstep(1.05, 1.75, Math.abs(ph)); // rim elevation per azimuth: low at the sides and back
  const cap = k.capGeo(y0, (t) => 0.075 + 0.02 * t, () => 0, window, 18, 72);
  const helm = k.part(cap, ctx.accent), hitH = k.hitOn(helm), dark = ctx.shade(ctx.accent, 0.25);
  k.part(k.rimRoll(cap, 0.05, 0.035), dark);
  const Q = cap.userData.Q, seam = [];
  for (let i = 0; i <= 18; i++) { const b = 0.1 + (i / 18) * (Math.PI - 0.2), d = V(0, Math.sin(b), Math.cos(b)); const h = hitH(Q.clone().addScaledVector(d, 5), d.clone().negate()); if (h) seam.push(h.p.addScaledVector(d, 0.004)); }
  if (seam.length > 4) k.part(tube(new X.CatmullRomCurve3(seam), () => 0.032, 48, 10), dark, { ol: 0.018 });
  // ear pads on the helmet's sides
  for (const sx of [-1, 1]) {
    const h = hitH(V(sx * 5, y0 - 0.26, Q.z), V(-sx, 0, 0)); if (!h) continue;
    const f = k.part(blob(0.16, 0.19, 0.07), ctx.accent); f.position.copy(h.p).addScaledVector(h.n, 0.02); f.lookAt(f.position.clone().add(h.n));
  }
  // goggles: two lenses in brass frames on the forehead, a bridge and a strap around the helmet
  const yg0 = y0 + 0.16, cg = k.axisAt(yg0), hw = (hitH(V(5, yg0, cg.z), V(-1, 0, 0)) || { p: V(0.6) }).p.x - cg.x;
  const rg = clamp(Math.min(0.15 * ctx.width + 0.04, hw * 0.42), 0.12, 0.19), dx = rg + 0.045, yg = y0 + rg * 0.95;
  const [u, v] = k.flat();
  k.part(k.ribbon(hitH, k.axisAt(yg).setY(yg), u, v, -0.004, 0.05, 0.024), C.ink);
  for (const sx of [-1, 1]) {
    const h = hitH(V(cg.x + sx * dx, yg, 5), V(0, 0, -1)); if (!h) continue;
    const n = h.n.clone().lerp(V(0, 0, 1), 0.35).normalize();
    const lens = new X.Group(); lens.position.copy(h.p).addScaledVector(n, 0.02); lens.lookAt(lens.position.clone().add(n)); lens.rotateZ(sx * 0.12); ctx.group.add(lens);
    k.part(new X.TorusGeometry(rg, 0.048, 14, 48), C.brass, { parent: lens, ol: 0.02, cast: false }).position.z = 0.045;
    k.part(blob(rg * 0.98, rg * 0.98, 0.055), C.lens, { parent: lens, ol: 0, emissive: C.lens, cast: false }).position.z = 0.035;
    const gl = new X.Mesh(new X.CircleGeometry(rg * 0.24, 20), new X.MeshBasicMaterial({ color: '#ffffff' })); gl.position.set(-rg * 0.36, rg * 0.36, 0.095); lens.add(gl);
  }
  const hb = hitH(V(cg.x, yg, 5), V(0, 0, -1));
  if (hb) k.part(blob(0.07, 0.04, 0.04), C.brass, { ol: 0.016 }).position.copy(hb.p).add(V(0, 0, 0.04));
});

// Horned helmet: steel cap with a brass rim and ridge, ivory horns curving up. Fixed colours.
acc('viking-helmet', 'head', 'horned helmet', (ctx, k) => {
  const y0 = Math.min(Math.max(ctx.T - 0.48, k.et + 0.05), ctx.T - 0.12);
  const cap = k.capGeo(y0, (t) => 0.055 + 0.025 * t, (t) => 0.07 * t * t);
  const helm = k.part(cap, C.steel, { metal: 1 }), hitH = k.hitOn(helm), Q = cap.userData.Q;
  k.part(k.rimRoll(cap, 0.06, 0.04), C.brass);
  // ridge, front to back over the top: points on the helmet in the mid plane
  const ridge = [];
  for (let i = 0; i <= 16; i++) { const b = 0.12 + (i / 16) * (Math.PI - 0.24), d = V(0, Math.sin(b), Math.cos(b)); const h = hitH(Q.clone().addScaledVector(d, 5), d.clone().negate()); if (h) ridge.push(h.p.addScaledVector(d, 0.005)); }
  if (ridge.length > 4) k.part(tube(new X.CatmullRomCurve3(ridge), () => 0.042, 48, 12), C.brass);
  for (const sx of [-1, 1]) {
    const h = hitH(V(sx * 5, y0 + 0.17, Q.z), V(-sx, 0, 0)); if (!h) continue;
    const reach = clamp(1.48 - Math.abs(h.p.x), 0.25, 0.44), p0 = h.p.clone().add(V(-sx * 0.08, 0, 0));
    const curve = new X.CatmullRomCurve3([p0, p0.clone().add(V(sx * reach * 0.6, 0.04, 0)), p0.clone().add(V(sx * reach, 0.25, 0)), p0.clone().add(V(sx * reach * 0.85, 0.48, 0))]);
    k.part(tube(curve, (t) => 0.105 - 0.068 * t, 32, 16), C.ivory);
  }
});

// Royal crown: a gold band with five pearl-tipped points, an accent velvet dome and a gem. Perched on top.
acc('royal-crown', 'head', 'royal crown', (ctx, k) => {
  const s = k.seat(0.18, { minR: 0.32, maxR: 0.56 }), rr = s.rref, hb = 0.22;
  const band = k.part(bandRing(s, rr - 0.01, rr + 0.055, -0.02, hb, 0.025, rr + 0.1), C.gold, { metal: 1 });
  k.part(revolve(s, profile([[0, 0], [rr + 0.02, 0.0], [rr + 0.05, 0.14, 0.1], [0, Math.max(0.42, ctx.T - s.y + 0.12)]], 6, 0.03)), ctx.accent);
  for (let i = 0; i < 5; i++) {
    const ph = (i / 5) * TAU, j = Math.round((i / 5) * s.n) % s.n, R = s.rho[j] + 0.065;
    const base = V(s.c.x + Math.sin(ph) * R, s.y + hb - 0.04, s.c.z + Math.cos(ph) * R), out = V(Math.sin(ph), 0, Math.cos(ph));
    const tip = base.clone().add(V(0, 0.18, 0)).addScaledVector(out, 0.045);
    k.part(tube(new X.CatmullRomCurve3([base, base.clone().lerp(tip, 0.5).addScaledVector(out, 0.005), tip]), (t) => 0.072 - 0.04 * t, 12, 12), C.gold, { metal: 1, ol: 0.02 });
    k.part(blob(0.052, 0.052, 0.052, 20, 14), '#fff4dc', { ol: 0.016 }).position.copy(tip).add(V(0, 0.04, 0));
  }
  const h = k.hitOn(band)(V(s.c.x, s.y + hb * 0.45, 5), V(0, 0, -1));
  // gem with an ink ring at its rim (its hull showed as a detached ring on the flared band)
  if (h) {
    const gm = k.part(blob(0.065, 0.075, 0.035), '#e5486b', { ol: 0 }); gm.position.copy(h.p).addScaledVector(h.n, 0.032); gm.lookAt(gm.position.clone().add(h.n));
    const rg = new X.TorusGeometry(0.068, 0.012, 8, 40); rg.scale(1, 1.13, 1); gm.add(new X.Mesh(rg, new X.MeshBasicMaterial({ color: ctx.line })));
  }
});

// Afterlife halo: a flat sun-yellow ring floating well above the head, tilted toward the viewer and rolled a
// little so it reads as a ring in perspective, with a pale highlight on its top face. Distinct from the round
// gold 'halo' torus.
acc('halo-ring', 'head', 'halo ring', (ctx, k) => {
  const c = k.axisAt(ctx.T - 0.05), R = clamp(ctx.width * 0.55, 0.45, 0.6);
  const ring = new X.Group(); ring.position.set(c.x, Math.min(ctx.T + 0.38, TOP - 0.05 - 0.41 * R), c.z);
  ring.rotation.order = 'ZYX'; ring.rotation.set(Math.PI / 2 + 0.42, 0, 0.1); ctx.group.add(ring); // tilt (front edge down), then roll
  const g = new X.TorusGeometry(R, 0.065, 12, 96); g.scale(1, 1, 0.48); // flat band, wider than tall
  k.part(g, '#ffe066', { parent: ring, emissive: '#ffe066', ol: 0.018 });
  const hl = new X.TorusGeometry(R, 0.022, 8, 96); hl.scale(1, 1, 0.6);
  const m = new X.Mesh(hl, new X.MeshBasicMaterial({ color: '#fff7c8' })); m.position.z = -0.022; ring.add(m); // the top face is local -z
});

// Headband with a knot and two tails at the side. Accent colour.
acc('headband', 'head', 'headband', (ctx, k) => {
  const y = Math.min(k.et + 0.1, ctx.T - 0.1), c = k.axisAt(y), [u, v] = k.flat();
  k.part(k.ribbon(k.hitBody, c, u, v, 0.01, 0.08, 0.032), ctx.accent);
  const ph = 0.62 * Math.PI, d = V(Math.sin(ph), 0, Math.cos(ph)), h = k.hitBody(c.clone().addScaledVector(d, 5), d.clone().negate());
  if (!h) return;
  const kp = h.p.clone().addScaledVector(d, 0.09);
  k.part(blob(0.085, 0.08, 0.075), ctx.shade(ctx.accent, 0.12)).position.copy(kp);
  for (const [a, l] of [[-0.45, 0.42], [-1.05, 0.34]]) {
    const dir = V(d.x * Math.cos(a), Math.sin(a), d.z * Math.cos(a) - 0.25).normalize();
    const curve = new X.CatmullRomCurve3([kp, kp.clone().addScaledVector(dir, l * 0.5).add(V(0, 0.025, 0)), kp.clone().addScaledVector(dir, l)]);
    k.part(tube(curve, (t) => 0.048 - 0.012 * t, 16, 12), ctx.accent);
  }
});

// ---------- toppers: reworked built-ins (same names, so they replace the rig's versions everywhere) ----------
// They stay near the head's axis (within about ±0.3), so they combine with any ears, which sit further out.

// A leaf: a lens-shaped blade swept along its length, widest near the base, folded along the midrib (the two
// halves take the two toon tones) and curled back toward the tip. Base at the origin, tip at (0, L).
function leafGeo(L, W, th = 0.028, fold = 0.32, curl = 0.16) {
  const rows = 28, cols = 24, w = (t) => W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
  const g = grid(rows + 1, cols, (i, j) => {
    const t = i / rows, a = (j / cols) * TAU, x = Math.cos(a) * w(t);
    return [x, t * L, Math.sin(a) * th * Math.sqrt(w(t) / W) + fold * Math.abs(x) - curl * t * t * L];
  }, (i) => V(0, (i / rows) * L, -curl * (i / rows) ** 2 * L));
  // weld the poles (base and tip) so the ink hull closes to a point instead of fanning into slivers
  g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-6); m.computeVertexNormals(); return m;
}

// Leaf sprout: a curved stem with a big leaf and a small one, each with a darker midrib. Fixed greens.
// Replaces the built-in 'sprout'.
acc('sprout', 'head', 'leaf', (ctx, k) => {
  const { p } = k.crown(), s = clamp((TOP - p.y) / 0.8, 0.6, 1);
  const tip = p.clone().add(V(0.03 * s, 0.26 * s, 0.01));
  k.part(tube(new X.CatmullRomCurve3([p.clone().add(V(0, -0.06, 0)), p.clone().add(V(-0.015, 0.13 * s, 0)), tip]), (t) => 0.048 - 0.014 * t, 20, 12), '#5a9a3c', { ol: 0.02 });
  const leaf = (L, W, col, at, rz, rx) => {
    L *= s; W *= s; const th = 0.03, curl = 0.16, w = (t) => W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
    const m = k.part(leafGeo(L, W, th, 0.32, curl), col, { ol: 0.02 }); m.position.copy(at); m.rotation.set(rx, 0.15, rz);
    const rib = new X.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => { const t = 0.06 + (i / 8) * 0.8; return V(0, t * L, th * Math.sqrt(w(t) / W) - curl * t * t * L + 0.002); }));
    m.add(new X.Mesh(new X.TubeGeometry(rib, 24, 0.011, 6), ctx.mat(ctx.shade(col, 0.28))));
  };
  leaf(0.62, 0.2, '#7cc95e', tip, -0.6, -0.32);
  leaf(0.38, 0.125, '#96d873', tip.clone().add(V(-0.01, -0.07 * s, 0)), 0.95, -0.25);
});

// Sweep a flattened cross-section along a curve lying roughly in the xy plane: wide in that plane (r), thin
// across it (r · aspect). Rounded ends. A lock of hair rather than a wire.
function strand(curve, rf, aspect = 0.5, segs = 64, radial = 14) {
  const rows = [], z = new X.Vector3(0, 0, 1), capN = 5;
  const frame = (t) => { const T = curve.getTangentAt(t), N = new X.Vector3().crossVectors(T, z).normalize(); return { T, N, B: new X.Vector3().crossVectors(N, T) }; };
  const ring = (c, f, r) => ({ c, N: f.N, B: f.B, r });
  const f0 = frame(0), f1 = frame(1), p0 = curve.getPointAt(0), p1 = curve.getPointAt(1);
  for (let k2 = capN; k2 >= 1; k2--) { const a = (k2 / capN) * Math.PI / 2; rows.push(ring(p0.clone().addScaledVector(f0.T, -rf(0) * Math.sin(a)), f0, rf(0) * Math.cos(a))); }
  for (let i = 0; i <= segs; i++) rows.push(ring(curve.getPointAt(i / segs), frame(i / segs), rf(i / segs)));
  for (let k2 = 1; k2 <= capN; k2++) { const a = (k2 / capN) * Math.PI / 2; rows.push(ring(p1.clone().addScaledVector(f1.T, rf(1) * Math.sin(a)), f1, rf(1) * Math.cos(a))); }
  return grid(rows.length, radial, (i, j) => { const R = rows[i], a = (j / radial) * TAU, q = R.c.clone().addScaledVector(R.N, Math.cos(a) * R.r).addScaledVector(R.B, Math.sin(a) * R.r * aspect); return [q.x, q.y, q.z]; }, (i) => rows[i].c);
}

// Ahoge (registered as 'curl'): a single springy strand of hair standing up from the crown, in the body colour.
// Thick at the root, thin with a rounded tip; it leans one way, then arcs over the other way and droops (a gentle
// S). Flat in section, like a lock of hair. Replaces the built-in 'curl'.
acc('curl', 'head', 'curl', (ctx, k) => {
  const { p } = k.crown(), s = clamp((TOP - p.y) / 0.5, 0.6, 1.15), sx = Math.min(s, 0.85); // narrow: it stays clear of ears
  const pts = [[0, -0.1], [-0.045, 0.07], [-0.04, 0.2], [0.03, 0.33], [0.13, 0.41], [0.23, 0.41], [0.29, 0.35]];
  const curve = new X.CatmullRomCurve3(pts.map(([x, y]) => p.clone().add(V(x * sx, y * s, 0.02))));
  k.part(strand(curve, (t) => (0.028 + 0.115 * Math.pow(1 - t, 1.3)) * Math.min(1.1, s), 0.5, 72), ctx.fill, { ol: 0.022 });
});

// Antennae: two stalks near the middle of the head, splaying out, with glowing accent bulbs. Replaces the
// built-in 'antenna' (which sat exactly where ears go).
acc('antenna', 'head', 'antennae', (ctx, k) => {
  const { p } = k.crown(), s = clamp((TOP - p.y) / 0.5, 0.6, 1);
  for (const sx of [-1, 1]) {
    const h = k.hitBody(V(p.x + sx * 0.14, 5, p.z + 0.02), V(0, -1, 0)); if (!h) continue;
    const b = h.p.clone().add(V(0, -0.04, 0)), top = h.p.clone().add(V(sx * 0.15 * s, 0.36 * s, 0.03));
    k.part(tube(new X.CatmullRomCurve3([b, h.p.clone().add(V(sx * 0.02, 0.18 * s, 0)), top]), () => 0.024, 24, 10), ctx.shade(ctx.fill, 0.45), { ol: 0.016 });
    k.part(blob(0.075, 0.075, 0.075, 24, 16), ctx.accent, { emissive: ctx.accent, ol: 0.018 }).position.copy(top).add(V(sx * 0.01, 0.05, 0));
  }
});

// a smooth closed 2D outline through the given points
const smooth2D = (pts, n = 48) => new X.CatmullRomCurve3(pts.map(([x, y]) => V(x, y, 0)), true, 'centripetal').getSpacedPoints(n).slice(0, n).map((v) => [v.x, v.y]);

// Ribbon bow: two puffy loops gathered into a knot, two notched tails. Accent colour. Replaces the built-in
// 'bow'. Worn high on the side of the head (the top is where ears go); with ears there, it is pinned on the ear.
acc('bow', 'head', 'bow', (ctx, k) => {
  const h = ctx.onSurf(0.58, 0.66, 0.5); if (!h) return;
  const g = new X.Group(); g.position.copy(h.p).addScaledVector(h.n, 0.06); g.lookAt(g.position.clone().add(h.n.clone().lerp(V(0, 0, 1), 0.55))); g.rotateZ(-0.45); g.scale.setScalar(1.15); ctx.group.add(g);
  const wing = [[0.02, 0.05], [0.14, 0.17], [0.27, 0.16], [0.33, 0.03], [0.3, -0.1], [0.16, -0.14], [0.03, -0.05]];
  const tail = [[-0.005, -0.02], [0.065, -0.03], [0.14, -0.25], [0.09, -0.21], [0.045, -0.27]];
  const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
  const shapeGeo = (pts, depth, bevel, bend) => { const geo = puffy(pts, depth, bevel), q = geo.attributes.position; for (let i = 0; i < q.count; i++) { const [x, y, z] = bend(q.getX(i), q.getY(i), q.getZ(i)); q.setXYZ(i, x, y, z); } geo.computeVertexNormals(); return geo; };
  // the loops narrow into the knot (gathered fabric) and sweep back at their ends
  const gather = (x, y, z) => [x, y * (0.45 + 0.55 * sstep(0.02, 0.14, Math.abs(x))), z - 0.55 * x * x];
  for (const pts of [wing, mirror(wing)]) k.part(shapeGeo(smooth2D(pts), 0.06, 0.035, gather), ctx.accent, { parent: g });
  for (const pts of [tail, mirror(tail)]) k.part(shapeGeo(pts, 0.025, 0.018, (x, y, z) => [x, y, z - 0.05 - 0.3 * y * y]), ctx.shade(ctx.accent, 0.08), { parent: g, ol: 0.02 });
  k.part(blob(0.07, 0.085, 0.07), ctx.shade(ctx.accent, 0.18), { parent: g }).position.z = 0.02;
  k.inFront(g);
});

// Headphones: padded cups at the sides of the head (accent shell, dark cushion) on a band that follows the head
// with a padded top. Replaces the built-in 'headphones'.
acc('headphones', 'head', 'headphones', (ctx, k) => {
  const yc = Math.max(ctx.face.ey - 0.05, ctx.face.minY + 0.35), c = k.axisAt(yc), dark = ctx.shade(ctx.accent, 0.5);
  const r = 0.24, depth = 0.15;
  const shell = profile([[0, 0], [r, 0, 0.03], [r, depth * 0.65, 0.06], [r * 0.62, depth, 0.07], [0, depth + 0.005]]);
  const ends = [];
  for (const sx of [-1, 1]) {
    const h = k.hitBody(V(sx * 5, yc, c.z), V(-sx, 0, 0)); if (!h) continue;
    const n = h.n.clone().lerp(V(sx, 0, 0), 0.6).normalize();
    const cup = new X.Group(); cup.position.copy(h.p).addScaledVector(n, 0.07); cup.quaternion.setFromUnitVectors(V(0, 1, 0), n); ctx.group.add(cup);
    k.part(revolve(roundSeat(r), shell), ctx.accent, { parent: cup });
    k.part(new X.TorusGeometry(r * 0.78, 0.06, 12, 40), dark, { parent: cup, ol: 0.02 }).rotation.x = Math.PI / 2;
    k.part(revolve(roundSeat(r * 0.42), profile([[0, 0], [r * 0.42, 0, 0.02], [r * 0.4, 0.035, 0.02], [0, 0.04]])), ctx.tint(ctx.accent, 0.3), { parent: cup, ol: 0.014 }).position.y = depth - 0.012;
    ends.push(h.p.clone().addScaledVector(n, 0.11).add(V(0, r * 0.5, -r * 0.3)));
  }
  if (ends.length < 2) return;
  // the band: points over the head in a plane through both cups, tilted back so it passes behind any ears,
  // pushed out from the surface
  const arch = [ends[0]], back = 0.38;
  for (let i = 1; i < 12; i++) { const a = Math.PI - (i / 12) * Math.PI, d = V(Math.cos(a), Math.sin(a) * Math.cos(back), -Math.sin(a) * Math.sin(back)); const hh = k.hitBody(c.clone().addScaledVector(d, 5), d.clone().negate()); if (hh && hh.p.y > yc + r * 0.6) arch.push(hh.p.addScaledVector(d, 0.1)); }
  arch.push(ends[1]);
  k.part(tube(new X.CatmullRomCurve3(arch), (t) => 0.042 + 0.026 * sstep(0.3, 0.42, t) * (1 - sstep(0.58, 0.7, t)), 64, 12), dark, { ol: 0.022 });
});

// ---------- side and face details ----------

// Flower tucked on the upper side of the head: accent petals, yellow heart. It takes the lowest spot, going from
// the side of the head up to the top, where the whole flower clears the eyes; on squat bodies that is the top, and
// it is lifted if even that is too low. With ears there, it sits on the ear.
acc('flower', 'head', 'flower', (ctx, k) => {
  const s = clamp(ctx.width, 0.85, 1.05) * 1.3, reach = 0.2 * s, clear = k.et + 0.03 + reach * 0.85;
  let h = null;
  for (let t = 0; t <= 1.001 && !(h && h.p.y >= clear); t += 0.1) h = ctx.onSurf(-0.62 + 0.42 * t, 0.62 + 0.38 * t, 0.45 - 0.3 * t) || h;
  if (!h) return;
  const n = h.n.clone().lerp(V(0, 0.25, 1).normalize(), 0.5).normalize();
  const f = new X.Group(); f.position.copy(h.p).addScaledVector(h.n, 0.06); f.position.y = Math.max(f.position.y, clear);
  f.lookAt(f.position.clone().add(n)); f.rotateZ(0.3); ctx.group.add(f);
  for (let i = 0; i < 5; i++) {
    const g = blob(0.075 * s, 0.115 * s, 0.035 * s, 24, 14); g.translate(0, 0.105 * s, 0); g.rotateZ((i / 5) * TAU);
    k.part(g, ctx.accent, { parent: f, ol: 0.018 });
  }
  k.part(blob(0.062 * s, 0.062 * s, 0.045 * s), C.yellow, { parent: f, ol: 0.018 }).position.z = 0.035 * s;
  k.inFront(f);
});

// Lightning-bolt scar on the forehead: a red decal with an ink rim, projected onto the body.
acc('bolt-scar', 'face', 'bolt scar', (ctx, k) => {
  const f = ctx.face, y = Math.min(k.et + 0.1, ctx.T - 0.12), x = f.fx0 + 0.12;
  const h = k.hitBody(V(x, y, 5), V(0, 0, -1)); if (!h) return;
  const bolt = [[0.05, 0.5], [0.3, 0.5], [0.1, 0.08], [0.28, 0.08], [-0.18, -0.5], [-0.02, -0.06], [-0.2, -0.06]];
  const size = 0.3, n = h.n.clone().lerp(V(0, 0, 1), 0.3).normalize(), hitN = k.near(h.p, 0.6);
  const uy = V(0, 1, 0).addScaledVector(n, -n.y).normalize(), ux = V().crossVectors(uy, n).normalize();
  const decal = (pts, color, lift) => {
    const g = subdivide(new X.ShapeGeometry(new X.Shape(pts.map(([a, b]) => new X.Vector2(a * size, b * size)))).toNonIndexed(), 2);
    const p = g.attributes.position, nrm = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const o = h.p.clone().addScaledVector(ux, p.getX(i)).addScaledVector(uy, p.getY(i)).addScaledVector(n, 0.6), q = hitN(o, n.clone().negate());
      const pt = q ? q.p.addScaledVector(q.n, lift) : o; p.setXYZ(i, pt.x, pt.y, pt.z); const nn = q ? q.n : n; nrm.set([nn.x, nn.y, nn.z], i * 3);
    }
    g.setAttribute('normal', new X.BufferAttribute(nrm, 3));
    const m = k.part(g, color, { ol: 0, cast: false }); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2;
  };
  decal(inflate(bolt, 0.09), ctx.line, 0.006);
  decal(bolt, C.scar, 0.012);
});

// Monocle: a gold ring around one eye and a thin cord. The ring is lifted point by point wherever the face
// slopes up toward it (a flat ring sank into the bell and slime faces).
acc('monocle', 'face', 'monocle', (ctx, k) => {
  const E = ctx.eyes.R, a = E.W * 1.16, b = E.H * 1.1, z0 = E.D * 0.78;
  E.anchor.updateMatrixWorld(true);
  const az = V(0, 0, 1).transformDirection(E.anchor.matrixWorld), inv = E.anchor.matrixWorld.clone().invert(), hitN = k.near(E.anchor.localToWorld(V()), a + b + 0.3);
  const pts = Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * TAU, q = V(Math.cos(t) * a, Math.sin(t) * b, 0), w = E.anchor.localToWorld(q.clone());
    const h = hitN(w.clone().addScaledVector(az, 1), az.clone().negate()), zs = h ? h.p.applyMatrix4(inv).z : -1;
    return q.setZ(Math.max(z0, zs + 0.06));
  });
  for (let pass = 0; pass < 2; pass++) { const z = pts.map((q) => q.z); pts.forEach((q, i) => q.setZ(Math.max(z[i], (z[(i + 47) % 48] + z[i] + z[(i + 1) % 48]) / 3))); }
  k.part(new X.TubeGeometry(new X.CatmullRomCurve3(pts, true), 96, 0.036, 12, true), C.gold, { parent: E.anchor, metal: 1, ol: 0.018, cast: false }); // its shadow read as a second ring
  const p0 = E.anchor.localToWorld(pts[45].clone()), ye = ctx.face.mouthY - 0.12;
  const end = k.hitBody(V(5, ye, 2.5), V(-2, 0, -1)) || { p: V(ctx.width, ye, 0.3), n: V(1, 0, 0) };
  const mx = (p0.x + end.p.x) / 2 + 0.04, my = Math.min(p0.y, ye) - 0.1, hm = k.hitBody(V(mx, my, 5), V(0, 0, -1));
  const sag = hm ? hm.p.addScaledVector(hm.n, 0.05) : V(mx, my, 0.8);
  k.part(tube(new X.CatmullRomCurve3([p0, sag, end.p.clone().addScaledVector(end.n, 0.015)]), () => 0.011, 32, 8), C.ink, { ol: 0, cast: false });
});

// Eye patch over one eye, with a strap across the forehead and around the head. Hides that eye.
// The patch is a closed lens projected onto the face (domed over the eye, flush at the edge), so it sits right
// on sloped faces too.
acc('eyepatch', 'face', 'eye patch', (ctx, k) => {
  const E = ctx.eyes.L, M = 10, cols = 48, a = E.W * 1.2, b = E.H * 1.12, H0 = E.D * 0.82;
  E.anchor.updateMatrixWorld(true);
  const o = E.anchor.localToWorld(V()), m = E.anchor.matrixWorld, ax = V(1, 0, 0).transformDirection(m), ay = V(0, 1, 0).transformDirection(m), az = V(0, 0, 1).transformDirection(m);
  const surf = [], hitN = k.near(o, a + b + 0.3);
  for (let i = 0; i <= M; i++) for (let j = 0; j < cols; j++) {
    const r = i / M, th = (j / cols) * TAU, q = o.clone().addScaledVector(ax, Math.cos(th) * a * r).addScaledVector(ay, Math.sin(th) * b * r);
    const h = hitN(q.clone().addScaledVector(az, 1), az.clone().negate()); surf.push(h ? h.p : q);
  }
  // rows 0..M: top sheet from the centre to the edge; rows M+1..2M: bottom sheet back to the centre
  const ring = (i) => (i <= M ? i : 2 * M - i), lift = (i) => (i <= M ? 0.012 + H0 * Math.pow(Math.max(0, 1 - (i / M) ** 2), 0.6) : -0.012);
  const geo = grid(2 * M + 1, cols, (i, j) => { const q = surf[ring(i) * cols + j].clone().addScaledVector(az, lift(i)); return [q.x, q.y, q.z]; },
    (i, j) => surf[ring(i) * cols + j].clone().addScaledVector(az, i <= M ? -0.05 : 0.2));
  k.part(geo, C.ink, { ol: 0 });
  // ink edge: a tube along the rim rather than the hull (on a lens lying on the skin the hull showed as a detached ring)
  const edge = Array.from({ length: cols }, (_, j) => surf[M * cols + j].clone().addScaledVector(az, 0.012));
  k.part(new X.TubeGeometry(new X.CatmullRomCurve3(edge, true), 96, 0.026, 8, true), new X.MeshBasicMaterial({ color: ctx.line }), { ol: 0, cast: false });
  // the covered eye is hidden (ball and lids; pose() toggles the eye group and the glint, so the glint is scaled away)
  E.ball.visible = E.lidT.visible = E.lidB.visible = false; if (E.glint) E.glint.scale.setScalar(1e-4);
  ctx.eyes.R.anchor.updateMatrixWorld(true);
  const A = E.anchor.localToWorld(V(0.1 * E.W, E.H * 0.85, 0)), B = ctx.eyes.R.anchor.localToWorld(V(ctx.eyes.R.W * 1.3, ctx.eyes.R.H * 1.15, 0));
  const u = V(B.x - A.x, B.y - A.y, 0).normalize(), v = V(0, 0, 1), c = k.axisAt(A.y).setY(A.y + (0 - A.x) * (u.y / u.x));
  k.part(k.ribbon(k.hitBody, c, u, v, 0.012, 0.036, 0.02), C.ink, { ol: 0.016 });
});

// ---------- eye styles ----------
// Painted into the iris area of the eyeball texture, in the toon look of the default iris: flat posterised
// bands, no gradients. `iris` is the creature's eye colour (user-chosen); `pupil` dilates with the voice.
// Special irises are drawn 10% larger than the default one so their pattern survives small sizes.
const DARK = '#140d16', BIG = 1.1;
function disc(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
// the shared iris base: dark rim, body, light crescent at the bottom, shade band at the top
function irisBase(o, R, rim = 0.86) {
  const { g, cx, cy, iris, shade, tint } = o;
  disc(g, cx, cy, R, shade(iris, 0.55)); disc(g, cx, cy, R * rim, iris);
  g.fillStyle = tint(iris, 0.38); g.beginPath(); g.ellipse(cx, cy + R * 0.38, R * 0.62, R * 0.36, 0, 0, Math.PI); g.fill();
  g.fillStyle = shade(iris, 0.3); g.beginPath(); g.arc(cx, cy, R * rim, Math.PI * 1.08, Math.PI * 1.92); g.arc(cx, cy - R * 0.12, R * 0.7, Math.PI * 1.92, Math.PI * 1.08, true); g.fill();
}
function starPath(g, x, y, r1, r0, k = 5, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < k * 2; i++) { const a = rot + (i / (k * 2)) * TAU, r = i % 2 ? r0 : r1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
function heartPath(g, x, y, s) { g.save(); g.translate(x, y + s * 0.1); g.scale(s / 11, s / 11); g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-6, 3, -11, 0, -11, -5); g.bezierCurveTo(-11, -9, -8, -11, -5.5, -11); g.bezierCurveTo(-3, -11, -1, -9.5, 0, -7.5); g.bezierCurveTo(1, -9.5, 3, -11, 5.5, -11); g.bezierCurveTo(8, -11, 11, -9, 11, -5); g.bezierCurveTo(11, 0, 6, 3, 0, 8); g.restore(); }
// four-point twinkle
function twinkle(g, x, y, r, col = '#ffffff') { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

// `reaction: true` marks what the eyes do when the creature reacts (hearts, stars, sparkles), as opposed to an
// eye type the creature always has; the creator offers only eye types.
const style = (name, label, draw, extra = {}) => { EYE_STYLES[name] = { label, draw: (o) => draw(o, o.R * BIG), ...extra }; };

// Three commas circling the pupil on a thin ring (an evocation of anime 'power eyes', drawn from the
// traditional tomoe motif; colour is the creature's iris)
style('tomoe', 'tomoe', (o, R) => {
  const { g, cx, cy, pupil } = o;
  irisBase(o, R);
  const rr = R * 0.56;
  g.strokeStyle = DARK; g.lineWidth = R * 0.06; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
  disc(g, cx, cy, R * (0.12 + 0.28 * pupil), DARK);
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + (i * TAU) / 3;
    // the round head, then a tail tapering along the ring
    for (let s = 0; s <= 16; s++) { const t = s / 16, a = a0 + t * 1.0; disc(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * (0.17 - 0.15 * t), DARK); }
    disc(g, cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, R * 0.2, DARK);
  }
});

// Concentric rings in a pale iris, small pupil (rings spread as the pupil dilates)
style('ripple', 'ripple', (o, R) => {
  const { g, cx, cy, iris, pupil, shade, tint } = o;
  disc(g, cx, cy, R, shade(iris, 0.6)); disc(g, cx, cy, R * 0.9, tint(iris, 0.3));
  const p0 = R * (0.1 + 0.18 * pupil);
  g.strokeStyle = shade(iris, 0.65); g.lineWidth = R * 0.075;
  for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, cy, p0 + ((R * 0.9 - p0) * i) / 3.6, 0, TAU); g.stroke(); }
  disc(g, cx, cy, p0, DARK);
});

// Reaction: star-shaped pupil with a warm twinkle in it
style('star', 'star', (o, R) => {
  const { g, cx, cy, pupil } = o;
  irisBase(o, R);
  g.fillStyle = DARK; g.lineJoin = 'round'; g.strokeStyle = DARK; g.lineWidth = R * 0.1;
  const r = R * (0.4 + 0.5 * pupil); starPath(g, cx, cy, r, r * 0.5); g.fill(); g.stroke();
  twinkle(g, cx, cy, r * 0.42, '#ffe9a8');
}, { reaction: true });

// Reaction: heart-shaped iris with a heart-shaped pupil
style('heart', 'heart', (o, R) => {
  const { g, cx, cy, iris, pupil, shade, tint } = o;
  g.fillStyle = shade(iris, 0.55); heartPath(g, cx, cy, R * 1.05); g.fill();
  g.fillStyle = iris; heartPath(g, cx, cy + R * 0.02, R * 0.88); g.fill();
  g.fillStyle = tint(iris, 0.38); g.beginPath(); g.ellipse(cx, cy + R * 0.3, R * 0.42, R * 0.22, 0, 0, Math.PI); g.fill();
  g.fillStyle = DARK; heartPath(g, cx, cy + R * 0.02, R * (0.2 + 0.5 * pupil)); g.fill();
}, { reaction: true });

// Reaction: shoujo sparkle, deep top shade, big pupil, twinkles
style('sparkle', 'sparkle', (o, R) => {
  const { g, cx, cy, iris, pupil, shade, tint } = o;
  disc(g, cx, cy, R, shade(iris, 0.6)); disc(g, cx, cy, R * 0.88, iris);
  g.fillStyle = shade(iris, 0.38); g.beginPath(); g.arc(cx, cy, R * 0.88, Math.PI, TAU); g.arc(cx, cy - R * 0.05, R * 0.7, TAU, Math.PI, true); g.fill();
  g.fillStyle = tint(iris, 0.45); g.beginPath(); g.ellipse(cx, cy + R * 0.42, R * 0.6, R * 0.32, 0, 0, Math.PI); g.fill();
  disc(g, cx, cy, R * (0.3 + 0.45 * pupil), DARK);
  twinkle(g, cx - R * 0.4, cy + R * 0.28, R * 0.36);
  disc(g, cx + R * 0.36, cy + R * 0.42, R * 0.1, '#ffffff');
  twinkle(g, cx + R * 0.1, cy - R * 0.48, R * 0.2);
}, { reaction: true });

// Robot LED: dark lens, a segmented bright ring and a bright core that grows with the voice
style('led', 'LED', (o, R) => {
  const { g, cx, cy, iris, pupil, tint, mix } = o;
  disc(g, cx, cy, R, '#10131a'); disc(g, cx, cy, R * 0.92, '#1b2030');
  const lit = tint(iris, 0.55);
  g.strokeStyle = lit; g.lineWidth = R * 0.15; g.lineCap = 'butt';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.arc(cx, cy, R * 0.68, a + 0.08, a + TAU / 12 - 0.08); g.stroke(); }
  disc(g, cx, cy, R * (0.18 + 0.4 * pupil), mix(lit, '#ffffff', 0.25));
  disc(g, cx, cy, R * (0.08 + 0.18 * pupil), '#ffffff');
});

// geometry helpers, shared with acts.js (effects and props in the same style)
export const geo = { grid, profile, revolve, roundSeat, tube, blob, puffy, starPts, smooth2D, strand, leafGeo, mergeVertices, RoundedBoxGeometry };
