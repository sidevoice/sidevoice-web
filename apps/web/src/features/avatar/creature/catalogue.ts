import { sha256 } from "@noble/hashes/sha2.js";
import { pcg32 } from "../engine/core";

/* What a creature can be, and which one a conversation gets. The tables, the rarity and the colour harmony are the frozen
 * design reference's creator (reference/2026-11-04/src/creator.js: BODIES, PAL, IRIS, SLOTS, RARE, UNCOMMON, FILL, RATES,
 * T25 harmonyAccent and harmonyIris, the Random button, specOf), with one change: where the creator throws Math.random,
 * a conversation's creature draws from a stream seeded by its identity (its key, `<machine fingerprint>|<thread id>`), in
 * the same order, so the same conversation gets the same creature on every reload and every device, and nothing is
 * stored. Nothing here needs three.js: the stage's tint (avatarColor) and the tests read a creature without drawing it.
 *
 * The slots are the creator's, with the accessories accessories.js registers appended to their slot in registration
 * order, exactly as the creator builds them at load; catalogue.test.ts holds this table to those registries. */

/** The creature's choices, as the creator keeps them (and as its URL hash spells them): option labels, not part names. */
export interface CreatureChoice {
  body: string;
  color: string;
  accent: string;
  iris: string;
  ears: string;
  head: string;
  /** One label, or several joined by "," (the face slot takes more than one; a roll gives one). */
  face: string;
  eyewear: string;
  /** "normal", or an eye style's label (EYE_OPTS). */
  eyes: string;
}

/** What the rig (rig.js Creature3D) is built from: specOf() in the creator. */
export interface RigSpec {
  body: string;
  color: string;
  accent: string;
  iris: string;
  parts: string[];
  eyeStyle: string | null;
  level: "v1";
  eyeScale: number;
  cheeks: false;
  marking: null;
  accessory: null;
  mouth: "smile";
  state?: string;
  expr?: string;
}

export const BODIES = ["round", "egg", "pear", "pill", "bean", "drop", "onion", "gumdrop", "bell", "dome", "slime", "mochi", "wide", "peanut", "can", "box", "onigiri", "blob"] as const;
export const PAL = ["#f2cf5b", "#6cc4a4", "#6fa6dc", "#e8826a", "#a58bd8", "#58c46a", "#d8a35c", "#9fb2c6", "#f2a7c3", "#4fb3c8", "#c9d66b", "#b98a6e", "#7d8ce0", "#f0b45a", "#e9e4da", "#5e6b7a", "#e86a8a", "#8fd0b8"] as const;
/** Mid tones: a near-black iris merges with the pupil and reads dilated. */
export const IRIS = ["#8a5a34", "#3d78c4", "#2f9a96", "#4f9a6a", "#7a56c0", "#b07a3a", "#c0506a", "#5a6478"] as const;
/** The rare shiny body: gold. */
export const SHINY = "#f3c24a";

export type SlotKey = "ears" | "head" | "face" | "eyewear";
/** An option: its label (what the creator shows and its hash keeps) and the part names the rig builds. */
export type SlotOption = readonly [label: string, parts: readonly string[]];
export type Slot = readonly [key: SlotKey, label: string, options: readonly SlotOption[], cfg?: { multi: true }];

/** One choice each (the face takes several). The creator's four slots, each followed by the accessories registered for it. */
export const SLOTS: readonly Slot[] = [
  ["ears", "Ears", [["none", []], ["cat", ["cat-ears"]], ["bear", ["bear-ears"]], ["bunny", ["bunny-ears"]], ["horns", ["horns"]]]],
  ["head", "Head", [["none", []], ["leaf", ["sprout"]], ["curl", ["curl"]], ["antennae", ["antenna"]], ["robot", ["robot-bits"]], ["mushroom", ["mushroom-sprout"]],
    ["party hat", ["party"]], ["cap", ["cap"]], ["star", ["star"]], ["bow", ["bow"]], ["headphones", ["headphones"]],
    // registered (accessories.js), in registration order
    ["bobble hat", ["bobble-hat"]], ["straw hat", ["straw-hat"]], ["wizard hat", ["wizard-hat"]], ["top hat", ["top-hat"]], ["cowboy hat", ["cowboy-hat"]],
    ["chef hat", ["chef-hat"]], ["pirate hat", ["tricorn"]], ["beret", ["beret"]], ["propeller cap", ["propeller-cap"]], ["mortarboard", ["mortarboard"]],
    ["pilot helmet", ["pilot-helmet"]], ["horned helmet", ["viking-helmet"]], ["royal crown", ["royal-crown"]], ["halo ring", ["halo-ring"]],
    ["headband", ["headband"]], ["flower", ["flower"]]]],
  ["face", "Face", [["none", []], ["muzzle", ["muzzle"]], ["whiskers", ["whiskers"]], ["bolt scar", ["bolt-scar"]]], { multi: true }],
  ["eyewear", "Eyewear", [["none", []], ["glasses", ["glasses"]], ["monocle", ["monocle"]], ["eye patch", ["eyepatch"]]]],
];

/** The eye types a creature can have (reactions — hearts, stars, sparkles — are things the eyes do, not types). */
export const EYE_OPTS: readonly (readonly [label: string, style: string | null])[] = [["normal", null], ["tomoe", "tomoe"], ["ripple", "ripple"], ["LED", "led"]];

// Rarity (operator, 2026-11-03): special eyes ~1%; accessories in three tiers, weights common 10 · uncommon 4 · rare 1
// (the product's own scale); a slot is filled with its own probability; a gold "shiny" body at 0.5%, as the product has.
export const RARE = new Set(["royal crown", "halo ring", "straw hat", "pilot helmet", "horned helmet", "mortarboard", "bolt scar", "monocle", "eye patch"]);
export const UNCOMMON = new Set(["wizard hat", "top hat", "cowboy hat", "chef hat", "pirate hat", "beret", "propeller cap", "headband", "robot", "mushroom", "party hat", "star"]);
export const tierWeight = (label: string) => (RARE.has(label) ? 1 : UNCOMMON.has(label) ? 4 : 10);
/** How often each slot is filled. Operator: head ~70%, and always something (rollCreature). */
export const FILL: Record<SlotKey, number> = { ears: 0.3, head: 0.7, face: 0.2, eyewear: 0.12 };
export const RATES = { specialEyes: 0.01, shiny: 0.005 } as const;

/** A random stream: 0 ≤ n < 1, as Math.random. */
export type Random = () => number;

export function weighted(opts: readonly SlotOption[], random: Random): SlotOption {
  const total = opts.reduce((t, o) => t + tierWeight(o[0]), 0);
  let r = random() * total;
  for (const o of opts) { r -= tierWeight(o[0]); if (r < 0) return o; }
  return opts[opts.length - 1];
}

// T25 (operator, 2026-11-04): colour harmony. The body colour is any of the palette (or the rare shiny gold); the accent
// is picked by a harmony with it on the hue wheel: complementary 40%, split complementary 25%, triadic 20%, analogous
// 15%, each the palette colour nearest the harmony's hue (never the body's own; an analogous one at least 20° off it).
// A neutral body (cream, slate, grey blue) takes any saturated accent; a neutral accent is a 10% chance on any body. The
// eyes: an iris at least 50° of hue away from the body's, so it never melts into the skin.
export const hueOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s };
};
export const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
export const HARMONY: readonly (readonly [name: string, share: number, offsets: readonly number[]])[] = [
  ["complementary", 0.4, [180]], ["split", 0.25, [150, 210]], ["triadic", 0.2, [120, 240]], ["analogous", 0.15, [35, -35]],
];

export function harmonyAccent(body: string, random: Random): string {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(random() * a.length)], B = hueOf(body), sat = PAL.filter((c) => c !== body && hueOf(c).s >= 0.3);
  if (random() < 0.1) return pick(PAL.filter((c) => c !== body && hueOf(c).s < 0.3));
  if (B.s < 0.3) return pick(sat);
  let r = random(), h = HARMONY[0];
  for (const x of HARMONY) { if (r < x[1]) { h = x; break; } r -= x[1]; }
  const want = (B.h + pick(h[2]) + 360) % 360, ok = sat.filter((c) => h[0] !== "analogous" || hueGap(hueOf(c).h, B.h) >= 20);
  return ok.reduce((a, c) => (hueGap(hueOf(c).h, want) < hueGap(hueOf(a).h, want) ? c : a), ok[0]);
}

export function harmonyIris(body: string, random: Random): string {
  const B = hueOf(body), far = IRIS.filter((c) => B.s < 0.3 || hueGap(hueOf(c).h, B.h) >= 50);
  return far[Math.floor(random() * far.length)] || IRIS[0];
}

/** A creature from a random stream: the creator's Random button, draw for draw. */
export function rollCreature(random: Random): CreatureChoice {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(random() * a.length)];
  const body = pick(BODIES);
  const color = random() < RATES.shiny ? SHINY : pick(PAL);
  const accent = harmonyAccent(color, random);
  const iris = harmonyIris(color, random);
  const slots = {} as Record<SlotKey, string>;
  for (const [key, , opts] of SLOTS) slots[key] = random() < (FILL[key] ?? 0.3) ? weighted(opts.slice(1), random)[0] : "none";
  if (SLOTS.every(([key]) => slots[key] === "none")) { const head = SLOTS.find((x) => x[0] === "head")!; slots.head = weighted(head[2].slice(1), random)[0]; } // never bare
  const eyes = random() < RATES.specialEyes ? pick(EYE_OPTS.slice(1))[0] : "normal";
  return { body, color, accent, iris, ...slots, eyes };
}

/** The version of the seed's roll: part of the stream's key, so a new one rolls every conversation afresh (a decision). */
export const CREATURE_ROLL = "creature-v1";

/** The stream a conversation's creature is drawn from: SHA-256 of the versioned identity, as the engine's streams
 *  (engine/core.ts rng), its first 8 bytes PCG32's state and the next 8 its sequence. */
export function creatureStream(seed: string): Random {
  const digest = sha256(new TextEncoder().encode(JSON.stringify([CREATURE_ROLL, seed])));
  const u64 = (at: number) => { let v = 0n; for (let i = 7; i >= 0; i -= 1) v = (v << 8n) | BigInt(digest[at + i]); return v; };
  const uint32 = pcg32(u64(0), u64(8));
  return () => uint32() / 4294967296;
}

const rolled = new Map<string, CreatureChoice>();
/** The creature of the conversation behind `seed` (its key, `<machine fingerprint>|<thread id>`). */
export function creatureFromSeed(seed: string): CreatureChoice {
  let choice = rolled.get(seed);
  if (!choice) {
    if (rolled.size >= 400) rolled.delete(rolled.keys().next().value!);
    rolled.set(seed, (choice = rollCreature(creatureStream(seed))));
  }
  return choice;
}

const chosen = (choice: CreatureChoice, key: SlotKey) => String(choice[key] || "none").split(",");
/** The part names the rig builds for a choice's slots. */
export const partsOf = (choice: CreatureChoice): string[] =>
  SLOTS.flatMap(([key, , opts]) => chosen(choice, key).flatMap((v) => (opts.find((o) => o[0] === v) || opts[0])[1]));

/** What the rig builds for a choice: the creator's specOf, with its fixed look (the 'v1' ink, big eyes, no cheeks, a smile). */
export function rigSpec(choice: CreatureChoice, over: Partial<RigSpec> = {}): RigSpec {
  return Object.assign({
    body: choice.body, color: choice.color, accent: choice.accent, iris: choice.iris, parts: partsOf(choice),
    eyeStyle: (EYE_OPTS.find((o) => o[0] === choice.eyes) || EYE_OPTS[0])[1],
    level: "v1", eyeScale: 1.35, cheeks: false, marking: null, accessory: null, mouth: "smile",
  } satisfies RigSpec, over);
}

/** The choice's keys in the creator's URL hash (a creature shared as a link, or matched against the reference). */
export const CHOICE_KEYS = ["body", "color", "accent", "iris", "eyes", "ears", "head", "face", "eyewear"] as const;
