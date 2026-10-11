import { rng } from "../core";
import type { ColorRule, Num, Pool, SlotDef, Spec, Weighted } from "./kit";
import { BODIES, FAMILIES, MEMBERS, PREFIXES, SLOTS, asMatchable, bodyOf, conflict, hides, matches, partOf, partsIn, slotOf, type Entry, type Family, type Matchable, type Member } from "./registry";
import { idsIn, normalizeSpec, present, resolve } from "./spec";

/* A conversation id → a coherent default bicho (docs/catalogue.md §4). Every decision draws from its own salted stream
 * (`rng(seed, "v4:<decision>")`), and weighted picks use rendezvous hashing (each option scores from its own stream),
 * so adding a family, member or part only takes the seeds it wins and moves no other choice.
 *
 * Prefixes: "bicho:<family>/<member>[:<seed>][?slot=id&…]" forces a member (lab rows, showcases); part files register
 * others ("monstruo:<seed>" the old sticker monster, "v3:<seed>" the previous roller). */

export const VERSION = "v4";
const GEAR_ODDS = { none: 0.55, one: 0.38 }; // two items: the rest (0.07)
const RARE_ODDS = 1 / 12, SHINY_ODDS = 1 / 200, CROSS_ODDS = 0.06;
/** Rare gear (star glasses, jetpack, wand) fits nearly any bicho, so it used to win every rare roll that found no rare of
 * the bicho's own: star glasses on 4% of bichos. It now steps in for this share of those rolls only (B14). */
const RARE_GEAR_ODDS = 0.3;
const NOISE_MAX = 7, PROTRUSIONS_MAX = 2;
/** The gear step tries a slot's first few ranked items, then leaves the slot (catalogue §4.1: "re-pick at most twice").
 * Walking the whole list let whatever fits everything win every time the rest was blocked (B14): clips beat hats on every
 * bicho with a tall top, earmuffs beat headphones. */
const GEAR_TRIES = 3;

/** Options ranked by weighted rendezvous: the first is the pick; the rest are the re-picks if it doesn't fit. */
function ranked<T>(seed: string, salt: string, items: T[], key: (t: T) => string, weight: (t: T) => number): T[] {
  return items
    .map((it) => ({ it, w: weight(it), u: rng(seed, `${salt}|${key(it)}`).next() }))
    .filter((x) => x.w > 0)
    .map((x) => ({ it: x.it, score: -Math.log(1 - x.u) / x.w }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.it);
}

/** A Weighted as [id, weight] pairs; bare ids take `fallback(id)`. */
const entries = (w: Weighted, fallback: (id: string) => number): [string, number][] =>
  typeof w === "string" ? [[w, fallback(w)]] : Array.isArray(w) ? w.map((id) => [id, fallback(id)]) : Object.entries(w);
const asPool = (p: Pool | Weighted): Pool => (typeof p === "object" && !Array.isArray(p) && "pick" in p ? (p as Pool) : { pick: p as Weighted });
const partWeight = (slot: string) => (id: string) => {
  const e = partOf(slot, id);
  if (!e) return 0;
  return e.rarity === "rare" ? 0 : e.weight ?? (e.rarity === "uncommon" ? 4 : 10);
};

function numFrom(r: ReturnType<typeof rng>, v: Num | undefined, fallback: Num): number {
  const x = v ?? fallback;
  if (typeof x === "number") return x;
  if (Array.isArray(x)) return r.range(x[0], x[1]);
  return r.pick(x.pick);
}

function rollColor(seed: string, rule: ColorRule | ColorRule[] | undefined): Spec["color"] {
  const r = rng(seed, `${VERSION}:colour`);
  const rules = rule === undefined ? [{}] : Array.isArray(rule) ? rule : [rule];
  let x = r.next() * rules.reduce((t, c) => t + (c.weight ?? 1), 0), c = rules[0];
  for (const each of rules) { x -= each.weight ?? 1; if (x < 0) { c = each; break; } }
  const hue = numFrom(r, c.hue, [0, 360]), sat = numFrom(r, c.sat, [70, 86]), light = numFrom(r, c.light, [56, 64]);
  let spot = numFrom(r, c.spot, { pick: [150, 180, 210, 40] }) % 360;
  // Guards (catalogue §4.4): the spot stays at least 60° round the wheel from the body; berenjena + mustard is the
  // Sidevoice mascot's pair, so a seeded bicho never wears it.
  if (spot < 60) spot = 60; else if (spot > 300) spot = 300;
  const spotHue = (hue + spot) % 360;
  if (hue >= 255 && hue <= 285 && spotHue >= 30 && spotHue <= 48) spot = (spot + 60) % 360;
  return { hue, sat, light, spot };
}

interface Roll { spec: Spec; fixed: Set<string>; optional: string[] }

const has = (spec: Spec): Matchable[] => { const b = bodyOf(spec.body); return [...present(spec), ...(b ? [{ ...b, ...asMatchable(b) }] : [])]; };
/** Can `e` join this spec: no conflict either way, nothing hides it or is hidden by it, its requires hold. */
function fits(spec: Spec, e: Entry): boolean {
  const list = has(spec);
  if (list.some((x) => conflict(e, x as Entry) || hides(x as Entry, e) || hides(e, x))) return false;
  const after = [...list, e];
  return (e.requires ?? []).every((ref) => after.some((x) => matches(ref, x)));
}

function add(roll: Roll, e: Entry, optional = true) {
  const s = slotOf(e.slot)!;
  const cur = idsIn(roll.spec, e.slot);
  roll.spec.parts[e.slot] = s.multi ? [...cur, e.id] : e.id;
  if (optional) roll.optional.push(e.key);
}

/** One open slot: maybe fill it from the pools, taking the first ranked option that fits (among the first `tries`). */
function fillSlot(seed: string, roll: Roll, slot: string, pools: Pool[], salt = `${VERSION}:slot:${slot}`, tries = Infinity): Entry | undefined {
  const def = slotOf(slot);
  if (!def || !pools.length) return;
  if (!def.multi && idsIn(roll.spec, slot).length) return;
  if (def.max && idsIn(roll.spec, slot).length >= def.max) return;
  const p = Math.max(...pools.map((x) => x.p ?? 1));
  if (!rng(seed, salt).chance(p)) return;
  const weights = new Map<string, number>();
  for (const pool of pools) for (const [id, w] of entries(pool.pick, partWeight(slot))) weights.set(id, Math.max(weights.get(id) ?? 0, w));
  // A rare part only comes from the rare roll, whatever weight a pool gives it.
  const options = [...weights].filter(([id]) => { const e = partOf(slot, id); return e && e.rarity !== "rare" && !idsIn(roll.spec, slot).includes(id); });
  for (const [id] of ranked(seed, salt, options, ([id]) => id, ([, w]) => w).slice(0, tries)) {
    const e = partOf(slot, id)!;
    if (fits(roll.spec, e)) { add(roll, e); return e; }
  }
}

/** A member's pools for a slot: its own, those other files added to it, its family's and those added to the family. */
const poolsFor = (m: Member, f: Family | undefined, slot: string): Pool[] =>
  [m.pools?.[slot], ...(m.added?.[slot] ?? []), f?.pools?.[slot], ...(f?.added?.[slot] ?? [])].filter((p): p is Pool | Weighted => p !== undefined).map(asPool);

/** What a family lends to other families' bichos: its own pools, with its cross pools (its own and those other files add
 * with `extend.cross`) replacing them slot by slot. Pools other files add with `extend.pools` are for the family's own
 * members and are not lent (B14): B03's and B04's faces spread through family pools, and lending them crowded out the
 * signatures the cross roll is for (a lent nose or plaster in place of bee wings or a fish tail). A file that wants to
 * lend through a family says so with `extend.cross`. */
function lendable(f: Family): Record<string, Pool[]> {
  const out: Record<string, Pool[]> = {};
  const put = (base: Record<string, Pool | Weighted> | undefined, added: Record<string, (Pool | Weighted)[]> | undefined) => {
    for (const slot of new Set([...Object.keys(base ?? {}), ...Object.keys(added ?? {})])) out[slot] = [base?.[slot], ...(added?.[slot] ?? [])].filter((p): p is Pool | Weighted => p !== undefined).map(asPool);
  };
  put(f.pools, undefined);
  put(f.cross, f.addedCross);
  return out;
}

/** The parts of a slot the gear step and the rare roll may offer (a slot with a `gearTag` only offers parts carrying it). */
const gearParts = (s: SlotDef) => partsIn(s.id).filter((e) => !s.gearTag || (e.tags ?? []).includes(s.gearTag));

/** A fixed entry's part. "a|b" takes the first id that exists. Weighted options (`{ a: 10, b: 3 }`, or options other
 * files added to the slot) pick one by weight, from the slot's own stream; a bare id weighs its part's weight, unless
 * another file's options weigh it themselves (0 retires it: B13 retires the core robot's screen face). */
function fixedPick(seed: string, slot: string, v: string | Record<string, number>, added?: Record<string, number>): Entry | undefined {
  const first = typeof v === "string" ? v.split("|").map((id) => partOf(slot, id)).find(Boolean) : undefined;
  if (typeof v === "string" && !added) return first;
  const weight = (e: Entry) => e.weight ?? (e.rarity === "uncommon" ? 4 : 10);
  const options: [Entry, number][] = [];
  if (first) options.push([first, added?.[first.id] ?? weight(first)]);
  for (const [id, w] of Object.entries({ ...(typeof v === "string" ? {} : v), ...added })) { const e = partOf(slot, id); if (e && e !== first) options.push([e, w]); }
  return ranked(seed, `${VERSION}:fixed:${slot}`, options, ([e]) => e.id, ([, w]) => w)[0]?.[0];
}

/** The v4 roll. `force` pins the member (and overrides parts) for "bicho:" seeds. */
export function rollSeed(seed: string, force?: { family?: string; member?: string; overrides?: Record<string, string> }): Spec {
  const families = FAMILIES.filter((f) => MEMBERS.some((m) => m.family === f.id) && (!force?.family || f.id === force.family));
  const family = ranked(seed, `${VERSION}:family`, families, (f) => f.id, (f) => (force?.family ? 1 : f.weight))[0];
  const members = MEMBERS.filter((m) => m.family === family?.id && (!force?.member || m.id === force.member));
  const member = ranked(seed, `${VERSION}:member:${family?.id}`, members, (m) => m.id, (m) => m.weight ?? 10)[0];
  if (!family || !member) return normalizeSpec({ shape: seed, name: "bicho" });

  const bodies = entries(member.bodies, () => 1).filter(([id]) => bodyOf(id));
  const body = ranked(seed, `${VERSION}:body`, bodies, ([id]) => id, ([, w]) => w)[0]?.[0] ?? BODIES[0].id;
  const roll: Roll = { spec: { body, parts: {}, color: rollColor(seed, member.color ?? family.color), shape: seed, name: member.label }, fixed: new Set(), optional: [] };

  // Fixed parts first: they are the member's signature and are never dropped. "a|b" is a fallback list: the first id
  // that exists wins (a part a later batch adds, with a stand-in until then). Weighted options, the member's own or added
  // by other files (`extend`), pick one by weight.
  for (const [slot, v] of Object.entries(member.fixed ?? {})) for (const ids of Array.isArray(v) ? v : [v]) {
    const e = fixedPick(seed, slot, ids, member.addedFixed?.[slot]);
    if (e) { add(roll, e, false); roll.fixed.add(e.key); } else console.warn(`[bichos] member ${member.id}: fixed "${slot}:${typeof ids === "string" ? ids : Object.keys(ids).join("|")}" does not exist (yet)`);
  }
  // Open slots, in slot order.
  for (const s of SLOTS) fillSlot(seed, roll, s.id, poolsFor(member, family, s.id));
  // Required slots nobody filled: any part that fits.
  for (const s of SLOTS) if (s.required && !idsIn(roll.spec, s.id).length) fillSlot(seed, roll, s.id, [{ pick: partsIn(s.id).map((e) => e.id) }]);

  // Gear (catalogue §4.5): none, one, or two in different regions; never two above the eyes. A slot whose first few items
  // don't fit is left, and the next slot is tried.
  const g = rng(seed, `${VERSION}:gear`).next();
  const count = g < GEAR_ODDS.none ? 0 : g < GEAR_ODDS.none + GEAR_ODDS.one ? 1 : 2;
  const used = new Set(present(roll.spec).map((e) => slotOf(e.slot)?.gear).filter(Boolean));
  const gearSlots = ranked(seed, `${VERSION}:gear:slot`, SLOTS.filter((s) => s.gear), (s) => s.id, (s) => s.gearWeight ?? 1);
  let added = 0;
  for (const s of gearSlots) {
    if (added >= count) break;
    if (used.has(s.gear) || idsIn(roll.spec, s.id).length) continue;
    if (fillSlot(seed, roll, s.id, [{ pick: gearParts(s).map((e) => e.id) }], `${VERSION}:gear:${s.id}`, GEAR_TRIES)) { used.add(s.gear); added += 1; }
  }

  // Cross-family (the Bugsnax effect): one optional slot from another family's pools (its `cross` pools win per slot).
  // Only slots this bicho still has open are lent (a family that lends tops skips a bicho that has one).
  if (rng(seed, `${VERSION}:cross`).chance(CROSS_ODDS)) {
    const open = (s: string) => { const d = slotOf(s); return !!d && !d.required && (d.multi ? !d.max || idsIn(roll.spec, s).length < d.max : !idsIn(roll.spec, s).length); };
    const lend = (f: Family) => Object.fromEntries(Object.entries(lendable(f)).filter(([s]) => open(s)));
    const other = ranked(seed, `${VERSION}:cross:family`, FAMILIES.filter((f) => f.id !== family.id && Object.keys(lend(f)).length), (f) => f.id, (f) => f.weight)[0];
    const pools = other ? lend(other) : {};
    const slots = Object.keys(pools);
    const slot = ranked(seed, `${VERSION}:cross:slot`, slots, (s) => s, () => 1)[0];
    if (other && slot) fillSlot(seed, roll, slot, pools[slot].map((p) => ({ ...p, p: 1 })), `${VERSION}:cross:${slot}`);
  }

  // Rare (1 in 12): a rare part from the member's or family's pools, or rare gear, replaces its slot's pick. When none of
  // the bicho's own rares (its member's and family's) can go on, rare gear steps in only RARE_GEAR_ODDS of the time.
  if (rng(seed, `${VERSION}:rare`).chance(RARE_ODDS)) {
    const pooled = SLOTS.flatMap((s) => poolsFor(member, family, s.id).flatMap((p) => entries(p.pick, () => 1).map(([id]) => partOf(s.id, id))));
    const own = new Set(pooled.filter((e): e is Entry => !!e && e.rarity === "rare"));
    const gear = SLOTS.filter((s) => s.gear).flatMap(gearParts).filter((e) => e.rarity === "rare" && !own.has(e));
    const placed = (e: Entry): Spec | undefined => {
      if (idsIn(roll.spec, e.slot).some((id) => roll.fixed.has(`${e.slot}:${id}`))) return;
      const trial: Spec = { ...roll.spec, parts: { ...roll.spec.parts } };
      if (!slotOf(e.slot)?.multi) delete trial.parts[e.slot];
      return fits(trial, e) ? trial : undefined;
    };
    const withGear = [...own].some((e) => placed(e)) || rng(seed, `${VERSION}:rare:gear`).chance(RARE_GEAR_ODDS);
    for (const e of ranked(seed, `${VERSION}:rare:part`, [...own, ...(withGear ? gear : [])], (x) => x.key, (x) => x.weight ?? 1)) {
      const trial = placed(e);
      if (trial) { roll.spec = trial; add(roll, e); break; }
    }
  }
  if (rng(seed, `${VERSION}:shiny`).chance(SHINY_ODDS)) roll.spec.shiny = true;

  // Noise budget (catalogue §4.3): drop optional picks, last first, until it reads at 28 px. Only picks that help are
  // dropped: never a required slot's (a parrot keeps its beak instead of falling back to a smile), never a noise-0 part
  // (it adds nothing), and while only the protrusions are over, only a protrusion.
  const noise = (e: Entry) => e.noise ?? slotOf(e.slot)?.noise ?? 1;
  for (;;) {
    const ps = present(roll.spec);
    const loud = ps.reduce((t, e) => t + noise(e), 0) > NOISE_MAX, busy = ps.filter((e) => noise(e) >= 2).length > PROTRUSIONS_MAX;
    if (!loud && !busy) break;
    const helps = (key: string) => {
      const e = ps.find((x) => x.key === key);
      return !!e && !slotOf(e.slot)?.required && noise(e) > 0 && (loud || noise(e) >= 2);
    };
    let at = roll.optional.length - 1;
    while (at >= 0 && !helps(roll.optional[at])) at -= 1;
    if (at < 0) break;
    const [key] = roll.optional.splice(at, 1), [slot, id] = key.split(":");
    const left = idsIn(roll.spec, slot).filter((x) => x !== id);
    if (left.length) roll.spec.parts[slot] = slotOf(slot)?.multi ? left : left[0]; else delete roll.spec.parts[slot];
  }

  for (const [slot, id] of Object.entries(force?.overrides ?? {})) {
    if (slot === "body") { if (bodyOf(id)) roll.spec.body = id; continue; }
    if (!slotOf(slot)) continue;
    if (id === "none" || id === "") delete roll.spec.parts[slot];
    else roll.spec.parts[slot] = slotOf(slot)?.multi ? [...idsIn(roll.spec, slot), id] : id;
  }
  const lastOverride = Object.entries(force?.overrides ?? {}).filter(([s, id]) => s !== "body" && id && id !== "none").pop();
  return resolve(roll.spec, lastOverride && `${lastOverride[0]}:${lastOverride[1]}`);
}

/** "bicho:<family>/<member>[:<seed>][?slot=id&…]", or "bicho:<family>[:<seed>]" for any member of the family. */
function bichoSeed(rest: string): Spec {
  const [head, query = ""] = rest.split("?");
  const [path, ...seedParts] = head.split(":");
  const [family, member] = path.split("/");
  const overrides = Object.fromEntries(query.split("&").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
  return rollSeed(seedParts.join(":") || path, { family, member, overrides });
}

export function specFromSeed(seed: string): Spec {
  const s = seed.trim();
  const m = /^([\w-]+):([\s\S]*)$/.exec(s);
  if (m) {
    const key = m[1].toLowerCase();
    if (key === "bicho") return bichoSeed(m[2]);
    const fn = PREFIXES.get(key);
    if (fn) return normalizeSpec({ shape: m[2], ...(fn(m[2]) as object) });
  }
  return rollSeed(s);
}

/** A member rolled with a given seed (the editor's template chips). */
export const memberSpec = (family: string, member: string, seed: string) => rollSeed(seed, { family, member });
