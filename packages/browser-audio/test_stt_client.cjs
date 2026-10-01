const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');

function wavBase64(samples,rate=16000,channels=1){
 const data=new Int16Array(samples),bytes=new Uint8Array(44+data.byteLength),view=new DataView(bytes.buffer);
 const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i)};
 text(0,'RIFF');view.setUint32(4,36+data.byteLength,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,data.byteLength,true);
 bytes.set(new Uint8Array(data.buffer),44);
 return Buffer.from(bytes).toString('base64');
}
function setup(){
 let now=3000;const sent=[];
 const context=vm.createContext({
  console,Float32Array,Int16Array,Uint8Array,DataView,ArrayBuffer,DOMException,atob:value=>Buffer.from(value,'base64').toString('binary'),
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
  performance:{now:()=>now},WebSocket:{OPEN:1},Worker:class{},
  window:{dispatchEvent(){},sidevoiceSessionId:()=> 'session-1'},
 });
 vm.runInContext(fs.readFileSync(__dirname+'/stt-client.js','utf8'),context);
 const client=context.window.roomTranscription;client.runtime={model:'model',engine:'transformers-js',accelerator:'webgpu'};
 client.start({socket:{readyState:1,send:value=>sent.push(JSON.parse(value))},language:'auto'});
 return {client,sent,context,setNow:value=>now=value};
}

test('a finished turn from the room is transcribed and answered with its metrics',async()=>{
 const {client,sent,setNow}=setup();let received;
 client._request=async(type,data)=>{received={type,...data};setNow(3250);return {text:'Hola desde el navegador',elapsed_ms:120,accelerator:'webgpu',model:'model'}};
 await client.transcribe({request_id:'req-1',audio_base64:wavBase64(new Array(16000).fill(1000)),language:null});
 assert.equal(received.type,'transcribe');assert.equal(received.model,'model');assert.equal(received.language,'auto');
 assert.equal(new Float32Array(received.audio).length,16000);
 assert.deepEqual(sent.map(item=>item.type),['voice-transcript']);
 assert.equal(sent[0].data.request_id,'req-1');assert.equal(sent[0].data.session_id,'session-1');
 assert.equal(sent[0].data.text,'Hola desde el navegador');
 assert.deepEqual({...sent[0].data.metrics},{audio_ms:1000,recognition_ms:120,request_to_transcript_ms:250,accelerator:'webgpu',model:'model'});
});

test('the room language wins over the browser default and a resampled WAV keeps its duration',async()=>{
 const {client,sent}=setup();let received;
 client._request=async(type,data)=>{received=data;return {text:'Bonjour',elapsed_ms:10,accelerator:'webgpu',model:'model'}};
 await client.transcribe({request_id:'req-2',audio_base64:wavBase64(new Array(48000).fill(0),48000),language:'fr'});
 assert.equal(received.language,'fr');
 assert.equal(new Float32Array(received.audio).length,16000);
 assert.equal(sent[0].data.metrics.audio_ms,1000);
});

test('degenerate symbol repetition is reported instead of reaching the agent',async()=>{
 const {client,sent}=setup();
 client._request=async()=>({text:'* '.repeat(200),elapsed_ms:100,accelerator:'webgpu',model:'model'});
 await client.transcribe({request_id:'req-3',audio_base64:wavBase64(new Array(1600).fill(0))});
 assert.deepEqual(sent.map(item=>item.type),['voice-transcript-error']);
 assert.equal(sent[0].data.request_id,'req-3');
 assert.match(sent[0].data.error,/degenerada/);
});

test('an unprepared model answers with an error rather than silence',async()=>{
 const {client,sent}=setup();client.runtime=null;
 await client.transcribe({request_id:'req-4',audio_base64:wavBase64(new Array(1600).fill(0))});
 assert.deepEqual(sent.map(item=>item.type),['voice-transcript-error']);
 assert.match(sent[0].data.error,/no está preparado/);
});

test('stopping the provider drops an in-flight answer and rejects pending work',async()=>{
 const {client,sent}=setup();
 client._request=()=>new Promise(resolve=>setTimeout(()=>resolve({text:'Tarde',elapsed_ms:1,accelerator:'webgpu',model:'model'}),5));
 const pending=client.transcribe({request_id:'req-5',audio_base64:wavBase64(new Array(1600).fill(0))});
 client.stop();
 await pending;
 assert.deepEqual(sent,[]);
 assert.equal(client.enabled,false);
});

test('switching between the page\'s engine and the native one fails what was waiting instead of leaving it hanging',async()=>{
 const {client,context}=setup();
 const posted=[];
 context.Worker=class{constructor(){this.terminated=false}postMessage(message){posted.push(message)}terminate(){this.terminated=true}};
 context.window.sidevoiceNativeWorkers=context.sidevoiceNativeWorkers={transcription:()=>({postMessage(message){posted.push({native:true,...message})},terminate(){}})};
 client.worker=null;client.native=false;
 const pending=client._request('transcribe',{native:false,audio:new ArrayBuffer(4)});
 const switched=client._request('load',{native:true,model:'m'});
 await assert.rejects(pending,/motor de transcripción/);
 assert.ok(posted.some(message=>message.native&&message.type==='load'),'the native engine got the load');
 client.pending.clear();void switched.catch(()=>{});
});

test('a checked model takes over: the old worker finishes what it was doing, then is let go (sidevoice/sidevoice-core#21)',async()=>{
 const {client}=setup();
 class Fake{constructor(name){this.name=name;this.posted=[];this.terminated=false}postMessage(data){this.posted.push(data)}terminate(){this.terminated=true}}
 const old=new Fake('old'),checked=new Fake('checked');
 client.worker=old;client.native=false;client._listen(old);
 const inFlight=client._request('transcribe',{native:false,model:'whisper-tiny'});
 client.adopt(checked,{model:'whisper-base',engine:'transformers-js',accelerator:'wasm'},false).commit();
 assert.equal(client.runtime.model,'whisper-base');
 assert.equal(old.terminated,false,'a transcription is still running on it');
 const next=client._request('transcribe',{native:false,model:'whisper-base'});
 assert.equal(checked.posted.length,1,'new work goes to the checked worker');
 old.onmessage({data:{id:old.posted[0].id,type:'result',result:{text:'hola'}}});
 assert.equal((await inFlight).text,'hola');
 assert.equal(old.terminated,true,'let go once nothing waits on it');
 checked.onmessage({data:{id:checked.posted[0].id,type:'result',result:{text:'adiós'}}});
 assert.equal((await next).text,'adiós');
 assert.equal(checked.terminated,false);
});

test('a load that is abandoned lets its worker go — download and all — and what waited on it is told',async()=>{
 const {client}=setup();
 class Fake{constructor(){this.posted=[];this.terminated=false}postMessage(d){this.posted.push(d)}terminate(){this.terminated=true}}
 const worker=new Fake();client.worker=worker;client.native=false;client._listen(worker);
 const seen=[];
 const loading=client.prepare({model:'whisper-base',engine:'transformers-js',accelerator:'wasm'},value=>seen.push(value));
 worker.onmessage({data:{id:worker.posted[0].id,type:'progress',progress:{status:'progress',file:'a.onnx',loaded:5,total:9}}});
 assert.deepEqual(seen.map(v=>v.loaded),[5],'the caller hears the engine\'s progress');
 client.abandon();
 await assert.rejects(loading,{name:'AbortError'});
 assert.equal(worker.terminated,true);
 assert.equal(client.worker,null);
});

test('a swap in a call: adopt, stop, then the old worker\'s late answer — the old worker is let go',async()=>{
 const {client}=setup();
 class Fake{constructor(){this.posted=[];this.terminated=0}postMessage(d){this.posted.push(d)}terminate(){this.terminated++}}
 const A=new Fake(),B=new Fake();
 client.worker=A;client.native=false;client._listen(A);
 const pending=client._request('transcribe',{native:false,model:'whisper-tiny'});pending.catch(()=>{});
 client.adopt(B,{model:'whisper-base'},false).commit();
 assert.equal(A.terminated,0,'a transcription is still running on it');
 client.stop();
 assert.equal(A.terminated,1,'clearing what it was doing lets it go');
 A.onmessage({data:{id:A.posted[0].id,type:'result',result:{text:'tarde'}}});
 assert.equal(A.terminated,1,'once');
 assert.equal(client.pending.size,0);
 assert.equal(B.terminated,0);
});
test('an unmatched late answer from a worker no longer in use lets it go',()=>{
 const {client}=setup();
 class Fake{constructor(){this.posted=[];this.terminated=0}postMessage(d){this.posted.push(d)}terminate(){this.terminated++}}
 const A=new Fake(),B=new Fake();
 client.worker=A;client._listen(A);client.retired.add(A);client.worker=B;
 A.onmessage({data:{id:999,type:'result',result:{}}});
 assert.equal(A.terminated,1);
});
test('a swap the call refused is undone: the old worker is back, the new one is let go with what it had',async()=>{
 const {client}=setup();
 class Fake{constructor(){this.posted=[];this.terminated=0}postMessage(d){this.posted.push(d)}terminate(){this.terminated++}}
 const A=new Fake(),B=new Fake();
 client.worker=A;client.native=false;client.runtime={model:'whisper-tiny'};client._listen(A);
 const swap=client.adopt(B,{model:'whisper-base'},false);
 const onB=client._request('transcribe',{native:false});
 swap.restore();
 await assert.rejects(onB,{name:'AbortError'});
 assert.deepEqual([client.worker===A,client.runtime.model,A.terminated,B.terminated],[true,'whisper-tiny',0,1]);
 swap.commit();
 assert.equal(A.terminated,0,'a commit after a restore lets nothing go');
});

test('a preparation that is cancelled ends quietly: no failure is shown, and the keyed cancel is handed on (N03)',async()=>{
 for(const how of ['abandon','native']){
  const events=[];
  const {client,context}=setup();
  context.window.dispatchEvent=event=>events.push(event.detail);
  class Fake{constructor(){this.posted=[]}postMessage(d){this.posted.push(d)}terminate(){}}
  const worker=new Fake();client.worker=worker;client.native=false;client._listen(worker);
  const loading=client.prepare({model:'whisper-base',engine:'sherpa-onnx',accelerator:'cpu'});
  if(how==='abandon'){client.abandon();await assert.rejects(loading,{name:'AbortError'})}
  else{
   worker.onmessage({data:{id:worker.posted[0].id,type:'error',error:'Descarga cancelada.',step:'download',reason:{key:'install_cancelled',message:'cancelled'}}});
   await assert.rejects(loading,error=>error.reason?.key==='install_cancelled');
  }
  assert.ok(!events.some(detail=>detail.phase==='error'),how+': no failure dialog');
  assert.equal(events.at(-1).phase,'hidden',how);
 }
});
