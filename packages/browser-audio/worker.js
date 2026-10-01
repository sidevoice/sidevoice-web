import {initialize,synthesize} from './engine.js';
import {splitText} from './split-text.js';
let epoch=0;let active=null;let chain=Promise.resolve();
/* The page's voice: a catalogue model on the accelerator its offer chose; `fallback` is the one to try when
 * that one fails to load (WebGPU → WASM), said to the page when it happens. */
self.onmessage=({data})=>{
 if(data.type==='cancel'){epoch++;return}
 const generation=epoch;
 chain=chain.then(async()=>{
  const send=(type,extra={})=>self.postMessage({type,id:data.id,...extra});
  try{
   if(!active||active.model!==data.model||active.requested!==data.accelerator||data.type==='load'){
    let accelerator;
    try{accelerator=await initialize(data.model,data.accelerator,p=>send('progress',{progress:p}))}
    catch(error){if(!data.fallback||data.fallback===data.accelerator)throw error;send('fallback',{reason:String(error)});accelerator=await initialize(data.model,data.fallback,p=>send('progress',{progress:p}))}
    active={model:data.model,requested:data.accelerator,accelerator};
    send('ready',{accelerator});
   }
   if(data.type==='load')return;
   for(const text of splitText(data.text)){
    if(epoch!==generation)return;
    const started=performance.now();const output=await synthesize(text,data.voice,data.speed,p=>send('progress',{progress:p}));
    if(epoch!==generation)return;
    self.postMessage({type:'audio',id:data.id,text,...output,elapsedMs:performance.now()-started,accelerator:active.accelerator},[output.samples.buffer]);
   }
   if(epoch===generation)send('done');
  }catch(error){active=null;send('error',{error:String(error?.message||error)})}
 });
};
