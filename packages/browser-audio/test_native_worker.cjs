const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');

/* native-worker.js against a fake desktop host: the same protocol as the Workers, backed by the app's engine. */
function setup(engine){
 const context=vm.createContext({setTimeout,Float32Array,performance:{now:()=>0},Promise,Error,Object,String,globalThis:null});
 context.globalThis=context;
 if(engine)context.__sidevoiceDesktop={host:{nativeEngine:engine}};
 vm.runInContext(fs.readFileSync(__dirname+'/native-worker.js','utf8'),context);
 return context.sidevoiceNativeWorkers;
}
function engine(overrides={}){
 const calls=[];
 const offers=[{model:'whisper-small',engine:'sherpa-onnx',task:'stt',label:'Whisper small',installed:false},
  {model:'kokoro-82m-v1.0',engine:'sherpa-onnx',task:'tts',label:'Kokoro',installed:true}];
 return {calls,
  available:async()=>({offers,pageIds:{'onnx-community/whisper-small':'whisper-small','onnx-community/Kokoro-82M-v1.0-ONNX':'kokoro-82m-v1.0'}}),
  install:async(model,eng,progress)=>{calls.push(['install',model,eng]);progress(50,100);progress(100,100)},
  transcribe:async(model,samples,rate,language)=>{calls.push(['transcribe',model,samples.length,rate,language]);return ' hola '},
  synthesize:async(model,voice,speed,text)=>{calls.push(['synthesize',model,voice,speed,text]);return {samples:new Float32Array(10),sampleRate:24000}},
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

test('transcription: the page model maps to the catalog, downloads with progress, and transcribes',async()=>{
 const fake=engine(),worker=setup(fake).transcription(),{seen,until}=talk(worker);
 worker.postMessage({id:1,type:'capabilities'});
 assert.deepEqual([...(await until('capabilities')).capabilities.models],['onnx-community/whisper-small']);
 worker.postMessage({id:2,type:'load',model:'onnx-community/whisper-small',device:'native'});
 const ready=await until('ready');
 assert.equal(ready.runtime.device,'native');
 assert.ok(seen.some(m=>m.type==='progress'&&m.progress.progress===50));
 assert.deepEqual(fake.calls[0],['install','whisper-small','sherpa-onnx']);
 worker.postMessage({id:3,type:'transcribe',audio:new Float32Array(16000).buffer,model:'onnx-community/whisper-small',language:'es'});
 const result=await until('result');
 assert.equal(result.result.text,'hola');
 assert.deepEqual(fake.calls.at(-1),['transcribe','whisper-small',16000,16000,'es']);
});

test('transcription: auto language is left to the engine, and an unknown model says so',async()=>{
 const fake=engine(),worker=setup(fake).transcription(),{until}=talk(worker);
 worker.postMessage({id:1,type:'transcribe',audio:new Float32Array(10).buffer,model:'onnx-community/whisper-small',language:'auto'});
 await until('result');
 assert.equal(fake.calls.at(-1)[4],'');
 const other=setup(engine()).transcription(),talked=talk(other);
 other.postMessage({id:9,type:'load',model:'onnx-community/whisper-large-v3-turbo'});
 assert.match((await talked.until('ready')).error,/nativa/);
});

test('voice: loads once, speaks a text in the same chunks as the page, then says done',async()=>{
 const fake=engine(),worker=setup(fake).voice(),{seen,until}=talk(worker);
 worker.postMessage({id:1,type:'speak',text:'Hola. ¿Qué tal estás hoy?',voice:'ef_dora',speed:1.1});
 await until('done');
 assert.deepEqual(seen.filter(m=>m.type==='audio').map(m=>m.text),['Hola.','¿Qué tal estás hoy?']);
 assert.equal(seen.find(m=>m.type==='audio').sampleRate,24000);
 assert.deepEqual(fake.calls.filter(c=>c[0]==='synthesize')[0],['synthesize','kokoro-82m-v1.0','ef_dora',1.1,'Hola.']);
 assert.ok(!fake.calls.some(c=>c[0]==='install'),'already installed');
});

test('voice: a cancel drops what was not spoken yet',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const fake=engine({synthesize:async()=>{await gate;return {samples:new Float32Array(1),sampleRate:24000}}});
 const worker=setup(fake).voice(),{seen}=talk(worker);
 worker.postMessage({id:1,type:'speak',text:'Uno. Dos. Tres.',voice:'ef_dora'});
 await new Promise(r=>setTimeout(r,5));
 worker.postMessage({type:'cancel'});release();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(seen.filter(m=>m.type==='audio').length,0);
 assert.ok(!seen.some(m=>m.type==='done'));
});
test('the chunks are the in-page voice\'s own (engine.js splitText)',()=>{
 const source=fs.readFileSync(__dirname+'/engine.js','utf8');
 const body=source.match(/export function splitText\(text,limit=160\)\{\n([^\n]*)\n/)[1];
 const theirs=new Function('text','limit=160',body);
 const ours=setup(null).splitText;
 const long='palabra '.repeat(60)+'fin.';
 for(const text of ['Hola. ¿Qué tal estás hoy?','Una frase sin punto','Uno; dos: tres! cuatro?',long])
  assert.deepEqual([...ours(text)],theirs(text),'native-worker.js splitText drifted from engine.js: '+text.slice(0,30));
});
