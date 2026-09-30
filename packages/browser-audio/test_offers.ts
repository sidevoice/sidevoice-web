/* The resolver against sidevoice-core's shared vectors (models.vectors.json), on the shipped catalogue
 * (models.json) and the vectors' own fixture. The core's reference and the desktop's Rust pass the same file. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offers, UnknownPlace, type Capabilities, type Catalog, type Offer } from "./offers.ts";

const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const shared: {
  fixture: Catalog;
  vectors: { name: string; catalog: "shipped" | "fixture"; capabilities: Capabilities; place: string; offers?: Offer[]; error?: string }[];
} = read("./models.vectors.json");
const catalogs = { shipped: read("./models.json") as Catalog, fixture: shared.fixture };

for (const vector of shared.vectors) {
  test(vector.name, () => {
    const catalog = structuredClone(catalogs[vector.catalog]);
    if (vector.error) assert.throws(() => offers(catalog, vector.capabilities, vector.place), UnknownPlace);
    else assert.deepEqual(offers(catalog, vector.capabilities, vector.place), vector.offers);
    assert.deepEqual(catalog, catalogs[vector.catalog], "the catalogue is left as it was");
  });
}

test("the vectors are the core's, with every way of choosing", () => {
  const reasons = new Set(shared.vectors.flatMap((vector) => (vector.offers ?? []).map((offer) => offer.reason.split(": ")[1])));
  assert.equal(reasons.size, 3);
  assert.ok(shared.vectors.some((vector) => vector.error));
});
