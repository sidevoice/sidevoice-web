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
/* The bridge contract (#124 phase 2): capabilities, installed builds, install, transcribe, synthesize — by catalogue
 * model id and engine. No offers and no page ids: the page resolves offers itself. */
function engine(overrides={}){
 const calls=[];
 return {calls,
  capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>[{model:'kokoro-82m-v1.0',engine:'sherpa-onnx'}],
  install:async(model,eng,progress)=>{calls.push(['install',model,eng]);progress(50,100);progress(100,100)},
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
 assert.deepEqual({...ready.runtime},{model:'whisper-small',engine:'sherpa-onnx',accelerator:'cpu',cached:false});
 assert.ok(seen.some(m=>m.type==='progress'&&m.progress.progress===50));
 assert.deepEqual(fake.calls[0],['install','whisper-small','sherpa-onnx']);
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
