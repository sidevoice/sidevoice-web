import { expect, test } from "vitest";
import { KINDS } from "./engine/bichos/archetypes";
import { SPECIES } from "./species.fixture";

/* Every one of the 94 species of the old catalogue stays reachable, as a sub-type of one archetype: its bodies and its
 * signature parts are options of the kind it is mapped to (species.fixture.ts). What a kind deliberately does not offer
 * is listed here, with its reason. */

/** Signature parts a kind leaves out on purpose (v7/v8 decisions): "<species>: <slot>:<id>". */
const LEFT_OUT = new Set([
  // a robot's arms are the robots' own (`bot`); the stubby `nubs` arms read as a different creature (v7)
  ...["robot", "tele", "orbe", "cabezon", "cupula", "calderita", "dron", "latita"].map((s) => `${s}: arms:nubs`),
  // lop ears read as a dog's on a rabbit (v7); the lent ember tail of the little dragon is a fire's
  "bunny: top:ears-lop", "dragoncito: tail:ember-tail",
  // the tin's round `pill` body is a food's
  "latita: body:pill",
]);

const slotsOf = (kind: (typeof KINDS)[number]) => kind;

test("all 94 species are reachable as a sub-type", () => {
  expect(SPECIES.length).toBe(94);
  const gaps: string[] = [];
  for (const s of SPECIES) {
    const kind = KINDS.find((k) => k.id === s.kind);
    if (!kind) { gaps.push(`${s.id}: no kind "${s.kind}"`); continue; }
    for (const body of s.bodies) if (!LEFT_OUT.has(`${s.id}: body:${body}`) && !kind.bodies.some((o) => o.id === body)) gaps.push(`${s.id}: body ${body} is not one of ${kind.id}'s`);
    for (const [slot, ids] of Object.entries(s.parts)) for (const id of ids) {
      if (LEFT_OUT.has(`${s.id}: ${slot}:${id}`)) continue;
      const plan = slotsOf(kind)[slot as "top"];
      const fromSet = (slot === "top" || slot === "pattern") && Object.values(kind.sets ?? {}).some((sets) => sets.some((x) => x[slot === "top" ? 0 : 1] === id));
      const bodies = s.bodies.filter((b) => plan?.options.some((o) => o.id === id && (!o.bodies || o.bodies.includes(b)) && !o.except?.includes(b)));
      if (!fromSet && bodies.length === 0) gaps.push(`${s.id}: ${slot}:${id} is not offered by ${kind.id} on ${s.bodies.join("/")}`);
    }
  }
  expect(gaps).toEqual([]);
});

test("every kind is some species' kind", () => {
  const mapped = new Set(SPECIES.map((s) => s.kind));
  expect(KINDS.filter((k) => !mapped.has(k.id)).map((k) => k.id)).toEqual([]);
});
