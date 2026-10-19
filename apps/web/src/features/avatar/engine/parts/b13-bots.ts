import { INK, LAYER, SOFT_INK, batch, ellipse, eyeAt, eyePair, n, spanAt, type BodyDef, type ColorRule, type Ctx, type Drawing, type Eye, type Piece, type Rng } from "../bichos/kit";

/* B13 Bots (docs/catalogue.md F10, reworked after the operator's robot feedback).
 *
 * Robot parts are modular: robot eyes are only eyes and a robot mouth is only a mouth. There is no screen plate behind
 * them, so they work on any body, and any other eyes and mouths work on the robot bodies. Each LED eye sits in its own
 * small ink socket (its "sclera"), which keeps it readable on a pale coat; a tinted visor is a separate, optional face
 * accessory (`eyewear: visor-glass`). The core `led` eyes keep their old screen, untouched, for the `v3:` seeds; the
 * robot member rolls these plate-free eyes instead (see `extend`).
 *
 * Robots feel alive in each mood, with the shared keyframes only:
 * - speaking: the LED mouths flash a different row of equaliser bars on every word (beat a / beat b);
 * - working: LED eyes turn into a spinning "loading" ring, darting pupils or a stepping pixel; panel lamps blink in
 *   turn; dishes scan, rotors and wheels spin, the chimney puffs, the wind-up key turns;
 * - waiting: a cheerful alert: LED eyes go ^ ^, the mouth lights a smile, the beacon flashes, springs boing;
 * - idle: powered down: sockets dark with a dim line, lamps and LEDs dimmed, antennae drooping, jets off. */

const LED = "#7df9ff";
/** A light steel for grilles: a fixed colour, like the LED cyan. */
const STEEL = "#d3dbe4";
type P = [number, number];

/* ---------- shape helpers ---------- */

/** A rounded rectangle. */
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const R = Math.min(r, w / 2, h / 2);
  return `M${n(x + R)} ${n(y)}H${n(x + w - R)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + R)}V${n(y + h - R)}Q${n(x + w)} ${n(y + h)} ${n(x + w - R)} ${n(y + h)}H${n(x + R)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - R)}V${n(y + R)}Q${n(x)} ${n(y)} ${n(x + R)} ${n(y)}Z`;
}
/** A true circle (two arcs). */
const circle = (x: number, y: number, r: number) => `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x - r)} ${n(y)}Z`;
/** A capsule of width w from one point to another (rounded ends). */
function capsule(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, px = -uy * (w / 2), py = ux * (w / 2), k = w / 2;
  const p = (x: number, y: number) => `${n(x)} ${n(y)}`;
  return `M${p(x1 + px, y1 + py)}L${p(x2 + px, y2 + py)}Q${p(x2 + px + ux * k, y2 + py + uy * k)} ${p(x2 + ux * k, y2 + uy * k)}Q${p(x2 - px + ux * k, y2 - py + uy * k)} ${p(x2 - px, y2 - py)}L${p(x1 - px, y1 - py)}Q${p(x1 - px - ux * k, y1 - py - uy * k)} ${p(x1 - ux * k, y1 - uy * k)}Q${p(x1 + px - ux * k, y1 + py - uy * k)} ${p(x1 + px, y1 + py)}Z`;
}
const dot = (x: number, y: number): string => `M${n(x)} ${n(y)}L${n(x)} ${n(y + 0.1)}`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d: string, color: string, w: number, extra = "") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

/* ---------- bodies ---------- */

/** A tin can: a lid that overhangs the straight sides by a lip, and a base rim. */
function canOutline(r: Rng): string {
  const L = 27 + r.range(-0.4, 0.4), B = 24, F = 25.5, T = 31.5, lid = n(38.5 + r.range(-0.4, 0.4));
  const x = (dx: number) => n(60 + dx);
  return `M${x(-L + 2.5)} ${T}Q60 ${T - 3} ${x(L - 2.5)} ${T}Q${x(L)} ${T} ${x(L)} ${T + 2.5}V${n(lid - 2.5)}Q${x(L)} ${lid} ${x(L - 2.5)} ${lid}H${x(B)}V92Q${x(F)} 92 ${x(F)} 94.5V96Q${x(F)} 99 ${x(F - 3)} 99H${x(-F + 3)}Q${x(-F)} 99 ${x(-F)} 96V94.5Q${x(-F)} 92 ${x(-B)} 92V${lid}H${x(-L + 2.5)}Q${x(-L)} ${lid} ${x(-L)} ${n(lid - 2.5)}V${T + 2.5}Q${x(-L)} ${T} ${x(-L + 2.5)} ${T}Z`;
}

/** An old TV set: wide, short, every edge bulging a little like a tube screen. */
function tvOutline(r: Rng): string {
  const b = 1.5 + r.range(-0.4, 0.4);
  return `M30 34.5Q60 ${n(34.5 - 2 * b)} 90 34.5Q103.5 35.5 104 48Q${n(104 + b)} 62 104 76Q103.5 88.5 90 89.5Q60 ${n(89.5 + 1.4 * b)} 30 89.5Q16.5 88.5 16 76Q${n(16 - b)} 62 16 48Q16.5 35.5 30 34.5Z`;
}

/** A floating ball with a round hub on each side at eye level (a ball bot's "ears"). */
const orbOutline = () => `${circle(60, 62, 30)}${circle(29.5, 60.5, 6)}${circle(90.5, 60.5, 6)}`;

/** The classic two-box robot: a big head, a dark neck, a smaller torso. */
const stackOutline = () => "M44 24H76Q86 24 86 34V58Q86 68 76 68H69V73H79Q88 73 88 82V91Q88 100 79 100H41Q32 100 32 91V82Q32 73 41 73H51V68H44Q34 68 34 58V34Q34 24 44 24Z";

/** A dome head on a can: the dome's rim sticks out a little at each side. */
const domeheadOutline = () => "M60 28C76.5 28 88 40 88 55.5H89.5Q91.5 55.5 91.5 57.5V58.5Q91.5 60.5 89.5 60.5H87.5V91Q87.5 98 80.5 98H39.5Q32.5 98 32.5 91V60.5H30.5Q28.5 60.5 28.5 58.5V57.5Q28.5 55.5 30.5 55.5H32C32 40 43.5 28 60 28Z";

/** Feet and the like can't hang under a floating body (the dome's rule, catalogue §4.3). */
const NO_FEET = "legs:feet|paws|bird|webbed|stick|boots|root|many|springs|treads";

const BODIES: BodyDef[] = [
  {
    id: "can", label: "lata",
    frame: { top: 30, eyeY: 54, mouthY: 70, armY: 66, half: 27, bottom: 99, faceHalf: 24 },
    outline: canOutline,
    anchors: {
      crown: { x: 60, y: 32, a: 0, s: 0.92 },
      hat: { x: 60, y: 32.5, a: 0, s: 0.9 },
      crownL: { x: 50.3, y: 34, a: -20, s: 0.9 },
      earL: { x: 45, y: 33, a: -30, s: 0.9 },
      templeL: { x: 36, y: 53, a: -90 },
      backL: { x: 37, y: 52, a: -72 },
      rump: { x: 78, y: 96, a: 115 },
    },
    // A can's highlight: one straight stroke down the left side, under the eyes.
    shine: () => "M40.5 66 L40.5 87",
  },
  {
    id: "tv", label: "tele",
    frame: { top: 33, eyeY: 56, mouthY: 72, armY: 62, half: 44, bottom: 91, faceHalf: 38 },
    outline: tvOutline,
    anchors: {
      hat: { x: 60, y: 35, a: 0, s: 1.1 },
      templeL: { x: 16.5, y: 55, a: -90 },
      backL: { x: 19, y: 50, a: -75 },
      // A wide stance: the set stands on its legs at its corners.
      footL: { x: 40, y: 88, a: 180 },
    },
    shine: () => "M22 62 Q21 41 35.5 37.5",
    // A flat screen front: a belly patch would sit under the open mouth.
    excludes: ["pattern:belly"],
  },
  {
    id: "orb", label: "orbe",
    frame: { top: 32, eyeY: 58, mouthY: 74, armY: 64, half: 30, bottom: 92 },
    outline: orbOutline,
    anchors: {
      crownL: { x: 48.5, y: 37, a: -22 },
      earL: { x: 43, y: 38.5, a: -36 },
      templeL: { x: 25, y: 60, a: -90 },
      rump: { x: 78, y: 84, a: 120 },
      ground: { x: 60, y: 106 },
    },
    shadow: { rx: 17, ry: 3.6, opacity: 0.75 },
    // It floats (`floats`: hover jets only, no treads or springs).
    tags: ["floats"],
    excludes: [NO_FEET],
  },
  {
    id: "stack", label: "cabezón",
    frame: { top: 24, eyeY: 44, mouthY: 56, armY: 78, half: 28, bottom: 100, faceHalf: 26 },
    outline: stackOutline,
    anchors: {
      crown: { x: 60, y: 26, a: 0, s: 0.92 },
      hat: { x: 60, y: 26, a: 0, s: 0.88 },
      crownL: { x: 49.7, y: 28, a: -20, s: 0.9 },
      earL: { x: 44.4, y: 26, a: -40, s: 0.9 },
      // The neck is the dark notch between head and torso: collars go round it.
      neck: { x: 60, y: 70.5 },
      backL: { x: 34, y: 80, a: -80 },
    },
    shine: () => "M38.5 48 Q38 30 48 28",
  },
  {
    id: "domehead", label: "cúpula",
    frame: { top: 28, eyeY: 50, mouthY: 67, armY: 70, half: 30.5, bottom: 98, faceHalf: 27 },
    outline: domeheadOutline,
    anchors: {
      crown: { x: 60, y: 30, a: 0, s: 0.94 },
      hat: { x: 60, y: 30.5, a: 0, s: 0.9 },
      crownL: { x: 49.4, y: 32, a: -25 },
      earL: { x: 44, y: 34, a: -45 },
      templeL: { x: 32.5, y: 49, a: -90 },
      backL: { x: 33, y: 64, a: -80 },
    },
    shine: () => "M37 50 Q38 37.5 49 32",
  },
];

/* ---------- LED eyes: each one in its own ink socket, no plate ---------- */

type Shape = "dot" | "pill" | "square";

/** The socket, the LED, its glow and its glint, for one eye. */
function ledGeo(shape: Shape, { x, y, r }: Eye) {
  if (shape === "dot") return { sock: circle(x, y, r), core: circle(x, y, r * 0.56), halo: circle(x, y, r * 0.8), glint: circle(x - r * 0.2, y - r * 0.22, r * 0.17) };
  if (shape === "pill") return { sock: rrect(x - r * 0.68, y - r, r * 1.36, r * 2, r * 0.68), core: rrect(x - r * 0.34, y - r * 0.62, r * 0.68, r * 1.24, r * 0.34), halo: rrect(x - r * 0.5, y - r * 0.82, r, r * 1.64, r * 0.5), glint: circle(x - r * 0.12, y - r * 0.36, r * 0.14) };
  return { sock: rrect(x - r * 0.95, y - r * 0.95, r * 1.9, r * 1.9, r * 0.42), core: rrect(x - r * 0.5, y - r * 0.5, r, r, r * 0.2), halo: rrect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, r * 0.3), glint: rrect(x - r * 0.38, y - r * 0.38, r * 0.26, r * 0.26, r * 0.06) };
}

/** A cheerful ^ for waiting. */
const happy = ({ x, y, r }: Eye, k = 1) => line(`M${n(x - r * 0.5 * k)} ${n(y + r * 0.22)}Q${n(x)} ${n(y - r * 0.62)} ${n(x + r * 0.5 * k)} ${n(y + r * 0.22)}`, LED, r * 0.27);
/** Powered down: a dim line across the dark socket. */
const dim = ({ x, y, r }: Eye, k = 1) => line(`M${n(x - r * 0.42 * k)} ${n(y + r * 0.12)}H${n(x + r * 0.42 * k)}`, LED, r * 0.2, ` opacity=".45"`);

/** What a LED eye shows while working: a spinning ring (dot), a darting pupil (pill), a pixel stepping round (square). */
function busy(shape: Shape, e: Eye): string {
  const { x, y, r } = e;
  if (shape === "dot") {
    const c = Math.PI * r;
    return `<circle class="b13-spin" cx="${x}" cy="${y}" r="${n(r * 0.5)}" fill="none" stroke="${LED}" stroke-width="${n(r * 0.2)}" stroke-linecap="round" stroke-dasharray="${n(c * 0.62)} ${n(c * 0.38)}"/>${path(circle(x, y, r * 0.13), LED)}`;
  }
  if (shape === "pill") return `<g class="b13-dart">${path(rrect(x - r * 0.3, y - r * 0.45, r * 0.6, r * 0.9, r * 0.3), LED)}${path(circle(x - r * 0.1, y - r * 0.24, r * 0.12), "#fff")}</g>`;
  const p = r * 0.42, g = r * 0.12, o = (p + g) / 2;
  const px = (dx: number, dy: number, on: boolean) => path(rrect(x + dx * o - p / 2, y + dy * o - p / 2, p, p, p * 0.2), LED, on ? "" : ` opacity=".25"`);
  return `<g class="b13-step4">${px(-1, -1, true)}${px(1, -1, false)}${px(1, 1, false)}${px(-1, 1, false)}</g>`;
}

function ledEyes(ctx: Ctx, shape: Shape, inward: number, r: number): Drawing {
  // A wide face (box, TV) gets bigger LEDs, up to 18% more; eyePair still fits them to the face.
  const eyes = eyePair(ctx, inward, r * Math.min(1.18, Math.max(1, ctx.rig.faceHalf / 30)));
  const geo = eyes.map((e) => ledGeo(shape, e));
  const sockets = geo.map((g) => path(g.sock, INK)).join("");
  const lit = geo.map((g) => path(g.halo, LED, ` opacity=".3"`) + path(g.core, LED) + path(g.glint, "#fff")).join("");
  const k = shape === "pill" ? 0.85 : 1;
  return {
    eyes,
    face: {
      eyes: `${sockets}<g class="look"><g class="b13-x-norm b13-glow">${lit}</g><g class="b13-x-work">${eyes.map((e) => busy(shape, e)).join("")}</g><g class="b13-x-wait">${eyes.map((e) => happy(e, k)).join("")}</g></g>`,
      closed: sockets + eyes.map((e) => dim(e, k)).join(""),
      brows: "",
    },
  };
}

/** A visor band: one capsule across the face with two lit spots; a single spot sweeps it while working. */
function visorEyes(ctx: Ctx): Drawing {
  const { rig } = ctx, y = rig.at.eyes.y, hh = 6.4;
  const half = Math.min(rig.faceHalf - 4.5, rig.spread + 10), x0 = 60 - half, w = half * 2;
  const ex = Math.min(rig.spread + 1, half - 6.5), xs = [60 - ex, 60 + ex];
  const slot = path(rrect(x0, y - hh, w, hh * 2, hh), INK);
  const band = path(rrect(x0 + 2.4, y - hh + 2.4, w - 4.8, hh * 2 - 4.8, hh - 2.4), LED, ` opacity=".28"`);
  const spot = (x: number) => path(rrect(x - 4.6, y - 2.5, 9.2, 5, 2.5), LED) + path(rrect(x - 3, y - 1.6, 2.4, 1.3, 0.6), "#fff");
  const eyes: Eye[] = xs.map((x) => ({ x: n(x), y, r: hh }));
  return {
    eyes,
    face: {
      eyes: `${slot}<g class="look">${band}<g class="b13-x-norm b13-glow">${xs.map(spot).join("")}</g><g class="b13-x-work"><g class="b13-scan" style="transform-box:view-box;transform-origin:60px ${n(y + 100)}px">${spot(60)}</g></g><g class="b13-x-wait">${eyes.map((e) => happy({ ...e, r: 7.4 }, 0.9)).join("")}</g></g>`,
      closed: slot + line(`M${n(x0 + 5)} ${y}H${n(x0 + w - 5)}`, LED, 2, ` opacity=".4"`),
      brows: "",
    },
  };
}

/** A camera lens: one big eye with a bezel, dark glass and a lit iris that turns like an aperture while working. */
function lensEye(ctx: Ctx): Drawing {
  const e = eyeAt(ctx, 0, 0, 12.5), { x, y, r } = e;
  const glass = path(circle(x, y, r), INK) + `<circle cx="${x}" cy="${y}" r="${n(r * 0.8)}" fill="#2a2338" stroke="var(--bx-belly)" stroke-width="${n(r * 0.1)}"/>`;
  const iris = (extra: string) => `<circle cx="${x}" cy="${n(y + 0.5)}" r="${n(r * 0.44)}" fill="none" stroke="${LED}" stroke-width="${n(r * 0.14)}"${extra}/>`;
  const glint = path(ellipse(x - r * 0.32, y - r * 0.34, r * 0.17, r * 0.12), "#fff");
  const c = 2 * Math.PI * r * 0.44;
  return {
    eyes: [e],
    face: {
      eyes: `${glass}<g class="look"><g class="b13-x-norm b13-glow">${iris("")}${path(circle(x, y + 0.5, r * 0.2), LED)}${path(circle(x, y + 0.5, r * 0.11), INK)}</g><g class="b13-x-work">${iris(` class="b13-spin" stroke-dasharray="${n(c / 6 * 0.7)} ${n(c / 6 * 0.3)}"`)}${path(circle(x, y + 0.5, r * 0.14), LED)}</g><g class="b13-x-wait">${happy({ x, y, r: r * 0.85 })}</g></g>${glint}`,
      closed: glass + dim({ x, y, r: r * 0.8 }),
      brows: "",
    },
  };
}

/** Pink pixel hearts in round sockets (rare): they beat while working and pop while waiting. */
function heartEyes(ctx: Ctx): Drawing {
  const eyes = eyePair(ctx, 0, 8);
  const heart = ({ x, y, r }: Eye, s: number) => `M${n(x)} ${n(y + 0.8 * s)}C${n(x - 1.3 * s)} ${n(y + 0.05 * s)} ${n(x - 0.8 * s)} ${n(y - 1 * s)} ${n(x)} ${n(y - 0.36 * s)}C${n(x + 0.8 * s)} ${n(y - 1 * s)} ${n(x + 1.3 * s)} ${n(y + 0.05 * s)} ${n(x)} ${n(y + 0.8 * s)}Z`;
  const sockets = eyes.map((e) => path(circle(e.x, e.y, e.r), INK)).join("");
  return {
    eyes,
    face: {
      eyes: `${sockets}<g class="look">${eyes.map((e) => `<g class="b13-beat b13-glow">${path(heart(e, e.r * 0.78), "#ff6f91", ` opacity=".35"`)}${path(heart(e, e.r * 0.58), "#ff6f91")}${path(circle(e.x - e.r * 0.26, e.y - e.r * 0.2, e.r * 0.11), "#fff")}</g>`).join("")}</g>`,
      closed: sockets + eyes.map((e) => line(`M${n(e.x - e.r * 0.36)} ${n(e.y + 1)}H${n(e.x + e.r * 0.36)}`, "#ff6f91", e.r * 0.2, ` opacity=".45"`)).join(""),
      brows: "",
    },
  };
}

/* ---------- LED mouths: just mouths, flashing equaliser bars on every word ---------- */

/** Equaliser bars, centred on a line: one group per beat, so every word lights a different row. */
function eq(x: number, cy: number, w: number, gap: number, a: number[], b: number[], color = LED): string {
  const bars = (hs: number[]) => hs.map((h, i) => path(rrect(x + (i - (hs.length - 1) / 2) * (w + gap) - w / 2, cy - h / 2, w, h, w / 2), color)).join("");
  return `<g class="b13-eq-a">${bars(a)}</g><g class="b13-eq-b">${bars(b)}</g>`;
}

function ledBar(ctx: Ctx): Drawing {
  const { x, y } = ctx.rig.at.mouth;
  const rest = path(rrect(x - 11, y - 3.3, 22, 6.6, 3.3), INK);
  const open = path(rrect(x - 11.5, y - 2, 23, 12.5, 3.8), INK);
  return {
    emits: { chin: { x, y: y + 11.8 } },
    face: {
      mouthRest: `${rest}<g class="b13-m-norm b13-glow">${path(rrect(x - 8.4, y - 1.2, 16.8, 2.4, 1.2), LED)}</g><g class="b13-m-wait">${line(`M${x - 7.4} ${y - 1.3}Q${x} ${y + 3.8} ${x + 7.4} ${y - 1.3}`, LED, 2.2)}</g>`,
      mouthOpen: open + eq(x, y + 4.25, 2.6, 1.3, [4, 7.4, 5, 8.2, 3.2], [7.6, 3.4, 8.2, 4.4, 6.6]),
    },
  };
}

function grill(ctx: Ctx): Drawing {
  const { x, y } = ctx.rig.at.mouth;
  const plate = `<path d="${rrect(x - 10.5, y - 4, 21, 8.6, 3)}" fill="${STEEL}" stroke="${INK}" stroke-width="2.4"/>`;
  const slits = line(`M${x - 6.5} ${y - 1}H${x + 6.5}M${x - 6.5} ${y + 1.8}H${x + 6.5}`, INK, 1.7);
  const open = `<path d="${rrect(x - 11, y - 2, 22, 13.5, 3.6)}" fill="${INK}" stroke="${INK}" stroke-width="1.6"/>`;
  const bars = (ws: number[]) => ws.map((w, i) => path(rrect(x - w / 2, y + 1.3 + i * 3.4, w, 2, 1), LED)).join("");
  return {
    emits: { chin: { x, y: y + 12.5 } },
    face: {
      mouthRest: `${plate}${slits}<g class="b13-m-wait">${line(`M${x - 6.5} ${y - 1}H${x + 6.5}M${x - 6.5} ${y + 1.8}H${x + 6.5}`, LED, 1.7)}</g>`,
      mouthOpen: `${open}<g class="b13-eq-a">${bars([16, 11, 5])}</g><g class="b13-eq-b">${bars([8, 16, 12])}</g>`,
    },
  };
}

function ledSmile(ctx: Ctx): Drawing {
  const { x, y } = ctx.rig.at.mouth;
  const tube = (d: string) => line(d, INK, 5.4) + `<g class="b13-glow">${line(d, LED, 2.2)}</g>`;
  const D = `M${x - 9} ${y - 2}H${x + 9}Q${x + 9} ${y + 10} ${x} ${y + 10}Q${x - 9} ${y + 10} ${x - 9} ${y - 2}Z`;
  const Din = `M${x - 6.9} ${y - 0.4}H${x + 6.9}Q${x + 6.9} ${y + 8} ${x} ${y + 8}Q${x - 6.9} ${y + 8} ${x - 6.9} ${y - 0.4}Z`;
  const O = ellipse(x, y + 3.6, 5.6, 5.6), Oin = ellipse(x, y + 3.6, 3.6, 3.6);
  return {
    emits: { chin: { x, y: y + 11.3 } },
    face: {
      mouthRest: `<g class="b13-m-norm">${tube(`M${x - 8.5} ${y}Q${x} ${y + 7} ${x + 8.5} ${y}`)}</g><g class="b13-m-wait">${tube(`M${x - 9.5} ${y - 1}Q${x} ${y + 10} ${x + 9.5} ${y - 1}`)}</g>`,
      mouthOpen: `<g class="b13-eq-a">${path(D, INK, ` stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`)}${line(Din, LED, 1.7)}</g><g class="b13-eq-b">${path(O, INK, ` stroke="${INK}" stroke-width="2.4"`)}${line(Oin, LED, 1.7)}</g>`,
    },
  };
}

/* ---------- patterns ---------- */

/** Rivets near the body's corners, read off its real outline, stepping clear of the eyes; under arms and hats. */
function rivets(ctx: Ctx): Drawing {
  const { rig } = ctx, h = rig.bottom - rig.top, pieces: Piece[] = [];
  for (const y of [rig.top + h * 0.2, rig.bottom - h * 0.12]) {
    const s = spanAt(rig, y);
    if (!s) continue;
    for (const x of [s[0] + 4.6, s[1] - 4.6]) {
      if (ctx.eyes.some((e) => Math.hypot(e.x - x, e.y - y) < e.r + 3.5)) continue;
      pieces.push({ d: ellipse(x, y, 1.9, 1.9), c: "dark", ink: "inner", stroke: 1.1, layer: LAYER.skin });
      pieces.push({ d: ellipse(x - 0.5, y - 0.6, 0.6, 0.6), c: "#ffffff", ink: "inner", flat: true, layer: LAYER.skin, lod: 2 });
    }
  }
  return { pieces };
}

/** A chest panel with three lamps that blink in turn while working: across the chest under the open mouth when there
 * is room, else standing upright on the right flank, clear of the mouth (a boiler's side gauge). Painted on the skin,
 * so arms cover it when they swing in. */
function panel(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const top = rig.at.chin.y + 1.5, bottom = rig.bottom - 4.5;
  let cx: number, cy: number, w: number, h: number, upright = false;
  if (bottom - top >= 9) {
    h = Math.min(13, bottom - top); cy = (top + bottom) / 2;
    const s = spanAt(rig, cy + h / 2), room = s ? Math.min(60 - s[0], s[1] - 60) - 5 : 12;
    w = Math.min(24, room * 2); cx = 60;
  } else {
    upright = true; w = 8.6; h = Math.min(17, rig.bottom - rig.mouthY - 3);
    cy = rig.bottom - 5 - h / 2;
    const edge = (y: number) => spanAt(rig, y)?.[1] ?? 60 + rig.half;
    // As far out as the outline allows at the panel's lower corner, but well clear of the mouth (half 11).
    cx = Math.max(60 + 11 + 4 + w / 2, Math.min(edge(cy + h / 2) - 4.5, edge(cy - h / 2) - 4.5) - w / 2);
  }
  const lamps: [number, string][] = [[-1, "gold"], [0, LED], [1, "pink"]];
  const lr = Math.min(2.3, (upright ? w : h) * 0.21), step = (upright ? h : w) * 0.3;
  return {
    pieces: [
      { d: rrect(cx - w / 2, cy - h / 2, w, h, 2.6), c: "belly", ink: "inner", stroke: 2.2, layer: LAYER.skin },
      ...lamps.map(([i, c], k): Piece => ({ d: ellipse(upright ? cx : cx + i * step, upright ? cy + i * step : cy, lr, lr), c: c as Piece["c"], ink: "inner", stroke: 1.3, flat: true, layer: LAYER.skin, g: `b13-lamp-${k + 1}` })),
    ],
  };
}

/* ---------- legs ---------- */

/** A jet nozzle under a floating body, with a flame that flickers (off when powered down). */
function hover(ctx: Ctx): Drawing {
  const { x, y } = ctx.rig.at.base, f = y + 7.5;
  const flame = `M${n(x - 4.6)} ${n(f)}Q${n(x - 4.8)} ${n(f + 5)} ${n(x)} ${n(f + 9)}Q${n(x + 4.8)} ${n(f + 5)} ${n(x + 4.6)} ${n(f)}Z`;
  const core = `M${n(x - 2.2)} ${n(f + 0.4)}Q${n(x - 2.3)} ${n(f + 3.4)} ${n(x)} ${n(f + 5.6)}Q${n(x + 2.3)} ${n(f + 3.4)} ${n(x + 2.2)} ${n(f + 0.4)}Z`;
  const fl = { g: "b13-flame", pivot: [x, f] as P };
  return {
    pieces: [
      { d: `M${n(x - 8)} ${n(y - 5)}H${n(x + 8)}L${n(x + 5.6)} ${n(y + 5.5)}H${n(x - 5.6)}Z`, c: "dark" },
      { d: rrect(x - 7.4, y + 3.6, 14.8, 3.6, 1.6), c: "belly" },
      { d: flame, c: "gold", ...fl },
      { d: core, c: "#ffffff", ink: "inner", flat: true, ...fl },
    ],
  };
}

/** A hub that turns: a light cap with three spokes, in a `spin` group pivoted on its centre. Merged pieces with a thin
 * edge (their fat outline hides under the tyre), so they stay in the legs layer, under the body. */
function hub(x: number, y: number, r: number, g: string): Piece[] {
  const sp = [0, 60, 120].map((a) => { const c = Math.cos((a * Math.PI) / 180) * r * 0.78, s = Math.sin((a * Math.PI) / 180) * r * 0.78; return `M${n(x - c)} ${n(y - s)}L${n(x + c)} ${n(y + s)}`; }).join("");
  return [
    { d: ellipse(x, y, r, r), c: "belly", stroke: 1.4, g, pivot: [x, y] },
    { d: sp, c: "ink", w: 1.3, flat: true, g, pivot: [x, y], lod: 1 },
    { d: ellipse(x, y, r * 0.3, r * 0.3), c: "dark", flat: true, g, pivot: [x, y] },
  ];
}

/** One wheel under the body, standing on the ground shadow, on a short strut (rare). */
function wheel(ctx: Ctx): Drawing {
  const { rig } = ctx, r = 8.6, cy = rig.at.ground.y - r + 0.8;
  return {
    pieces: [
      { d: capsule(60, rig.bottom - 5, 60, cy, 5), c: "dark" },
      { d: ellipse(60, cy, r, r), c: SOFT_INK as Piece["c"] },
      ...hub(60, cy, r * 0.58, "spin"),
    ],
  };
}

/** Two wheels at the feet. */
function wheels(ctx: Ctx): Drawing {
  const { rig } = ctx, r = 7, cy = rig.at.ground.y - r + 0.8, dx = Math.min(20, Math.max(11.5, rig.half * 0.5));
  const side = (x: number, g: string): Piece[] => [
    { d: capsule(x, rig.bottom - 5, x, cy, 4.4), c: "dark" },
    { d: ellipse(x, cy, r, r), c: SOFT_INK as Piece["c"] },
    ...hub(x, cy, r * 0.56, g),
  ];
  return { pieces: [...side(60 - dx, "spin-l"), ...side(60 + dx, "spin-r")] };
}

/** Tank treads: a rubber track under the body with three turning wheels. */
function treads(ctx: Ctx): Drawing {
  const { rig } = ctx, w = Math.min(rig.half * 0.88, 31), h = 14.5, y0 = Math.min(rig.bottom - 4, rig.at.ground.y + 1.2 - h), y1 = y0 + h, cy = y0 + h / 2 + 0.6;
  const teeth = Array.from({ length: 7 }, (_, i) => { const x = 60 - w + h / 2 + (i * (2 * w - h)) / 6; return `M${n(x)} ${n(y1 - 1.6)}V${n(y1 - 0.2)}`; }).join("");
  return {
    pieces: [
      { d: rrect(60 - w, y0, 2 * w, h, h / 2), c: SOFT_INK as Piece["c"] },
      { d: rrect(60 - w + 2.6, y0 + 2.6, 2 * w - 5.2, h - 5.2, (h - 5.2) / 2), c: "dark", flat: true },
      ...[60 - w + h / 2, 60, 60 + w - h / 2].flatMap((x, i) => hub(x, cy, 4.6, ["spin-l", "spin", "spin-r"][i])),
      { d: teeth, c: "ink", w: 1.4, flat: true, lod: 2 },
    ],
  };
}

/* ---------- the visor accessory ---------- */

/** A tinted glass visor over the eyes, strapped to the temples: optional, never forced by the eyes. */
function visorGlass(ctx: Ctx): Drawing {
  const { eyes, rig } = ctx;
  if (!eyes.length) return {};
  const x0 = Math.min(...eyes.map((e) => e.x - e.r)) - 3.4, x1 = Math.max(...eyes.map((e) => e.x + e.r)) + 3.4;
  const y = eyes.reduce((t, e) => t + e.y, 0) / eyes.length, hh = Math.max(...eyes.map((e) => e.r)) + 2.8;
  const tl = Math.min(x0, rig.at.templeL.x + 1.5), tr = Math.max(x1, rig.at.templeR.x - 1.5);
  const glass = rrect(x0, y - hh, x1 - x0, hh * 2, hh * 0.9);
  return {
    over: `<g class="b13-visor">${line(`M${n(tl)} ${n(y)}H${n(x0 + 2)}M${n(x1 - 2)} ${n(y)}H${n(tr)}`, INK, 3.4)}<path d="${glass}" fill="${INK}" fill-opacity=".38" stroke="${INK}" stroke-width="2.6"/>${line(`M${n(x0 + hh * 0.7)} ${n(y + hh * 0.2)}L${n(x0 + hh * 1.4)} ${n(y - hh * 0.55)}M${n(x0 + hh * 1.5)} ${n(y + hh * 0.2)}L${n(x0 + hh * 1.9)} ${n(y - hh * 0.25)}`, "#fff", 2, ` opacity=".7"`)}</g>`,
  };
}

/* ---------- colours ---------- */

/** Clean toy-robot paints: aqua, sky, mint, coral, butter, lilac, and silver-white. The spot lands opposite. */
const BOT_COLORS: ColorRule[] = [
  { weight: 3, hue: { pick: [184, 196, 206] }, sat: [50, 62], light: [62, 70], spot: 180 },
  { weight: 2, hue: { pick: [150, 165] }, sat: [40, 52], light: [64, 72], spot: 180 },
  { weight: 2, hue: { pick: [8, 18, 28] }, sat: [62, 74], light: [62, 68], spot: 180 },
  { weight: 2, hue: { pick: [42, 50] }, sat: [70, 80], light: [62, 68], spot: 180 },
  { weight: 1, hue: { pick: [272, 290] }, sat: [36, 48], light: [66, 72], spot: 180 },
  { weight: 2, hue: [200, 230], sat: [6, 12], light: [80, 86], spot: 160 },
];

export default batch({
  label: "B13 Robots",
  // The robots' highlights run where the arms join (a can's down its side, a tv's round its corner): under the arms.
  bodies: BODIES.map((body) => ({ ...body, glossUnder: true })),

  parts: [
    /* ---------- tops (drawn on the reference body; the crown socket is (60, 42)) ---------- */
    {
      // A brass hex nut on a washer.
      id: "bolt", slot: "top", label: "tuerca", at: "crown", socket: [60, 42], noise: 1, tags: ["hat-hidden", "blocks-band"],
      // Three faces of a hex nut, lit from the left: the middle one light, the right one in shade.
      draw: {
        pieces: [
          { d: "M46.5 43 Q46.5 39.4 50 39.4 H70 Q73.5 39.4 73.5 43Z", c: "dark" },
          { d: "M51 40.4 L50.4 33.8 Q50.4 31.4 52.8 31.4 H67.2 Q69.6 31.4 69.6 33.8 L69 40.4Z", c: "gold" },
          { d: "M56 32.4 H64 V39.4 H56Z", c: "#ffe9a6", ink: "inner", flat: true },
          { d: "M64 32.4 H68.4 Q68.6 32.4 68.6 33.8 L68.1 39.4 H64Z", c: "#c99528", ink: "inner", flat: true },
          { d: "M56 32.4 V39.4 M64 32.4 V39.4", c: "ink", w: 1.4, ink: "inner", flat: true },
        ],
      },
    },
    {
      // A TV's V antenna: two rods from a knob, ball tips; the rods feel about, and droop when powered down.
      id: "rabbit-ears", slot: "top", label: "antena de tele", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"], jitter: { rot: 4 },
      draw: {
        pieces: [
          { d: "M57.5 37.5 L45.5 15.5", c: "dark", w: 2.4, flat: true, g: "b13-rod-l", pivot: [58, 38] },
          { d: dot(45.2, 15), c: "spot", w: 7.4, flat: true, g: "b13-rod-l", pivot: [58, 38], layer: LAYER.float },
          { d: "M62.5 37.5 L74.5 15.5", c: "dark", w: 2.4, flat: true, g: "b13-rod-r", pivot: [62, 38] },
          { d: dot(74.8, 15), c: "spot", w: 7.4, flat: true, g: "b13-rod-r", pivot: [62, 38], layer: LAYER.float },
          { d: "M51.5 42.5 Q51.5 34.5 60 34.5 Q68.5 34.5 68.5 42.5Z", c: "dark" },
        ],
      },
    },
    {
      // A little radar dish on a stalk, tilted up to one side: it scans while working.
      id: "dish", slot: "top", label: "radar", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"],
      draw: () => {
        // Drawn upright (a bowl opening upwards over the stalk's top), then tilted 32° about the stalk's top, which is
        // also the pivot it scans about.
        const o: P = [60, 32], t = (32 * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
        const q = (x: number, y: number) => `${n(o[0] + (x - o[0]) * c - (y - o[1]) * s)} ${n(o[1] + (x - o[0]) * s + (y - o[1]) * c)}`;
        const sw = { g: "b13-dish", pivot: o };
        return {
          pieces: [
            { d: "M60 42 L60 32", c: "dark", w: 3.4, flat: true },
            { d: `M${q(47, 21.5)}Q${q(48.5, 33.5)} ${q(60, 33.5)}Q${q(71.5, 33.5)} ${q(73, 21.5)}Q${q(60, 26.5)} ${q(47, 21.5)}Z`, c: "belly", ...sw },
            { d: `M${q(49.6, 23.4)}Q${q(60, 27.6)} ${q(70.4, 23.4)}`, c: "dark", w: 1.6, ink: "inner", flat: true, ...sw },
            { d: `M${q(60, 30)}L${q(60, 17.5)}`, c: "dark", w: 1.7, flat: true, ...sw },
            { d: `M${q(60, 16.8)}L${q(60, 16.7)}`, c: "spot", w: 5.4, flat: true, ...sw },
            { d: dot(60, 32), c: "dark", w: 5.6, flat: true },
          ],
        };
      },
    },
    {
      // A three-blade rotor on a mast: it spins while talking, races while working, rests when powered down.
      id: "propeller", slot: "top", label: "hélice", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"],
      draw: () => {
        const hx = 60, hy = 24.5, blades = [-90, 30, 150].map((a) => {
          const t = (a * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t), px = -uy * 4.4, py = ux * 4.4;
          return `M${hx} ${hy}Q${n(hx + ux * 6 + px)} ${n(hy + uy * 6 + py)} ${n(hx + ux * 12.5)} ${n(hy + uy * 12.5)}Q${n(hx + ux * 6 - px)} ${n(hy + uy * 6 - py)} ${hx} ${hy}Z`;
        });
        const rot = { g: "b13-rotor", pivot: [hx, hy] as P };
        return {
          pieces: [
            { d: `M60 42 L60 ${hy + 2}`, c: "dark", w: 3.2, flat: true },
            ...blades.map((d): Piece => ({ d, c: "spot", ...rot })),
            { d: dot(hx, hy), c: "gold", w: 5.6, flat: true, ...rot },
          ],
        };
      },
    },
    {
      // A short chimney: smoke puffs rise while working, and one puff pops on every word.
      id: "chimney", slot: "top", label: "chimenea", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"],
      draw: (ctx) => ({
        pieces: [
          { d: "M61.5 43 L61.5 30 H71.5 L71.5 43Z", c: "dark" },
          { d: rrect(59.4, 26.6, 14.2, 4.8, 1.8), c: "dark" },
          { d: "M61.5 36.4 H71.5", c: "belly", w: 2.2, ink: "inner", flat: true },
        ],
        over: ctx.size === "stage" ? `<g class="b13-smoke"><circle cx="67.5" cy="20.5" r="3.4"/><circle cx="70.5" cy="13" r="4.2"/><circle cx="66" cy="6.5" r="3"/><circle cx="65.5" cy="21" r="3.2"/></g>` : "",
      }),
    },
    {
      // A spring antenna with a ball: it wobbles while talking and boings while waiting.
      id: "coil", slot: "top", label: "antena de muelle", at: "crown", socket: [60, 42], group: "b13-boing", tags: ["tall", "blocks-band"],
      draw: {
        pieces: [
          { d: "M60 42 L55.6 39.2 L64.4 36 L55.6 32.8 L64.4 29.6 L57.5 26.6", c: "dark", w: 2.4, flat: true },
          { d: ellipse(59.6, 21.4, 5.4, 5.4), c: "spot" },
          { d: ellipse(57.8, 19.6, 1.5, 1.1), c: "#ffffff", ink: "inner", flat: true },
        ],
      },
    },
    {
      // A beacon lamp: it flashes a cheerful alert while waiting, blinks slowly while working, dims when powered down.
      id: "beacon", slot: "top", label: "baliza", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"],
      draw: (ctx) => ({
        pieces: [
          { d: rrect(50.5, 36.5, 19, 6, 2.2), c: "dark" },
          { d: "M52.8 37 Q52.8 24.8 60 24.8 Q67.2 24.8 67.2 37Z", c: "spot", g: "b13-lamp", pivot: [60, 31] },
          { d: "M56 34.5 Q56 29.4 58.6 28", c: "#ffffff", w: 1.8, ink: "inner", flat: true, g: "b13-lamp", pivot: [60, 31] },
        ],
        over: ctx.size === "stage" ? `<g class="b13-rays">${line("M47 27 L43.5 24.5 M45.6 33.5 L41.4 33.5 M73 27 L76.5 24.5 M74.4 33.5 L78.6 33.5 M60 21 L60 17", INK, 2.2)}</g>` : "",
      }),
    },
    {
      // Robot ears: a disc on each temple with a little feeler.
      id: "dials", slot: "top", label: "orejas de robot", at: "templeL", socket: [28, 57], tags: ["blocks-temples"], jitter: { rot: 5 },
      draw: {
        pieces: [
          { d: "M24.2 51 L21.4 43.4", c: "dark", w: 2.2, flat: true, g: "b13-ear", pivot: [24.2, 51] },
          { d: dot(21.2, 42.6), c: "spot", w: 5.6, flat: true, g: "b13-ear", pivot: [24.2, 51] },
          { d: ellipse(25.6, 57, 6.2, 7), c: "dark" },
          { d: ellipse(25, 57, 3.4, 4), c: "belly", ink: "inner" },
        ],
      },
    },

    /* ---------- eyes ---------- */
    { id: "led-dot", slot: "eyes", label: "LED redondos", draw: (ctx) => ledEyes(ctx, "dot", 0, 8) },
    { id: "led-pill", slot: "eyes", label: "LED alargados", draw: (ctx) => ledEyes(ctx, "pill", 0.5, 8.4) },
    { id: "led-square", slot: "eyes", label: "LED cuadrados", draw: (ctx) => ledEyes(ctx, "square", 0, 7.4) },
    // One band across the face: no other eyewear fits over it.
    { id: "visor", slot: "eyes", label: "visor", excludes: ["eyewear", "#stalks"], draw: visorEyes },
    { id: "lens", slot: "eyes", label: "objetivo", tags: ["one-eye"], draw: lensEye },
    { id: "led-heart", slot: "eyes", label: "LED corazones", rarity: "rare", draw: heartEyes },

    /* ---------- mouths ---------- */
    { id: "led-bar", slot: "mouth", label: "barra LED", draw: ledBar },
    { id: "grill", slot: "mouth", label: "rejilla", draw: grill },
    { id: "led-smile", slot: "mouth", label: "sonrisa de neón", draw: ledSmile },

    /* ---------- arms ---------- */
    {
      // A jointed arm with a two-finger clamp; the clamp holds items.
      id: "bot", slot: "arms", label: "brazos de robot", at: "shoulderL", socket: [34, 74], group: "arm", tags: ["hand"],
      draw: {
        pieces: [
          { d: capsule(33, 74.5, 25.4, 80.4, 6.2), c: "belly" },
          { d: capsule(25.2, 80.8, 21.6, 86, 5.2), c: "belly" },
          { d: "M20 85.6 Q14.4 86 14.6 91.6", c: "dark", w: 3, flat: true },
          { d: "M23 88 Q23.2 93.6 17.8 94.2", c: "dark", w: 3, flat: true },
          { d: ellipse(25.2, 80.6, 3.3, 3.3), c: "dark" },
          { d: ellipse(21.4, 86.6, 2.7, 2.7), c: "dark" },
          { d: ellipse(33.4, 74.2, 4.2, 4.2), c: "dark" },
        ],
        emits: { handL: { x: 18.6, y: 90 } },
        // The joint sits on the body's edge, where a can's or a tv's highlight runs: the gloss goes under the arm.
        glossUnder: true,
      },
    },

    /* ---------- legs ---------- */
    { id: "hover", slot: "legs", label: "propulsor", requires: ["#floats"], excludes: ["tail"], draw: hover },
    { id: "wheel", slot: "legs", label: "rueda", rarity: "rare", draw: wheel },
    { id: "wheels", slot: "legs", label: "ruedas", noise: 1, draw: wheels },
    // Treads and springs stand on the ground: not under a floating body.
    { id: "treads", slot: "legs", label: "orugas", noise: 1, excludes: ["#floats"], draw: treads },
    {
      // Spring legs: they hop while working and boing while waiting, and settle when powered down.
      id: "springs", slot: "legs", label: "muelles", at: "footL", socket: [51, 92], group: "b13-spring", excludes: ["#floats"],
      draw: {
        pieces: [
          // Legs only get the band between the body's base and the ground: the coil packs two fat zigzags there.
          { d: "M51 92 L46.2 94.6 L55.8 96.6 L46.2 98.6 L51 100.4", c: "dark", w: 2.5, flat: true },
          { d: "M43 104.2 Q43 99.6 51 99.6 Q59 99.6 59 104.2Z", c: "dark" },
        ],
      },
    },

    /* ---------- patterns ---------- */
    { id: "rivets", slot: "pattern", label: "remaches", lod: 1, draw: rivets },
    { id: "panel", slot: "pattern", label: "panel de luces", draw: panel },

    /* ---------- back ---------- */
    {
      // A wind-up key on the right side: it turns while working.
      id: "windup", slot: "back", label: "llave de cuerda", at: "backR", pair: false, socket: [87.2, 56], jitter: { rot: 6 },
      draw: {
        pieces: [
          { d: "M84 56 L98 56", c: "dark", w: 3.4, flat: true },
          { d: ellipse(100.6, 49.6, 3.8, 5.6), c: "gold", g: "b13-key", pivot: [100.6, 56] },
          { d: ellipse(100.6, 62.4, 3.8, 5.6), c: "gold", g: "b13-key", pivot: [100.6, 56] },
          { d: ellipse(100.6, 56, 2.6, 2.6), c: "gold", g: "b13-key", pivot: [100.6, 56] },
        ],
      },
    },

    /* ---------- the face accessory ---------- */
    { id: "visor-glass", slot: "eyewear", label: "visera de cristal", rarity: "uncommon", excludes: ["#many-eyes", "#stalks"], draw: visorGlass },
  ],

  members: [
    {
      // A tin-can bot: hex nut, rivets, clamp arms.
      id: "latita", family: "bots", label: "latita", bodies: { can: 3, pill: 1 },
      fixed: { top: "bolt", pattern: ["rivets"], arms: "bot", legs: { feet: 10, wheels: 4, springs: 4 } },
      pools: { eyes: { "led-dot": 10, visor: 6, "led-pill": 5, "led-heart": 1 }, mouth: { "led-bar": 10, grill: 6, "led-smile": 6 } },
      color: BOT_COLORS,
    },
    {
      // An old TV set on legs, with a V antenna.
      id: "tele", family: "bots", label: "tele", bodies: "tv",
      fixed: { top: "rabbit-ears", legs: "stick|feet", arms: { bot: 10, nubs: 6 } },
      pools: { eyes: { "led-square": 10, "led-dot": 5, "led-pill": 4, "led-heart": 1 }, mouth: { grill: 10, "led-bar": 6, "led-smile": 5 } },
      color: BOT_COLORS,
    },
    {
      // A little drone: a rotor on top, a jet underneath.
      id: "dron", family: "bots", label: "dron", bodies: { orb: 3, dome: 2 },
      fixed: { top: "propeller", legs: "hover", arms: "bot" },
      pools: { eyes: { visor: 10, lens: 8, "led-dot": 4 }, mouth: { "led-bar": 8, "led-smile": 8 } },
      color: BOT_COLORS,
    },
    {
      // A floating ball with a camera eye and a radar dish (and, rarely, one wheel).
      id: "orbe", family: "bots", label: "orbe", bodies: "orb",
      fixed: { eyes: "lens", top: "dish", arms: { bot: 10, nubs: 8 } },
      pools: { mouth: { "led-smile": 8, "led-bar": 6, grill: 4 }, legs: { p: 0.35, pick: { hover: 10, wheel: 1 } } },
      color: BOT_COLORS,
    },
    {
      // A boiler bot: a chimney that puffs, a lamp panel, treads.
      id: "calderita", family: "bots", label: "calderita", bodies: { wide: 3, box: 1 },
      fixed: { top: "chimney", pattern: ["panel"], legs: { treads: 10, feet: 5 }, arms: { bot: 6, nubs: 4 } },
      pools: { eyes: { "led-dot": 8, "led-square": 6, button: 3 }, mouth: { grill: 8, "led-bar": 6, "led-smile": 4 } },
      color: BOT_COLORS,
    },
    {
      // The classic two-box robot with a big head.
      id: "cabezon", family: "bots", label: "cabezón", bodies: "stack",
      fixed: { top: { antenna: 10, coil: 8, beacon: 5, dials: 6 }, arms: { bot: 10, nubs: 6 }, legs: { treads: 6, feet: 6, springs: 4, wheels: 4 } },
      pools: { eyes: { "led-dot": 10, "led-pill": 8, "led-square": 8, visor: 4, "led-heart": 1 }, mouth: { "led-bar": 10, "led-smile": 8, grill: 6 }, pattern: { p: 0.7, pick: { panel: 10, rivets: 5 } } },
      color: BOT_COLORS,
    },
    {
      // A dome-headed rover: a beacon on top, wheels or treads below.
      id: "cupula", family: "bots", label: "cúpula", bodies: "domehead",
      fixed: { top: { beacon: 10, dish: 5, propeller: 3 }, legs: { treads: 8, wheels: 8 }, arms: { bot: 8, nubs: 4 } },
      pools: { eyes: { lens: 10, visor: 6, "led-dot": 6 }, mouth: { grill: 8, "led-bar": 6, "led-smile": 6 }, pattern: { p: 0.5, pick: { panel: 8, rivets: 6 } } },
      color: BOT_COLORS,
    },
  ],

  extend: [
    // Every bot may blush and, now and then, carry a wind-up key (lent to other families through the cross roll too: pools a
    // file adds to a family are its members' only, so the key is lent through `cross`).
    { family: "bots", pools: { cheeks: { p: 0.2, pick: "blush" }, back: { p: 0.1, pick: "windup" } }, cross: { back: { windup: 10 } } },
    {
      // The core robot keeps its member, with plate-free LED faces, more heads, arms and wheels. Its old screen face (`led`
      // eyes and mouth: the plate) is legacy: the core member no longer names it and the parts weigh 0, so no v4 seed
      // reaches it; `v3:` seeds keep it through their own prefix. The faces are pools (always filled: required slots),
      // so the rare roll may light up LED hearts.
      family: "bots", member: "robot",
      fixed: {
        top: { coil: 6, beacon: 4, dials: 4, "rabbit-ears": 3, bolt: 3 },
        arms: { bot: 8 },
        legs: { wheels: 5, treads: 4, springs: 3 },
      },
      pools: {
        eyes: { "led-dot": 46, "led-pill": 38, "led-square": 34, visor: 18, lens: 14, "led-heart": 1 },
        mouth: { "led-bar": 40, "led-smile": 34, grill: 26 },
        pattern: { p: 0.5, pick: { rivets: 10, panel: 8 } },
      },
    },
  ],

  css: `
    /* asleep = idle without a pastime (the mascots', the frozen figures') or the nap: the quiet pose and the pastimes stay awake */
    /* LED faces: one expression per mood (normal, busy while working, happy while waiting), dimmed when powered down */
    .b13-x-work, .b13-x-wait, .b13-m-wait { display: none }
    &:is([data-mood=working], [data-mood=waiting]) .b13-x-norm { display: none }
    &[data-mood=working] .b13-x-work { display: inline }
    &[data-mood=waiting] .b13-x-wait { display: inline }
    &[data-mood=waiting] .b13-m-norm { display: none }
    &[data-mood=waiting] .b13-m-wait { display: inline }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .b13-glow { opacity: .4 }
    .b13-spin, .b13-step4, .b13-beat { transform-box: fill-box; transform-origin: 50% 50% }
    &[data-mood=working] .b13-spin { animation: bx-spin 1s linear infinite }
    &[data-mood=working] .b13-step4 { animation: bx-spin 1.2s steps(4) infinite }
    &[data-mood=working] .b13-dart { animation: bx-step .45s ease-in-out infinite alternate }
    &[data-mood=working] .b13-scan { animation: bx-sway .9s ease-in-out infinite }
    &[data-mood=working] .b13-beat { animation: bx-pulse .5s ease-in-out infinite }
    &[data-mood=waiting] .b13-beat { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }
    /* a different row of equaliser bars on every word */
    .b13-eq-b { display: none }
    &[data-beat=b] .b13-eq-a { display: none }
    &[data-beat=b] .b13-eq-b { display: inline }

    /* the V antenna feels about; it droops when powered down */
    &:not([data-mood=idle]:is(:not([data-idle]), [data-idle=nap])) .pg-b13-rod-l { animation: bx-feel 2s ease-in-out infinite }
    &:not([data-mood=idle]:is(:not([data-idle]), [data-idle=nap])) .pg-b13-rod-r { animation: bx-feel 2s ease-in-out infinite reverse }
    &[data-mood=working] :is(.pg-b13-rod-l, .pg-b13-rod-r) { animation-duration: .5s }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-rod-l { transform: rotate(-14deg) }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-rod-r { transform: rotate(14deg) }

    /* the dish scans while working, ticks while waiting, nods while talking, droops when powered down */
    &[data-mood=speaking] .pg-b13-dish { animation: bx-feel 2.4s ease-in-out infinite }
    &[data-mood=working] .pg-b13-dish { animation: bx-sway 1.2s ease-in-out infinite }
    &[data-mood=waiting] .pg-b13-dish { animation: bx-tick 1.3s cubic-bezier(.3,1.6,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-dish { transform: rotate(-24deg) }

    /* the rotor */
    &[data-mood=speaking] .pg-b13-rotor { animation: bx-spin 1.4s linear infinite }
    &[data-mood=working] .pg-b13-rotor { animation: bx-spin .35s linear infinite }
    &[data-mood=waiting] .pg-b13-rotor { animation: bx-spin .8s linear infinite }

    /* the spring antenna */
    &[data-mood=speaking] .pg-b13-boing { animation: bx-sway 1.8s ease-in-out infinite }
    &[data-mood=working] .pg-b13-boing { animation: bx-jitter .08s linear infinite alternate }
    &[data-mood=waiting] .pg-b13-boing { animation: bx-bounce 1.3s cubic-bezier(.3,1.6,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-boing { transform: rotate(-20deg) scale(.96,.86) }

    /* the beacon: a quick cheerful flash with rays while waiting, a slow blink while working, dim when powered down */
    &[data-mood=working] .pg-b13-lamp { animation: bx-bulb 1s steps(1) infinite }
    &[data-mood=waiting] .pg-b13-lamp { animation: bx-bulb .4s steps(1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .fills .pg-b13-lamp { opacity: .55 }
    .b13-rays { display: none; transform-box: fill-box; transform-origin: 50% 70% }
    &[data-mood=waiting] .b13-rays { display: inline; animation: bx-pulse .4s ease-in-out infinite }

    /* robot ears */
    &[data-mood=speaking] .pg-b13-ear-l { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=speaking] .pg-b13-ear-r { animation: bx-feel 2s ease-in-out infinite reverse }
    &[data-mood=waiting] :is(.pg-b13-ear-l, .pg-b13-ear-r) { animation: bx-tick 1.3s cubic-bezier(.3,1.6,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-ear-l { transform: rotate(-20deg) }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-ear-r { transform: rotate(20deg) }

    /* chimney smoke: puffs rise while working; one puff pops on each word (a different circle per beat, so it restarts) */
    .b13-smoke circle { fill: #fff; stroke: #1b1428; stroke-width: 1.6; opacity: 0; transform-box: fill-box; transform-origin: 50% 50% }
    &[data-mood=working] .b13-smoke circle { animation: bx-puff 1.4s ease-out infinite }
    &[data-mood=working] .b13-smoke circle:nth-child(2) { animation-delay: .45s }
    &[data-mood=working] .b13-smoke circle:nth-child(3) { animation-delay: .9s }
    &[data-mood=speaking][data-beat=a] .b13-smoke circle:nth-child(1) { animation: bx-puff .7s ease-out }
    &[data-mood=speaking][data-beat=b] .b13-smoke circle:nth-child(4) { animation: bx-puff .7s ease-out }

    /* the jet flame flickers; off when powered down */
    .pg-b13-flame { transform-box: fill-box; transform-origin: 50% 0 }
    &[data-mood=speaking] .pg-b13-flame, &[data-mood=waiting] .pg-b13-flame { animation: bx-pulse .3s ease-in-out infinite }
    &[data-mood=working] .pg-b13-flame { animation: bx-pulse .16s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b13-flame { display: none }

    /* spring legs */
    &[data-mood=working] .pg-b13-spring-l { animation: bx-step .3s ease-in-out infinite alternate }
    &[data-mood=working] .pg-b13-spring-r { animation: bx-step .3s ease-in-out infinite alternate-reverse }
    &[data-mood=waiting] :is(.pg-b13-spring-l, .pg-b13-spring-r) { animation: bx-bounce 1.3s cubic-bezier(.3,1.6,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) :is(.pg-b13-spring-l, .pg-b13-spring-r) { transform: scaleY(.72) }

    /* panel lamps blink in turn while working, slowly while waiting, and go dark when powered down */
    &[data-mood=working] .pg-b13-lamp-1 { animation: bx-bulb .6s steps(1) infinite }
    &[data-mood=working] .pg-b13-lamp-2 { animation: bx-bulb .6s steps(1) infinite .2s }
    &[data-mood=working] .pg-b13-lamp-3 { animation: bx-bulb .6s steps(1) infinite .4s }
    &[data-mood=waiting] :is(.pg-b13-lamp-1, .pg-b13-lamp-3) { animation: bx-bulb 1.3s steps(1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) :is(.pg-b13-lamp-1, .pg-b13-lamp-2, .pg-b13-lamp-3) { opacity: .3 }

    /* the wind-up key */
    &[data-mood=speaking] .pg-b13-key { animation: bx-spin 4s linear infinite }
    &[data-mood=working] .pg-b13-key { animation: bx-spin 1.2s linear infinite }
    &[data-mood=waiting] .pg-b13-key { animation: bx-tick 1.3s cubic-bezier(.3,1.6,.5,1) infinite }
  `,

  // Ten "robotitos" for the examples row: every robot body, the heads (antenna, V antenna, rotor, dish, nut, chimney,
  // spring, beacon), treads, wheels, springs and a jet, and every LED face. One seed each, picked for a varied palette.
  showcase: [
    "bicho:bots/cabezon:tic?top=antenna&eyes=led-dot&mouth=led-smile&legs=treads&pattern=panel&arms=bot",
    "bicho:bots/tele:chispa?eyes=led-square&mouth=grill&arms=none",
    "bicho:bots/dron:zum?eyes=visor&mouth=led-smile&arms=none",
    "bicho:bots/orbe:coco?legs=hover&mouth=led-bar&arms=none",
    "bicho:bots/latita:rayo?eyes=led-pill&mouth=led-bar&legs=springs&eyewear=none",
    "bicho:bots/cupula:tuerca?top=beacon&eyes=lens&mouth=grill&legs=wheels&pattern=panel",
    "bicho:bots/calderita:limon?eyes=led-square&mouth=grill&held=none",
    "bicho:bots/robot:bop?eyes=led-pill&mouth=led-smile&legs=wheels&arms=bot",
    "bicho:bots/cabezon:nube?top=coil&eyes=led-pill&mouth=led-bar&legs=springs&eyewear=none",
    "bicho:bots/robot:pixel?eyes=led-heart&mouth=led-smile&top=beacon&legs=treads",
  ],
});
