import { n, type Size } from "../core";
import { INK, add, clamp, mul, outlineLoops, rad, spanAt, sub, topAt, unit, type Eye, type Pt, type Rig, type Spec } from "./kit";
import { present } from "./spec";

/* Idle pastimes ("reposo"): what a bicho does on its own while nothing is going on. Idle shows no state signal, only a
 * cute activity. The pastime is not part of the bicho: the client picks one at random when the bicho goes idle
 * (`nextIdle`) and swaps it for another every 20–40 s while it stays idle (`idleTurn`). It sets the choice on the
 * avatar's root as `data-idle`; IDLE_CSS keys each pastime's keyframes on it, for the shared groups every part already
 * joins (squash, arms, `.look`, brows, ears, tops, legs, tail, claws), and pops each pastime's props in and out.
 *
 *   juggle   three balls go round over the head, from the left hand to the right; the eyes follow them
 *   soup     a little cauldron of soup in front, stirred with a ladle; it bubbles and steams
 *   water    a watering can in the right hand tips over a potted sprout beside it, which perks up (a heart)
 *   fish     a tiny rod held out over a puddle beside it; the float bobs, and now and then a fish leaps
 *   bubbles  soap bubbles blown off a wand held beside the face (or straight from the mouth, without hands)
 *   music    a boombox on the floor beside it; it grooves to the beat (sway, arms, feet, ears), notes float up
 *   stretch  a big stretch, arms up, and a yawn (eyes squint, never shut); then a wiggle
 *   nap      the old idle: eyes shut, zz, a slow breath. An occasional pastime now, no longer the default
 *
 * Juggle, soup, water and fish need a hand in each arm, free: a bicho without hands (armless, fins, flippers, claws,
 * tentacles, leaves), or one holding something, gets the others (`idlesFor`). Bubbles draws its wand only on free
 * hands. Frozen figures (`v3:`, `monstruo:`) and the mascots get no `data-idle`: they keep the old sleep.
 *
 * Every pastime but the nap is awake: the eyes are open (`.eyes`, never `.eyes-closed`), the colour is full, the ears
 * and tops stand, the zz are gone. Props are stage-only, except the big cue of each pastime (`keep-small`, so the
 * sidebar still reads it); the rail draws none and holds still. Nothing touches the face: props stay under the mouth or
 * beside the head (measured on the real outline and the real eyes), and what floats away floats outwards. With reduced
 * motion each pastime is a still pose with its props showing. There is no desk in idle. */

export const IDLE_STYLES = ["juggle", "soup", "water", "fish", "bubbles", "music", "stretch", "nap"] as const;
export type Idle = (typeof IDLE_STYLES)[number];

/** Spanish labels, for pickers. */
export const IDLE_LABELS: Record<Idle, string> = {
  juggle: "malabares", soup: "sopa", water: "regar", fish: "pescar", bubbles: "pompas", music: "música", stretch: "estirarse", nap: "siesta",
};

/** How long a bicho keeps one pastime before it moves on to another, in ms. */
export const IDLE_TURN = { min: 20_000, max: 40_000 } as const;

/** The pastimes whose props are held in both hands. */
const IN_HAND: readonly Idle[] = ["juggle", "soup", "water", "fish"];

/** How often a pastime comes up against the others (1 by default): the nap is occasional. */
const IDLE_WEIGHT: Partial<Record<Idle, number>> = { nap: 0.4 };

/** The pastimes that suit a bicho: all of them with free hands, the hands-free ones otherwise. */
export function idlesFor(spec: Spec): Idle[] {
  const parts = present(spec);
  const hands = parts.some((e) => e.slot === "arms" && e.tags?.includes("hand")) && !parts.some((e) => e.slot === "held");
  return IDLE_STYLES.filter((w) => hands || !IN_HAND.includes(w));
}

/** A random pastime from `pool` (weighted: the nap is rarer), never `prev`, so a swap always changes pastime. Going
 * idle: `nextIdle(null, pool)`. */
export function nextIdle(prev?: string | null, pool: readonly Idle[] = IDLE_STYLES, random: () => number = Math.random): Idle {
  const options = pool.filter((w) => w !== prev);
  if (!options.length) return pool[0] ?? "nap";
  const weight = (w: Idle) => IDLE_WEIGHT[w] ?? 1;
  let r = random() * options.reduce((s, w) => s + weight(w), 0);
  for (const w of options) if ((r -= weight(w)) < 0) return w;
  return options[options.length - 1];
}

/** How long to keep the current pastime before the next swap, in ms. */
export const idleTurn = (random: () => number = Math.random) => IDLE_TURN.min + random() * (IDLE_TURN.max - IDLE_TURN.min);

/* ---------- geometry ---------- */

const deg = (r: number) => (r * 180) / Math.PI;
const P = (p: Pt) => `${n(p[0])} ${n(p[1])}`;
const centre = (p: Pt) => `cx="${n(p[0])}" cy="${n(p[1])}"`;
/** p turned by `a` degrees (clockwise on screen) about o. */
function turn(p: Pt, o: Pt, a: number): Pt {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a)), d = sub(p, o);
  return [o[0] + d[0] * c - d[1] * s, o[1] + d[0] * s + d[1] * c];
}
/** A direction on screen, `a` degrees clockwise from pointing right. */
const along = (a: number): Pt => [Math.cos(rad(a)), Math.sin(rad(a))];
const wrapDeg = (a: number) => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };

/** The right arm's pivot and hand at rest (a nub's hand, for arms that emit none). */
function armR(rig: Rig): { o: Pt; hand: Pt } {
  const h = rig.at.handR, s = rig.at.shoulderR;
  return { o: h?.o ?? [s.x, s.y], hand: h ? [h.x, h.y] : [s.x + 13 * rig.u, s.y + 8] };
}
/** How far the right arm turns (degrees, clockwise) to point its hand along `dir` (degrees on screen, 0 right, −90 up). */
function aim(rig: Rig, dir: number): number {
  const { o, hand } = armR(rig);
  return n(wrapDeg(dir - deg(Math.atan2(hand[1] - o[1], hand[0] - o[0]))));
}
/** How far the right arm turns to point its hand at `target`. */
function reach(rig: Rig, target: Pt): number {
  const { o } = armR(rig);
  return aim(rig, deg(Math.atan2(target[1] - o[1], target[0] - o[0])));
}

/** The body's leftmost and rightmost x between heights y0 and y1 (its real outline, wobble included). */
function extent(rig: Rig, y0: number, y1: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let y = y0; y <= y1; y += 2) { const s = spanAt(rig, y); if (s) { lo = Math.min(lo, s[0]); hi = Math.max(hi, s[1]); } }
  return lo <= hi ? [lo, hi] : [60 - rig.half, 60 + rig.half];
}

/** Markup that rides the right arm: the arm's own group and pivot, so it moves with the arm's keyframes. */
function onArm(rig: Rig, html: string) {
  const h = rig.at.handR;
  if (!h?.g) return html;
  return `<g class="pg-${h.g}"${h.o ? ` style="transform-box:view-box;transform-origin:${n(h.o[0])}px ${n(h.o[1])}px"` : ""}>${html}</g>`;
}

const ink = (w: number) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;
/** A round-capped line, ink under colour (the cast's look for thin props: a rod, a stick, a handle). */
const stick = (a: Pt, b: Pt, w: number, c: string) => `<path d="M${P(a)}L${P(b)}" stroke="${INK}" stroke-width="${n(w + 2.6)}" stroke-linecap="round"/><path d="M${P(a)}L${P(b)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
/** A pivot for a group of its own, in the 120 box. */
const origin = (p: Pt) => `transform-box:view-box;transform-origin:${n(p[0])}px ${n(p[1])}px`;

/** `fine`: draw the stage-only bits too (steam, drops, notes, the leaping fish); the sidebar hides them anyway.
 * `hold`: the hand that holds something (its arm keeps still, so the item isn't tipped over). */
interface Out { back: string; arm: string; front: string; vars: string[]; hold?: "l" | "r"; fine: boolean; hands: boolean }

/** A prop of one pastime: shown only while the root's `data-idle` names it (CSS), and only in idle (`prop-idle`). */
const prop = (idle: Idle, html: string, extra = "") => `<g class="prop-idle idl idl-${idle}${extra ? ` ${extra}` : ""}">${html}</g>`;

/** An arm angle for both arms (`--idl-<name>-r/-l`): the right one turns by `a`, the left one mirrors it; a hand that
 * holds something stays put. */
const armVars = (o: Out, name: string, a: number) => o.vars.push(`--idl-${name}-r:${o.hold === "r" ? 0 : n(a)}deg`, `--idl-${name}-l:${o.hold === "l" ? 0 : n(-a)}deg`);

/* ---------- the pastimes ---------- */

/** Juggle: three balls go round the head on a circle through both hands, from the left hand over the top to the right
 * one, where each is caught and passed back (it shrinks into the hand and pops out of the other). The circle's centre
 * is as low as keeps every eye (and the brow room over it) inside, and the arc over the head when it fits, so the balls
 * hug the head on any body. The static turns spread the balls over the arc, for reduced motion. */
function juggle(rig: Rig, o: Out, eyes: Eye[]) {
  const l = rig.at.handL, r = rig.at.handR;
  if (!l || !r) return;
  const ball = 6.4, mx = (l.x + r.x) / 2, dx = (r.x - l.x) / 2, yh = (l.y + r.y) / 2 - 6;
  const radius = (cy: number) => Math.hypot(dx, yh - cy);
  const fits = (cy: number, clearHead: boolean, sides: boolean) => {
    const R = radius(cy);
    if (cy - R - ball < 2 || (sides && (mx - R - ball < 1 || mx + R + ball > 119))) return false;
    if (eyes.some((e) => Math.hypot(e.x - mx, e.y - cy) + e.r + 5 + ball > R)) return false;
    if (!clearHead) return true;
    const a0 = deg(Math.atan2(yh - cy, -dx)), sweep = 180 + 2 * deg(Math.atan2(yh - cy, dx));
    for (let t = 0; t <= 1; t += 0.05) {
      const p = add([mx, cy], mul(along(a0 + sweep * t), R));
      if (Math.abs(p[0] - 60) < rig.half && p[1] + ball > topAt(rig, p[0]) - 7) return false;
    }
    return true;
  };
  // Tightest first: clear of the head and inside the box; then only clear of the eyes; then (hands at the box's very edges) let
  // the sides go, never the top. Failing all, the flattest arc.
  let cy = yh - 4;
  search: for (const [clearHead, sides] of [[true, true], [false, true], [false, false]]) for (let c = yh - 4; c >= yh - 80; c -= 0.5) if (fits(c, clearHead, sides)) { cy = c; break search; }
  const sweep = n(180 + 2 * deg(Math.atan2(yh - cy, dx)));
  o.vars.push(`--idl-sweep:${sweep}deg`);
  const start: Pt = [mx - dx, yh];
  const html = (["#ff6f91", "#ffd23f", "#5ec8ff"] as const).map((c, i) => {
    const delay = `animation-delay:${n(-i * 0.7)}s`;
    return `<g class="idl-orbit" style="${origin([mx, cy])};transform:rotate(${n(sweep * (0.2 + 0.3 * i))}deg);${delay}"><g class="idl-ball" style="${delay}">
        <circle ${centre(start)} r="${ball}" fill="${c}" ${ink(2.2)}/><circle ${centre(add(start, [-1.9, -2]))} r="1.6" fill="#fff" opacity=".85"/></g></g>`;
  }).join("");
  o.front += prop("juggle", html, "keep-small");
}

/** Soup: a little cauldron on the floor in front, to the right, its rim under the mouth, full of tomato soup with bits
 * in it; a ladle held high in the right hand stirs it round. The ladle is drawn where it sits with the arm at its
 * stirring angle, turned back into the arm's rest frame (the CSS turns the arm). Bubbles pop on the soup, and steam
 * curls up its right side, away from the face. */
function soup(rig: Rig, shade: (c: string) => string, o: Out, eyes: Eye[]) {
  if (!rig.at.handR) return;
  const G = rig.at.ground.y, pw = clamp(rig.half - 12, 12, 17), cx = 60 + clamp(rig.half * 0.3, 7, 13);
  // The rim (its fat ink included) sits clear under the resting smile, which reaches about 6 under the mouth line.
  const yR = Math.max(G - 16.5, rig.mouthY + 13), ph = G - 1.5 - yR;
  const { o: pivot, hand } = armR(rig);
  const dip: Pt = [cx + pw * 0.25, yR + 1];
  // The smallest raise that holds the hand well over the rim, and out to the right of where the ladle dips, so the
  // ladle goes in steeply from above.
  let lift = -15;
  for (let a = -15; a >= -100; a -= 5) { lift = a; const g = turn(hand, pivot, a); if (g[1] <= yR - 15 && g[0] >= dip[0] + 8) break; }
  o.vars.push(`--idl-stir:${lift}deg`);
  const grip = turn(hand, pivot, lift), u = unit(sub(dip, grip)), back = (p: Pt) => turn(p, pivot, -lift);
  const a = back(add(grip, mul(u, -4))), z = back(add(dip, mul(u, 1))), bowl = add(dip, mul(u, 3));
  const ladle = `<ellipse ${centre(back(bowl))} rx="3.4" ry="2.4" transform="rotate(${n(deg(Math.atan2(u[1], u[0])) - lift)} ${P(back(bowl))})" fill="#c9d0dc" ${ink(1.8)}/>${stick(a, z, 2.6, "#c9d0dc")}`;
  const X = (f: number) => n(cx + f);
  // Back: the soup's surface and the back of the rim, so the ladle dips in between.
  o.back += prop("soup", `<ellipse cx="${n(cx)}" cy="${n(yR)}" rx="${n(pw - 1)}" ry="3.6" fill="#ff9b4a" ${ink(2)}/>
      <ellipse cx="${n(cx - pw * 0.35)}" cy="${n(yR + 0.4)}" rx="2" ry="1.2" fill="#ffd23f"/><ellipse cx="${n(cx + pw * 0.05)}" cy="${n(yR - 1)}" rx="1.8" ry="1.1" fill="#7bd389"/>
      <ellipse cx="${n(cx)}" cy="${n(yR)}" rx="${n(pw + 0.6)}" ry="4" fill="none" stroke="${INK}" stroke-width="5.4"/><ellipse cx="${n(cx)}" cy="${n(yR)}" rx="${n(pw + 0.6)}" ry="4" fill="none" stroke="#7a6f99" stroke-width="2.2"/>`, "idl-ground keep-small");
  o.arm += onArm(rig, prop("soup", `<g class="idl-ladle">${ladle}</g>`, "keep-small"));
  const potD = `M${X(-pw - 0.6)} ${n(yR)}C${X(-pw - 3)} ${n(yR + ph * 0.8)} ${X(-pw * 0.55)} ${n(yR + ph)} ${X(0)} ${n(yR + ph)}C${X(pw * 0.55)} ${n(yR + ph)} ${X(pw + 3)} ${n(yR + ph * 0.8)} ${X(pw + 0.6)} ${n(yR)}A${n(pw + 0.6)} 4 0 0 1 ${X(-pw - 0.6)} ${n(yR)}Z`;
  const feet = [-1, 1].map((sd) => `<ellipse cx="${X(sd * pw * 0.55)}" cy="${n(yR + ph - 0.5)}" rx="3.2" ry="2.4" fill="#3a3350" ${ink(2)}/>`).join("");
  const rim = `M${X(-pw - 0.6)} ${n(yR)}A${n(pw + 0.6)} 4 0 0 0 ${X(pw + 0.6)} ${n(yR)}`;
  const ears = [-1, 1].map((sd) => `<path d="M${X(sd * (pw + 1.5))} ${n(yR + 3)}q${n(sd * 3.4)} 0 ${n(sd * 3.4)} 3.2t${n(-sd * 3)} 2.8" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`).join("");
  o.front += prop("soup", `${feet}${ears}<path d="${potD}" fill="${shade("#4c4266")}" ${ink(2.4)}/>
      <path d="${rim}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="${rim}" fill="none" stroke="#7a6f99" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M${X(-pw + 2)} ${n(yR + 6)}Q${X(-pw + 1)} ${n(yR + ph * 0.6)} ${X(-pw * 0.6)} ${n(yR + ph * 0.8)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`, "idl-ground keep-small");
  if (!o.fine) return;
  const pops = ([[-0.5, 1.6], [0.1, 1.2], [0.45, 1.8]] as const).map(([f, r], i) => `<circle class="idl-pop" style="animation-delay:${n(i * 0.6 - 1.8)}s" cx="${X(f * pw)}" cy="${n(yR - 0.6)}" r="${r}" fill="#ffc285" ${ink(1.2)}/>`).join("");
  // Steam curls up the pot's right side, right of the mouth's corner, and fades before it reaches an eye.
  const steam = ([0.3, 0.75] as const).map((f, i) => {
    const x = Math.max(cx + f * pw, rig.at.mouth.x + 13 + i * 5), y = yR - 2.5;
    const eye = Math.max(rig.mouthY, ...eyes.filter((e) => Math.abs(e.x - x) < e.r + 4).map((e) => e.y + e.r + 4));
    const rise = clamp(y - 7 - eye, 0, 7);
    return `<path class="idl-steam" style="--idl-rise:${n(-rise)}px;animation-delay:${n(i * 1.3 - 2.6)}s" d="M${n(x)} ${n(y)}q-2 -1.75 0 -3.5t0 -3.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`;
  }).join("");
  o.front += prop("soup", pops + steam);
}

/** Water: a little potted sprout on the floor beside the bicho, to the right, clear of its real outline; a watering can
 * held out in the right hand above it tips over now and then (`.idl-tilt`, pivoting on the grip) and a few drops fall
 * on the sprout, which perks up and sends a heart up. The can rides the arm, drawn upright for the arm's raised angle
 * and turned back into its rest frame. */
function water(rig: Rig, shade: (c: string) => string, o: Out) {
  if (!rig.at.handR) return;
  const G = rig.at.ground.y, { o: pivot, hand } = armR(rig);
  const tip = 30;
  let k = clamp(1.1 * rig.u, 1, 1.25);
  // The hand out to the right and a little up; higher (so further in) on a long arm, until the whole can fits the box.
  let lift = aim(rig, -40), grip = turn(hand, pivot, lift);
  for (let d = -45; grip[0] + 17 * k > 118.5 && d >= -70; d -= 5) { lift = aim(rig, d); grip = turn(hand, pivot, lift); }
  k = Math.min(k, Math.max(0.8, (118.5 - grip[0]) / 17));
  o.vars.push(`--idl-water:${lift}deg`, `--idl-tip:${tip}deg`);
  // The can, in the box at the raised arm: the handle arches over the grip, the body hangs under it, the spout points
  // up and out to the right.
  const C = (x: number, y: number): Pt => [grip[0] + x * k, grip[1] + y * k];
  const body = `M${P(C(-6, 3))}Q${P(C(-6.5, 12))} ${P(C(0, 12.2))}Q${P(C(6.5, 12))} ${P(C(6, 3))}Z`;
  const spout = `M${P(C(4, 9.5))}L${P(C(13.5, 2.5))}`, rose = `M${P(C(12, 0.2))}L${P(C(16.5, 3.5))}L${P(C(14.6, 5.3))}Z`;
  const handle = `M${P(C(-5, 3.4))}Q${P(C(-5, -3.2))} ${P(C(0, -2.4))}Q${P(C(5, -3.2))} ${P(C(5, 3.4))}`;
  const can = `<path d="${handle}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="${handle}" fill="none" stroke="#3fae8c" stroke-width="2.2" stroke-linecap="round"/>
      <path d="${spout}" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="${spout}" stroke="#55d6b0" stroke-width="2.6" stroke-linecap="round"/>
      <path d="${rose}" fill="#55d6b0" ${ink(1.8)}/><path d="${body}" fill="${shade("#55d6b0")}" ${ink(2.4)}/>
      <path d="M${P(C(-3.6, 5.5))}Q${P(C(-3.8, 9))} ${P(C(-1.5, 10.2))}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>`;
  o.arm += onArm(rig, prop("water", `<g class="idl-tilt" style="${origin(turn(grip, pivot, -lift))}"><g transform="rotate(${n(-lift)} ${P(pivot)})">${can}</g></g>`, "keep-small"));
  // The sprout's pot sits under where the tipped rose pours, clear of the body near the floor (and of the box's edge).
  const pour = turn(C(15.4, 4.6), grip, tip), [, xr] = extent(rig, G - 22, G - 2), q = clamp(1.15 * rig.u, 1, 1.3);
  const px = clamp(pour[0] - 1.5, xr + 6 * q, 119 - 7.4 * q);
  const Q = (x: number, y: number) => `${n(px + x * q)} ${n(G + 0.5 + y * q)}`, yq = (y: number) => G + 0.5 + y * q;
  const pot = `<path d="M${Q(-5.8, -8.6)}L${Q(-4.4, 0)}L${Q(4.4, 0)}L${Q(5.8, -8.6)}Z" fill="${shade("#d9774b")}" ${ink(2.2)}/>
      <rect x="${n(px - 7 * q)}" y="${n(yq(-10.6))}" width="${n(14 * q)}" height="${n(3.6 * q)}" rx="1.4" fill="${shade("#e88a5a")}" ${ink(2.2)}/>`;
  const leaf = (side: 1 | -1) => `<path d="M${Q(0, -13)}q${n(side * 2 * q)} ${n(-4.4 * q)} ${n(side * 7 * q)} ${n(-3.8 * q)}q${n(-side * q)} ${n(4.4 * q)} ${n(-side * 7 * q)} ${n(3.8 * q)}z" fill="${shade("#5cc36a")}" ${ink(1.8)}/>`;
  const bud = yq(-16.4);
  const sprout = `<g class="idl-grow" style="${origin([px, yq(-10.6)])}"><path d="M${Q(0, -10.6)}V${n(bud + 1.5)}" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M${Q(0, -10.6)}V${n(bud + 1.5)}" stroke="#5cc36a" stroke-width="2" stroke-linecap="round"/>
      ${leaf(-1)}${leaf(1)}<circle cx="${n(px)}" cy="${n(bud)}" r="${n(2.6 * q)}" fill="#ff8fb1" ${ink(1.8)}/></g>`;
  o.front += prop("water", sprout + pot, "idl-ground keep-small");
  if (!o.fine) return;
  const fall = Math.max(3, bud - 3 - pour[1]);
  o.vars.push(`--idl-fall:${n(fall)}px`);
  const drops = [0, 1, 2, 3].map((i) => `<path class="idl-drop" style="animation-delay:${n(-i * 0.165)}s" d="M${n(pour[0] + [-1.6, 1.2, -0.4, 2][i])} ${n(pour[1] - 0.5)}q2.4 3.4 0 4.4q-2.4 -1 0 -4.4z" fill="#8fd3ff" ${ink(1.2)}/>`).join("");
  const heart = `<g transform="translate(${n(px - 6.5 * q)} ${n(bud - 3)})"><path class="idl-heart" d="M0 3.4C-4.2 0.5-3.9 -3.1-1.6 -3.1C-0.5 -3.1 0 -2.1 0 -1.6C0 -2.1 0.5 -3.1 1.6 -3.1C3.9 -3.1 4.2 0.5 0 3.4Z" fill="#ff6f91" ${ink(1.4)}/></g>`;
  o.front += prop("water", `<g class="idl-rain">${drops}</g>${heart}`);
}

/** Fish: a puddle on the floor beside the bicho, to the right; a tiny rod held out in the right hand leans over it, its
 * line hanging straight down to a red-and-white float that bobs, dips (rings spread) and now and then lets a little
 * fish leap out, away from the bicho. The rod rides the arm (the arm holds still at its angle); the line, the float
 * and the puddle are in the box, where the rod's tip is at that angle. */
function fish(rig: Rig, shade: (c: string) => string, o: Out) {
  if (!rig.at.handR) return;
  const G = rig.at.ground.y, { o: pivot, hand } = armR(rig);
  const lift = aim(rig, -12), grip = turn(hand, pivot, lift);
  o.vars.push(`--idl-fish:${lift}deg`);
  const L = 30 * clamp(rig.u, 0.85, 1.1);
  let a = -55, tip = add(grip, mul(along(a), L));
  while (tip[0] > 110 && a > -100) { a -= 5; tip = add(grip, mul(along(a), L)); }
  const butt = add(grip, mul(along(a), -4)), back = (p: Pt) => turn(p, pivot, -lift);
  const reel = add(grip, mul(along(a), 4));
  const rod = `${stick(back(butt), back(tip), 1.8, "#b07a4a")}<circle ${centre(back(reel))} r="2.4" fill="#c9d0dc" ${ink(1.6)}/>`;
  o.arm += onArm(rig, prop("fish", rod, "keep-small"));
  const rx = 15, ry = 4.4, pcx = clamp(tip[0] - 2.5, 60 + rig.half * 0.5, 118.5 - rx), pcy = G - 0.3;
  const bob: Pt = [tip[0], pcy - 0.6], line = bob[1] - 5.4 - tip[1];
  o.vars.push(`--idl-ls:${Math.round(((line + 2.6) / line) * 1000) / 1000}`);
  o.back += prop("fish", `<ellipse cx="${n(pcx)}" cy="${n(pcy)}" rx="${rx}" ry="${ry}" fill="${shade("#5ec8ff")}" ${ink(2.2)}/>
      <path d="M${n(pcx - rx * 0.55)} ${n(pcy - 0.6)}h${n(rx * 0.4)}" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>`, "idl-ground keep-small");
  const rings = o.fine ? [0, 1].map((i) => `<ellipse class="idl-ripple" style="animation-delay:${n(i * 0.25)}s" cx="${n(bob[0])}" cy="${n(pcy)}" rx="6" ry="1.8" fill="none" stroke="#fff" stroke-width="1.2"/>`).join("") : "";
  o.front += prop("fish", `${rings}<path class="idl-line" style="${origin(tip)}" d="M${P(tip)}V${n(bob[1] - 5.4)}" stroke="${INK}" stroke-width="1.2"/>
      <g class="idl-bob"><path d="M${n(bob[0] - 3.3)} ${n(bob[1])}a3.3 3.3 0 0 1 6.6 0z" fill="#ff5a5a" ${ink(1.5)}/><path d="M${n(bob[0] - 3.3)} ${n(bob[1])}a3.3 2.6 0 0 0 6.6 0z" fill="#fff" ${ink(1.5)}/><path d="M${n(bob[0])} ${n(bob[1] - 3.3)}v-2.2" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/></g>`, "keep-small");
  if (!o.fine) return;
  // The leap: from the puddle's middle up and out to the right, nose first; drawn heading right, at the water.
  const f0: Pt = [pcx - 6.5, pcy - 1.5], lx = clamp(117 - f0[0] - 7, 4, 12), ly = -21;
  o.vars.push(`--idl-lx:${n(lx / 2)}px`, `--idl-ly:${ly}px`);
  const fishy = `<g class="idl-fishy"><path d="M${n(f0[0] - 8)} ${n(f0[1])}l-3.8 -3.2v6.4z" fill="#ff9b4a" ${ink(1.5)}/><ellipse ${centre(f0)} rx="6.4" ry="3.5" fill="${shade("#ff9b4a")}" ${ink(1.7)}/><path d="M${n(f0[0] - 1)} ${n(f0[1] - 3.2)}q2 -2.6 4.6 -.6" fill="#ffc285" ${ink(1.3)}/><circle cx="${n(f0[0] + 3.2)}" cy="${n(f0[1] - 0.7)}" r="1" fill="${INK}"/></g>`;
  o.front += prop("fish", fishy);
}

/** Bubbles: soap bubbles drift up and out to the right, wobbling, and pop. With free hands they come off a wand held
 * up beside the face (its ring just clear of the head's outline, at the mouth's height), and the mouth purses to blow
 * (CSS); without, they come straight from the mouth's corner, heading out sideways before they rise. */
function bubbles(rig: Rig, o: Out) {
  const m = rig.at.mouth, s = spanAt(rig, m.y - 4), edge = s ? s[1] : 60 + rig.half, rr = 4.8;
  // Without hands the bubbles come out just beside the cheek, where the pursed mouth blows them: never over the face.
  let from: Pt = [Math.min(edge + 4, 110), m.y - 3];
  if (o.hands && rig.at.handR) {
    const ring: Pt = [Math.min(edge + rr + 2.5, 110), m.y - 4];
    const { o: pivot, hand } = armR(rig), lift = clamp(reach(rig, add(ring, [2, 13])), -90, 60), grip = turn(hand, pivot, lift);
    o.vars.push(`--idl-blow:${lift}deg`);
    const back = (p: Pt) => turn(p, pivot, -lift), foot: Pt = [ring[0], ring[1] + rr];
    const wand = `${stick(back(add(grip, mul(unit(sub(foot, grip)), -2.5))), back(foot), 1.8, "#ff9fd0")}
        <circle ${centre(back(ring))} r="${rr}" fill="#dff6ff" fill-opacity=".35" stroke="${INK}" stroke-width="4.4"/><circle ${centre(back(ring))} r="${rr}" fill="none" stroke="#ff9fd0" stroke-width="2"/>`;
    o.arm += onArm(rig, prop("bubbles", wand, "keep-small"));
    from = ring;
  }
  // They rise up the head's side, drifting outwards (never back over the head), wobbling on the way.
  const room = 117 - from[0], up = clamp(rig.u, 0.9, 1.15);
  const trips = ([[0.5, -44, 7], [0.95, -28, 4.6], [0.2, -58, 5.6], [0.75, -52, 3.8], [0.6, -36, 5]] as const);
  const html = trips.map(([fx, dy, r], i) => {
    const bx = Math.max(2, room * fx - r), by = Math.max(dy * up, 4 + r - from[1]), f = 0.25 + 0.15 * i;
    // Born one after another while the mouth blows (12–34% of the bar, after the .5 s hop), static spread for reduced motion.
    const style = `--idl-bx:${n(bx)}px;--idl-by:${n(by)}px;animation-delay:${n(0.86 + i * 0.15)}s;transform:translate(${n(bx * f)}px,${n(by * f)}px)`;
    const glint = `M${n(from[0] - r * 0.62)} ${n(from[1] - r * 0.05)}A${n(r * 0.62)} ${n(r * 0.62)} 0 0 1 ${n(from[0] - r * 0.05)} ${n(from[1] - r * 0.62)}`;
    return `<g class="idl-bubble" style="${style}"><circle ${centre(from)} r="${r}" fill="#c8f3ff" fill-opacity=".38" stroke="${INK}" stroke-width="1.6"/><circle ${centre(from)} r="${n(r - 1.3)}" fill="none" stroke="#9fe7ff" stroke-width="1.1" stroke-opacity=".9"/>
        <path d="${glint}" fill="none" stroke="#fff" stroke-width="${n(Math.min(1.8, r * 0.34))}" stroke-linecap="round"/><circle cx="${n(from[0] + r * 0.4)}" cy="${n(from[1] + r * 0.35)}" r="${n(r * 0.14)}" fill="#ffc2e0"/></g>`;
  });
  o.front += prop("bubbles", html[0], "keep-small");
  if (o.fine) o.front += prop("bubbles", html.slice(1).join(""));
}

/** Music: a boombox on the floor beside the bicho, to the left, clear of its real outline (or just in front of its
 * edge on a wide one); the speakers thump on every beat and notes float up and out to the left. The bicho grooves:
 * sways and dips on the beat, arms swing (`--idl-sw-r/-l`), feet tap, ears bop. */
function music(rig: Rig, shade: (c: string) => string, o: Out) {
  const G = rig.at.ground.y, [xl] = extent(rig, G - 22, G - 2), W = 25, H = 15;
  const x0 = Math.max(1.5, Math.min(xl + 3, 50) - W), y0 = G + 0.5 - H;
  armVars(o, "sw", -9);
  const X = (x: number) => n(x0 + x), Y = (y: number) => n(y0 + y);
  const cone = (cx: number) => `<g class="idl-cone" style="${origin([x0 + cx, y0 + 9])}"><circle cx="${X(cx)}" cy="${Y(9)}" r="4.6" fill="#3a3350" ${ink(1.8)}/><circle cx="${X(cx)}" cy="${Y(9)}" r="2" fill="#7a6f99"/><circle cx="${X(cx - 0.6)}" cy="${Y(8.4)}" r=".7" fill="#fff" opacity=".7"/></g>`;
  const box = `<path d="M${X(5)} ${Y(1)}V${Y(-2.6)}Q${X(5)} ${Y(-4.4)} ${X(7)} ${Y(-4.4)}H${X(W - 7)}Q${X(W - 5)} ${Y(-4.4)} ${X(W - 5)} ${Y(-2.6)}V${Y(1)}" fill="none" stroke="${INK}" stroke-width="4.6"/><path d="M${X(5)} ${Y(1)}V${Y(-2.6)}Q${X(5)} ${Y(-4.4)} ${X(7)} ${Y(-4.4)}H${X(W - 7)}Q${X(W - 5)} ${Y(-4.4)} ${X(W - 5)} ${Y(-2.6)}V${Y(1)}" fill="none" stroke="#c9d0dc" stroke-width="1.8"/>
      <path d="M${X(W - 4)} ${Y(1)}L${X(W + 1.5)} ${Y(-8.5)}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${X(W + 1.5)}" cy="${Y(-8.5)}" r="1.4" fill="#ffd23f" ${ink(1.2)}/>
      <rect x="${X(0)}" y="${Y(0)}" width="${W}" height="${H}" rx="3.4" fill="${shade("#ef6f6c")}" ${ink(2.4)}/>
      <rect x="${X(W / 2 - 3.4)}" y="${Y(3)}" width="6.8" height="4.2" rx="1" fill="#ffe7a3" ${ink(1.4)}/><circle cx="${X(W / 2 - 1.6)}" cy="${Y(10.6)}" r="1" fill="${INK}"/><circle cx="${X(W / 2 + 1.6)}" cy="${Y(10.6)}" r="1" fill="${INK}"/>
      ${cone(5.6)}${cone(W - 5.6)}`;
  o.back += prop("music", box, "idl-ground keep-small");
  if (!o.fine) return;
  // Notes in the cast's look: a merged ink outline (every piece stroked first), then the colour.
  const note = (x: number, y: number, two: boolean) => {
    const head = (hx: number, hy: number) => `<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="2.6" ry="2" transform="rotate(-20 ${n(hx)} ${n(hy)})"/>`;
    const shapes = two
      ? `${head(x - 1.8, y)}${head(x + 5.2, y - 1.6)}<path d="M${n(x)} ${n(y)}V${n(y - 8.4)}h1.5V${n(y)}zM${n(x + 7)} ${n(y - 1.6)}V${n(y - 10)}h1.5V${n(y - 1.6)}zM${n(x)} ${n(y - 8.4)}L${n(x + 8.5)} ${n(y - 10)}V${n(y - 7.6)}L${n(x)} ${n(y - 6)}z"/>`
      : `${head(x - 1.8, y)}<path d="M${n(x)} ${n(y)}V${n(y - 8.6)}h1.5V${n(y)}zM${n(x + 1.5)} ${n(y - 8.6)}q3.6 1.4 3.6 5q-1.2 -2.2 -3.6 -2.6z"/>`;
    return `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" fill="${INK}">${shapes}</g><g fill="${two ? "#ffd23f" : "#ff9fd0"}">${shapes}</g>`;
  };
  // They start over the boombox's outer half and drift up and outwards; each one's right edge stays clear of the body's
  // real outline all the way up (the face is never behind a note).
  const rise = 24, [edge] = extent(rig, y0 - 3 - rise - 9, y0 - 3);
  const notes = ([[0.1, -5, false], [0.38, -3, true], [0.22, -7, false]] as const).map(([fx, nx, two], i) => {
    const w = two ? 9 : 5.6, y = y0 - 3, f = 0.3 + 0.3 * i;
    const x = Math.max(4.5, Math.min(x0 + W * fx + 2, edge - 3 - w));
    return `<g class="idl-note" style="--idl-nx:${nx}px;animation-delay:${n(i * 0.8 - 2.4)}s;transform:translate(${n(nx * f)}px,${n(-rise * f)}px)">${note(x, y, two)}</g>`;
  }).join("");
  o.front += prop("music", notes);
}

/** Stretch: no props. The arms go up and out (`--idl-up-r/-l`: each hand points up and outwards, clear of the face),
 * the body stretches tall, and the mouth yawns. */
function stretch(rig: Rig, o: Out) {
  armVars(o, "up", aim(rig, -58));
}

/** The idle props for every pastime this bicho suits, plus the CSS variables their keyframes read (arm angles that
 * hold the ladle, the can, the rod and the wand; the juggling sweep; the arms up for the stretch). The big props are
 * `keep-small`, so the sidebar keeps them as its cue; the fine bits are stage only; the rail draws none (it holds still,
 * and without the variables the arms stay at rest). `shade` is the renderer's own shade (lit top-left, deep rim),
 * shared with the bicho's pieces. `eyes` is the eye geometry as drawn (`ctx.eyes`), which the juggling arc keeps clear
 * of; without it the eyes are estimated from the rig. */
export function idleProps(spec: Spec, rig: Rig, size: Size, shade: (c: string) => string, eyes?: Eye[]): { vars: string; html: string } {
  if (size === "rail") return { vars: "", html: "" };
  const idles = idlesFor(spec);
  const held = present(spec).find((e) => e.slot === "held"), at = held?.at ?? held?.rides ?? "";
  const o: Out = { back: "", arm: "", front: "", vars: [], hold: held ? (at.endsWith("L") ? "l" : "r") : undefined, fine: size === "stage", hands: idles.includes("juggle") };
  const face = eyes?.length ? eyes : (["eyeL", "eyeR"] as const).map((k) => ({ x: rig.at[k].x, y: rig.at[k].y, r: rig.fit(rig.at[k].x, 9) }));
  if (idles.includes("juggle")) juggle(rig, o, face);
  if (idles.includes("soup")) soup(rig, shade, o, face);
  if (idles.includes("water")) water(rig, shade, o);
  if (idles.includes("fish")) fish(rig, shade, o);
  if (idles.includes("bubbles")) bubbles(rig, o);
  if (idles.includes("music")) music(rig, shade, o);
  if (idles.includes("stretch")) stretch(rig, o);
  const html = o.back || o.arm || o.front ? `<g class="idl-props">${o.back}${o.arm}${o.front}</g>` : "";
  return { vars: o.vars.map((v) => `;${v}`).join(""), html };
}

/* ---------- the CSS: scoped under `.av[data-style=bichos]` (& is the root), keyframes hoisted ---------- */

/** Every pastime but the nap is awake. `:where()` keeps these defaults one step over the base idle (eyes shut, grey,
 * drooping) and level with each pastime's own rules below, which come later and win. */
const AWAKE = "&[data-mood=idle][data-idle]:where(:not([data-idle=nap]))";
const I = (idle: Idle) => `&[data-mood=idle][data-idle=${idle}]`;
/** The figure hops once as it takes up a new pastime (as it does on a new tool); the pastime's own loop starts after. */
const HOP = "bx-bounce .5s cubic-bezier(.3,1.6,.5,1)";

export const IDLE_CSS = `
    /* idle pastimes (src/bichos/idle.ts). The client sets data-idle on the root when the bicho goes idle and swaps it
       every 20–40 s; a root without it (the mascots, the frozen v3:/monstruo: figures) keeps the old sleep, untouched.
       On every change the old props pop out and the new ones pop in. Arm angles come from the renderer (--idl-*), and
       the rail gets none, so its arms stay at rest. */
    &:not([data-idle]) .idl-props { display: none }
    .idl { opacity: 0; transform: scale(.3); transform-box: fill-box; transform-origin: 50% 50%; transition: opacity .16s ease-in, transform .2s ease-in }
    .idl-ground { transform-origin: 50% 100% }
    ${IDLE_STYLES.filter((s) => s !== "nap" && s !== "stretch").map((s) => `&[data-idle=${s}] .idl-${s}`).join(", ")} { opacity: 1; transform: none; transition: none; animation: idl-in .45s cubic-bezier(.3,1.6,.5,1) .12s backwards }

    /* awake: eyes open, full colour, ears and tops up, legs straight, no zz */
    ${AWAKE} .eyes { display: inline }
    ${AWAKE} :is(.eyes-closed, .zz) { display: none }
    ${AWAKE} .squash { transform: none; filter: none; animation: ${HOP} }
    ${AWAKE} :is(.pg-ear-l, .pg-ear-r, .pg-sprout, .pg-sprout-l, .pg-sprout-r, .pg-hang-l, .pg-hang-r, .pg-leg-a, .pg-leg-b) { transform: none }
    ${AWAKE} .pg-tail { animation-duration: 3s }

    /* juggle: each ball goes round on its circle (its delay inline) and is passed back hand to hand; the hands toss in
       turn, the eyes follow */
    ${I("juggle")} .squash { animation: ${HOP}, idl-bob .7s ease-in-out .5s infinite }
    ${I("juggle")} .pg-arm-l { animation: idl-toss-l .7s ease-out -.1s infinite }
    ${I("juggle")} .pg-arm-r { animation: idl-toss-r .7s ease-out .02s infinite }
    ${I("juggle")} .look { animation: idl-follow 1.4s ease-in-out infinite alternate }
    .idl-ball { transform-box: fill-box; transform-origin: 50% 50% }
    ${I("juggle")} .idl-orbit { animation: idl-orbit 2.1s infinite }
    ${I("juggle")} .idl-ball { animation: idl-ball 2.1s linear infinite }

    /* soup: the arm goes round with the ladle (which bobs a quarter turn ahead), eyes in the pot, bubbles and steam */
    ${I("soup")} .squash { animation: ${HOP}, idl-sway 1.8s ease-in-out .5s infinite }
    ${I("soup")} .pg-arm-r { transform: rotate(var(--idl-stir)); animation: idl-stir 1.8s ease-in-out .5s infinite backwards }
    ${I("soup")} .pg-arm-l { animation: bx-feel 1.8s ease-in-out .5s infinite }
    ${I("soup")} .idl-ladle { animation: idl-churn 1.8s ease-in-out .05s infinite }
    ${I("soup")} .look { transform: translate(1.4px,2.4px) }
    .idl-pop, .idl-steam { transform-box: fill-box; transform-origin: 50% 100% }
    ${I("soup")} .idl-pop { animation: idl-pop 1.8s ease-out infinite }
    ${I("soup")} .idl-steam { animation: idl-steam 2.6s ease-out infinite }

    /* water: the can tips and pours, drops fall, the sprout perks up and a heart rises; a lean towards it, eyes on it */
    ${I("water")} .squash { animation: ${HOP}, idl-lean 3.6s ease-in-out .5s infinite }
    ${I("water")} .pg-arm-r { transform: rotate(var(--idl-water)) }
    ${I("water")} .idl-tilt { transform: rotate(var(--idl-tip)); animation: idl-pour 3.6s ease-in-out .5s infinite }
    ${I("water")} .look { transform: translate(2.2px,2px) }
    ${I("water")} .idl-rain { animation: idl-rain 3.6s linear .5s infinite }
    ${I("water")} .idl-drop { animation: idl-drop .66s ease-in infinite }
    ${I("water")} .idl-grow { animation: idl-grow 3.6s ease-in-out .5s infinite }
    .idl-heart { opacity: 0; transform-box: fill-box; transform-origin: 50% 100% }
    ${I("water")} .idl-heart { animation: idl-heart 3.6s ease-out .5s infinite }

    /* fish: patient, eyes on the float; it bobs and dips, rings spread, a fish leaps (the eyes jump to it) */
    ${I("fish")} .squash { animation: ${HOP}, idl-breathe 3.4s ease-in-out .5s infinite }
    ${I("fish")} .pg-arm-r { transform: rotate(var(--idl-fish)) }
    ${I("fish")} .look { transform: translate(2.2px,2.4px); animation: idl-watch 6s ease-in-out .5s infinite }
    ${I("fish")} .idl-bob { animation: idl-bobber 6s ease-in-out .5s infinite }
    ${I("fish")} .idl-line { animation: idl-line 6s ease-in-out .5s infinite }
    .idl-ripple { opacity: 0; transform-box: fill-box; transform-origin: 50% 50% }
    ${I("fish")} .idl-ripple { animation: idl-ripple 6s ease-out .5s infinite }
    .idl-fishy { opacity: 0; transform-box: fill-box; transform-origin: 50% 50% }
    ${I("fish")} .idl-fishy { animation: idl-leap 6s ease-in-out .5s infinite }

    /* bubbles: purse and blow, bubbles drift off and pop; eyes on them */
    ${I("bubbles")} .squash { animation: ${HOP}, idl-puff 3s ease-in-out .5s infinite }
    ${I("bubbles")} .pg-arm-r { transform: rotate(var(--idl-blow)) }
    ${I("bubbles")} .look { transform: translate(2.2px,-.4px) }
    ${I("bubbles")} .m-open { animation: idl-o 3s ease-in-out .5s infinite }
    ${I("bubbles")} .m-rest { animation: idl-o-rest 3s ease-in-out .5s infinite }
    .idl-bubble { transform-box: fill-box; transform-origin: 50% 50% }
    ${I("bubbles")} .idl-bubble { animation: idl-float 3s ease-in-out infinite }

    /* music: groove on the beat (two beats a bar): sway and dip, arms swing, feet tap, ears bop, tops sway, the tail and
       claws keep time; the speakers thump and notes float off */
    ${I("music")} .squash { animation: ${HOP}, idl-groove 1.2s ease-in-out .5s infinite }
    ${I("music")} .pg-arm-l { animation: idl-swing-l 1.2s ease-in-out .5s infinite }
    ${I("music")} .pg-arm-r { animation: idl-swing-r 1.2s ease-in-out .5s infinite }
    ${I("music")} .pg-leg-a { animation: bx-step .6s ease-in-out .5s infinite alternate }
    ${I("music")} .pg-leg-b { animation: bx-step .6s ease-in-out .5s infinite alternate-reverse }
    ${I("music")} .pg-ear-l { animation: idl-bop-l .6s ease-in-out .5s infinite }
    ${I("music")} .pg-ear-r { animation: idl-bop-r .6s ease-in-out .5s infinite }
    ${I("music")} :is(.pg-sprout, .pg-sprout-l, .pg-sprout-r) { animation: bx-sway 1.2s ease-in-out .5s infinite }
    ${I("music")} .pg-tail { animation: bx-wag .6s ease-in-out .5s infinite }
    ${I("music")} .pg-claw-l { animation: bx-claw .3s ease-in-out .5s infinite alternate }
    ${I("music")} .pg-claw-r { animation: bx-claw-r .3s ease-in-out .8s infinite alternate }
    ${I("music")} .look { transform: translate(-2px,.6px) }
    ${I("music")} .idl-cone { animation: idl-thump .6s ease-out .5s infinite }
    .idl-note { transform-box: fill-box; transform-origin: 50% 100% }
    ${I("music")} .idl-note { animation: idl-note 2.4s ease-out infinite }

    /* stretch: arms up, tall, a yawn (eyes squint, never shut), then a wiggle; the still pose is the stretch */
    ${I("stretch")} .squash { transform: scale(.97,1.05); animation: ${HOP}, idl-stretch 6s ease-in-out .5s infinite }
    ${I("stretch")} .pg-arm-r { transform: rotate(var(--idl-up-r)); animation: idl-reach-r 6s ease-in-out .5s infinite }
    ${I("stretch")} .pg-arm-l { transform: rotate(var(--idl-up-l)); animation: idl-reach-l 6s ease-in-out .5s infinite }
    ${I("stretch")} .pg-claw-l { animation: idl-reach-l 6s ease-in-out .5s infinite; --idl-up-l: 18deg }
    ${I("stretch")} .pg-claw-r { animation: idl-reach-r 6s ease-in-out .5s infinite; --idl-up-r: -18deg }
    ${I("stretch")} .eyes { animation: idl-squint 6s ease-in-out .5s infinite }
    ${I("stretch")} .brows { animation: idl-brows 6s ease-in-out .5s infinite }
    ${I("stretch")} .m-open { animation: idl-yawn 6s ease-in-out .5s infinite }
    ${I("stretch")} .m-rest { animation: idl-yawn-rest 6s ease-in-out .5s infinite }

    /* nap: the old sleep (base idle: eyes shut, grey, drooping, zz), breathing slowly */
    ${I("nap")} .squash { animation: idl-snooze 4.4s ease-in-out infinite }

    @keyframes idl-in { 0% { opacity: 0; transform: scale(.3) } 50% { opacity: 1 } 100% { opacity: 1; transform: scale(1) } }
    @keyframes idl-bob { 0%,100% { transform: scale(1.012,.988) } 50% { transform: scale(.996,1.012) translateY(-.8px) } }
    @keyframes idl-toss-l { 0%,100% { transform: rotate(0) } 16% { transform: rotate(14deg) } 46% { transform: rotate(-4deg) } }
    @keyframes idl-toss-r { 0%,100% { transform: rotate(0) } 16% { transform: rotate(-14deg) } 46% { transform: rotate(4deg) } }
    @keyframes idl-follow { from { transform: translate(-2.2px,-2.8px) } to { transform: translate(2.2px,-2.8px) } }
    @keyframes idl-orbit { 0% { transform: rotate(0); animation-timing-function: cubic-bezier(.3,.62,.7,.38) } 74%,100% { transform: rotate(var(--idl-sweep)) } }
    @keyframes idl-ball { 0% { opacity: 0; transform: scale(.4) } 5%,70% { opacity: 1; transform: scale(1) } 74%,100% { opacity: 0; transform: scale(.4) } }
    @keyframes idl-sway { 0%,100% { transform: rotate(-1.4deg) } 50% { transform: rotate(1.4deg) } }
    @keyframes idl-stir { 0%,100% { transform: rotate(calc(var(--idl-stir) - 7deg)) } 50% { transform: rotate(calc(var(--idl-stir) + 7deg)) } }
    @keyframes idl-churn { 0%,100% { transform: translateY(-1.4px) } 50% { transform: translateY(1.4px) } }
    @keyframes idl-pop { 0% { opacity: 0; transform: scale(.3) } 30% { opacity: 1; transform: scale(1) } 55%,100% { opacity: 0; transform: scale(1.5) } }
    @keyframes idl-steam { 0% { opacity: 0; transform: translateY(2px) scale(.7) } 30% { opacity: .85 } 100% { opacity: 0; transform: translate(2.5px,var(--idl-rise, -6px)) scale(1.1) } }
    @keyframes idl-lean { 0%,100% { transform: rotate(0) } 30%,72% { transform: rotate(1.8deg) } }
    @keyframes idl-pour { 0%,12% { transform: rotate(0) } 26%,70% { transform: rotate(var(--idl-tip)) } 82%,100% { transform: rotate(0) } }
    @keyframes idl-rain { 0%,27% { opacity: 0 } 31%,68% { opacity: 1 } 72%,100% { opacity: 0 } }
    @keyframes idl-drop { 0% { transform: translateY(0); opacity: 1 } 80% { opacity: 1 } 100% { transform: translateY(var(--idl-fall)); opacity: 0 } }
    @keyframes idl-grow { 0%,66% { transform: scale(1) } 76% { transform: scale(1.1,1.16) } 88%,100% { transform: scale(1) } }
    @keyframes idl-heart { 0%,70% { opacity: 0; transform: translateY(0) scale(.4) } 78% { opacity: 1; transform: translateY(-3px) scale(1) } 100% { opacity: 0; transform: translateY(-12px) scale(1) } }
    @keyframes idl-breathe { 0%,100% { transform: scale(1,1) } 50% { transform: scale(1.01,1.02) } }
    @keyframes idl-watch { 0%,74%,96%,100% { transform: translate(2.2px,2.4px) } 80%,90% { transform: translate(2.6px,-1.8px) } }
    @keyframes idl-bobber { 0%,100% { transform: translateY(0) } 15% { transform: translateY(.8px) } 30% { transform: translateY(-.3px) } 50% { transform: translateY(.8px) } 58% { transform: translateY(2.6px) } 64% { transform: translateY(0) } }
    @keyframes idl-line { 0%,30%,64%,100% { transform: scaleY(1) } 15%,50% { transform: scaleY(calc(1 + (var(--idl-ls) - 1) * .3)) } 58% { transform: scaleY(var(--idl-ls)) } }
    @keyframes idl-ripple { 0%,56% { opacity: 0; transform: scale(.4) } 60% { opacity: .9 } 76%,100% { opacity: 0; transform: scale(1.7) } }
    @keyframes idl-leap { 0%,78% { opacity: 0; transform: translate(0,0) rotate(-70deg) } 80% { opacity: 1; transform: translate(0,0) rotate(-70deg) } 83.5% { transform: translate(calc(var(--idl-lx) * .5),calc(var(--idl-ly) * .75)) rotate(-40deg) } 87% { transform: translate(var(--idl-lx),var(--idl-ly)) rotate(0) } 90.5% { transform: translate(calc(var(--idl-lx) * 1.5),calc(var(--idl-ly) * .75)) rotate(40deg) } 93.5% { opacity: 1; transform: translate(calc(var(--idl-lx) * 2),0) rotate(70deg) } 95%,100% { opacity: 0; transform: translate(calc(var(--idl-lx) * 2),0) rotate(70deg) } }
    @keyframes idl-puff { 0%,46%,100% { transform: scale(1) } 12%,32% { transform: scale(1.025,.985) } }
    @keyframes idl-o { 0%,6% { opacity: 0; transform: scale(.25,.3) } 12%,34% { opacity: 1; transform: scale(.36,.42) } 42%,100% { opacity: 0; transform: scale(.25,.3) } }
    @keyframes idl-o-rest { 0%,6% { opacity: 1 } 12%,34% { opacity: 0 } 42%,100% { opacity: 1 } }
    @keyframes idl-float { 0% { opacity: 0; transform: translate(0,0) scale(.2) } 8% { opacity: 1; transform: translate(calc(var(--idl-bx) * .12),calc(var(--idl-by) * .04)) scale(.7) } 30% { transform: translate(calc(var(--idl-bx) * .45),calc(var(--idl-by) * .28)) scale(1.06,.94) } 55% { transform: translate(calc(var(--idl-bx) * .75),calc(var(--idl-by) * .6)) scale(.95,1.05) } 86% { opacity: 1; transform: translate(var(--idl-bx),var(--idl-by)) scale(1) } 92%,100% { opacity: 0; transform: translate(var(--idl-bx),var(--idl-by)) scale(1.45) } }
    @keyframes idl-groove { 0%,50%,100% { transform: rotate(0) scale(1,1) } 10% { transform: rotate(-2.4deg) scale(1.035,.955) } 30% { transform: rotate(-1.4deg) scale(.99,1.02) translateY(-1px) } 60% { transform: rotate(2.4deg) scale(1.035,.955) } 80% { transform: rotate(1.4deg) scale(.99,1.02) translateY(-1px) } }
    @keyframes idl-swing-l { 0%,50%,100% { transform: rotate(0) } 12% { transform: rotate(var(--idl-sw-l)) } 62% { transform: rotate(calc(var(--idl-sw-l) * -.4)) } }
    @keyframes idl-swing-r { 0%,50%,100% { transform: rotate(0) } 12% { transform: rotate(calc(var(--idl-sw-r) * -.4)) } 62% { transform: rotate(var(--idl-sw-r)) } }
    @keyframes idl-bop-l { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-8deg) } }
    @keyframes idl-bop-r { 0%,100% { transform: rotate(0) } 20% { transform: rotate(8deg) } }
    @keyframes idl-thump { 0% { transform: scale(1.16) } 40%,100% { transform: scale(1) } }
    @keyframes idl-note { 0% { opacity: 0; transform: translate(0,0) rotate(0) scale(.5) } 15% { opacity: 1 } 50% { transform: translate(calc(var(--idl-nx) * .5),-12px) rotate(-12deg) scale(1) } 85% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--idl-nx),-24px) rotate(10deg) scale(1) } }
    @keyframes idl-stretch { 0%,8%,100% { transform: scale(1,1) } 26%,46% { transform: scale(.95,1.09) translateY(-1.5px) } 36% { transform: scale(.955,1.1) translateY(-2px) } 55% { transform: scale(1.06,.93) } 63% { transform: scale(.99,1.01) } 70% { transform: rotate(-2deg) } 76% { transform: rotate(2deg) } 82% { transform: rotate(0) } }
    @keyframes idl-reach-r { 0%,8%,58%,100% { transform: rotate(0) } 26%,46% { transform: rotate(var(--idl-up-r)) } 36% { transform: rotate(calc(var(--idl-up-r) - 6deg)) } }
    @keyframes idl-reach-l { 0%,8%,58%,100% { transform: rotate(0) } 26%,46% { transform: rotate(var(--idl-up-l)) } 36% { transform: rotate(calc(var(--idl-up-l) + 6deg)) } }
    @keyframes idl-squint { 0%,28%,52%,100% { transform: scaleY(1) } 34%,46% { transform: scaleY(.55) } 84% { transform: scaleY(1) } 86% { transform: scaleY(.1) } 88% { transform: scaleY(1) } }
    @keyframes idl-brows { 0%,28%,52%,100% { opacity: 0; transform: translateY(0) } 34%,46% { opacity: 1; transform: translateY(-2px) } }
    @keyframes idl-yawn { 0%,30% { opacity: 0; transform: scale(.4,.3) } 34% { opacity: 1; transform: scale(.7,.6) } 41% { opacity: 1; transform: scale(1,1.08) } 47% { opacity: 1; transform: scale(.6,.5) } 50%,100% { opacity: 0; transform: scale(.4,.3) } }
    @keyframes idl-yawn-rest { 0%,30% { opacity: 1 } 34%,47% { opacity: 0 } 50%,100% { opacity: 1 } }
    @keyframes idl-snooze { 0%,100% { transform: scale(1.04,.95) } 50% { transform: scale(1.06,.935) } }
`;
