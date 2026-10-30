import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { rng } from "./engine/core";
import { ARCHETYPES, KINDS, POLICY, type Plan } from "./engine/bichos/archetypes";
import { ZONES, problems, roll, safeCore, specFromSeed } from "./engine/bichos/generate";
import { BODIES, SLOTS, bodyOf, partOf } from "./engine/bichos/registry";

/* The creature generator (web#280): the declared data is sound, a roll is deterministic and valid, and the
 * distribution is what the declarations say. */

const PLANS = ["top", "nose", "mouth", "arms", "legs", "tail", "back", "cheeks", "pattern", "marks"] as const;
const identity = (i: number) => createHash("sha256").update(`creature-test-${i}`).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5");
const SAMPLE = 10_000;

describe("declared data", () => {
  test("every body, part and slot a kind names exists", () => {
    const missing: string[] = [];
    for (const k of KINDS) {
      for (const o of k.bodies) if (!bodyOf(o.id)) missing.push(`${k.id}: body ${o.id}`);
      for (const slot of PLANS) for (const o of k[slot].options) {
        if (!partOf(slot, o.id)) missing.push(`${k.id}: ${slot}:${o.id}`);
        for (const b of [...(o.bodies ?? []), ...(o.except ?? [])]) if (!bodyOf(b)) missing.push(`${k.id}: ${slot}:${o.id}@${b}`);
      }
      for (const [body, sets] of Object.entries(k.sets ?? {})) {
        if (!bodyOf(body)) missing.push(`${k.id}: set body ${body}`);
        for (const [top, pattern] of sets) { if (top && !partOf("top", top)) missing.push(`${k.id}: set top ${top}`); if (pattern && !partOf("pattern", pattern)) missing.push(`${k.id}: set pattern ${pattern}`); }
      }
    }
    for (const ref of [...POLICY.excluded, ...POLICY.glasses.map((g) => `eyewear:${g}`), ...POLICY.organicLed.eyes.map((e) => `eyes:${e}`), ...POLICY.screen.eyes.map((e) => `eyes:${e}`), ...POLICY.screen.mouths.map((e) => `mouth:${e}`), ...POLICY.ledFace.map((e) => `eyes:${e}`)]) {
      const [slot, id] = ref.split(":");
      if (!partOf(slot, id)) missing.push(`policy: ${ref}`);
    }
    expect(missing).toEqual([]);
  });

  test("weights are positive, ids unique, no excluded part, probabilities in range", () => {
    const bad: string[] = [];
    for (const k of KINDS) {
      if (!(k.weight > 0)) bad.push(`${k.id}: weight`);
      if (!k.families && !k.element) bad.push(`${k.id}: no colour`);
      const ids = k.bodies.map((o) => o.id);
      if (new Set(ids).size !== ids.length) bad.push(`${k.id}: duplicate body`);
      for (const slot of PLANS) {
        const plan: Plan = k[slot];
        if (plan.p < 0 || plan.p > 1) bad.push(`${k.id}: ${slot}.p`);
        if (plan.p > 0 && !plan.options.length && !(k.sets && (slot === "top" || slot === "pattern"))) bad.push(`${k.id}: ${slot} has a chance but no options`);
        const seen = plan.options.map((o) => `${o.id}@${o.bodies?.join("|") ?? ""}`);
        if (new Set(seen).size !== seen.length) bad.push(`${k.id}: ${slot} lists an option twice`);
        for (const o of plan.options) {
          if (!(o.weight > 0)) bad.push(`${k.id}: ${slot}:${o.id} weight`);
          if ((POLICY.excluded as readonly string[]).includes(`${slot}:${o.id}`)) bad.push(`${k.id}: lists excluded ${slot}:${o.id}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test("every body has a valid safe core in every kind that declares it, and every body is used by some kind", () => {
    const bad: string[] = [];
    const used = new Set<string>();
    for (const k of KINDS) for (const o of k.bodies) {
      used.add(o.id);
      const issues = problems(safeCore(k, o.id), k);
      if (issues.length) bad.push(`${k.id}/${o.id}: ${issues.join("; ")}`);
    }
    expect(bad).toEqual([]);
    expect(BODIES.filter((b) => !used.has(b.id)).map((b) => b.id)).toEqual([]);
  });

  test("an option limited to bodies is offered somewhere it can go, and a plan with p = 1 has an option on every body", () => {
    const bad: string[] = [];
    for (const k of KINDS) for (const slot of PLANS) {
      const plan = k[slot];
      for (const o of plan.options) if (o.bodies && !o.bodies.some((b) => k.bodies.some((kb) => kb.id === b))) bad.push(`${k.id}: ${slot}:${o.id} fits none of its bodies`);
      if (plan.p >= 1 && plan.options.length) for (const kb of k.bodies) if (!plan.options.some((o) => (!o.bodies || o.bodies.includes(kb.id)) && !o.except?.includes(kb.id))) bad.push(`${k.id}: ${slot} has nothing for body ${kb.id}`);
    }
    expect(bad).toEqual([]);
  });

  test("every archetype and sub-type is one kind, and the weights of an archetype's sub-types add up to its own", () => {
    for (const a of ARCHETYPES) {
      const kinds = KINDS.filter((k) => k.archetype === a.id);
      expect(kinds.length).toBe(Object.keys(a.subs ?? { one: 1 }).length);
      expect(kinds.reduce((t, k) => t + k.weight, 0)).toBeCloseTo(a.weight, 6);
    }
    expect(new Set(KINDS.map((k) => k.id)).size).toBe(KINDS.length);
  });
});

describe("a roll", () => {
  test("is deterministic: the same identity is the same spec", () => {
    for (let i = 0; i < 200; i += 1) expect(specFromSeed(identity(i))).toEqual(specFromSeed(identity(i)));
  });

  test("is valid, within budget, with the accessory rules, over a sample of identities", { timeout: 60_000 }, () => {
    const issues: string[] = [];
    let fallbacks = 0;
    const attempts: Record<number, number> = {};
    for (let i = 0; i < SAMPLE; i += 1) {
      const r = roll(identity(i));
      attempts[r.attempts] = (attempts[r.attempts] ?? 0) + 1;
      if (r.fallback) fallbacks += 1;
      for (const p of problems(r.spec, r.kind)) issues.push(`${identity(i)} ${r.kind.id}: ${p}`);
      const eyes = r.spec.parts.eyes as string;
      if (["hollow", "three", "four", "sleepy"].includes(eyes)) issues.push(`${identity(i)}: eyes ${eyes}`);
      if ("pins" in r.spec.parts || r.spec.parts.cheeks === "pouches") issues.push(`${identity(i)}: pins or pouches`);
    }
    expect(issues.slice(0, 10)).toEqual([]);
    expect(fallbacks).toBeLessThan(SAMPLE * 0.002);
    // most rolls are valid the first time: the backtracking is a safety net, not the generator
    expect(attempts[1] / SAMPLE).toBeGreaterThan(0.97);
  });
});

const ONE = SAMPLE;
const rolls = (() => { const cache: ReturnType<typeof roll>[] = []; return () => { if (!cache.length) for (let i = 0; i < ONE; i += 1) cache.push(roll(identity(i))); return cache; }; })();
const share = (n: number) => n / ONE;
const inkHex = (hex: string) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (h: string) => { const v = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  return (lum(hex) + 0.05) / (lum("#1b1428") + 0.05);
};

describe("distribution", () => {
  test("every kind comes up, near the share its weight gives it", { timeout: 60_000 }, () => {
    const total = KINDS.reduce((t, k) => t + k.weight, 0), seen = new Map<string, number>();
    for (const r of rolls()) seen.set(r.kind.id, (seen.get(r.kind.id) ?? 0) + 1);
    const off: string[] = [];
    for (const k of KINDS) {
      const want = (k.weight / total) * ONE, got = seen.get(k.id) ?? 0;
      if (Math.abs(got - want) > Math.max(5 * Math.sqrt(want), want * 0.15)) off.push(`${k.id}: ${got} of ~${Math.round(want)}`);
    }
    expect(off).toEqual([]);
    if (process.env.AVATAR_REPORT) console.info(distributionReport());
  });

  test("eyes: LED dots only now and then on an organic creature, screens and visors only on robots, none of the excluded", () => {
    let organic = 0, dots = 0;
    for (const r of rolls()) {
      const eyes = r.spec.parts.eyes as string;
      if (POLICY.screen.eyes.includes(eyes as never)) expect(r.kind.robot, `${eyes} on ${r.kind.id}`).toBe(true);
      if (!r.kind.robot) { organic += 1; if (POLICY.organicLed.eyes.includes(eyes as never)) dots += 1; }
    }
    expect(dots / organic).toBeGreaterThan(0.015);
    expect(dots / organic).toBeLessThan(0.04);
  });

  test("accessories: none, one or two, about as many as asked; a one-eyed creature that wears eyewear wears a monocle, and often does", () => {
    const counts = [0, 0, 0];
    let cyclops = 0, monocles = 0;
    for (const r of rolls()) {
      const n = Object.values(ZONES).flat().filter((s) => r.spec.parts[s]).length;
      counts[n] += 1;
      if (r.spec.parts.eyes === "cyclops") { cyclops += 1; if (r.spec.parts.eyewear === "monocle") monocles += 1; else expect(r.spec.parts.eyewear).toBeUndefined(); }
    }
    expect(share(counts[0])).toBeGreaterThan(0.3); // the budget plus what finds no room
    expect(share(counts[2])).toBeGreaterThan(0.05);
    expect(share(counts[2])).toBeLessThan(0.22);
    expect(monocles / cyclops).toBeGreaterThan(0.3);
  });

  test("budgets: noise ≤ 7 and ≤ 2 protrusions everywhere, and the typical creature is well inside", () => {
    let max = 0, sum = 0;
    for (const r of rolls()) {
      const noise = Object.entries(r.spec.parts).flatMap(([slot, v]) => (Array.isArray(v) ? v : [v]).map((id) => partOf(slot, id)!)).reduce((t, e) => t + (e.noise ?? SLOTS.find((s) => s.id === e.slot)?.noise ?? 0), 0);
      max = Math.max(max, noise); sum += noise;
    }
    expect(max).toBeLessThanOrEqual(POLICY.noiseMax);
    expect(sum / ONE).toBeLessThan(5.5);
  });

  test("colour: schemes at their weights, every body colour and tint legible against the ink, arms and legs alike", () => {
    const schemes = new Map<string, number>();
    const dim: string[] = [];
    for (const r of rolls()) {
      schemes.set(r.scheme, (schemes.get(r.scheme) ?? 0) + 1);
      const t = r.spec.tints ?? {};
      for (const [k, v] of Object.entries(t)) if (/-body$|^spot$/.test(k) && k !== "spot" && inkHex(v) < 3.5) dim.push(`${k} ${v}`);
      if (r.spec.parts.arms && r.spec.parts.legs && t["arms-body"] !== t["legs-body"]) dim.push(`arms ${t["arms-body"]} legs ${t["legs-body"]}`);
    }
    expect(dim.slice(0, 5)).toEqual([]);
    for (const [scheme, w] of [["analogous", 34], ["complementary", 24], ["split", 14], ["triadic", 6], ["tonal", 22]] as const) expect(Math.abs(share(schemes.get(scheme) ?? 0) * 100 - w)).toBeLessThan(2.5);
  });

  test("elementals: each sub-type has many bodies, crests, tails, arms and legs, not one look", { timeout: 60_000 }, () => {
    const poor: string[] = [];
    for (const kind of KINDS.filter((k) => k.archetype === "elemental")) {
      const sample = Array.from({ length: 300 }, (_, i) => roll(`elemental-variety-${i}`, kind.id).spec);
      const distinct = (pick: (s: (typeof sample)[number]) => unknown) => new Set(sample.map((s) => JSON.stringify(pick(s)))).size;
      const stats = { bodies: distinct((s) => s.body), tops: distinct((s) => s.parts.top), tails: distinct((s) => s.parts.tail), arms: distinct((s) => s.parts.arms), legs: distinct((s) => s.parts.legs), looks: distinct((s) => [s.body, s.parts.top, s.parts.tail, s.parts.arms, s.parts.legs]) };
      if (stats.bodies < 3 || stats.tops < 3 || stats.tails < 2 || stats.arms < 2 || stats.legs < 2 || stats.looks < 30) poor.push(`${kind.id}: ${JSON.stringify(stats)}`);
    }
    expect(poor).toEqual([]);
  });
});

describe("the seed", () => {
  // Pairs of conversation ids whose FNV-1a hash collided in the 2026-10-29 audit (research/creature-randomness): under the
  // old 32-bit seed each pair drew the same creature, background and desk.
  const COLLIDING = [
    ["ebe1a248-5895-45d9-9629-ca10ff2f2a55", "a57530c4-0730-49bd-875e-e7153e0654db"],
    ["cf23efc9-f07f-41b0-98a9-5871cd4cb86a", "53f8bd76-992a-4c40-b561-1e5c4d9f9eea"],
    ["46a45497-70dc-4511-b4ad-c83e5c3458d3", "5c61296f-6e3b-46b9-b47d-d8b4b7ab9d8e"],
    ["78c3fd82-fc10-47bd-aa08-5d2515d1bbbf", "ba27cca4-2e68-4492-a6fe-5b6d07ca9cee"],
    ["0bdd65f6-bdbc-4ce3-8f05-558360083970", "e65ed2da-bd18-4c98-b68b-e99701151128"],
    ["4729eb85-db6a-44a5-abf3-90ce5d51584d", "766d716b-73bc-4219-a472-a747e5fdc69c"],
  ];
  test("identities that collided under the old 32-bit hash draw different streams and different creatures", () => {
    for (const [a, b] of COLLIDING) {
      expect(rng(a, "archetype").uint32()).not.toBe(rng(b, "archetype").uint32());
      expect(specFromSeed(a)).not.toEqual(specFromSeed(b));
    }
  });

  test("no two of a sample of identities share a stream (every first draw of every decision differs)", { timeout: 60_000 }, () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i += 1) {
      const r = rng(identity(i), "archetype");
      seen.add(`${r.uint32()}.${r.uint32()}`);
    }
    expect(seen.size).toBe(20_000);
  });
});

/** The table a human reads: kinds, bodies, eyes, schemes, families, fallbacks. */
function distributionReport(): string {
  const count = (pick: (r: ReturnType<typeof roll>) => string) => { const m = new Map<string, number>(); for (const r of rolls()) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${(share(n) * 100).toFixed(1)}%`).join(", "); };
  return [
    `kinds: ${count((r) => r.kind.id)}`, `bodies: ${count((r) => r.spec.body)}`, `eyes: ${count((r) => r.spec.parts.eyes as string)}`,
    `schemes: ${count((r) => r.scheme)}`, `families: ${count((r) => r.family)}`, `attempts: ${count((r) => String(r.attempts))}`, `fallbacks: ${rolls().filter((r) => r.fallback).length}`,
  ].join("\n");
}
