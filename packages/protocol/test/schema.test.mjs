// Every schema here is open to fields it does not list (sidevoice/sidevoice-core#112): a newer version may add an
// optional field to any object, and a reader that refuses it breaks against that version. No object may close itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../schema/', import.meta.url);
const schemas = readdirSync(dir).filter((name) => name.endsWith('.json'));

/** Every place in `node` that closes an object to fields it does not list, as a path. */
function closed(node, path = '$') {
  if (!node || typeof node !== 'object') return [];
  const here = node.additionalProperties === false || node.unevaluatedProperties === false ? [path] : [];
  return here.concat(Object.entries(node).flatMap(([key, value]) => closed(value, path + '.' + key)));
}

test('the schemas are there to check', () => assert.ok(schemas.length > 0));

for (const name of schemas) {
  test(`${name} closes no object to fields it does not list`, () => {
    assert.deepEqual(closed(JSON.parse(readFileSync(new URL(name, dir), 'utf8'))), []);
  });
}
