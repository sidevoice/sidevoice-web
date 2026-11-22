import { expect, test } from "vitest";
import { ACCESSORY_BUILDERS, EYE_STYLES } from "./accessories.js";
import {
  BODIES, CREATURE_ROLL, EYE_OPTS, FILL, HARMONY, IRIS, PAL, RARE, RATES, SHINY, SLOTS, UNCOMMON,
  creatureFromSeed, creatureStream, harmonyAccent, harmonyIris, hueGap, hueOf, partsOf, rigSpec, rollCreature, tierWeight, weighted,
  type Random, type SlotOption,
} from "./catalogue";

/** A stream for a test: the same draws every run. */
const stream = (seed: string): Random => creatureStream("test:" + seed);

test("the slots are the creator's, with every registered accessory appended to its slot in registration order", () => {
  // As the design reference's creator builds them at load (creator.js, SLOTS and the loop after it).
  const base: [string, string, [string, string[]][]][] = [
    ["ears", "Ears", [["none", []], ["cat", ["cat-ears"]], ["bear", ["bear-ears"]], ["bunny", ["bunny-ears"]], ["horns", ["horns"]]]],
    ["head", "Head", [["none", []], ["leaf", ["sprout"]], ["curl", ["curl"]], ["antennae", ["antenna"]], ["robot", ["robot-bits"]], ["mushroom", ["mushroom-sprout"]], ["party hat", ["party"]], ["cap", ["cap"]], ["star", ["star"]], ["bow", ["bow"]], ["headphones", ["headphones"]]]],
    ["face", "Face", [["none", []], ["muzzle", ["muzzle"]], ["whiskers", ["whiskers"]]]],
    ["eyewear", "Eyewear", [["none", []], ["glasses", ["glasses"]]]],
  ];
  const listed = new Set(base.flatMap((x) => x[2].flatMap((o) => o[1])));
  const EYEWEAR = new Set(["glasses", "monocle", "eyepatch"]);
  for (const [name, a] of Object.entries(ACCESSORY_BUILDERS)) {
    if (listed.has(name)) continue;
    const want = EYEWEAR.has(name) ? "eyewear" : a.slot || "head";
    base.find((x) => x[0] === want)?.[2].push([a.label || name, [name]]);
  }
  expect(SLOTS.map(([key, label, opts]) => [key, label, opts.map(([l, p]) => [l, [...p]])])).toEqual(base);
  expect(SLOTS.find(([key]) => key === "face")?.[3]).toEqual({ multi: true });
  // The eye types: normal and every registered style that is not a reaction.
  expect(EYE_OPTS).toEqual([["normal", null], ...Object.entries(EYE_STYLES).filter(([, v]) => !v.reaction).map(([k, v]) => [v.label || k, k])]);
  // Every option has a tier: the rare and uncommon labels are real options.
  const labels = new Set(SLOTS.flatMap(([, , opts]) => opts.map(([l]) => l)));
  for (const label of [...RARE, ...UNCOMMON]) expect(labels.has(label), label).toBe(true);
});

test("the same identity rolls the same creature, from its own versioned stream", () => {
  expect(CREATURE_ROLL).toBe("creature-v1");
  expect(rollCreature(creatureStream("a thread"))).toEqual(rollCreature(creatureStream("a thread")));
  expect(creatureFromSeed("a thread")).toEqual(rollCreature(creatureStream("a thread")));
  expect(creatureFromSeed("a thread")).toBe(creatureFromSeed("a thread"));
  expect(creatureFromSeed("a thread")).not.toEqual(creatureFromSeed("another thread"));
  const draws = creatureStream("x");
  for (let i = 0; i < 1000; i += 1) { const v = draws(); expect(v >= 0 && v < 1).toBe(true); }
});

test("rarity: the slots fill at their own rates, always with something, and the rare ones stay rare", () => {
  const N = 20_000, all = Array.from({ length: N }, (_, i) => creatureFromSeed("rarity-" + i));
  const share = (f: (c: (typeof all)[number]) => boolean) => all.filter(f).length / N;
  // Never bare: at least one item on every creature.
  expect(all.every((c) => c.ears !== "none" || c.head !== "none" || c.face !== "none" || c.eyewear !== "none")).toBe(true);
  // The slots' own rates (the head a little over its 70%: a bare roll gets a hat).
  const bare = (1 - FILL.ears) * (1 - FILL.head) * (1 - FILL.face) * (1 - FILL.eyewear);
  expect(share((c) => c.ears !== "none")).toBeCloseTo(FILL.ears, 1);
  expect(share((c) => c.head !== "none")).toBeCloseTo(FILL.head + bare, 1);
  expect(share((c) => c.face !== "none")).toBeCloseTo(FILL.face, 1);
  expect(share((c) => c.eyewear !== "none")).toBeCloseTo(FILL.eyewear, 1);
  // Special eyes about 1%, the shiny gold body about 0.5%.
  expect(Math.abs(share((c) => c.eyes !== "normal") - RATES.specialEyes)).toBeLessThan(0.004);
  expect(Math.abs(share((c) => c.color === SHINY) - RATES.shiny)).toBeLessThan(0.003);
  // A rare hat is about a tenth as likely as a common one.
  const heads = (label: string) => all.filter((c) => c.head === label).length;
  expect(heads("royal crown") * 5).toBeLessThan(heads("leaf"));
  expect(heads("wizard hat")).toBeGreaterThan(heads("royal crown"));
  // Every body and every option shows up.
  expect(new Set(all.map((c) => c.body)).size).toBe(BODIES.length);
  for (const [key, , opts] of SLOTS) for (const [label] of opts) expect(all.some((c) => c[key] === label), `${key} ${label}`).toBe(true);
});

test("the tiers weigh common 10, uncommon 4, rare 1", () => {
  expect([tierWeight("leaf"), tierWeight("wizard hat"), tierWeight("royal crown")]).toEqual([10, 4, 1]);
  const opts: SlotOption[] = [["leaf", []], ["wizard hat", []], ["royal crown", []]];
  const counts = new Map<string, number>(), r = stream("tiers");
  for (let i = 0; i < 30_000; i += 1) { const [l] = weighted(opts, r); counts.set(l, (counts.get(l) ?? 0) + 1); }
  expect(counts.get("leaf")! / 30_000).toBeCloseTo(10 / 15, 1);
  expect(counts.get("wizard hat")! / 30_000).toBeCloseTo(4 / 15, 1);
  expect(counts.get("royal crown")! / 30_000).toBeCloseTo(1 / 15, 1);
});

test("harmony: the accent is never the body's own, sits on its harmony's hue, and the iris is at least 50° off the body", () => {
  const neutral = (c: string) => hueOf(c).s < 0.3;
  const kinds = { neutralAccent: 0, total: 0 };
  for (const body of [...PAL, SHINY]) {
    const r = stream("harmony-" + body);
    for (let i = 0; i < 150; i += 1) {
      const accent = harmonyAccent(body, r), iris = harmonyIris(body, r);
      expect(accent).not.toBe(body);
      expect(PAL).toContain(accent);
      expect(IRIS).toContain(iris);
      if (!neutral(body)) expect(hueGap(hueOf(iris).h, hueOf(body).h), `${body} ${iris}`).toBeGreaterThanOrEqual(50);
      // A neutral body takes a saturated accent, unless the 10% neutral accent comes up.
      kinds.total += 1;
      if (neutral(accent)) kinds.neutralAccent += 1;
      // A saturated accent is one of the harmony's picks: the palette colour nearest one of its hues.
      if (!neutral(body) && !neutral(accent)) {
        const B = hueOf(body).h, sat = PAL.filter((c) => c !== body && !neutral(c)), far = sat.filter((c) => hueGap(hueOf(c).h, B) >= 20);
        const near = (pool: string[], off: number) => { const want = (B + off + 360) % 360; return pool.reduce((x, c) => (hueGap(hueOf(c).h, want) < hueGap(hueOf(x).h, want) ? c : x), pool[0]); };
        const allowed = HARMONY.flatMap(([name, , offs]) => offs.map((off) => near(name === "analogous" ? far : sat, off)));
        expect(allowed, `${body} → ${accent}`).toContain(accent);
      }
    }
  }
  expect(kinds.neutralAccent / kinds.total).toBeGreaterThan(0.06);
  expect(kinds.neutralAccent / kinds.total).toBeLessThan(0.2);
  // The shares of the four harmonies: complementary 40%, split 25%, triadic 20%, analogous 15%.
  expect(HARMONY.map(([name, share]) => [name, share])).toEqual([["complementary", 0.4], ["split", 0.25], ["triadic", 0.2], ["analogous", 0.15]]);
});

test("what the rig builds: the creator's spec, its fixed look and the parts of the choice", () => {
  const choice = { body: "bean", color: "#6cc4a4", accent: "#e8826a", iris: "#7a56c0", ears: "cat", head: "straw hat", face: "muzzle,whiskers", eyewear: "monocle", eyes: "tomoe" };
  expect(partsOf(choice)).toEqual(["cat-ears", "straw-hat", "muzzle", "whiskers", "monocle"]);
  expect(rigSpec(choice)).toEqual({
    body: "bean", color: "#6cc4a4", accent: "#e8826a", iris: "#7a56c0", parts: ["cat-ears", "straw-hat", "muzzle", "whiskers", "monocle"], eyeStyle: "tomoe",
    level: "v1", eyeScale: 1.35, cheeks: false, marking: null, accessory: null, mouth: "smile",
  });
  expect(rigSpec({ ...choice, eyes: "normal", ears: "none", head: "none", face: "none", eyewear: "none" })).toMatchObject({ parts: [], eyeStyle: null });
});
