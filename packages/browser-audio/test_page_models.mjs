/* The page's model list is the model catalogue's (page-models.js reading models.json), keyed by the catalogue
 * id a stage saves, in the shapes the engines use: stt-engine.js's MODELS and engine.js's Kokoro. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WHISPER,KOKORO} from './page-models.js';

const catalog=JSON.parse(readFileSync(new URL('./models.json',import.meta.url),'utf8'));
const hex=/^[0-9a-f]{40}$/;
const pageBuild=model=>model.builds.find(b=>b.engine==='transformers-js');

test('every model with a page build is there, by catalogue id and in catalogue order, and nothing else',()=>{
 for(const [family,list] of [['whisper',WHISPER],['kokoro',KOKORO]]){
  const expected=catalog.models.filter(m=>m.family===family&&pageBuild(m)).map(m=>m.id);
  assert.deepEqual(Object.keys(list),expected);
  assert.ok(expected.length>0);
  for(const id of expected)assert.equal(list[id].repository,pageBuild(catalog.models.find(m=>m.id===id)).config.repository);
 }
});

test('each carries a pinned revision, and a dtype for every accelerator it runs on',()=>{
 for(const [id,entry] of [...Object.entries(WHISPER),...Object.entries(KOKORO)]){
  assert.match(entry.revision,hex,id);
  assert.ok(entry.devices.length&&entry.devices.every(d=>['webgpu','wasm'].includes(d)),id);
  assert.deepEqual(Object.keys(entry.dtype).sort(),[...entry.devices].sort(),id);
 }
});

test('a build that needs shader-f16 says so',()=>{
 for(const model of catalog.models.filter(m=>m.family==='whisper'&&pageBuild(m)))
  assert.equal(WHISPER[model.id].requiresFp16,(pageBuild(model).needs||[]).includes('webgpu-f16'));
});
