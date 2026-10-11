import { n, rng, uid, type Rng } from "./core";

/* Stage backgrounds ("fondos"), like a video call's virtual backgrounds: plain colours and gradients (today's tint
 * by the bicho's tone among them) and illustrated scenes. Like the desk, the backdrop is a small spec (here just an
 * id) that the conversation's seed rolls by default and the person can override.
 *
 * Scenes sit *behind* the cast, so they speak a quieter version of its language: two-stop gradients and flat
 * shapes, no ink outline, muted and lower in contrast than any bicho, with depth from mist bands and a soft vignette
 * (all gradients: no SVG filters). Each scene carries a light and a dark variant.
 *
 * Geometry. A backdrop is one <svg> that fills its box (the stage tile) in three layers:
 *   - box: tile-relative plain colours and gradients, whatever the tile's shape;
 *   - scene: an 800 × 440 frame pinned to the tile's bottom centre (1 unit = 1 px on a 440 px tall tile), cropped at
 *     the sides when the tile is narrower. What matters stays in the middle ~420: horizon near y 300, so a bicho
 *     stands on the ground (its feet at ~357) and a desk in front (top edge at ~310) still leaves the sky showing;
 *   - mount: what a poster hangs from (a post, a tree, a lamp post, balloons...), in px around the tile's top
 *     centre, for a poster centred near the top (the lab's "desconectado" wanted poster spans x ±92, y 40–280).
 *     Hidden unless the host shows `.bd-mount`. Wall scenes need none.
 * How a poster hangs is part of the spec: the root <svg> carries `data-hang` = "pin" (flat on a wall or surface: the
 * host pins it there), "mount" (the scene draws what it hangs from) or "float" (space: nothing holds it).
 * Animation is CSS only (BACKDROP_CSS), gentle, and stops under reduced motion. */

export type Theme = "dark" | "light";

interface Ctx {
  dark: boolean;
  tone: string;
  /** A per-render unique id, so several backdrops on one page (the stage and its thumbnails) never share one. */
  id(name: string): string;
}
interface Layers { defs?: string; box?: string; scene?: string; mount?: string }
export interface Backdrop {
  label: string;
  kind: "plain" | "scene";
  /** Skip the soft vignette (today's tint must stay exactly as it was). */
  flat?: boolean;
  /** How a poster hangs here; by default "mount" when the scene draws one, else "pin" (a wall). */
  hang?: "pin" | "mount" | "float";
  draw(c: Ctx): Layers;
}

type Pt = [number, number];
type Stop = [number, string, number?];

/* ---------- small drawing kit ---------- */

const TILE = { dark: "#24232d", light: "#fbf8f1" };
const url = (c: Ctx, name: string) => `url(#${c.id(name)})`;
const stops = (s: Stop[]) => s.map(([o, col, a]) => `<stop offset="${o}" stop-color="${col}"${a === undefined || a === 1 ? "" : ` stop-opacity="${a}"`}/>`).join("");
/** A linear gradient, top to bottom unless told otherwise. */
const lin = (c: Ctx, name: string, s: Stop[], x2 = 0, y2 = 1) => `<linearGradient id="${c.id(name)}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rad = (c: Ctx, name: string, s: Stop[], cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${c.id(name)}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
/** A soft glow: a colour fading to nothing at its edge. */
const glow = (c: Ctx, name: string, col: string, a: number) => rad(c, name, [[0, col, a], [1, col, 0]]);
const sky = (c: Ctx, top: string, bottom: string, mid?: string) =>
  lin(c, "sky", mid ? [[0, top], [0.55, mid], [1, bottom]] : [[0, top], [1, bottom]]);
const fillSky = (c: Ctx) => `<rect width="800" height="440" fill="${url(c, "sky")}"/>`;

/** A range of peaks: straight ridges through `pts`, closed to the bottom. */
const range = (pts: Pt[]) => `M${pts[0][0]} 460${pts.map(([x, y]) => `L${x} ${y}`).join("")}L${pts[pts.length - 1][0]} 460Z`;

/** Snow caps on the peaks at `idx` (each peak's neighbours give its slopes); `t` is how far down the snow reaches. */
function caps(pts: Pt[], idx: number[], t = 0.3) {
  return idx.map((i) => {
    const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1];
    const ax = px + (lx - px) * t, ay = py + (ly - py) * t, bx = px + (rx - px) * t, by = py + (ry - py) * t;
    const my = Math.max(ay, by);
    return `M${n(ax)} ${n(ay)}L${px} ${py}L${n(bx)} ${n(by)}L${n((bx * 3 + ax) / 4)} ${n(my + 5)}L${n((ax + bx) / 2)} ${n(my - 2)}L${n((ax * 3 + bx) / 4)} ${n(my + 6)}Z`;
  }).join("");
}

/** Rolling hills: a smooth line through heights spread evenly from x -40 to 840, closed to the bottom. */
function ridge(ys: number[]) {
  const step = 880 / (ys.length - 1), x = (i: number) => n(-40 + i * step);
  let d = `M-40 460L-40 ${ys[0]}`;
  for (let i = 0; i < ys.length - 1; i += 1) d += `Q${x(i)} ${ys[i]} ${n((x(i) + x(i + 1)) / 2)} ${n((ys[i] + ys[i + 1]) / 2)}`;
  return `${d}L840 ${ys[ys.length - 1]}L840 460Z`;
}

/** A semicircle bump from (ax, ay) to (bx, by), bulging to the left of travel (upwards when going right). */
const bump = (ax: number, ay: number, bx: number, by: number) => {
  const r = n(Math.hypot(bx - ax, by - ay) / 2);
  return `A${r} ${r} 0 0 1 ${n(bx)} ${n(by)}`;
};

/** A cartoon cloud with a flat base at y, `w` wide. */
function cloud(x: number, y: number, w: number) {
  const pts: Pt[] = [[x - w / 2, y], [x - w * 0.26, y - w * 0.2], [x + w * 0.1, y - w * 0.3], [x + w * 0.34, y - w * 0.14], [x + w / 2, y]];
  let d = `M${n(pts[0][0])} ${n(y)}`;
  for (let i = 1; i < pts.length; i += 1) d += bump(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return `${d}Z`;
}

/** A scalloped bank (a sea of clouds, a bush line): bumps about `w` wide along y, closed to the bottom. */
function scallops(r: Rng, y: number, w: number, jitter = 8) {
  let x = -40, py = y, d = `M-40 460L-40 ${y}`;
  while (x < 840) {
    const nx = x + w * r.range(0.7, 1.3), ny = y + r.range(-jitter, jitter);
    d += bump(x, py, nx, ny);
    x = nx; py = ny;
  }
  return `${d}L${n(x)} 460Z`;
}

/** A row of pointy trees (a far treeline): narrow triangles on a band at `base`. */
function treeline(r: Rng, base: number, hMin: number, hMax: number, step: number) {
  let d = `M-40 ${base}H840V460H-40Z`;
  for (let x = -40; x < 840; x += step * r.range(0.7, 1.3)) {
    const h = r.range(hMin, hMax), w = h * 0.26;
    d += `M${n(x - w)} ${base + 2}L${n(x)} ${n(base - h)}L${n(x + w)} ${base + 2}Z`;
  }
  return d;
}

/** A three-tier pine standing at (x, base). */
function pine(x: number, base: number, h: number) {
  const w = h * 0.42, p = (dx: number, dy: number) => `${n(x + w * dx)} ${n(base - h * dy)}`;
  return `M${p(0, 1)}L${p(0.36, 0.64)}L${p(0.2, 0.64)}L${p(0.5, 0.3)}L${p(0.3, 0.3)}L${p(0.6, 0)}L${p(-0.6, 0)}L${p(-0.3, 0.3)}L${p(-0.5, 0.3)}L${p(-0.2, 0.64)}L${p(-0.36, 0.64)}Z`;
}

/** A four-point sparkle. */
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;

/** A star field over a box, in three twinkle groups (each group blinks on its own beat). */
function stars(r: Rng, count: number, [x0, y0, x1, y1]: [number, number, number, number], col: string, maxR = 1.7, sparkles = 0) {
  const groups = ["", "", ""];
  for (let i = 0; i < count; i += 1) groups[i % 3] += `<circle cx="${n(r.range(x0, x1))}" cy="${n(r.range(y0, y1))}" r="${n(r.range(0.6, maxR))}" opacity="${n(r.range(0.45, 1))}"/>`;
  for (let i = 0; i < sparkles; i += 1) groups[i % 3] += `<path d="${sparkle(n(r.range(x0, x1)), n(r.range(y0, y1)), n(r.range(4, 6.5)))}"/>`;
  return `<g fill="${col}">${groups.map((g, i) => `<g class="bd-tw${["", " b", " c"][i]}">${g}</g>`).join("")}</g>`;
}

/** A horizontal mist band: transparent, then `col` at `a`, then transparent again (y0 to y1). */
const mist = (c: Ctx, name: string, col: string, a: number, y0: number, y1: number) => ({
  def: lin(c, name, [[0, col, 0], [0.5, col, a], [1, col, 0]]),
  el: `<rect y="${y0}" width="800" height="${y1 - y0}" fill="${url(c, name)}"/>`,
});

/** Colour mixing in Oklab, like CSS `color-mix(in oklab, …)`, so "tono del bicho" matches today's tint exactly. */
function mix(a: string, b: string, t: number) {
  const lab = (hex: string) => {
    const h = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "888";
    const full = h.length === 3 ? [...h].map((ch) => ch + ch).join("") : h;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const v = parseInt(full.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const A = lab(a), B = lab(b);
  const [L, M, S] = [0, 1, 2].map((i) => A[i] * t + B[i] * (1 - t));
  const l = (L + 0.3963377774 * M + 0.2158037573 * S) ** 3, m = (L - 0.1055613458 * M - 0.0638541728 * S) ** 3, s = (L - 0.0894841775 * M - 1.291485548 * S) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0");
  }).join("")}`;
}

/* ---------- mounts: what the poster hangs from (px, origin at the tile's top centre) ---------- */

/** A wooden post planted in the ground, with a tuft of grass at its foot. */
const post = (wood: string, deep: string, grass: string, foot = 394) =>
  `<rect x="-8" y="70" width="16" height="${foot - 70}" rx="3" fill="${wood}" stroke="${deep}" stroke-width="3"/>
  <path d="M-3 120V${foot - 20}M3 160V${foot - 50}" stroke="${deep}" stroke-width="1.5" opacity=".5"/>
  <ellipse cx="0" cy="${foot}" rx="30" ry="6" fill="${deep}" opacity=".35"/>
  <path d="M-20 ${foot}l5-13 3 13 5-16 4 16M8 ${foot}l4-12 3 12 5-9 2 9" fill="none" stroke="${grass}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

/* ---------- the catalogue ---------- */

export const BACKDROPS: Record<string, Backdrop> = {
  tone: {
    label: "tono del bicho",
    kind: "plain",
    flat: true,
    // Today's tile tint, unchanged: radial-gradient(120% 90% at 50% 75%, color-mix(tone 26%, tile), tile).
    draw(c) {
      const tile = c.dark ? TILE.dark : TILE.light;
      return {
        defs: `<radialGradient id="${c.id("tone")}" cx=".5" cy=".75" r="1" gradientTransform="translate(.5 .75) scale(1.2 .9) translate(-.5 -.75)">${stops([[0, mix(c.tone, tile, 0.26)], [1, tile]])}</radialGradient>`,
        box: `<rect width="100%" height="100%" fill="${url(c, "tone")}"/>`,
      };
    },
  },
  plain: {
    label: "liso",
    kind: "plain",
    draw: (c) => ({ box: `<rect width="100%" height="100%" fill="${c.dark ? "#2a2933" : "#f1ede4"}"/>` }),
  },
  sunset: {
    label: "degradado atardecer",
    kind: "plain",
    draw(c) {
      const s: Stop[] = c.dark ? [[0, "#262340"], [0.55, "#3f2b48"], [1, "#55363f"]] : [[0, "#dcd3ee"], [0.5, "#f5d3d8"], [1, "#fbe2cc"]];
      return { defs: lin(c, "g", s, 0.35, 1), box: `<rect width="100%" height="100%" fill="${url(c, "g")}"/>` };
    },
  },
  lagoon: {
    label: "degradado laguna",
    kind: "plain",
    draw(c) {
      const s: Stop[] = c.dark ? [[0, "#1b2546"], [1, "#173a40"]] : [[0, "#d3e3f5"], [1, "#d3f0e6"]];
      return { defs: lin(c, "g", s, 0.35, 1), box: `<rect width="100%" height="100%" fill="${url(c, "g")}"/>` };
    },
  },

  mountains: {
    label: "montañas",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#1b2140", "#3d3459"], far: "#363d65", farSnow: "#535b88", mid: "#2a3154", midSnow: "#434b76", near: ["#242c47", "#1b2135"], haze: "#3d3459", cloud: "#4b4c76", sun: "#e7a58a", wood: "#4f4038", deep: "#2f2622", grass: "#3a4a52" }
        : { sky: ["#b9d0ea", "#f3e9de"], far: "#b5c1dc", farSnow: "#e4e9f3", mid: "#9babc8", midSnow: "#d5dcea", near: ["#a7c1a4", "#8eab8b"], haze: "#f3e9de", cloud: "#ffffff", sun: "#fff1cf", wood: "#c49c74", deep: "#8f6c4c", grass: "#7f9f7c" };
      const far: Pt[] = [[-40, 236], [70, 196], [150, 228], [250, 160], [340, 222], [420, 184], [510, 230], [600, 168], [690, 214], [770, 186], [840, 214]];
      const mid: Pt[] = [[-40, 268], [60, 240], [160, 276], [240, 222], [330, 270], [400, 250], [470, 274], [560, 226], [650, 270], [740, 238], [840, 262]];
      const h1 = mist(c, "m1", p.haze, 0.7, 196, 286), h2 = mist(c, "m2", p.haze, 0.5, 250, 330);
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + glow(c, "sun", p.sun, c.dark ? 0.32 : 0.9) + lin(c, "near", [[0, p.near[0]], [1, p.near[1]]]) + h1.def + h2.def,
        scene: `${fillSky(c)}
          ${c.dark ? `<ellipse cx="400" cy="250" rx="420" ry="110" fill="${url(c, "sun")}"/>${stars(rng("mountains"), 16, [190, 20, 610, 150], "#e9e6f5", 1.4)}` : `<circle cx="560" cy="122" r="110" fill="${url(c, "sun")}"/><circle cx="560" cy="122" r="20" fill="#fffaf0" opacity=".85"/>`}
          <g fill="${p.cloud}" opacity="${c.dark ? 0.5 : 0.75}"><path class="bd-drift" d="${cloud(268, 128, 104)}"/><path class="bd-drift slow" d="${cloud(520, 78, 70)}"/></g>
          <path d="${range(far)}" fill="${p.far}"/><path d="${caps(far, [3, 7, 5], 0.32)}" fill="${p.farSnow}"/>
          ${h1.el}
          <path d="${range(mid)}" fill="${p.mid}"/><path d="${caps(mid, [3, 7], 0.28)}" fill="${p.midSnow}"/>
          ${h2.el}
          <path d="${ridge([322, 306, 314, 300, 296, 304, 318, 308, 296, 312])}" fill="${url(c, "near")}"/>`,
        mount: post(p.wood, p.deep, p.grass),
      };
    },
  },

  beach: {
    label: "playa",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#1e2848", "#4b4470"], sea: ["#2a4064", "#2f4a6a"], wave: "#7189b2", sand: ["#4a4459", "#3a3447"], foam: "#8a9cc0", light: "#e8e2cc", palm: "#2c2f4a", frond: "#2f3a4e", boat: "#5a5f86", wood: "#4f4552", deep: "#2e2836", grass: "#3e4a5a" }
        : { sky: ["#bde0ef", "#f8eddb"], sea: ["#97cbd3", "#b7ddda"], wave: "#e3f4f2", sand: ["#f2dfbf", "#e6cba0"], foam: "#ffffff", light: "#fff3d2", palm: "#c9a47c", frond: "#93bd98", boat: "#e9e4dc", wood: "#c8a985", deep: "#977a5b", grass: "#9cbf8e" };
      const sun = c.dark ? [296, 112, 22] : [300, 208, 26];
      const waves = (y: number) => `M-40 ${y}${Array.from({ length: 22 }, () => "q10-5 20 0t20 0").join("")}`;
      const frond = (a: number, len: number) => {
        const x0 = 560, y0 = 174, rad_ = (a * Math.PI) / 180, ex = x0 + Math.cos(rad_) * len, ey = y0 + Math.sin(rad_) * len + len * 0.28;
        const px = -Math.sin(rad_) * len * 0.16, py = Math.cos(rad_) * len * 0.16, mx = (x0 + ex) / 2, my = (y0 + ey) / 2 - len * 0.12;
        return `M${x0} ${y0}Q${n(mx + px)} ${n(my + py)} ${n(ex)} ${n(ey)}Q${n(mx - px)} ${n(my - py)} ${x0} ${y0}Z`;
      };
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + lin(c, "sea", [[0, p.sea[0]], [1, p.sea[1]]]) + lin(c, "sand", [[0, p.sand[0]], [1, p.sand[1]]]) + glow(c, "sun", p.light, c.dark ? 0.22 : 0.85),
        scene: `${fillSky(c)}
          ${c.dark ? stars(rng("beach"), 14, [190, 16, 610, 170], "#e9e6f5", 1.3) : `<g fill="#ffffff" opacity=".7"><path class="bd-drift" d="${cloud(470, 110, 90)}"/></g>`}
          <circle cx="${sun[0]}" cy="${sun[1]}" r="${sun[2] * 4.5}" fill="${url(c, "sun")}"/><circle cx="${sun[0]}" cy="${sun[1]}" r="${sun[2]}" fill="${p.light}" opacity=".8"/>
          <rect y="262" width="800" height="200" fill="${url(c, "sea")}"/>
          <path d="M${sun[0] - 22} 268h44M${sun[0] - 30} 280h60M${sun[0] - 18} 292h36" stroke="${p.light}" stroke-width="3" stroke-linecap="round" opacity="${c.dark ? 0.35 : 0.6}"/>
          <path d="M236 258h40l-6 6h-28z" fill="${p.boat}" opacity=".8"/><path d="M256 256V232l14 22z" fill="${p.boat}" opacity=".8"/>
          <g fill="none" stroke="${p.wave}" stroke-width="3" stroke-linecap="round" opacity="${c.dark ? 0.6 : 0.5}"><path class="bd-wave" d="${waves(284)}"/><path class="bd-wave b" d="${waves(304)}"/></g>
          <path class="bd-wave b" d="${ridge([338, 330, 324, 330, 326, 322, 330, 336, 330])}" fill="${p.foam}" opacity=".45"/>
          <path d="${ridge([344, 336, 330, 336, 332, 328, 336, 342, 336])}" fill="${url(c, "sand")}"/>
          <path d="M618 372Q606 262 562 176" fill="none" stroke="${p.palm}" stroke-width="14" stroke-linecap="round"/>
          <path d="M618 372Q606 262 562 176" fill="none" stroke="${p.sand[1]}" stroke-width="14" stroke-dasharray="2 16" opacity=".55"/>
          <g class="bd-sway palm" fill="${p.frond}">${[-170, -135, -95, -50, -12, 25].map((a) => `<path d="${frond(a, 70)}"/>`).join("")}</g>`,
        mount: post(p.wood, p.deep, p.grass, 398),
      };
    },
  },

  city: {
    label: "ciudad",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#121933", "#2c2749"], far: "#232a48", near: "#1a203d", win: "#f1cc7c", winA: [0.34, 0.1], street: ["#1b2038", "#141a2e"], pole: "#3a4160", lamp: "#f6d58c" }
        : { sky: ["#cadcef", "#f5e9e1"], far: "#bcc7da", near: "#a6b4cb", win: "#dfe6f1", winA: [0.6, 0.28], street: ["#b2bbcc", "#a1aabd"], pole: "#8c94aa", lamp: "#fbe7b4" };
      const r = rng("city");
      const skyline = (top: [number, number], wMin: number, wMax: number, gap: number) => {
        let d = "";
        for (let x = -30; x < 830;) {
          const w = r.range(wMin, wMax), t = r.range(top[0], top[1]);
          d += `M${n(x)} 460V${n(t)}h${n(w)}V460Z`;
          if (r.chance(0.25)) d += `M${n(x + w / 2 - 1.5)} ${n(t)}v-16h3v16Z`;
          x += w + gap;
        }
        return d;
      };
      const far = skyline([150, 225], 34, 70, 0), near = skyline([196, 282], 40, 76, 6);
      const [a1, a2] = p.winA;
      const bokeh = c.dark ? Array.from({ length: 8 }, () => `<circle cx="${n(r.range(190, 610))}" cy="${n(r.range(210, 330))}" r="${n(r.range(8, 20))}" fill="${url(c, r.chance(0.6) ? "bw" : "bc")}"/>`).join("") : "";
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + lin(c, "street", [[0, p.street[0]], [1, p.street[1]]])
          + `<pattern id="${c.id("win")}" width="28" height="34" patternUnits="userSpaceOnUse"><g fill="${p.win}"><rect x="5" y="6" width="6" height="9" opacity="${a1}"/><rect x="17" y="6" width="6" height="9" opacity="${a2}"/><rect x="5" y="23" width="6" height="9" opacity="${a2}"/><rect x="17" y="23" width="6" height="9" opacity="${a1 * 0.7}"/></g></pattern>`
          + (c.dark ? glow(c, "bw", "#f3c27a", 0.3) + glow(c, "bc", "#8fb2f0", 0.24) + glow(c, "lg", "#f6d58c", 0.4) : ""),
        scene: `${fillSky(c)}
          ${c.dark ? stars(rng("city-stars"), 12, [190, 16, 610, 130], "#e6e3f2", 1.2) : `<g fill="#ffffff" opacity=".7"><path class="bd-drift" d="${cloud(290, 120, 96)}"/><path class="bd-drift slow" d="${cloud(560, 86, 64)}"/></g>`}
          <path d="${far}" fill="${p.far}"/>
          <path d="${near}" fill="${p.near}"/><path d="${near}" fill="${url(c, "win")}"/>
          ${c.dark ? `<g fill="${p.win}"><rect class="bd-tw" x="231" y="240" width="6" height="9"/><rect class="bd-tw b" x="533" y="262" width="6" height="9"/><rect class="bd-tw c" x="300" y="290" width="6" height="9"/></g>` : ""}
          <rect y="326" width="800" height="120" fill="${url(c, "street")}"/>
          <path d="M-40 368H840" stroke="${p.far}" stroke-width="3" stroke-dasharray="26 22" opacity=".6"/>
          ${bokeh}`,
        mount: `${c.dark ? `<circle cx="0" cy="18" r="70" fill="${url(c, "lg")}"/>` : ""}
          <rect x="-4.5" y="30" width="9" height="362" fill="${p.pole}"/><path d="M-14 396l4-10h20l4 10z" fill="${p.pole}"/>
          <path d="M-13 32l-3-22h32l-3 22z" fill="${p.lamp}" opacity="${c.dark ? 0.95 : 0.8}" stroke="${p.pole}" stroke-width="3" stroke-linejoin="round"/>
          <path d="M-20 11L0 -1 20 11z" fill="${p.pole}"/>`,
      };
    },
  },

  space: {
    label: "espacio",
    kind: "scene",
    hang: "float",
    draw(c) {
      const p = c.dark
        ? { sky: ["#0d1026", "#241b40"], neb1: "#7a5ac4", neb2: "#3f8fa8", star: "#f2efff", planet: ["#dcae86", "#9c6650"], ring: "#d8c1a2", moon: "#8f95c2", ground: ["#353f7a", "#232955"], atmo: "#6f8fe6", crater: "#1e2450" }
        : { sky: ["#6f70ae", "#cbb7dd"], neb1: "#f2b6d6", neb2: "#9fdbe2", star: "#ffffff", planet: ["#f6d2b0", "#d49d86"], ring: "#fff0dc", moon: "#e6e2f6", ground: ["#9497cb", "#7a7eb7"], atmo: "#eceeff", crater: "#6b70a8" };
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + glow(c, "n1", p.neb1, c.dark ? 0.3 : 0.4) + glow(c, "n2", p.neb2, c.dark ? 0.22 : 0.35)
          + rad(c, "pl", [[0, p.planet[0]], [1, p.planet[1]]], 0.35, 0.3, 0.75) + rad(c, "gr", [[0, p.ground[0]], [1, p.ground[1]]], 0.5, 0, 0.5),
        scene: `${fillSky(c)}
          <ellipse cx="250" cy="150" rx="230" ry="130" fill="${url(c, "n1")}"/><ellipse cx="590" cy="250" rx="200" ry="120" fill="${url(c, "n2")}"/>
          ${stars(rng("space"), 34, [170, 10, 630, 330], p.star, 1.8, 4)}
          <g class="bd-float"><circle cx="546" cy="120" r="24" fill="${url(c, "pl")}"/>
            <ellipse cx="546" cy="120" rx="42" ry="10" fill="none" stroke="${p.ring}" stroke-width="3.5" opacity=".65" transform="rotate(-16 546 120)"/></g>
          <circle class="bd-float b" cx="236" cy="206" r="9" fill="${p.moon}" opacity=".85"/>
          <circle cx="400" cy="1190" r="872" fill="none" stroke="${p.atmo}" stroke-width="16" opacity=".12"/>
          <circle cx="400" cy="1190" r="862" fill="none" stroke="${p.atmo}" stroke-width="8" opacity=".22"/>
          <circle cx="400" cy="1190" r="856" fill="${url(c, "gr")}"/>
          <g fill="${p.crater}" opacity=".35"><ellipse cx="250" cy="372" rx="26" ry="6"/><ellipse cx="560" cy="360" rx="18" ry="4.5"/><ellipse cx="470" cy="408" rx="30" ry="7"/></g>`,
      };
    },
  },

  forest: {
    label: "bosque",
    kind: "scene",
    // Pinned to the trunk: the tree is a surface, not a stake.
    hang: "pin",
    draw(c) {
      const p = c.dark
        ? { sky: ["#14292a", "#22403a"], far: "#203d38", mid: "#1a342f", near: "#132a25", ground: ["#1a342d", "#122620"], haze: "#1f3a35", bark: "#3a302b", deep: "#251e1b" }
        : { sky: ["#d3e5d5", "#f1f0dd"], far: "#b9cfb8", mid: "#9cb99e", near: "#86a88b", ground: ["#a8c59b", "#95b689"], haze: "#f1f0dd", bark: "#b38f6d", deep: "#8a6a4e" };
      const r = rng("forest");
      const h1 = mist(c, "m1", p.haze, 0.75, 212, 290), h2 = mist(c, "m2", p.haze, 0.55, 262, 330);
      const flies = c.dark ? Array.from({ length: 9 }, (_, i) => `<circle class="bd-tw${["", " b", " c"][i % 3]}" cx="${n(r.range(200, 600))}" cy="${n(r.range(200, 330))}" r="7" fill="${url(c, "fly")}"/>`).join("") : "";
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + lin(c, "gr", [[0, p.ground[0]], [1, p.ground[1]]]) + h1.def + h2.def
          + (c.dark ? glow(c, "fly", "#e6f39a", 0.9) : lin(c, "ray", [[0, "#ffffff", 0.45], [1, "#ffffff", 0]])),
        scene: `${fillSky(c)}
          ${c.dark ? "" : `<g class="bd-glow" fill="${url(c, "ray")}"><path d="M560 -10h46L470 330h-40z"/><path d="M630 -10h26L540 330h-24z"/><path d="M500 -10h18L390 300h-20z"/></g>`}
          <path d="${treeline(r, 252, 40, 78, 26)}" fill="${p.far}"/>
          ${h1.el}
          <path d="${treeline(r, 300, 60, 120, 44)}" fill="${p.mid}"/>
          ${h2.el}
          <path d="${ridge([330, 318, 312, 316, 310, 314, 320, 312, 324])}" fill="${url(c, "gr")}"/>
          <g fill="${p.near}" class="bd-sway slow"><path d="${pine(204, 352, 230)}"/></g><g fill="${p.near}" class="bd-sway slow b"><path d="${pine(612, 356, 250)}"/></g>
          ${flies}`,
        // A wide old trunk, so the poster's corner tack lands in the bark, not in the air beside it.
        mount: `<path d="M-112 -10C-104 120-110 300-136 398H136C110 300 104 120 112-10Z" fill="${p.bark}" stroke="${p.deep}" stroke-width="3"/>
          <path d="M-70 300q6-34 0-70M66 350q-6-34 0-60M-92 120q5-24 0-48M96 200q-5-26 0-52M-30 330q4-22 0-44M-136 398q-18-8-30 2M136 398q18-8 30 2" fill="none" stroke="${p.deep}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
      };
    },
  },

  room: {
    label: "cuarto con ventana",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { wall: ["#3b3142", "#2f2836"], wains: ["#342b3a", "#2a2330"], rail: "#463a4c", floor: ["#3b2e2d", "#2c2322"], frame: "#5c4e60", sill: "#4a3e4e", glass: ["#1f2a54", "#3a3c6e"], curtain: "#5b4054", pic: "#2b3554", hill: "#46507a", shelf: "#56443e", rug: "#6b4a52", lamp: "#e8c590", leaf: "#4f6a58", books: ["#6e4a48", "#41546e", "#7a6340"] }
        : { wall: ["#f1e5d6", "#e8d6c2"], wains: ["#e4d0b7", "#d9c1a5"], rail: "#d3ba9d", floor: ["#cfac88", "#ba9572"], frame: "#fbf6ee", sill: "#e2d2bd", glass: ["#c4e0f0", "#ebf3f3"], curtain: "#e8bcae", pic: "#dbe8ee", hill: "#a9c4b0", shelf: "#c9a37d", rug: "#dca08c", lamp: "#f3d39b", leaf: "#93bb94", books: ["#d39a8b", "#93aecb", "#e2c38e"] };
      const clip = c.id("pane");
      return {
        defs: lin(c, "wall", [[0, p.wall[0]], [1, p.wall[1]]]) + lin(c, "wains", [[0, p.wains[0]], [1, p.wains[1]]]) + lin(c, "floor", [[0, p.floor[0]], [1, p.floor[1]]])
          + lin(c, "glass", [[0, p.glass[0]], [1, p.glass[1]]]) + `<clipPath id="${clip}"><rect x="206" y="88" width="88" height="130"/></clipPath>`
          + glow(c, "lamp", "#f6c37a", c.dark ? 0.26 : 0.18) + glow(c, "sun", "#fff6e2", 0.5),
        scene: `<rect width="800" height="440" fill="${url(c, "wall")}"/>
          ${c.dark ? "" : `<ellipse cx="270" cy="250" rx="200" ry="160" fill="${url(c, "sun")}"/>`}
          <rect y="262" width="800" height="180" fill="${url(c, "wains")}"/><rect y="258" width="800" height="7" fill="${p.rail}"/>
          <rect y="346" width="800" height="100" fill="${url(c, "floor")}"/><rect y="342" width="800" height="6" fill="${p.rail}"/>
          <ellipse cx="400" cy="394" rx="220" ry="24" fill="${p.rug}" opacity=".45"/>
          <g transform="translate(6 0)"><rect x="196" y="78" width="108" height="150" rx="5" fill="${p.frame}"/>
          <rect x="206" y="88" width="88" height="130" fill="${url(c, "glass")}"/>
          <g clip-path="url(#${clip})">${c.dark
            ? `<circle cx="272" cy="114" r="11" fill="#efe9d2" opacity=".9"/><circle cx="277" cy="110" r="10" fill="${p.glass[0]}"/>${stars(rng("room"), 7, [210, 92, 290, 210], "#e9e6f5", 1.3)}`
            : `<g fill="#ffffff" opacity=".85"><path class="bd-drift" d="${cloud(238, 128, 40)}"/><path class="bd-drift slow" d="${cloud(276, 176, 28)}"/></g><path d="M206 218l30-26 22 16 18-12 18 14v8z" fill="#b7d3bd" opacity=".8"/>`}</g>
          <path d="M248 88h4v130h-4zM206 151h88v4h-88z" fill="${p.frame}"/>
          <rect x="188" y="226" width="124" height="10" rx="3" fill="${p.sill}"/>
          <rect x="176" y="64" width="148" height="6" rx="3" fill="${p.sill}"/>
          <g fill="${p.curtain}"><path d="M182 70H208Q200 150 214 244H174Q188 150 182 70Z"/><path d="M318 70H292Q300 150 286 244H326Q312 150 318 70Z"/></g></g>
          <rect x="510" y="92" width="74" height="56" rx="3" fill="${p.shelf}"/><rect x="517" y="99" width="60" height="42" fill="${p.pic}"/>
          <path d="M517 141L537 116 549 128 559 119 577 141Z" fill="${p.hill}"/>
          ${c.dark ? `<circle cx="524" cy="186" r="150" fill="${url(c, "lamp")}"/>` : ""}
          <rect x="494" y="206" width="124" height="8" rx="2" fill="${p.shelf}"/>
          <path d="M506 184l7-20h22l7 20z" fill="${p.lamp}"/><path d="M522 184v22M514 206h16" stroke="${p.sill}" stroke-width="4"/>
          <g>${p.books.map((b, i) => `<rect x="${548 + i * 11}" y="${170 + (i % 2) * 6}" width="10" height="${36 - (i % 2) * 6}" rx="1.5" fill="${b}"/>`).join("")}</g>
          <path d="M586 206l3-16h16l3 16z" fill="${p.rug}"/>
          <g class="bd-sway" fill="${p.leaf}"><ellipse cx="590" cy="182" rx="6" ry="11" transform="rotate(-25 590 182)"/><ellipse cx="604" cy="180" rx="6" ry="12" transform="rotate(25 604 180)"/><ellipse cx="597" cy="176" rx="5" ry="12"/></g>`,
      };
    },
  },

  clouds: {
    label: "nubes",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#272c58", "#6b5a8a"], cloud: ["#6b6a96", "#4f4f7b"], floor: ["#5f5e8b", "#45456e"], floor2: ["#706e9a", "#55557f"], sun: "#f0b9a0", balloon: ["#c98a9c", "#c9b26e"], string: "#9a98bb" }
        : { sky: ["#a7cbee", "#eef4fa"], cloud: ["#ffffff", "#e2eaf6"], floor: ["#f4f7fc", "#d9e3f1"], floor2: ["#ffffff", "#e6edf7"], sun: "#fff3cf", balloon: ["#f2a9b8", "#f4d58a"], string: "#9aa7bd" };
      const r = rng("clouds");
      const balloon = (x: number, y: number, col: string, tx: number, ty: number) =>
        `<path d="M${x} ${y + 25}Q${(x + tx) / 2} ${y + 40} ${tx} ${ty}" fill="none" stroke="${p.string}" stroke-width="1.6"/>
        <ellipse cx="${x}" cy="${y}" rx="17" ry="21" fill="${col}"/><path d="M${x - 3} ${y + 23}h6l-3-4z" fill="${col}"/>
        <path d="M${x - 9} ${y - 8}q2-7 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + lin(c, "cl", [[0, p.cloud[0]], [1, p.cloud[1]]]) + lin(c, "f1", [[0, p.floor[0]], [1, p.floor[1]]]) + lin(c, "f2", [[0, p.floor2[0]], [1, p.floor2[1]]]) + glow(c, "sun", p.sun, c.dark ? 0.35 : 0.9),
        scene: `${fillSky(c)}
          ${c.dark ? stars(rng("clouds-stars"), 14, [190, 12, 610, 120], "#ecebf8", 1.3) : ""}
          <circle cx="${c.dark ? 400 : 560}" cy="${c.dark ? 300 : 112}" r="${c.dark ? 260 : 120}" fill="${url(c, "sun")}"/>
          <g fill="${url(c, "cl")}" opacity="${c.dark ? 0.7 : 0.9}">
            <path class="bd-drift slow" d="${cloud(250, 112, 110)}"/><path class="bd-drift" d="${cloud(560, 184, 130)}"/><path class="bd-drift slow b" d="${cloud(330, 232, 80)}"/></g>
          <path class="bd-drift slow" d="${scallops(r, 302, 70, 10)}" fill="${url(c, "f1")}"/>
          <path class="bd-drift b" d="${scallops(r, 346, 90, 8)}" fill="${url(c, "f2")}"/>`,
        mount: `${balloon(-132, 24, p.balloon[0], -86, 46)}${balloon(134, 30, p.balloon[1], 86, 46)}`,
      };
    },
  },

  night: {
    label: "noche de luna",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#0d1230", "#232b57"], moon: ["#e6e0c6", "#bfb798"], crater: "#b3ab8c", far: "#1c2550", near: ["#171f42", "#111733"], tree: "#121a38", win: "#f2c97c", star: "#eeebfa", wood: "#3a3448", deep: "#221e2e", grass: "#2b3556" }
        : { sky: ["#5a69a6", "#aab3d9"], moon: ["#f4f0e2", "#d9d3bd"], crater: "#cbc3a8", far: "#7684b8", near: ["#6878ac", "#5a689c"], tree: "#56649a", win: "#f6d48e", star: "#ffffff", wood: "#8a86a8", deep: "#5f5b80", grass: "#4f5d92" };
      const r = rng("night");
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + rad(c, "moon", [[0, p.moon[0]], [1, p.moon[1]]], 0.38, 0.35, 0.7) + glow(c, "mg", p.moon[0], c.dark ? 0.2 : 0.35) + lin(c, "near", [[0, p.near[0]], [1, p.near[1]]]),
        scene: `${fillSky(c)}
          ${stars(r, 26, [180, 10, 620, 250], p.star, 1.6, 3)}
          <circle class="bd-glow" cx="566" cy="108" r="120" fill="${url(c, "mg")}"/>
          <circle cx="566" cy="108" r="27" fill="${url(c, "moon")}"/>
          <g fill="${p.crater}" opacity=".7"><circle cx="557" cy="101" r="4.5"/><circle cx="574" cy="117" r="3.2"/><circle cx="571" cy="97" r="2.3"/></g>
          <path d="${ridge([300, 270, 258, 276, 264, 250, 268, 280, 262, 286])}" fill="${p.far}"/>
          <path d="M238 262l14-12 14 12v16h-28z" fill="${p.tree}"/><rect x="247" y="266" width="7" height="7" fill="${p.win}" opacity=".85" class="bd-tw b"/>
          <path d="${ridge([330, 316, 306, 312, 320, 314, 304, 310, 322, 318])}" fill="${url(c, "near")}"/>
          <g fill="${p.tree}">${[[202, 316, 60], [226, 312, 44], [588, 312, 66], [612, 318, 46]].map(([x, b, h]) => `<path d="${pine(x, b, h)}"/>`).join("")}</g>`,
        mount: post(p.wood, p.deep, p.grass),
      };
    },
  },

  underwater: {
    label: "fondo del mar",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sea: ["#13344f", "#0a1b2e"], ray: "#7cc2e0", rayA: 0.13, sand: ["#243646", "#1b2a37"], weed: "#20504a", weed2: "#2a5f50", rock: "#1f3342", coral: "#5e3b52", bubble: "#a8d6ea", fish: ["#c9995f", "#6a8fb8"], rope: "#7d6a55", anchor: "#4d5d6d" }
        : { sea: ["#bfe7ee", "#7cbacb"], ray: "#ffffff", rayA: 0.38, sand: ["#e6dabb", "#d3c3a0"], weed: "#7db59a", weed2: "#93c4a2", rock: "#9db4bb", coral: "#eaa9a4", bubble: "#ffffff", fish: ["#f4c48a", "#f3a59a"], rope: "#bfa27c", anchor: "#7f8f9c" };
      const r = rng("underwater");
      const weed = (x: number, base: number, h: number, cls: string, col: string) =>
        `<path class="bd-sway ${cls}" d="M${x} ${base}q-12-${h / 6} 0-${h / 3}t0-${h / 3}t0-${h / 3}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`;
      const bubbles = Array.from({ length: 8 }, (_, i) => `<circle class="bd-rise" style="animation-delay:-${n(i * 1.3)}s" cx="${n(r.range(200, 600))}" cy="${n(r.range(300, 400))}" r="${n(r.range(2.5, 6))}"/>`).join("");
      const fish = (x: number, y: number, col: string, cls: string) => `<g class="bd-swim ${cls}" fill="${col}"><ellipse cx="${x}" cy="${y}" rx="12" ry="6.5"/><path d="M${x + 9} ${y}l10-7v14z"/></g>`;
      return {
        defs: lin(c, "sea", [[0, p.sea[0]], [1, p.sea[1]]]) + lin(c, "ray", [[0, p.ray, p.rayA], [1, p.ray, 0]]) + lin(c, "sand", [[0, p.sand[0]], [1, p.sand[1]]]),
        scene: `<rect width="800" height="440" fill="${url(c, "sea")}"/>
          <g fill="${url(c, "ray")}"><path class="bd-glow" d="M250 -10h50l60 330h-70z"/><path class="bd-glow b" d="M420 -10h30l70 300h-50z"/><path class="bd-glow c" d="M540 -10h44l40 320h-64z"/></g>
          ${fish(300, 160, p.fish[0], "")}${fish(520, 218, p.fish[1], "b")}
          <path d="${ridge([344, 334, 338, 330, 334, 340, 332, 338, 346])}" fill="${url(c, "sand")}"/>
          <g fill="${p.rock}"><path d="M176 360q6-40 40-38q30 4 34 40z"/><path d="M560 352q10-30 38-28q26 2 30 30z"/></g>
          <path d="M612 340c-2-30 6-44 0-62M612 312c10-8 14-20 12-32M612 300c-12-6-16-16-14-28" fill="none" stroke="${p.coral}" stroke-width="7" stroke-linecap="round"/>
          ${weed(214, 350, 150, "", p.weed)}${weed(234, 346, 110, "b", p.weed2)}${weed(586, 344, 130, "c", p.weed)}
          <g fill="${p.bubble}" fill-opacity=".18" stroke="${p.bubble}" stroke-width="1.5" stroke-opacity=".6">${bubbles}</g>`,
        mount: `<path d="M0 270q9 16 0 32t0 32t0 30" fill="none" stroke="${p.rope}" stroke-width="4" stroke-linecap="round"/>
          <g fill="none" stroke="${p.anchor}" stroke-width="5" stroke-linecap="round"><circle cx="0" cy="370" r="5"/><path d="M0 375v28M-9 383h18M-15 392q15 18 30 0"/></g>`,
      };
    },
  },

  candy: {
    label: "país de golosinas",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#36213f", "#5c3356"], cloud: ["#7a5a86", "#5e466f"], far: "#583a62", mid: "#3c5058", ground: ["#5a4356", "#463446"], pops: ["#a2607a", "#4f7a8c", "#8c7a4a"], stick: "#cdbfc8", cane: ["#d9cdd2", "#a8556a", "#6d4a5c"], gum: ["#4f7050", "#8a4f62", "#62558a"], sprinkle: ["#a87a8c", "#6f8fa0", "#a39a6a"] }
        : { sky: ["#ffd8e6", "#fff3e2"], cloud: ["#ffffff", "#ffe2ef"], far: "#f6c9dc", mid: "#c6eadb", ground: ["#f6d9b2", "#edc699"], pops: ["#f39cb8", "#97d3e6", "#f6d488"], stick: "#fffaf3", cane: ["#fff6f2", "#ea8fa0", "#cf8b97"], gum: ["#b5e2a6", "#f7b1c4", "#c9b7f0"], sprinkle: ["#ef9ab3", "#8fcbe0", "#f1cf7f"] };
      const r = rng("candy");
      const spiral = (x: number, y: number, s: number) => {
        let d = `M${x} ${y}`, dir = 1;
        for (let k = 2; k <= 7; k += 1) { d += `a${n((k * s) / 2)} ${n((k * s) / 2)} 0 0 1 ${n(dir * k * s)} 0`; dir = -dir; }
        return d;
      };
      const pop = (x: number, y: number, rr: number, col: string, cls: string) =>
        `<path d="M${x} ${y}V${y + 120}" stroke="${p.stick}" stroke-width="6" stroke-linecap="round"/>
        <g class="bd-spin ${cls}"><circle cx="${x}" cy="${y}" r="${rr}" fill="${col}"/><path d="${spiral(x, y, rr / 7.6)}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".6"/></g>`;
      const gum = (x: number, y: number, col: string) => `<path d="M${x - 14} ${y}q0-22 14-22q14 0 14 22z" fill="${col}"/>`;
      const sprinkles = Array.from({ length: 11 }, () => {
        const x = n(r.range(190, 610)), y = n(r.range(346, 420));
        return `<rect x="${x}" y="${y}" width="9" height="3" rx="1.5" fill="${r.pick(p.sprinkle)}" transform="rotate(${n(r.range(0, 180))} ${n(x + 4.5)} ${n(y + 1.5)})"/>`;
      }).join("");
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + lin(c, "cl", [[0, p.cloud[0]], [1, p.cloud[1]]]) + lin(c, "gr", [[0, p.ground[0]], [1, p.ground[1]]]),
        scene: `${fillSky(c)}
          ${c.dark ? stars(r, 14, [190, 12, 610, 140], "#f3e6f2", 1.3) : ""}
          <g fill="${url(c, "cl")}" opacity="${c.dark ? 0.6 : 0.9}"><path class="bd-drift" d="${cloud(280, 112, 100)}"/><path class="bd-drift slow" d="${cloud(548, 78, 76)}"/></g>
          <path d="${ridge([260, 236, 250, 226, 246, 232, 222, 244, 230, 250])}" fill="${p.far}"/>
          <path d="${ridge([300, 282, 292, 276, 290, 296, 278, 286, 300, 290])}" fill="${p.mid}"/>
          ${pop(226, 196, 30, p.pops[0], "")}${pop(578, 206, 24, p.pops[1], "b")}
          <path d="${ridge([340, 330, 324, 330, 326, 322, 330, 336, 330])}" fill="${url(c, "gr")}"/>
          ${gum(262, 336, p.gum[0])}${gum(560, 334, p.gum[1])}${gum(586, 340, p.gum[2])}
          ${sprinkles}`,
        mount: `<path d="M0 396V44a26 26 0 0 0-52 0v8" fill="none" stroke="${p.cane[2]}" stroke-width="18" stroke-linecap="round"/>
          <path d="M0 396V44a26 26 0 0 0-52 0v8" fill="none" stroke="${p.cane[0]}" stroke-width="12" stroke-linecap="round"/>
          <path d="M0 396V44a26 26 0 0 0-52 0v8" fill="none" stroke="${p.cane[1]}" stroke-width="12" stroke-dasharray="9 9"/>`,
      };
    },
  },

  aurora: {
    label: "aurora boreal",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#0a1626", "#16303f"], a1: "#7ef0c0", a2: "#b48cf5", aA: [0.55, 0.4], far: "#1b2e42", snow: "#2f4a62", trees: "#12233a", ground: ["#27425c", "#1c3149"], star: "#e8f4f5", wood: "#3c3a46", deep: "#24222c", grass: "#2c4458" }
        : { sky: ["#c9e0ea", "#f1f5f2"], a1: "#58cfa5", a2: "#a68ef0", aA: [0.42, 0.32], far: "#a8bfd0", snow: "#eef4f8", trees: "#9cb4c3", ground: ["#f0f5f8", "#dbe6ee"], star: "#ffffff", wood: "#a99c8c", deep: "#7c7062", grass: "#8fa8b5" };
      // A ribbon of even thickness: the same wave along its top and bottom edges.
      const band = (y: number, amp: number, h: number) =>
        `M-40 ${y}q100-${amp} 200 0t200 0t200 0t200 0t200 0v${h}q-100-${amp} -200 0t-200 0t-200 0t-200 0t-200 0z`;
      const curtain = (name: string, col: string, a: number) => lin(c, name, [[0, col, 0], [0.6, col, a * 0.45], [0.88, col, a], [1, col, 0]]);
      const pk: Pt[] = [[-40, 290], [80, 236], [170, 276], [270, 214], [370, 270], [450, 240], [540, 280], [630, 222], [730, 268], [840, 246]];
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + curtain("a1", p.a1, p.aA[0]) + curtain("a2", p.a2, p.aA[1]) + lin(c, "gr", [[0, p.ground[0]], [1, p.ground[1]]]),
        scene: `${fillSky(c)}
          ${stars(rng("aurora"), c.dark ? 22 : 10, [170, 8, 630, 220], p.star, 1.5, c.dark ? 2 : 0)}
          <g transform="rotate(-4 400 80) translate(-80 -34)" opacity=".85"><path class="bd-band b" d="${band(50, 36, 90)}" fill="${url(c, "a2")}"/></g>
          <g transform="rotate(-9 400 120)"><path class="bd-band" d="${band(66, 46, 120)}" fill="${url(c, "a1")}"/></g>
          <g transform="rotate(-13 400 100) translate(90 52)" opacity=".6"><path class="bd-band c" d="${band(70, 30, 70)}" fill="${url(c, "a1")}"/></g>
          <path d="${range(pk)}" fill="${p.far}"/><path d="${caps(pk, [3, 7, 1, 5], 0.4)}" fill="${p.snow}"/>
          <path d="${treeline(rng("aurora-trees"), 306, 22, 44, 22)}" fill="${p.trees}"/>
          <path d="${ridge([326, 318, 314, 318, 312, 316, 322, 316, 326])}" fill="${url(c, "gr")}"/>`,
        mount: post(p.wood, p.deep, p.grass),
      };
    },
  },

  bookshelf: {
    label: "estantería",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { wall: ["#2f2c39", "#25222d"], back: ["#3a3039", "#2c242c"], board: "#58463a", floor: ["#3a2e2b", "#2b2220"], books: ["#6e4a48", "#41546e", "#4f6448", "#7a6340", "#5a4a6e", "#6e5052"], leaf: "#4f6a58", pot: "#6b4a44", frame: "#6a5848", pic: "#33405e" }
        : { wall: ["#ece5da", "#e2d8ca"], back: ["#dac8af", "#ccb699"], board: "#c49d76", floor: ["#c8a886", "#b69570"], books: ["#cf9384", "#90abc8", "#a7c49a", "#e1c18b", "#b49cc6", "#d9aaa2"], leaf: "#93bb94", pot: "#d9907a", frame: "#b08a64", pic: "#dbe8ee" };
      const r = rng("bookshelf");
      const unit = (x0: number) => {
        let out = `<rect x="${x0}" y="50" width="118" height="296" fill="${url(c, "back")}"/>`;
        for (const [k, shelf] of [122, 196, 270, 338].entries()) {
          out += `<rect x="${x0 - 4}" y="${shelf}" width="126" height="${k === 3 ? 10 : 8}" fill="${p.board}"/>`;
          if (k === 3) break;
          let x = x0 + 8;
          const stop = x0 + 110, extra = (k + (x0 > 400 ? 1 : 0)) % 3;
          while (x < stop - 10) {
            if (extra === 1 && x > x0 + 66) { out += `<path d="M${x + 8} ${shelf}l2-14h18l2 14z" fill="${p.pot}"/><g class="bd-sway" fill="${p.leaf}"><ellipse cx="${x + 13}" cy="${shelf - 24}" rx="5" ry="12" transform="rotate(-25 ${x + 13} ${shelf - 24})"/><ellipse cx="${x + 25}" cy="${shelf - 24}" rx="5" ry="12" transform="rotate(25 ${x + 25} ${shelf - 24})"/><ellipse cx="${x + 19}" cy="${shelf - 30}" rx="4.5" ry="13"/></g>`; break; }
            if (extra === 2 && x > x0 + 60) { out += `<rect x="${x + 4}" y="${shelf - 44}" width="34" height="44" rx="2" fill="${p.frame}"/><rect x="${x + 9}" y="${shelf - 39}" width="24" height="30" fill="${p.pic}"/>`; break; }
            const w = r.int(9, 15), h = r.int(44, 62);
            out += `<rect x="${x}" y="${shelf - h}" width="${w}" height="${h}" rx="1.5" fill="${r.pick(p.books)}"/>`;
            x += w + 1;
          }
        }
        return out + `<rect x="${x0 - 6}" y="44" width="130" height="8" fill="${p.board}"/><rect x="${x0 - 6}" y="44" width="8" height="304" fill="${p.board}"/><rect x="${x0 + 116}" y="44" width="8" height="304" fill="${p.board}"/>`;
      };
      return {
        defs: lin(c, "wall", [[0, p.wall[0]], [1, p.wall[1]]]) + lin(c, "back", [[0, p.back[0]], [1, p.back[1]]]) + lin(c, "floor", [[0, p.floor[0]], [1, p.floor[1]]]) + glow(c, "pool", c.dark ? "#f3c27a" : "#fffaf0", c.dark ? 0.14 : 0.45),
        scene: `<rect width="800" height="440" fill="${url(c, "wall")}"/>
          <ellipse cx="400" cy="170" rx="250" ry="230" fill="${url(c, "pool")}"/>
          ${unit(184)}${unit(498)}
          <rect y="350" width="800" height="96" fill="${url(c, "floor")}"/><rect y="346" width="800" height="6" fill="${p.board}"/>`,
      };
    },
  },

  meadow: {
    label: "pradera",
    kind: "scene",
    draw(c) {
      const p = c.dark
        ? { sky: ["#252a4c", "#6a546f"], sun: "#eaa48a", far: "#334550", mid: ["#2b3d3e", "#243433"], near: ["#22322e", "#1a2724"], cloud: "#5a5a80", tree: "#294036", trunk: "#3d3330", flowers: ["#a77d92", "#a59a6e", "#8f94b8"], wood: "#4a3e38", deep: "#2c2522", grass: "#34503f" }
        : { sky: ["#cbe4f4", "#f7f0dc"], sun: "#fff2cc", far: "#c3dbb0", mid: ["#b1d19b", "#a5c78f"], near: ["#a1c68b", "#8db67a"], cloud: "#ffffff", tree: "#9cc18b", trunk: "#b49274", flowers: ["#f2b3c4", "#f6dc8a", "#ffffff"], wood: "#c49c74", deep: "#8f6c4c", grass: "#7fa86c" };
      const r = rng("meadow");
      const flowers = Array.from({ length: c.dark ? 12 : 22 }, (_, i) => `<circle cx="${n(r.range(180, 620))}" cy="${n(r.range(300, 420))}" r="${n(r.range(2.2, 4))}" fill="${p.flowers[i % 3]}"/>`).join("");
      const flies = c.dark ? Array.from({ length: 7 }, (_, i) => `<circle class="bd-tw${["", " b", " c"][i % 3]}" cx="${n(r.range(200, 600))}" cy="${n(r.range(220, 330))}" r="6" fill="${url(c, "fly")}"/>`).join("") : "";
      return {
        defs: sky(c, p.sky[0], p.sky[1]) + glow(c, "sun", p.sun, c.dark ? 0.35 : 0.9) + lin(c, "mid", [[0, p.mid[0]], [1, p.mid[1]]]) + lin(c, "near", [[0, p.near[0]], [1, p.near[1]]]) + (c.dark ? glow(c, "fly", "#e6f39a", 0.85) : ""),
        scene: `${fillSky(c)}
          <ellipse cx="${c.dark ? 520 : 560}" cy="${c.dark ? 270 : 118}" rx="${c.dark ? 320 : 120}" ry="${c.dark ? 120 : 120}" fill="${url(c, "sun")}"/>
          ${c.dark ? stars(rng("meadow-stars"), 12, [190, 12, 610, 120], "#efecf8", 1.2) : `<circle cx="560" cy="118" r="20" fill="#fffaf0" opacity=".85"/>`}
          <g fill="${p.cloud}" opacity="${c.dark ? 0.45 : 0.8}"><path class="bd-drift" d="${cloud(290, 124, 96)}"/><path class="bd-drift slow b" d="${cloud(470, 70, 60)}"/></g>
          <path d="${ridge([262, 248, 256, 244, 252, 260, 246, 254, 250])}" fill="${p.far}"/>
          <path d="${ridge([300, 286, 280, 290, 284, 278, 288, 294, 286])}" fill="${url(c, "mid")}"/>
          <path d="M228 300v-46" stroke="${p.trunk}" stroke-width="9" stroke-linecap="round"/>
          <g class="bd-sway slow" fill="${p.tree}"><circle cx="228" cy="236" r="30"/><circle cx="208" cy="252" r="20"/><circle cx="250" cy="250" r="22"/></g>
          <path d="${ridge([332, 322, 316, 322, 318, 314, 322, 328, 322])}" fill="${url(c, "near")}"/>
          <g opacity="${c.dark ? 0.35 : 0.85}">${flowers}</g>
          ${flies}`,
        mount: post(p.wood, p.deep, p.grass),
      };
    },
  },
};

/** The seed's backdrop: a quarter keep today's tone tint, the rest roll any other backdrop. */
export function backdropFromSeed(seed: string): string {
  const r = rng(seed, "backdrop");
  if (r.chance(0.25)) return "tone";
  return r.pick(Object.keys(BACKDROPS).filter((id) => id !== "tone"));
}

/** The backdrop as one <svg> that fills its box (see the header for its layers). Unknown ids draw "tono del bicho". */
export function backdropSvg(id: string, tone: string, theme: Theme = "dark"): string {
  const b = BACKDROPS[id] ?? BACKDROPS.tone;
  const pre = uid("bd");
  const c: Ctx = { dark: theme === "dark", tone, id: (name) => `${pre}-${name}` };
  const l = b.draw(c);
  // The vignette: edges sink a little in the dark theme and fade toward paper in the light one (a soft "blur" look).
  const vig = c.dark ? rad(c, "vig", [[0.55, "#07060c", 0], [1, "#07060c", 0.42]], 0.5, 0.45, 0.75) : rad(c, "vig", [[0.55, "#fffdf8", 0], [1, "#fffdf8", 0.45]], 0.5, 0.45, 0.75);
  const hang = b.hang ?? (l.mount ? "mount" : "pin");
  return `<svg class="backdrop" data-backdrop="${BACKDROPS[id] ? id : "tone"}" data-hang="${hang}" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>${l.defs ?? ""}${vig}</defs>`
    + (l.box ?? "")
    + (l.scene ? `<svg viewBox="0 0 800 440" preserveAspectRatio="xMidYMax slice">${l.scene}</svg>` : "")
    + (l.mount ? `<svg class="bd-mount" x="50%" overflow="visible">${l.mount}</svg>` : "")
    + (b.flat ? "" : `<rect width="100%" height="100%" fill="url(#${c.id("vig")})"/>`) + "</svg>";
}

/** Fills the box, hides the mount until the host shows it, and moves the scenes gently. Global (not scoped):
 *  everything is under `.backdrop`. Reduced motion stops it all. */
export const BACKDROP_CSS = `
.backdrop { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; overflow: hidden }
.backdrop .bd-mount { display: none }
.backdrop :is(.bd-drift, .bd-tw, .bd-sway, .bd-wave, .bd-rise, .bd-glow, .bd-band, .bd-swim, .bd-float, .bd-spin) { transform-box: fill-box; transform-origin: 50% 50% }
.backdrop .bd-drift { animation: bd-drift 38s ease-in-out infinite alternate }
.backdrop .bd-drift.slow { animation-duration: 56s; animation-delay: -20s }
.backdrop .bd-drift.b { animation-direction: alternate-reverse }
.backdrop .bd-tw { animation: bd-tw 3.4s ease-in-out infinite }
.backdrop .bd-tw.b { animation-duration: 4.7s; animation-delay: -1.6s }
.backdrop .bd-tw.c { animation-duration: 2.7s; animation-delay: -.8s }
.backdrop .bd-sway { transform-origin: 50% 100%; animation: bd-sway 5s ease-in-out infinite alternate }
.backdrop .bd-sway.b { animation-duration: 6.2s; animation-delay: -2s }
.backdrop .bd-sway.c { animation-duration: 4.4s; animation-delay: -1s }
.backdrop .bd-sway.slow { animation: bd-sway-slow 9s ease-in-out infinite alternate }
.backdrop .bd-sway.slow.b { animation-delay: -4s }
.backdrop .bd-sway.palm { transform-origin: 50% 30% }
.backdrop .bd-wave { animation: bd-wave 6s ease-in-out infinite alternate }
.backdrop .bd-wave.b { animation-duration: 7.5s; animation-direction: alternate-reverse }
.backdrop .bd-rise { animation: bd-rise 10.4s linear infinite }
.backdrop .bd-glow { animation: bd-glow 7s ease-in-out infinite alternate }
.backdrop .bd-glow.b { animation-delay: -3s }
.backdrop .bd-glow.c { animation-delay: -5s }
.backdrop .bd-band { animation: bd-band 14s ease-in-out infinite alternate }
.backdrop .bd-band.b { animation-duration: 18s; animation-direction: alternate-reverse }
.backdrop .bd-band.c { animation-duration: 11s; animation-delay: -4s }
.backdrop .bd-swim { animation: bd-swim 26s ease-in-out infinite alternate }
.backdrop .bd-swim.b { animation-duration: 34s; animation-direction: alternate-reverse }
.backdrop .bd-float { animation: bd-float 9s ease-in-out infinite alternate }
.backdrop .bd-float.b { animation-duration: 7s; animation-delay: -3s }
.backdrop .bd-spin { animation: bd-spin 30s linear infinite }
.backdrop .bd-spin.b { animation-direction: reverse }
@keyframes bd-drift { from { transform: translateX(-22px) } to { transform: translateX(22px) } }
@keyframes bd-tw { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
@keyframes bd-sway { from { transform: rotate(-3deg) } to { transform: rotate(3deg) } }
@keyframes bd-sway-slow { from { transform: rotate(-1.2deg) } to { transform: rotate(1.2deg) } }
@keyframes bd-wave { from { transform: translateX(-10px) } to { transform: translateX(10px) } }
@keyframes bd-rise { 0% { transform: translateY(0); opacity: 0 } 10% { opacity: 1 } 85% { opacity: 1 } 100% { transform: translateY(-260px); opacity: 0 } }
@keyframes bd-glow { from { opacity: .55 } to { opacity: 1 } }
@keyframes bd-band { from { transform: translateX(-30px) skewX(-4deg); opacity: .75 } to { transform: translateX(30px) skewX(4deg); opacity: 1 } }
@keyframes bd-swim { from { transform: translateX(-40px) } to { transform: translateX(40px) } }
@keyframes bd-float { from { transform: translateY(-4px) } to { transform: translateY(4px) } }
@keyframes bd-spin { to { transform: rotate(360deg) } }
@media (prefers-reduced-motion: reduce) { .backdrop * { animation: none !important } }
`;
