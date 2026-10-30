import { rng, type Rng } from "../core";
import { KINDS, POLICY, TIER_WEIGHT, type Kind, type Option, type Plan } from "./archetypes";
import type { Spec } from "./kit";
import { rollPalette } from "./palette";
import { BODIES, SLOTS, asMatchable, bodyOf, conflict, hides, matches, partOf, partsIn, slotOf, type Entry, type Matchable } from "./registry";

/* A conversation's identity → its creature (web#280). Every decision draws from a stream of its own, keyed by the
 * whole versioned (identity, decision) tuple (core.ts), in this order:
 *
 *   archetype (and sub-type) → body → [top plan →] eyes → mouth → arms and legs → top, tail, back (shuffled) →
 *   nose, cheeks, food set, one dominant decoration → accessories → palette
 *
 * A part joins only if it fits (no conflict, its requires hold, nothing hides it) and the 40 px budget allows it
 * (noise ≤ 7, protrusions ≤ 2). A creature that comes out invalid is rolled again from its body on, with fresh streams,
 * a bounded number of times; past that it is the archetype's safe core. Nothing invalid is ever returned. */

const excluded = new Set<string>(POLICY.excluded);
/** Accessory zones, from the slots that declare one (`SlotDef.gear`): zone → its slots. The back is structure, not a zone. */
export const ZONES: Record<string, string[]> = {};
for (const s of SLOTS) if (s.gear && s.gear !== "back") (ZONES[s.gear] ??= []).push(s.id);
const noiseOf = (e: Entry) => e.noise ?? slotOf(e.slot)?.noise ?? 0;
const isProtrusion = (e: Entry) => noiseOf(e) >= 2;
/** How often a part comes up where nothing says: its own `weight` when the catalogue sets one (0 retires it), else its tier's. */
const popularity = (e: Entry) => e.weight ?? TIER_WEIGHT[e.rarity === "rare" ? "rare" : e.rarity === "uncommon" ? "uncommon" : "common"];
const isMulti = (slot: string) => !!slotOf(slot)?.multi;
const bodyMatch = (id: string): Matchable & Record<string, unknown> => { const b = bodyOf(id)!; return { ...b, ...asMatchable(b) }; };

/** A weighted pick; `weight` 0 or less never wins. */
function pickWeighted<T>(r: Rng, items: readonly T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((t, i) => t + Math.max(0, weight(i)), 0);
  if (total <= 0) return undefined;
  let x = r.next() * total;
  for (const item of items) if ((x -= Math.max(0, weight(item))) < 0 && weight(item) > 0) return item;
  return [...items].reverse().find((i) => weight(i) > 0);
}

/** The ids a plan offers on this body. */
const allows = (o: Option, body: string) => (!o.bodies || o.bodies.includes(body)) && !o.except?.includes(body);
const offered = (plan: Plan, body: string) => plan.options.filter((o) => allows(o, body));

interface Build {
  kind: Kind;
  body: string;
  chosen: Entry[];
  parts: Record<string, string | string[]>;
  noise: number;
  protrusions: number;
}

const fits = (b: Build, e: Entry): boolean => {
  if (excluded.has(e.key)) return false;
  const body = bodyMatch(b.body);
  if (conflict(e, body) || hides(body as never, e)) return false;
  if (b.chosen.some((k) => k.key === e.key || conflict(e, k) || hides(k, e) || hides(e, k))) return false;
  if (!isMulti(e.slot) && b.chosen.some((k) => k.slot === e.slot)) return false;
  const max = slotOf(e.slot)?.max;
  if (max && b.chosen.filter((k) => k.slot === e.slot).length >= max) return false;
  return (e.requires ?? []).every((ref) => matches(ref, body) || b.chosen.some((k) => matches(ref, k)));
};

/** Adds a part if it fits and, unless `free`, the budget allows it. */
function accept(b: Build, e: Entry | undefined, free = false): boolean {
  if (!e || !fits(b, e)) return false;
  const n = noiseOf(e), p = isProtrusion(e) ? 1 : 0;
  if (!free && (b.noise + n > POLICY.noiseMax || b.protrusions + p > POLICY.protrusionsMax)) return false;
  b.noise += n; b.protrusions += p; b.chosen.push(e);
  b.parts[e.slot] = isMulti(e.slot) ? [...((b.parts[e.slot] as string[] | undefined) ?? []), e.id] : e.id;
  return true;
}

/** Tries weighted candidates until one is accepted (at most 12 tries). */
function tryPick(b: Build, r: Rng, candidates: { e: Entry; w: number }[], free = false): Entry | undefined {
  let pool = candidates;
  for (let t = 0; t < 12 && pool.length; t += 1) {
    const x = pickWeighted(r, pool, (c) => c.w);
    if (!x) return undefined;
    if (accept(b, x.e, free)) return x.e;
    pool = pool.filter((c) => c !== x);
  }
}

const candidatesOf = (slot: string, plan: Plan, body: string, scale: (id: string) => number = () => 1) =>
  offered(plan, body).map((o: Option) => ({ e: partOf(slot, o.id) as Entry, w: o.weight * scale(o.id) })).filter((c) => c.e && c.e.weight !== 0);

/** Accessories: up to POLICY.accessoriesMax, one per zone. */
function accessorize(b: Build, r: Rng, eyes: Entry | undefined, ledFace: boolean) {
  const tags = eyes?.tags ?? [];
  const crowned = b.chosen.some((e) => e.slot === "top" && e.tags?.some((t) => ["tall", "blocks-band", "hat-hidden", "stalks"].includes(t)));
  const oneEye = tags.includes("one-eye"), wantMonocle = oneEye && r.next() < POLICY.monocleOnCyclops, roll = r.next();
  const [none, one] = POLICY.accessories;
  const count = roll < none ? 0 : roll < none + one ? 1 : 2;
  const budget = wantMonocle ? Math.max(1, count) : count;
  const zones = Object.keys(ZONES).filter((z) => (z !== "head" || !crowned) && (z !== "hand" || b.chosen.some((e) => e.tags?.includes("hand"))));
  const used: string[] = [];
  let added = 0;
  for (let n = 0; n < budget && added < POLICY.accessoriesMax && zones.length; n += 1) {
    const free = zones.filter((z) => !used.includes(z));
    if (!free.length) break;
    const zone = n === 0 && wantMonocle ? "face" : free[r.below(free.length)];
    used.push(zone);
    const slot = ZONES[zone][r.below(ZONES[zone].length)];
    let pool = partsIn(slot).filter((e) => !excluded.has(e.key));
    if (slot === "eyewear") {
      if (tags.includes("many-eyes") || ledFace) pool = [];
      else if (oneEye) pool = pool.filter((e) => e.id === "monocle");
      else pool = pool.filter((e) => (r.next() < POLICY.moustache ? e.id === "mustache" : (POLICY.glasses as readonly string[]).includes(e.id)));
    }
    pool = pool.filter((e) => e.rarity !== "rare" || e.weight !== undefined || r.next() < POLICY.rareAccessory);
    if (tryPick(b, r, pool.map((e) => ({ e, w: popularity(e) })))) added += 1;
  }
}

function attempt(identity: string, kind: Kind, n: number): Spec & { family: string; scheme: string } {
  const stream = (name: string) => rng(identity, n ? `${name}#${n}` : name);
  const robot = !!kind.robot;
  const body = pickWeighted(stream("body"), kind.bodies.filter((o) => bodyOf(o.id)), (o) => o.weight)?.id ?? BODIES[0].id;
  const b: Build = { kind, body, chosen: [], parts: {}, noise: 0, protrusions: 0 };
  const bodyM = bodyMatch(body);
  const Rt = stream("top"), Rf = stream("face"), Rs = stream("structure"), Rd = stream("decoration"), Ra = stream("accessories");

  // The top is planned first: one that needs certain eyes (a frog's, eye stalks') narrows the eyes to those.
  const topOptions = candidatesOf("top", kind.top, body).filter((c) => !excluded.has(c.e.key) && !conflict(c.e, bodyM) && (c.e.requires ?? []).filter((x) => !x.startsWith("eyes")).every((x) => matches(x, bodyM)));
  const topPlan = kind.top.p > 0 && Rt.next() < kind.top.p ? pickWeighted(Rt, topOptions, (c) => c.w)?.e : undefined;
  const eyeRequirements = (topPlan?.requires ?? []).filter((x) => x.startsWith("eyes"));

  // Eyes: free. A robot may have a screen or a visor; an organic creature the odd LED dot (and then only dots).
  const screen = new Set<string>(POLICY.screen.eyes), ledEyes = new Set<string>(POLICY.organicLed.eyes);
  const ledDots = !robot && !eyeRequirements.length && Rf.next() < POLICY.organicLed.chance;
  const eyePool = partsIn("eyes").filter((e) => !excluded.has(e.key) && (robot || (ledDots ? ledEyes.has(e.id) : !screen.has(e.id) && !ledEyes.has(e.id)))
    && (e.id !== "lens" || body === POLICY.screen.lensBody) && eyeRequirements.every((x) => matches(x, e)));
  const eyes = tryPick(b, Rf, eyePool.map((e) => ({ e, w: popularity(e) })), true);
  const ledFace = !!eyes && (POLICY.ledFace as readonly string[]).includes(eyes.id);

  // Mouth: the archetype's; a screen mouth only on a robot with a screen face.
  const screenMouths = new Set<string>(POLICY.screen.mouths);
  tryPick(b, Rf, candidatesOf("mouth", kind.mouth, body).filter((c) => !screenMouths.has(c.e.id) || (robot && ledFace)), true);

  // Structure: limbs, then top, tail and back in a random order (so the same slot is not always the one that finds no room).
  const earsAbove = !!topPlan?.tags?.includes("ears");
  for (const slot of ["arms", "legs"] as const) if (Rs.next() < kind[slot].p) tryPick(b, Rs, candidatesOf(slot, kind[slot], body));
  const order = (["top", "tail", "back"] as const).map((s) => ({ s, k: Rs.next() })).sort((x, y) => x.k - y.k).map((x) => x.s);
  for (const slot of order) {
    if (slot === "top") { if (topPlan) accept(b, topPlan); continue; }
    if (Rs.next() >= kind[slot].p) continue;
    tryPick(b, Rs, candidatesOf(slot, kind[slot], body, (id) => (slot === "back" && earsAbove && partOf("back", id)?.tags?.includes("wings") ? 0.25 : 1)));
  }

  // Food has one fixed (top, pattern) set per body.
  if (kind.sets) {
    const set = pickWeighted(Rd, kind.sets[body] ?? [], (s) => s[2]);
    if (set?.[0]) accept(b, partOf("top", set[0]), true);
    if (set?.[1]) accept(b, partOf("pattern", set[1]), true);
  }
  for (const slot of ["nose", "cheeks"] as const) if (Rf.next() < kind[slot].p) tryPick(b, Rf, candidatesOf(slot, kind[slot], body));
  // One dominant decoration: a pattern, else marks, else none.
  const dec = Rd.next();
  if (!kind.sets && dec < kind.pattern.p) tryPick(b, Rd, candidatesOf("pattern", kind.pattern, body));
  else if (!kind.sets && dec < kind.pattern.p + kind.marks.p) tryPick(b, Rd, candidatesOf("marks", kind.marks, body));

  accessorize(b, Ra, eyes, ledFace);

  const has = (slot: string) => !!b.parts[slot];
  const palette = rollPalette(stream("palette"), stream("roles"), { families: kind.families, element: kind.element, present: { arms: has("arms"), legs: has("legs"), tail: has("tail"), back: has("back"), top: has("top") } });
  return { body, parts: b.parts, color: palette.color, shape: identity, name: kind.id, tints: palette.tints, family: palette.family, scheme: palette.scheme };
}

/** Why a creature is not valid (empty: it is). The sampler checks every roll with it; tests check the sampler with it. */
export function problems(spec: Spec, kind?: Kind): string[] {
  const out: string[] = [];
  const body = bodyOf(spec.body);
  if (!body) return [`unknown body "${spec.body}"`];
  const bodyM = bodyMatch(spec.body);
  const entries: Entry[] = [];
  for (const [slot, value] of Object.entries(spec.parts)) {
    const def = slotOf(slot);
    if (!def) { out.push(`unknown slot "${slot}"`); continue; }
    if (!def.multi && typeof value !== "string") out.push(`slot "${slot}" is single but holds a list`);
    for (const id of Array.isArray(value) ? value : [value]) {
      const e = partOf(slot, id);
      if (!e) out.push(`unknown part ${slot}:${id}`);
      else { entries.push(e); if (excluded.has(e.key)) out.push(`excluded part ${e.key}`); }
    }
  }
  for (const s of SLOTS) if (s.required && !entries.some((e) => e.slot === s.id)) out.push(`required slot "${s.id}" is empty`);
  for (const e of entries) {
    if (conflict(e, bodyM)) out.push(`${e.key} conflicts with body ${spec.body}`);
    if (hides(bodyM as never, e)) out.push(`${e.key} is hidden by body ${spec.body}`);
    for (const ref of e.requires ?? []) if (!matches(ref, bodyM) && !entries.some((k) => matches(ref, k))) out.push(`${e.key} requires ${ref}`);
    for (const k of entries) if (k !== e && (conflict(e, k) || hides(e, k))) out.push(`${e.key} clashes with ${k.key}`);
  }
  const noise = entries.reduce((t, e) => t + noiseOf(e), 0), protrusions = entries.filter(isProtrusion).length;
  if (noise > POLICY.noiseMax) out.push(`noise ${noise} > ${POLICY.noiseMax}`);
  if (protrusions > POLICY.protrusionsMax) out.push(`${protrusions} protrusions > ${POLICY.protrusionsMax}`);
  const zoneOf = (slot: string) => Object.keys(ZONES).find((z) => ZONES[z].includes(slot));
  const zones = entries.map((e) => zoneOf(e.slot)).filter(Boolean);
  if (zones.length > POLICY.accessoriesMax) out.push(`${zones.length} accessories`);
  if (new Set(zones).size !== zones.length) out.push("two accessories in one zone");
  const eyeTags = entries.find((e) => e.slot === "eyes")?.tags ?? [];
  const eyewear = entries.find((e) => e.slot === "eyewear");
  if (eyewear && (eyeTags.includes("many-eyes") || (eyeTags.includes("one-eye") && eyewear.id !== "monocle"))) out.push(`${eyewear.id} does not fit the eyes`);
  if (kind) {
    for (const slot of ["arms", "legs"] as const) if (kind[slot].p >= 1 && offered(kind[slot], spec.body).some((o) => partOf(slot, o.id)) && !spec.parts[slot]) out.push(`no ${slot}`);
  }
  return out;
}

/** The archetype's safe core on a body: eyes, mouth, arms and legs, the first option of each that fits. Never fails on a
 * body the archetype declares (a test holds every one to it). */
export function safeCore(kind: Kind, body: string): Spec {
  const b: Build = { kind, body, chosen: [], parts: {}, noise: 0, protrusions: 0 };
  accept(b, partOf("eyes", "two"), true);
  for (const slot of ["mouth", "arms", "legs"] as const) for (const o of offered(kind[slot], body)) if (accept(b, partOf(slot, o.id), true)) break;
  const palette = rollPalette(rng("safe-core", "palette"), rng("safe-core", "roles"), { families: kind.families, element: kind.element, present: { arms: !!b.parts.arms, legs: !!b.parts.legs, tail: false, back: false, top: false } });
  return { body, parts: b.parts, color: palette.color, shape: kind.id, name: kind.id, tints: palette.tints };
}

export interface Rolled { spec: Spec; kind: Kind; attempts: number; family: string; scheme: string; fallback: boolean }

/** The creature of `identity`, with how it came about. `force` pins the kind ("felino", "elemental/fuego") for tooling. */
export function roll(identity: string, force?: string): Rolled {
  const kinds = force ? KINDS.filter((k) => k.id === force || k.archetype === force) : KINDS;
  const kind = pickWeighted(rng(identity, "archetype"), kinds, (k) => k.weight) ?? KINDS[0];
  for (let n = 0; n < POLICY.attempts; n += 1) {
    const { family, scheme, ...spec } = attempt(identity, kind, n);
    if (!problems(spec, kind).length) return { spec, kind, attempts: n + 1, family, scheme, fallback: false };
  }
  const spec = safeCore(kind, kind.bodies.find((o) => bodyOf(o.id))!.id);
  return { spec, kind, attempts: POLICY.attempts, family: "-", scheme: "-", fallback: true };
}

/** The creature a conversation's identity rolls. */
export const specFromSeed = (identity: string): Spec => roll(identity).spec;
