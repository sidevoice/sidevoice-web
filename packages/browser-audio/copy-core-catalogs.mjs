#!/usr/bin/env node
// Copies the catalogues sidevoice/sidevoice-core owns into this package, byte for byte, for the page's build:
// the voice catalogue (catalog.json), the model catalogue (models.json), the resolver's shared vectors
// (models.vectors.json) and what a model check runs and is judged by (checks/: checks.json and its clips). The core is their one writer; these copies are never edited here, and the core's
// tests/test_catalog_contract.py says whether they still agree (SIDEVOICE_REPOSITORY=<this checkout>).
//
//   node packages/browser-audio/copy-core-catalogs.mjs <sidevoice-core checkout>
import {copyFileSync,existsSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
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
// The checks are a directory: its copy is replaced whole, so a clip the core dropped does not linger here.
const checks=path.join(source,'models','checks');
if(!existsSync(checks)){console.error(`${checks} does not exist: is ${core} a sidevoice-core checkout?`);process.exit(1)}
rmSync(path.join(here,'checks'),{recursive:true,force:true});mkdirSync(path.join(here,'checks'));
for(const name of readdirSync(checks))copyFileSync(path.join(checks,name),path.join(here,'checks',name));
console.log('checks/ ← sidevoice-core models/checks/');
