const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
/* A page voice that fails to load on WebGPU falls back to WASM on the check's own load, and both passes
 * speak on WASM. The real voice worker (packages/browser-audio/worker.js) with only its engine faked: WebGPU
 * initialisation fails, WASM succeeds, and every synthesis says which accelerator it ran on. */
const FAKE_ENGINE=`
 export const log=[];let current=null;
 export async function initialize(id,accelerator){log.push(['initialize',accelerator]);if(accelerator==='webgpu')throw Error('GPU device lost');current=accelerator;return accelerator}
 export async function synthesize(text){log.push(['synthesize',current]);const samples=new Float32Array(24000*2.5);for(let i=0;i<samples.length;i++)samples[i]=.3*Math.sin(i/7);return {samples,sampleRate:24000,phonemes:''}}
 globalThis.__engineLog=log;`;
const BUNDLE=require('esbuild').build({entryPoints:[path.join(__dirname,'../../../packages/browser-audio/worker.js')],bundle:true,format:'iife',write:false,
 plugins:[{name:'fake-engine',setup(build){build.onResolve({filter:/\/engine\.js$/},()=>({path:'fake-engine',namespace:'fake'}));build.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:FAKE_ENGINE,loader:'js'}))}}]}).then(result=>result.outputFiles[0].text);
const verify=import('../src/services/load-and-verify.js').then(module=>module.verifyDevice);

async function voiceWorker(){
 const bundle=await BUNDLE;
 // A Worker as the page sees it: messages cross asynchronously, both ways.
 const scope={postMessage:data=>setTimeout(()=>worker.onmessage?.({data}),0)};
 const worker={onmessage:null,onerror:null,terminated:false,postMessage:data=>setTimeout(()=>scope.onmessage({data}),0),terminate(){this.terminated=true}};
 globalThis.self=scope;new Function(bundle)();
 return worker;
}
test('a voice whose WebGPU load fails is checked on WASM, both passes on WASM, and the resolved accelerator is reported',async()=>{
 const worker=await voiceWorker(),sent=[];const post=worker.postMessage;worker.postMessage=data=>{sent.push(data);post(data)};
 const result=await (await verify)({task:'tts',build:{model:'kokoro-82m-v1.0',engine:'transformers-js',accelerator:'webgpu',native:false,fallback:'wasm'},
  open:()=>worker,fetchClip:async()=>new ArrayBuffer(0),language:'es',voice:'ef_dora',speed:1,download:false});
 assert.equal(sent[0].type,'load');
 assert.equal(sent[0].fallback,'wasm','the fallback travels with the load itself');
 assert.equal(result.ok,true,JSON.stringify(result.reason));
 assert.equal(result.passes.length,2);
 assert.equal(result.runtime.accelerator,'wasm','what it really runs on, for Diagnóstico');
 const log=globalThis.__engineLog;
 assert.deepEqual(log.filter(([kind])=>kind==='initialize').map(([,on])=>on),['webgpu','wasm']);
 assert.ok(log.filter(([kind])=>kind==='synthesize').length>=2);
 assert.ok(log.filter(([kind])=>kind==='synthesize').every(([,on])=>on==='wasm'),'every pass speaks on WASM');
});
