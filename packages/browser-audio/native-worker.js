import {splitText} from './split-text.js';
import {refusalText} from './refusals.js';
/* The desktop app's native engine behind the same message protocol as this package's workers, so the
 * transcription and voice clients do not change: a build whose engine runs natively gets one of these instead of
 * a Web Worker. The engine is the app's (`window.__sidevoiceDesktop.host.nativeEngine`, the bridge contract of
 * rubasace/sidevoice#124 phase 2): it is asked by catalogue model id and engine — the offer the page resolved —
 * installs a build the first time, and runs it on the machine's own hardware, on the offer's accelerator (or the one
 * chosen under Avanzado). Nothing here maps ids or chooses. build.mjs bundles it, with the page's own chunker. */
(function(){
 function host(){return globalThis.__sidevoiceDesktop?.host?.nativeEngine||null}
 /* The build on this machine's disk, downloaded first when it is not (the engine's package too, if missing). */
 async function ready(engine,model,name,progress){
  if(!model||!name)throw Error('Falta el modelo o el motor que ejecutar en este dispositivo.');
  const installed=await engine.installed();
  if((installed||[]).some(build=>build.model===model&&build.engine===name))return true;
  await engine.install(model,name,(done,total)=>progress({status:'progress',progress:total?done*100/total:0,file:model}));
  return false;
 }
 /* Posts to whoever set onmessage, asynchronously, like a Worker. */
 class Stand{
  constructor(engine){this.engine=engine;this.onmessage=null;this.onerror=null;this.epoch=0;this.chain=Promise.resolve()}
  emit(data){setTimeout(()=>this.onmessage?.({data}),0)}
  terminate(){this.epoch++}
  postMessage(data){
   if(data?.type==='cancel'){this.epoch++;return}
   const epoch=this.epoch;
   // The app refuses with {key, message, ...params}, like the node: said by its key where the page knows it.
   this.chain=this.chain.then(()=>this.handle(data,epoch)).catch(error=>{if(epoch===this.epoch)this.emit({id:data.id,type:'error',error:refusalText(error,String(error))})});
  }
 }
 /* stt-worker.js's protocol: load {model, engine}, transcribe {audio, model, engine, language}. */
 class NativeTranscription extends Stand{
  async handle(data,epoch){
   const send=(type,extra={})=>{if(epoch===this.epoch)this.emit({id:data.id,type,...extra})};
   if(data.type==='load'){
    const cached=await ready(this.engine,data.model,data.engine,progress=>send('progress',{progress}));
    this.build={model:data.model,engine:data.engine,accelerator:data.accelerator};
    send('ready',{runtime:{model:data.model,engine:data.engine,accelerator:data.accelerator,cached}});return;
   }
   if(data.type==='transcribe'){
    const started=performance.now(),{model,engine,accelerator}=this.build||data;
    const text=await this.engine.transcribe(model,engine,new Float32Array(data.audio),16000,data.language&&data.language!=='auto'?data.language:'',accelerator);
    send('result',{result:{text:String(text||'').trim(),elapsed_ms:performance.now()-started,model,engine,accelerator}});return;
   }
   throw Error('Mensaje de transcripcion desconocido');
  }
 }
 /* worker.js's protocol: load {model, engine}, speak {text, voice, speed, model, engine} → audio chunks, done. */
 class NativeVoice extends Stand{
  async handle(data,epoch){
   const send=(type,extra={})=>{if(epoch===this.epoch)this.emit({id:data.id,type,...extra})};
   if(!this.build||this.build.model!==data.model||this.build.engine!==data.engine){
    await ready(this.engine,data.model,data.engine,progress=>send('progress',{progress}));
    this.build={model:data.model,engine:data.engine};send('ready',{accelerator:data.accelerator});
   }else if(data.type==='load')send('ready',{accelerator:data.accelerator});
   // Another accelerator for the same build needs no download: the engine is asked on it from now on.
   this.build.accelerator=data.accelerator;
   if(data.type==='load')return;
   for(const text of splitText(data.text)){
    if(epoch!==this.epoch)return;
    const started=performance.now(),audio=await this.engine.synthesize(this.build.model,this.build.engine,data.voice,data.speed||1,text,this.build.accelerator);
    if(epoch!==this.epoch)return;
    send('audio',{text,samples:audio.samples,sampleRate:audio.sampleRate,phonemes:'',elapsedMs:performance.now()-started,accelerator:data.accelerator});
   }
   send('done');
  }
 }
 globalThis.sidevoiceNativeWorkers={
  available:()=>!!host(),
  transcription:()=>host()?new NativeTranscription(host()):null,
  voice:()=>host()?new NativeVoice(host()):null,
 };
})();
