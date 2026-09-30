#!/usr/bin/env node
// Copies the catalogues sidevoice/sidevoice-core owns into this package, byte for byte, for the page's build:
// the voice catalogue (catalog.json), the model catalogue (models.json) and the resolver's shared vectors
// (models.vectors.json). The core is their one writer; these copies are never edited here, and the core's
// tests/test_catalog_contract.py says whether they still agree (SIDEVOICE_REPOSITORY=<this checkout>).
//
//   node packages/browser-audio/copy-core-catalogs.mjs <sidevoice-core checkout>
import {copyFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const core=process.argv[2];
if(!core){console.error('usage: node copy-core-catalogs.mjs <sidevoice-core checkout>');process.exit(2)}
const source=path.join(core,'src','sidevoice_core');
const copies={'pipeline/catalog.json':'catalog.json','models/catalog.json':'models.json','models/vectors.json':'models.vectors.json'};
for(const [from,to] of Object.entries(copies)){
 if(!existsSync(path.join(source,from))){console.error(`${path.join(source,from)} does not exist: is ${core} a sidevoice-core checkout?`);process.exit(1)}
 copyFileSync(path.join(source,from),path.join(here,to));
 console.log(`${to} ← sidevoice-core ${from}`);
}
