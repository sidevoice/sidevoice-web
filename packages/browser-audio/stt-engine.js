import {env,pipeline} from '@huggingface/transformers';
import {WHISPER} from './page-models.js';

/* The page's Whisper models, from the model catalogue (page-models.js). */
export const MODELS=WHISPER;
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths='/voice-browser/assets/';
env.backends.onnx.wasm.numThreads=1;
let transcriber=null,active=null;

/* What this page has: the resolver (offers.ts) decides from it which models it offers, and the diagnostics show
 * the WebGPU adapter it found (#90). */
export async function capabilities(){
 const wasm=typeof WebAssembly==='object'&&typeof WebAssembly.validate==='function';
 let adapter=null;
 try{adapter=navigator.gpu?await navigator.gpu.requestAdapter():null}catch{}
 const info=adapter?.info||{};
 return {webgpu:!!adapter,webgpuFp16:!!adapter?.features?.has?.('shader-f16'),wasm,
  adapter:adapter?{vendor:info.vendor||'',architecture:info.architecture||'',device:info.device||'',description:info.description||''}:null,
  threads:env.backends.onnx.wasm.numThreads};
}
async function dispose(){try{await transcriber?.dispose?.()}catch{}transcriber=null;active=null}
/* A catalogue model on one accelerator, as the offer chose it: nothing is picked here. */
export async function initialize(model,accelerator,progress){
 const metadata=MODELS[model];
 if(!metadata)throw Error('Modelo de transcripcion no compatible');
 const available=await capabilities();
 if(!available[accelerator])throw Error(accelerator==='webgpu'?'WebGPU no esta disponible en este navegador':'WebAssembly no esta disponible en este navegador');
 if(!metadata.devices.includes(accelerator)||(metadata.requiresFp16&&!available.webgpuFp16))throw Error('Este modelo no es compatible con el motor seleccionado');
 const key=model+':'+accelerator,runtime={model,engine:'transformers-js',accelerator};
 if(transcriber&&active===key)return {...runtime,cached:true};
 await dispose();
 transcriber=await pipeline('automatic-speech-recognition',metadata.repository,{device:accelerator,dtype:metadata.dtype[accelerator],revision:metadata.revision,progress_callback:progress});
 active=key;
 return {...runtime,cached:false};
}
export async function transcribe(audio,{model,accelerator,language},progress){
 const runtime=await initialize(model,accelerator,progress),options={task:'transcribe',chunk_length_s:30,stride_length_s:5};
 if(language&&language!=='auto')options.language=language;
 const result=await transcriber(audio,options);
 return {text:String(result?.text||'').trim(),...runtime};
}
