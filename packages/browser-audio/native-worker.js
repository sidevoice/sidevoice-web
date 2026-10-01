import {splitText} from './split-text.js';
import {refusalText} from './refusals.js';
/* The desktop app's native engine behind the same message protocol as this package's workers, so the
 * transcription and voice clients do not change: a build whose engine runs natively gets one of these instead of
 * a Web Worker. The engine is the app's (`window.__sidevoiceDesktop.host.nativeEngine`, the bridge contract of
 * rubasace/sidevoice#124 phases 2 and 3): it is asked by catalogue model id and engine — the offer the page
 * resolved — installs a build the first time, loads it into memory (`load`, which `loaded` lists) and runs it on the
 * machine's own hardware, on the offer's accelerator (or the one chosen under Avanzado). When a model is unloaded is
 * the app's (D13), apart from the swap after a model check, which the page asks for with `unload`. Nothing here
 * maps ids or chooses. build.mjs bundles it, with the page's own chunker. */
(function(){
 function host(){return globalThis.__sidevoiceDesktop?.host?.nativeEngine||null}
 /* A failure with the step it happened at (download, load, run) and, when the app refused with one, its refusal:
  * what a model check names when it says why a model did not take effect (#124 §6). */
 class StepError extends Error{
  constructor(step,cause){
   super(refusalText(cause,String(cause?.message||cause||'')));
   this.step=step;this.reason=cause&&typeof cause==='object'&&typeof cause.key==='string'?{...cause}:null;
  }
 }
 async function at(step,work){try{return await work()}catch(error){throw error instanceof StepError?error:new StepError(step,error)}}
 /* The build on this machine's disk, downloaded first when it is not (the engine's package too, if missing), then
  * in memory on the accelerator asked for (the app keeps it there while a call uses it, D13). The install is one job
  * of the app's (`promise.job`), which `stand` keeps while it runs so a cancel can stop it there; its progress is the
  * app's, speed included. A cancel (the worker's epoch moved past `epoch`) is looked for after every step: nothing
  * is loaded for a worker that was let go, and a load it had started is released (Stand.release). */
 async function ready(engine,model,name,accelerator,progress,stand,epoch){
  if(!model||!name)throw Error('Falta el modelo o el motor que ejecutar en este dispositivo.');
  const halt=()=>{if(stand.epoch!==epoch)throw Object.assign(Error('Cancelled'),{name:'AbortError'})};
  const installed=await engine.installed();halt();
  const cached=(installed||[]).some(build=>build.model===model&&build.engine===name);
  if(!cached)await at('download',async()=>{
   const running=engine.install(model,name,event=>progress({status:'progress',progress:event?.total?event.done*100/event.total:0,
    loaded:event?.done,total:event?.total,bytes_per_s:event?.bytes_per_s??null,job:event?.job,file:model}));
   stand.job=running.job||null;
   try{return await running}finally{if(stand.job===running.job)stand.job=null}
  });
  halt();
  const inMemory=(await engine.loaded()||[]).some(build=>build.model===model&&build.engine===name&&build.accelerator===accelerator);
  halt();
  let load_ms=0;
  if(!inMemory){
   // This worker owns the instance it loads: until the load is over, a cancel releases it (an unload also stops a
   // load still in flight); one that completes after the cancel is released then.
   const build={model,engine:name,accelerator};
   progress({status:'loading',file:model});stand.loading=build;stand.released.delete(model+'/'+name+'/'+accelerator);
   try{load_ms=Number((await at('load',()=>engine.load(model,name,accelerator)))?.load_ms)||0}
   finally{if(stand.loading===build)stand.loading=null}
   if(stand.epoch!==epoch){stand.release(build);halt()}
  }
  return {cached,load_ms};
 }
 /* Posts to whoever set onmessage, asynchronously, like a Worker. */
 class Stand{
  constructor(engine){this.engine=engine;this.onmessage=null;this.onerror=null;this.epoch=0;this.chain=Promise.resolve();this.job=null;this.loading=null;this.released=new Set()}
  emit(data){setTimeout(()=>this.onmessage?.({data}),0)}
  // A cancel, or a worker let go, stops what this worker was doing — a download the app is running for it, and a load.
  stop(){
   this.epoch++;const job=this.job,loading=this.loading;this.job=null;this.loading=null;
   if(job)Promise.resolve(this.engine.cancel(job)).catch(()=>{});
   if(loading)this.release(loading);
  }
  /* A load this worker started and no longer wants is let go — exactly that accelerator's instance, once — unless the
   * page says a stage of its own runs it (`sidevoiceNativeWorkers.keeps`, the page's to set). */
  release(build){
   const key=build.model+'/'+build.engine+'/'+build.accelerator;
   if(this.released.has(key))return;this.released.add(key);
   if(globalThis.sidevoiceNativeWorkers?.keeps?.(build))return;
   Promise.resolve(this.engine.unload(build.model,build.engine,build.accelerator)).catch(()=>{});
  }
  terminate(){this.stop()}
  postMessage(data){
   if(data?.type==='cancel'){this.stop();return}
   const epoch=this.epoch;
   // The app refuses with {key, message, ...params}, like the node: said by its key where the page knows it, and
   // handed on with the step it failed at.
   this.chain=this.chain.then(()=>this.handle(data,epoch)).catch(error=>{if(epoch===this.epoch)this.emit({id:data.id,type:'error',error:refusalText(error,String(error?.message||error)),step:error?.step||'run',reason:error instanceof StepError?error.reason:(error&&typeof error==='object'&&typeof error.key==='string'?{...error}:null)})});
  }
 }
 /* stt-worker.js's protocol: load {model, engine}, transcribe {audio, model, engine, language}. */
 class NativeTranscription extends Stand{
  async handle(data,epoch){
   const send=(type,extra={})=>{if(epoch===this.epoch)this.emit({id:data.id,type,...extra})};
   if(data.type==='load'){
    const {cached,load_ms}=await ready(this.engine,data.model,data.engine,data.accelerator,progress=>send('progress',{progress}),this,epoch);
    this.build={model:data.model,engine:data.engine,accelerator:data.accelerator};
    send('ready',{runtime:{model:data.model,engine:data.engine,accelerator:data.accelerator,cached,load_ms}});return;
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
   if(!this.build||this.build.model!==data.model||this.build.engine!==data.engine||this.build.accelerator!==data.accelerator){
    // Another accelerator for the same build needs no download, only loading on it.
    const {load_ms}=await ready(this.engine,data.model,data.engine,data.accelerator,progress=>send('progress',{progress}),this,epoch);
    this.build={model:data.model,engine:data.engine,accelerator:data.accelerator};send('ready',{accelerator:data.accelerator,load_ms});
   }else if(data.type==='load')send('ready',{accelerator:data.accelerator,load_ms:0});
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
