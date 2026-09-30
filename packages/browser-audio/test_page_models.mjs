/* The page's model list is the model catalogue's (page-models.js reading models.json), in the shapes the
 * engines use: stt-engine.js's MODELS and engine.js's Kokoro. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WHISPER,KOKORO} from './page-models.js';

const catalog=JSON.parse(readFileSync(new URL('./models.json',import.meta.url),'utf8'));
const hex=/^[0-9a-f]{40}$/;

test('every Whisper model with a page build is offered, in catalogue order, and nothing else',()=>{
 const expected=catalog.models.filter(m=>m.family==='whisper'&&m.builds.some(b=>b.engine==='transformers-js')).map(m=>m.builds.find(b=>b.engine==='transformers-js').config.repository);
 assert.deepEqual(Object.keys(WHISPER),expected);
 assert.ok(expected.length>0);
});

test('each carries a pinned revision, and a dtype for every device it runs on',()=>{
 for(const [repository,entry] of [...Object.entries(WHISPER),[KOKORO.repository,KOKORO]]){
  assert.match(entry.revision,hex,repository);
  assert.ok(entry.devices.length&&entry.devices.every(d=>['webgpu','wasm'].includes(d)),repository);
  assert.deepEqual(Object.keys(entry.dtype).sort(),[...entry.devices].sort(),repository);
 }
});

test('a build that needs shader-f16 says so, as MODELS always has',()=>{
 for(const model of catalog.models.filter(m=>m.family==='whisper')){
  const build=model.builds.find(b=>b.engine==='transformers-js');
  assert.equal(WHISPER[build.config.repository].requiresFp16,(build.needs||[]).includes('webgpu-f16'));
 }
});

test('the voice is Kokoro, on both page devices',()=>{
 assert.equal(KOKORO.label,catalog.models.find(m=>m.family==='kokoro').label);
 assert.deepEqual(KOKORO.devices,['webgpu','wasm']);
});
