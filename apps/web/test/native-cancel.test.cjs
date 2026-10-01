const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
/* Cancel against the desktop app (sidevoice/sidevoice-core#21): the real check (load-and-verify.js) driving the real native
 * worker (native-worker.js, bundled as the page gets it) over a bridge whose install and load are held open, so a
 * cancel can land in each step. The bridge is sidevoice-desktop#3's: install is a job (`promise.job`), cancel(job),
 * load, loaded, unload(model, engine, accelerator). */
const BUNDLE=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../../../packages/browser-audio/native-worker.js')],bundle:true,format:'iife',write:false}).outputFiles[0].text;
const verify=import('../src/services/load-and-verify.js').then(module=>module.verifyDevice);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function bridge(){
 const actions=[],install=deferred(),load=deferred();
 const engine={installed:async()=>[],loaded:async()=>[],
  install(model,name){actions.push(['install',model,name]);const running=install.promise;running.job='install-1';return running},
  cancel:async job=>{actions.push(['cancel',job]);return true},
  load(model,name,accelerator){actions.push(['load',model,name,accelerator]);return load.promise},
  unload:async(model,name,accelerator)=>{actions.push(['unload',model,name,accelerator]);return null},
  transcribe:async()=>'hola'};
 globalThis.__sidevoiceDesktop={host:{nativeEngine:engine}};
 new Function(BUNDLE)();
 return {actions,install,load,workers:globalThis.sidevoiceNativeWorkers};
}
const BUILD={model:'whisper-base',engine:'sherpa-onnx',accelerator:'coreml',native:true};
const settle=()=>new Promise(r=>setTimeout(r,20));
const check=async(workers,signal)=>(await verify)({task:'stt',build:BUILD,open:()=>workers.transcription(),fetchClip:async()=>new ArrayBuffer(0),language:'es',signal});

test('a cancel during the download cancels the app\'s job and never loads, even if the install still finishes',async()=>{
 const {actions,install,workers}=bridge(),controller=new AbortController();
 const result=check(workers,controller.signal);
 await settle();controller.abort();
 const outcome=await result;
 assert.deepEqual([outcome.ok,outcome.cancelled,outcome.loaded],[false,true,false]);
 install.resolve();   // the reviewer's probe: the install completes after the cancel
 await settle();
 assert.deepEqual(actions,[['install','whisper-base','sherpa-onnx'],['cancel','install-1']]);
});
test('a cancel during the load releases exactly that instance, once, even when the load completes late',async()=>{
 const {actions,install,load,workers}=bridge(),controller=new AbortController();
 const result=check(workers,controller.signal);
 install.resolve();await settle();
 assert.deepEqual(actions.at(-1),['load','whisper-base','sherpa-onnx','coreml']);
 controller.abort();
 assert.equal((await result).cancelled,true);
 load.resolve({load_ms:900});await settle();
 assert.deepEqual(actions.filter(([kind])=>kind==='unload'),[['unload','whisper-base','sherpa-onnx','coreml']]);
});
test('a load the page says a stage runs is not released',async()=>{
 const {actions,install,load,workers}=bridge(),controller=new AbortController();
 workers.keeps=build=>build.model==='whisper-base'&&build.accelerator==='coreml';
 const result=check(workers,controller.signal);
 install.resolve();await settle();controller.abort();await result;
 load.resolve({load_ms:1});await settle();
 assert.ok(!actions.some(([kind])=>kind==='unload'));
});
test('a load the app cancelled (an unload landed on it) is a cancel, not a failure',async()=>{
 const {install,load,workers}=bridge();
 const result=check(workers,new AbortController().signal);
 install.resolve();await settle();
 load.reject({key:'load_cancelled',model:'whisper-base',engine:'sherpa-onnx',accelerator:'coreml',message:'unloaded'});
 const outcome=await result;
 assert.deepEqual([outcome.ok,outcome.cancelled,outcome.step],[false,true,'load']);
});

/* The load is done and the worker has queued its `ready`, but the page has not seen it yet when
 * the cancel lands. The instance is still the worker's then, and is released. */
test('a cancel after the load resolved but before its ready reached the page releases that instance (R04)',async()=>{
 const actions=[],load=deferred();
 const engine={installed:async()=>[{model:'whisper-base',engine:'sherpa-onnx'}],loaded:async()=>[],
  load(model,name,accelerator){actions.push(['load',model,name,accelerator]);return load.promise},
  unload:async(model,name,accelerator)=>{actions.push(['unload',model,name,accelerator]);return null},
  cancel:async()=>true,install(){throw Error('not here')},transcribe:async()=>'hola'};
 globalThis.__sidevoiceDesktop={host:{nativeEngine:engine}};new Function(BUNDLE)();
 const workers=globalThis.sidevoiceNativeWorkers,controller=new AbortController();
 const result=check(workers,controller.signal);
 await settle();
 assert.deepEqual(actions,[['load','whisper-base','sherpa-onnx','coreml']]);
 load.resolve({load_ms:5});
 for(let i=0;i<20;i++)await Promise.resolve();   // microtasks only: the worker queues its ready, no timer runs
 controller.abort();
 const outcome=await result;
 await settle();                                   // now the timers: the ready that was queued
 assert.deepEqual([outcome.cancelled,outcome.loaded],[true,false]);
 assert.deepEqual(actions,[['load','whisper-base','sherpa-onnx','coreml'],['unload','whisper-base','sherpa-onnx','coreml']]);
});
test('a ready the page received makes the instance the page\'s: the worker does not release it on a later cancel',async()=>{
 const actions=[];
 const engine={installed:async()=>[{model:'whisper-base',engine:'sherpa-onnx'}],loaded:async()=>[],
  load:async(...args)=>{actions.push(['load',...args]);return {load_ms:5}},unload:async(...args)=>{actions.push(['unload',...args]);return null},
  cancel:async()=>true,install(){throw Error('not here')},transcribe:()=>new Promise(()=>{})};
 globalThis.__sidevoiceDesktop={host:{nativeEngine:engine}};new Function(BUNDLE)();
 const workers=globalThis.sidevoiceNativeWorkers,controller=new AbortController();
 const result=check(workers,controller.signal);
 await settle();
 controller.abort();   // after ready was delivered (the check itself ends either way)
 const outcome=await result;
 await settle();
 assert.equal(outcome.loaded,true,'the page knows it loaded, and releases it itself (discardCandidate)');
 assert.ok(!actions.some(([kind])=>kind==='unload'),'not released twice');
});
