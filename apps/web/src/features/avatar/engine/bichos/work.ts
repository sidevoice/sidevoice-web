import { n, type Size } from "../core";
import { INK, add, clamp, mul, rad, sub, unit, type Pt, type Rig, type Spec } from "./kit";
import { present } from "./spec";

/* Working styles: the tool a bicho has in its hands while it works. The style is not part of the bicho: the client
 * picks one at random when the bicho starts working (`nextWork`) and swaps it for another when its time is up
 * (`workTurn(work)`: each style has its own range) while it keeps working, like picking up a different tool. It sets the choice on the avatar's root as `data-work`; the
 * shared CSS (styles/bichos.ts) keys each style's keyframes on it, for the shared groups (squash, arms, `.look`, brows)
 * every part already joins, and pops each style's props in and out. The cog pair turns over the head in every style
 * (render.ts places it): it is the "busy" cue at a glance, and the one the sidebar keeps. Each style also changes the
 * scene a little, and what piles up clears again before it gets big:
 *
 *   crank   the classic: arms crank, puffs of effort (what a root without `data-work` shows)
 *   hammer  a hammer in the right hand winds up overhead and strikes an anvil; the body slams down on every hit, sparks
 *           fly, and nails jump off and gather by the anvil
 *   read    a big open book held in front; the eyes scan the lines; a page turns now and then, and finished pages fly
 *           over its shoulder into a little pile behind it
 *   type    a little laptop in front, hands tapping at its sides; bits of code fly out (the one code-flavoured style)
 *
 * The hammer needs a free hand on the right: a bicho without hands, or one holding something, gets the others
 * (`worksFor`). Frozen figures (the `v3:` and `monstruo:` seeds) and the mascots get no `data-work`: they keep the
 * classic crank. (Juggling and the cauldron moved to idle, as pastimes: idle.ts.)
 *
 * A desk in front (the stage scene's: the client sets `data-desk` on the root) covers the figure below `DESK_Y`, where
 * the props would stand. At stage size each prop also carries how far it steps up to rest on the desk top
 * (`--wk-lift`), the arms carry their angles to reach it there (`--wk-read-rd`/`-ld`, `--wk-type-rd`/`-ld`), and
 * the paddle comes in a second drawing for the raised cauldron; the CSS swaps them in under `data-desk`. */

export const WORKS = ["crank", "hammer", "read", "type"] as const;
export type Work = (typeof WORKS)[number];

/** Spanish labels, for pickers. */
export const WORK_LABELS: Record<Work, string> = {
  crank: "manivela", hammer: "martillo", read: "libro", type: "portátil",
};


/** How long a bicho keeps one tool before it picks up another, in ms: the default, and each style's own (hammering
 * comes in short bursts, reading goes on). */
export const WORK_TURN = { min: 20_000, max: 30_000 } as const;
export const WORK_DURATION: Record<Work, [number, number]> = {
  crank: [15_000, 25_000], hammer: [8_000, 14_000], read: [20_000, 35_000], type: [15_000, 30_000],
};

/** A desk in front of the figure has its top edge on this line of the 120 box (the stage scene lays its desk out so):
 * the props rest on it, and the desk covers everything below it. */
export const DESK_Y = 93.5;

/** The styles whose props are held in the hands. */
const IN_HAND: readonly Work[] = ["hammer"];

/** The styles that suit a bicho: all of them with free hands, the hands-free ones otherwise. */
export function worksFor(spec: Spec): Work[] {
  const parts = present(spec);
  const hands = parts.some((e) => e.slot === "arms" && e.tags?.includes("hand")) && !parts.some((e) => e.slot === "held");
  return WORKS.filter((w) => hands || !IN_HAND.includes(w));
}

/** A random style from `pool`, never `prev` (so a swap always changes tool). Starting work: `nextWork(null, pool)`. */
export function nextWork(prev?: string | null, pool: readonly Work[] = WORKS, random: () => number = Math.random): Work {
  const options = pool.filter((w) => w !== prev);
  if (!options.length) return pool[0] ?? "crank";
  return options[Math.floor(random() * options.length)];
}

/** How long to keep `work` (the tool just picked up) before the next swap, in ms; the default range without one. */
export const workTurn = (work?: Work, random: () => number = Math.random) => {
  const [min, max] = work ? WORK_DURATION[work] : [WORK_TURN.min, WORK_TURN.max];
  return min + random() * (max - min);
};

/* ---------- the props: one set per style the bicho suits, popped in and out by the CSS ---------- */

const deg = (r: number) => (r * 180) / Math.PI;
const P = (p: Pt) => `${n(p[0])} ${n(p[1])}`;

/** The right arm's pivot and hand at rest (a nub's hand, for arms that emit none). */
function armR(rig: Rig): { o: Pt; hand: Pt } {
  const h = rig.at.handR, s = rig.at.shoulderR;
  return { o: h?.o ?? [s.x, s.y], hand: h ? [h.x, h.y] : [s.x + 13 * rig.u, s.y + 8] };
}

/** How far the right arm turns (degrees, clockwise: inwards and down) to point its hand at `target`. */
function reach(rig: Rig, target: Pt, lo = 15, hi = 80): number {
  const { o, hand } = armR(rig);
  let a = deg(Math.atan2(target[1] - o[1], target[0] - o[0]) - Math.atan2(hand[1] - o[1], hand[0] - o[0]));
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return n(clamp(a, lo, hi));
}

/** A prop of one style: shown only while the root's `data-work` names it (CSS), and only in working (`prop-work`).
 * `lift` (negative, up): how far it steps up onto a desk in front (`--wk-lift`, applied under `data-desk`). */
const prop = (work: Work, html: string, extra = "", lift = 0) => {
  const up = lift < -0.05;
  return `<g class="prop-work wk wk-${work}${extra ? ` ${extra}` : ""}${up ? " wk-lift" : ""}"${up ? ` style="--wk-lift:${n(lift)}px"` : ""}>${html}</g>`;
};
/** How far a prop whose lowest point is at `foot` steps up to rest on the desk top (0 without a desk: not at stage). */
const deskLift = (o: Out, foot: number) => (o.desk ? Math.min(0, DESK_Y - foot) : 0);

/** Markup that rides the right (or left) arm: the arm's own group and pivot, so it moves with the arm's keyframes. */
function onArm(rig: Rig, side: "L" | "R", html: string) {
  const h = rig.at[`hand${side}`];
  if (!h?.g) return html;
  return `<g class="pg-${h.g}"${h.o ? ` style="transform-box:view-box;transform-origin:${n(h.o[0])}px ${n(h.o[1])}px"` : ""}>${html}</g>`;
}

const ink = (w: number) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;

/** `fine`: draw the stage-only bits too (the star, bubbles, code, the turning page); the sidebar hides them anyway.
 * `desk`: add what a desk in front needs (stage only, where the scene draws one). */
interface Out { under: string; back: string; arm: string; front: string; vars: string[]; hold?: "l" | "r"; fine: boolean; desk: boolean }

/** A reach angle for both arms: the right one turns by `a`, the left one mirrors it; a hand that holds something stays
 * put (its angle is 0), so the item isn't tipped over. `desk`: the same reach to the prop on a desk (`-rd`/`-ld`). */
const reachVars = (o: Out, name: string, a: number, desk?: number) => {
  const put = (suffix: string, v: number) => o.vars.push(`--wk-${name}-r${suffix}:${o.hold === "r" ? 0 : v}deg`, `--wk-${name}-l${suffix}:${o.hold === "l" ? 0 : -v}deg`);
  put("", a);
  if (desk !== undefined) put("d", desk);
};

/** Hammer: an anvil in front of the bicho's lower right, and a hammer in the right hand, handle pointing in, head standing
 * on the anvil: the impact pose, which is also the arm's rest. The arm lifts while the wrist (`.wk-wrist`, pivoting on
 * the grip) cocks the hammer up overhead, then both snap down; a star flashes where the head lands. With a desk in front
 * the head lands on the desk top itself: the anvil steps out and the star flashes just above the edge. */
function hammer(rig: Rig, shade: (c: string) => string, o: Out) {
  const h = rig.at.handR;
  if (!h) return;
  const grip: Pt = [h.x, h.y], ground = rig.at.ground.y;
  const head: Pt = [grip[0] - 13, clamp(grip[1] + 10, ground - 15, ground - 8) - 7.5], span = sub(head, grip), reachL = Math.hypot(...span);
  const d = unit(span), down: Pt = d[0] < 0 ? [d[1], -d[0]] : [-d[1], d[0]], strike = add(head, mul(down, 7.5));
  const k = clamp((ground - strike[1]) / 9.5, 0.85, 1.45), ax = Math.min(strike[0] + 1.75 * k, 119 - 13 * k), stump = ground - strike[1] - 9.5 * k;
  const anvil = `<g transform="translate(${n(ax)} ${n(strike[1] + 0.3)}) scale(${n(k)})">
      <path fill="${shade("#6c7486")}" ${ink(2.2 / k)} d="M-8.5 0H5Q9 0 13 1.2Q9 3.6 4.5 3.8L3.5 5.5Q3.5 7 6.5 7.6V9.5H-7.5V7.6Q-4.5 7-4.5 5.5L-5.5 3.8Q-8.5 3.4-8.5 0Z"/>
      <path d="M-6 1.5H3.5" fill="none" stroke="#c3cad8" stroke-width="${n(1.4 / k)}" stroke-linecap="round"/></g>`;
  const log = stump > 1.5 ? `<rect x="${n(ax - 7 * k)}" y="${n(strike[1] + 9 * k)}" width="${n(13 * k)}" height="${n(stump + 0.5)}" rx="1.5" fill="${shade("#b07a4a")}" ${ink(2.2)}/>` : "";
  o.back += prop("hammer", log + anvil, "wk-ground keep-small wk-off-desk");
  const tool = `<g class="wk-wrist" style="transform-box:view-box;transform-origin:${n(grip[0])}px ${n(grip[1])}px"><g transform="translate(${P(grip)}) rotate(${n(deg(Math.atan2(d[1], d[0])))})">
      <rect x="-3.8" y="-1.9" width="${n(reachL)}" height="3.8" rx="1.9" fill="${shade("#d39a5c")}" ${ink(2.2)}/>
      <rect x="${n(reachL - 4.6)}" y="-7.5" width="9.2" height="15" rx="2.2" fill="${shade("#8d96aa")}" ${ink(2.4)}/>
      <path d="M${n(reachL - 2.2)} -4.8V4.8" stroke="#e3e8f1" stroke-width="1.5" stroke-linecap="round"/></g></g>`;
  o.arm += onArm(rig, "R", prop("hammer", tool, "keep-small"));
  // The tink: a star where the head meets the anvil, flashing on every hit.
  const c = add(strike, [-8, -2.5]), r = 5.2, star: string[] = [];
  for (let i = 0; i < 8; i += 1) { const a = rad(i * 45), q = i % 2 ? r * 0.4 : r; star.push(P(add(c, [Math.sin(a) * q, -Math.cos(a) * q]))); }
  if (!o.fine) return;
  // Sparks burst from the star on every hit; nails jump off, one every other hit, and gather by the anvil (on the desk
  // top when a desk is in) until they clear.
  const sparks = [[-9, -6], [-2, -10], [7, -7]].map(([sx, sy]) => `<path class="wk-spark" style="--wk-sx:${sx}px;--wk-sy:${sy}px" d="M${P(c)}l${n(sx * 0.18)} ${n(sy * 0.18)}" stroke="#ffd23f" stroke-width="2.2" stroke-linecap="round"/>`).join("");
  o.front += prop("hammer", `<g class="wk-tink"><path d="M${star.join("L")}Z" fill="#fff6c2" ${ink(1.6)}/></g>${sparks}`, "", deskLift(o, c[1] + 4));
  const floor = ground - 1.2, nail = `<path d="M-3.4 0H3" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M-3.4 0H3" stroke="#b9c2d0" stroke-width="1.2" stroke-linecap="round"/><path d="M-3.6 -1.9V1.9" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  const nails = ([[-15, 8], [12, -10], [-21, -4]] as const).map(([dx, tilt], i) => {
    const at: Pt = [clamp(ax + dx * k, 6, 116), floor - i * 0.4];
    return `<g class="wk-nail" style="--wk-fx:${n(strike[0] - at[0])}px;--wk-fy:${n(strike[1] - at[1])}px;animation-name:wk-nail-${i}"><g transform="translate(${P(at)}) rotate(${tilt})">${nail}</g></g>`;
  }).join("");
  o.front += prop("hammer", nails, "", deskLift(o, ground));
}

/** Read: a big open book held low in front, pages towards us; the arms reach in behind its edges. One page (a copy of
 * the right one) turns over now and then, about the spine. */
function read(rig: Rig, shade: (c: string) => string, o: Out) {
  const bw = clamp(rig.half - 8, 17, 28), H = 15, yT = Math.min(rig.mouthY + 7, rig.at.ground.y - H - 4), x0 = 60 - bw, s = yT + 2.5, b = yT + H;
  const lift = deskLift(o, b + 3);
  reachVars(o, "read", reach(rig, [60 + bw - 3, yT + 9]), o.desk ? reach(rig, [60 + bw - 3, yT + 9 + lift]) : undefined);
  const page = (side: 1 | -1) => {
    const X = (x: number) => n(60 + side * (x - 60));
    const lines = [0, 1, 2].map((i) => `M${X(x0 + 3.5)} ${n(yT + 4.4 + i * 3.3)}Q${X(60 - bw * 0.45)} ${n(yT + 1.6 + i * 3.3)} ${X(i === 2 ? 60 - bw * 0.35 : 56)} ${n(yT + 5.4 + i * 3.3)}`).join("");
    return `<path fill="#fffaf0" ${ink(1.8)} d="M60 ${n(s)}Q${X(60 - bw * 0.45)} ${n(yT - 2.5)} ${X(x0)} ${n(yT + 0.5)}L${X(x0)} ${n(b)}Q${X(60 - bw * 0.45)} ${n(b - 2.8)} 60 ${n(b + 1.8)}Z"/>
      <path d="${lines}" fill="none" stroke="#cbc3d9" stroke-width="1.2" stroke-linecap="round"/>`;
  };
  const cover = `<path fill="${shade("#4f6bed")}" ${ink(2.2)} d="M${n(x0 - 2.5)} ${n(yT + 2)}L${n(x0 - 2.5)} ${n(b + 1.8)}Q${n(60 - bw * 0.5)} ${n(b + 0.8)} 60 ${n(b + 4.4)}Q${n(60 + bw * 0.5)} ${n(b + 0.8)} ${n(120 - x0 + 2.5)} ${n(b + 1.8)}L${n(120 - x0 + 2.5)} ${n(yT + 2)}Z"/>`;
  const turning = !o.fine ? "" : `<g class="wk-page" style="transform-box:view-box;transform-origin:60px ${n(yT + H / 2)}px">${page(1)}</g>`;
  o.front += prop("read", `${cover}${page(-1)}${page(1)}${turning}<path d="M60 ${n(s)}V${n(b + 1.8)}" stroke="${INK}" stroke-width="1.6"/>`, "keep-small", lift);
  if (!o.fine) return;
  // Finished pages fly up from behind the head, over its left shoulder, and land on a little pile behind it on the floor
  // (on the desk top when a desk is in); four of them, then the pile clears and it starts again.
  const ground = rig.at.ground.y, from: Pt = [60, rig.top + 14], px = Math.max(9, 60 - rig.half - 8);
  const sheets = [0, 1, 2, 3].map((i) => {
    const at: Pt = [px + [0, 2.5, -1.5, 1][i], ground - 1.5 - i * 2.8];
    return `<g class="wk-sheet" style="--wk-fx:${n(from[0] - at[0])}px;--wk-fy:${n(from[1] - at[1])}px;animation-name:wk-sheet-${i}"><g transform="translate(${P(at)}) rotate(${[-6, 5, -3, 8][i]})">
        <rect x="-6.5" y="-7.5" width="13" height="15" rx="1.2" fill="#fffaf0" ${ink(1.6)}/><path d="M-3.8 -3.6H3.8M-3.8 0H3.8M-3.8 3.6H1.6" stroke="#cbc3d9" stroke-width="1.2" stroke-linecap="round"/></g></g>`;
  }).join("");
  o.under += prop("read", sheets, "", deskLift(o, ground));
}

/** Type: a little laptop on the ground in front, lid towards us (stickers on it, the screen's glow spilling over its top
 * edge); narrow enough that the hands show at its sides, tapping, while bits of code fly out. */
function type(rig: Rig, shade: (c: string) => string, o: Out) {
  const ground = rig.at.ground.y, lw = clamp(rig.half - 16, 12, 17), top = clamp(rig.mouthY + 8, ground - 24, ground - 16), bot = ground - 1.5, mid = (top + bot) / 2;
  const lift = deskLift(o, bot + 1.6);
  reachVars(o, "type", reach(rig, [60 + lw - 1, top - 1]), o.desk ? reach(rig, [60 + lw - 1, top - 1 + lift]) : undefined);
  const glow = `<ellipse class="wk-glow" cx="60" cy="${n(top + 1)}" rx="${n(lw + 3)}" ry="7" fill="#aef8ff" opacity=".3"/>`;
  const heart = `<path transform="translate(${n(60 - lw * 0.42)} ${n(mid - 1)})" d="M0 2.6C-3.2 0.4-3 -2.4-1.2 -2.4C-0.4 -2.4 0 -1.6 0 -1.2C0 -1.6 0.4 -2.4 1.2 -2.4C3 -2.4 3.2 0.4 0 2.6Z" fill="#ff6f91" ${ink(1.2)}/>`;
  const star: string[] = [];
  for (let i = 0; i < 10; i += 1) { const a = rad(i * 36), q = i % 2 ? 1.3 : 3; star.push(P([60 + lw * 0.4 + Math.sin(a) * q, mid + 2 - Math.cos(a) * q])); }
  const lid = `<rect x="${n(60 - lw)}" y="${n(top)}" width="${n(lw * 2)}" height="${n(bot - top)}" rx="3" fill="${shade("#d5dae4")}" ${ink(2.4)}/>
      ${heart}<path d="M${star.join("L")}Z" fill="#ffd23f" ${ink(1.2)}/>
      <rect x="${n(60 - lw - 3)}" y="${n(bot - 2)}" width="${n(lw * 2 + 6)}" height="3.6" rx="1.6" fill="${shade("#aab2c2")}" ${ink(2.2)}/>`;
  // Bits of code fly out of the lid's corners, outwards (`--wk-gx`), clear of the face; staggered, so a still frame (reduced
  // motion) shows them apart.
  const glyphs = ([["</>", -1], ["{ }", 1], [";", -1], ["#", 1]] as const).map(([g, side], i) => `<text class="wk-glyph" style="--wk-gx:${side * 7}px;animation-delay:${n(0.5 + i * 0.45 - 1.8)}s" x="${n(60 + side * (lw + 1 + (i > 1 ? 4 : 0)))}" y="${n(top + 3 - (i > 1 ? 8 : 0))}">${g.replace("<", "&lt;").replace(">", "&gt;")}</text>`).join("");
  o.front += prop("type", glow + lid, "wk-ground keep-small", lift);
  if (o.fine) o.front += prop("type", glyphs, "", lift);
}

/** The working props for every style this bicho suits, plus the CSS variables their keyframes read (arm angles that
 * reach the book and the keys; where the flying pages and nails come from). `under` goes under the body (the pile of
 * pages behind it), the rest in front. The big props are `keep-small`, so the sidebar keeps
 * them as its cue; the fine bits are stage only; the rail draws none (it holds still). `shade` is the renderer's own
 * shade (lit top-left, deep rim), shared with the bicho's pieces. */
export function workProps(spec: Spec, rig: Rig, size: Size, shade: (c: string) => string): { vars: string; html: string; under: string } {
  if (size === "rail") return { vars: "", html: "", under: "" };
  const works = worksFor(spec);
  const held = present(spec).find((e) => e.slot === "held"), at = held?.at ?? held?.rides ?? "";
  const o: Out = { under: "", back: "", arm: "", front: "", vars: [], hold: held ? (at.endsWith("L") ? "l" : "r") : undefined, fine: size === "stage", desk: size === "stage" };
  if (works.includes("hammer")) hammer(rig, shade, o);
  if (works.includes("read")) read(rig, shade, o);
  if (works.includes("type")) type(rig, shade, o);
  const html = o.back || o.arm || o.front ? `<g class="wk-props">${o.back}${o.arm}${o.front}</g>` : "";
  return { vars: o.vars.map((v) => `;${v}`).join(""), html, under: o.under ? `<g class="wk-props wk-under">${o.under}</g>` : "" };
}
