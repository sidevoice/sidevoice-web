const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');

/* native-worker.js against a fake desktop host: the same protocol as the Workers, backed by the app's engine. It is
 * run as the page gets it: bundled by esbuild (build.mjs) with the chunker it shares with the page's voice. */
const BUNDLED=require('esbuild').buildSync({entryPoints:[__dirname+'/native-worker.js'],bundle:true,format:'iife',write:false}).outputFiles[0].text;
function setup(engine){
 const context=vm.createContext({setTimeout,Float32Array,performance:{now:()=>0},Promise,Error,Object,String,globalThis:null});
 context.globalThis=context;
 if(engine)context.__sidevoiceDesktop={host:{nativeEngine:engine}};
 vm.runInContext(BUNDLED,context);
 return context.sidevoiceNativeWorkers;
}
/* The bridge contract (#124 phases 2 and 3): capabilities, installed builds, install (a job: `promise.job`, progress
 * as {job, model, engine, done, total, bytes_per_s}), cancel, load, loaded, unload, memory, transcribe, synthesize —
 * by catalogue model id and engine. No offers and no page ids: the page resolves offers. */
function engine(overrides={}){
 const calls=[],inMemory=[];
 return {calls,inMemory,
  load:async(model,eng,accelerator)=>{calls.push(['load',model,eng,accelerator]);inMemory.push({model,engine:eng,accelerator,since:0,last_used:0});return {load_ms:420}},
  loaded:async()=>inMemory.slice(),
  unload:async(model,eng)=>{calls.push(['unload',model,eng])},
  memory:async()=>({total_mb:16384,available_mb:9000}),
  capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>[{model:'kokoro-82m-v1.0',engine:'sherpa-onnx'}],
  install(model,eng,progress){calls.push(['install',model,eng]);const job='install-1';
   const running=(async()=>{progress({job,model,engine:eng,done:50,total:100,bytes_per_s:null});progress({job,model,engine:eng,done:100,total:100,bytes_per_s:2048})})();
   running.job=job;return running},
  cancel:async job=>{calls.push(['cancel',job]);return true},
  transcribe:async(model,eng,samples,rate,language,accelerator)=>{calls.push(['transcribe',model,eng,samples.length,rate,language,accelerator]);return ' hola '},
  synthesize:async(model,eng,voice,speed,text,accelerator)=>{calls.push(['synthesize',model,eng,voice,speed,text,accelerator]);return {samples:new Float32Array(10),sampleRate:24000}},
  ...overrides};
}
function talk(worker){
 const seen=[];worker.onmessage=({data})=>seen.push(data);
 const until=async type=>{for(let i=0;i<100;i++){const hit=seen.find(m=>m.type===type||m.type==='error');if(hit)return hit;await new Promise(r=>setTimeout(r,1))}throw Error('no '+type)};
 return {seen,until};
}

test('outside the desktop app there is no native engine',()=>{
 const workers=setup(null);
 assert.equal(workers.available(),false);
 assert.equal(workers.transcription(),null);
});

test('transcription: the offer\'s model and engine are installed with progress, then transcribe',async()=>{
 const fake=engine(),worker=setup(fake).transcription(),{seen,until}=talk(worker);
 worker.postMessage({id:2,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu'});
 const ready=await until('ready');
 assert.deepEqual({...ready.runtime},{model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu',cached:false,load_ms:420});
 assert.ok(seen.some(m=>m.type==='progress'&&m.progress.progress===50&&m.progress.loaded===50&&m.progress.total===100));
 assert.ok(seen.some(m=>m.type==='progress'&&m.progress.status==='loading'),'the step after the download is said');
 assert.deepEqual(fake.calls.slice(0,2),[['install','whisper-small','sherpa-onnx'],['load','whisper-small','sherpa-onnx','cpu']],'downloaded, then loaded on the offer\'s accelerator');
 worker.postMessage({id:3,type:'transcribe',audio:new Float32Array(16000).buffer,language:'es'});
 const result=await until('result');
 assert.equal(result.result.text,'hola');
 assert.deepEqual(fake.calls.at(-1),['transcribe','whisper-small','sherpa-onnx',16000,16000,'es','cpu'],'on the offer\'s accelerator');
});

test('transcription: auto language is left to the engine, and a build already on disk is not downloaded',async()=>{
 const fake=engine({installed:async()=>[{model:'whisper-small',engine:'sherpa-onnx'}]}),worker=setup(fake).transcription(),{until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'coreml'});
 assert.equal((await until('ready')).runtime.cached,true);
 worker.postMessage({id:2,type:'transcribe',audio:new Float32Array(10).buffer,language:'auto'});
 await until('result');
 assert.equal(fake.calls.at(-1)[5],'');
 assert.equal(fake.calls.at(-1)[6],'coreml','an Avanzado override reaches the engine');
 assert.ok(!fake.calls.some(c=>c[0]==='install'));
});

test('a load without the build to run says so instead of guessing one',async()=>{
 const worker=setup(engine()).transcription(),{until}=talk(worker);
 worker.postMessage({id:9,type:'load',model:'whisper-small'});
 assert.match((await until('ready')).error,/motor/);
});

test('voice: loads once, speaks a text in the same chunks as the page, then says done',async()=>{
 const fake=engine(),worker=setup(fake).voice(),{seen,until}=talk(worker);
 worker.postMessage({id:1,type:'speak',text:'Hola. ¿Qué tal estás hoy?',voice:'ef_dora',speed:1.1,model:'kokoro-82m-v1.0',engine:'sherpa-onnx',accelerator:'cpu'});
 await until('done');
 assert.deepEqual(seen.filter(m=>m.type==='audio').map(m=>m.text),['Hola.','¿Qué tal estás hoy?']);
 assert.equal(seen.find(m=>m.type==='audio').sampleRate,24000);
 assert.deepEqual(fake.calls.filter(c=>c[0]==='synthesize')[0],['synthesize','kokoro-82m-v1.0','sherpa-onnx','ef_dora',1.1,'Hola.','cpu']);
 assert.ok(!fake.calls.some(c=>c[0]==='install'),'already installed');
});

test('voice: a cancel drops what was not spoken yet',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const fake=engine({synthesize:async()=>{await gate;return {samples:new Float32Array(1),sampleRate:24000}}});
 const worker=setup(fake).voice(),{seen}=talk(worker);
 worker.postMessage({id:1,type:'speak',text:'Uno. Dos. Tres.',voice:'ef_dora',model:'kokoro-82m-v1.0',engine:'sherpa-onnx'});
 await new Promise(r=>setTimeout(r,5));
 worker.postMessage({type:'cancel'});release();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(seen.filter(m=>m.type==='audio').length,0);
 assert.ok(!seen.some(m=>m.type==='done'));
});
test('the native voice cuts a text with the page voice\'s own chunker, and there is only one (F08)',async()=>{
 const {splitText}=await import('./split-text.js');
 const fake=engine(),worker=setup(fake).voice(),{seen,until}=talk(worker);
 const long='palabra '.repeat(60)+'fin. Una frase sin punto';
 worker.postMessage({id:1,type:'speak',text:long,voice:'ef_dora',model:'kokoro-82m-v1.0',engine:'sherpa-onnx',accelerator:'coreml'});
 await until('done');
 assert.deepEqual(seen.filter(m=>m.type==='audio').map(m=>m.text),splitText(long));
 assert.ok(fake.calls.filter(c=>c[0]==='synthesize').every(c=>c[6]==='coreml'),'every chunk on the chosen accelerator');
 for(const file of ['native-worker.js','engine.js','worker.js'])
  assert.doesNotMatch(fs.readFileSync(__dirname+'/'+file,'utf8'),/function splitText/,file+' has no chunker of its own');
});

test('a native refusal {key, message, ...params} is said by its key where the page knows it, else by its own sentence (D06)',async()=>{
 const refusing=refusal=>engine({installed:async()=>{throw refusal}});
 for(const [refusal,said] of [
  [{key:'provider_key_missing',provider:'elevenlabs',message:'ElevenLabs needs an API key before connecting.'},'ElevenLabs necesita una clave de API antes de conectar.'],
  [{key:'engine_package_unavailable',os:'windows',message:'No sherpa-onnx package for windows.'},'No sherpa-onnx package for windows.'],
  [Object.assign(Error('boom'),{key:'place_host_unavailable'}),'Ejecutar modelos en el host aún no está disponible.'],
 ]){
  const worker=setup(refusing(refusal)).transcription(),{until}=talk(worker);
  worker.postMessage({id:1,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu'});
  assert.equal((await until('ready')).error,said);
 }
});

test('a model already in memory on that accelerator is not loaded again; on another one it is (D13)',async()=>{
 const fake=engine({installed:async()=>[{model:'whisper-small',engine:'sherpa-onnx'}]});
 fake.inMemory.push({model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu',since:0,last_used:0});
 const worker=setup(fake).transcription(),{seen,until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu'});
 assert.equal((await until('ready')).runtime.load_ms,0);
 assert.ok(!fake.calls.some(c=>c[0]==='load'));
 seen.length=0;
 worker.postMessage({id:2,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'coreml'});
 assert.equal((await until('ready')).runtime.load_ms,420);
 assert.deepEqual(fake.calls.at(-1),['load','whisper-small','sherpa-onnx','coreml']);
});

test('a failure says the step it happened at and hands on the app\'s refusal (#124 §6)',async()=>{
 const interrupted={key:'download_failed',url:'https://example.com/m.tar.bz2',message:'Could not download https://example.com/m.tar.bz2: reset'};
 const nomemory={key:'model_needs_memory',needed_mb:2500,memory_mb:2048,message:'whisper-large needs 2500 MB of memory; this device has 2048 MB.'};
 for(const [overrides,step,key] of [
  [{install:async()=>{throw interrupted}},'download','download_failed'],
  [{load:async()=>{throw nomemory}},'load','model_needs_memory'],
  [{load:async()=>{throw Error('dlopen failed')}},'load',null],
 ]){
  const worker=setup(engine(overrides)).transcription(),{until}=talk(worker);
  worker.postMessage({id:1,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu'});
  const failed=await until('ready');
  assert.equal(failed.type,'error');
  assert.equal(failed.step,step);
  assert.equal(failed.reason?.key??null,key);
  assert.ok(failed.error);
 }
 const worker=setup(engine({transcribe:async()=>{throw Error('runtime')}})).transcription(),{until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'kokoro-82m-v1.0',engine:'sherpa-onnx',accelerator:'cpu'});
 await until('ready');
 worker.postMessage({id:2,type:'transcribe',audio:new Float32Array(10).buffer,language:'es'});
 assert.equal((await until('result')).step,'run');
});

test('voice: a load on the bridge says how long it took',async()=>{
 const fake=engine(),worker=setup(fake).voice(),{until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'kokoro-82m-v1.0',engine:'sherpa-onnx',accelerator:'cpu'});
 assert.equal((await until('ready')).load_ms,420);
 assert.deepEqual(fake.calls.at(-1),['load','kokoro-82m-v1.0','sherpa-onnx','cpu']);
});

/* An install the app runs for a worker, stopped by the person (sidevoice-desktop#3: cancel(job), and the install
 * rejects with {key: 'install_cancelled'}). */
function stalled(){
 let reject;const cancelled=[];
 const fake=engine({install(model,eng,progress){
  const running=new Promise((_,no)=>{reject=no});running.job='install-7';
  setTimeout(()=>progress({job:'install-7',model,engine:eng,done:3e6,total:8e7,bytes_per_s:4e6}),0);
  return running},
  cancel:async job=>{cancelled.push(job);reject({key:'install_cancelled',message:'The download was cancelled.'});return true}});
 return {fake,cancelled,rejectWith:value=>reject(value)};
}
test('a native download says its job, bytes and the app\'s own speed',async()=>{
 const {fake}=stalled(),worker=setup(fake).transcription(),{seen}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'whisper-base',engine:'sherpa-onnx',accelerator:'cpu'});
 await new Promise(r=>setTimeout(r,10));
 const progress=seen.find(m=>m.type==='progress').progress;
 assert.deepEqual({...progress},{status:'progress',progress:3.75,loaded:3e6,total:8e7,bytes_per_s:4e6,job:'install-7',file:'whisper-base'});
});
test('cancelling, or letting the worker go, cancels the app\'s install job; nothing is said after',async()=>{
 for(const how of ['cancel','terminate']){
  const {fake,cancelled}=stalled(),worker=setup(fake).transcription(),{seen}=talk(worker);
  worker.postMessage({id:1,type:'load',model:'whisper-base',engine:'sherpa-onnx',accelerator:'cpu'});
  await new Promise(r=>setTimeout(r,5));
  if(how==='cancel')worker.postMessage({type:'cancel'});else worker.terminate();
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(cancelled,['install-7'],how);
  assert.ok(!seen.some(m=>m.type==='error'||m.type==='ready'),how+': a cancelled load says nothing more');
  assert.ok(!fake.calls.some(c=>c[0]==='load'),how+': and never loads');
 }
});
test('an install the app cancelled itself fails at the download with its refusal',async()=>{
 const {fake,rejectWith}=stalled(),worker=setup(fake).transcription(),{until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'whisper-base',engine:'sherpa-onnx',accelerator:'cpu'});
 await new Promise(r=>setTimeout(r,5));
 rejectWith({key:'install_cancelled',message:'The download was cancelled.'});
 const failed=await until('ready');
 assert.deepEqual([failed.type,failed.step,failed.reason.key,failed.error],['error','download','install_cancelled','Descarga cancelada.']);
});
test('a cancel with no download running asks the app for nothing',async()=>{
 const fake=engine(),worker=setup(fake).transcription(),{until}=talk(worker);
 worker.postMessage({id:1,type:'load',model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu'});
 await until('ready');
 worker.postMessage({type:'cancel'});worker.terminate();
 assert.ok(!fake.calls.some(c=>c[0]==='cancel'));
});
