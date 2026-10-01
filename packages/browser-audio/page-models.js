/* The models this page runs, read from the model catalogue (models.json: sidevoice-core's, copied by
 * copy-core-catalogs.mjs and bundled by build.mjs): each model's transformers.js build, in the shapes the
 * engines have always used. The catalogue is the one list; nothing here names a model. */
import catalog from './models.json' with {type:'json'};
const engine=catalog.engines.find(e=>e.id==='transformers-js');
const pageBuild=model=>model.builds.find(b=>b.engine===engine.id);
function entry(model){
 const build=pageBuild(model);
 return {repository:build.config.repository,revision:build.config.revision,label:model.label,family:model.family,devices:build.accelerators||engine.accelerators,dtype:build.config.dtype,sizes:build.config.sizes||{},requiresFp16:(build.needs||[]).includes('webgpu-f16')};
}
const family=name=>catalog.models.filter(model=>model.family===name&&pageBuild(model));
/* The page's adapters' models by catalogue id (the id a stage saves): repository, revision, label, devices,
 * dtype and download size per device, requiresFp16. stt-engine.js runs the whisper family, engine.js the kokoro family. */
const byId=name=>Object.fromEntries(family(name).map(model=>[model.id,entry(model)]));
export const WHISPER=byId('whisper');
export const KOKORO=byId('kokoro');

/** What a page model downloads on an accelerator, in bytes, as the catalogue measured it (0 when it does not say). */
export function pageSize(model,accelerator){return (WHISPER[model]||KOKORO[model])?.sizes?.[accelerator]||0}

// The graphs transformers.js 3.x loads for each family, and the file suffix of each precision: what a model that is
// already in this browser's cache has there. Only used to tell whether a download is still ahead.
const GRAPHS={whisper:['encoder_model','decoder_model_merged'],kokoro:['model']};
const SUFFIX={fp32:'',fp16:'_fp16',int8:'_int8',uint8:'_uint8',q8:'_quantized',q4:'_q4',q4f16:'_q4f16',bnb4:'_bnb4'};
/** Whether this browser already holds a page model's graphs for an accelerator (transformers.js's own cache). */
export async function pageCached(model,accelerator){
 const found=WHISPER[model]||KOKORO[model],dtype=found?.dtype?.[accelerator];
 if(!found||!(dtype in SUFFIX)||typeof caches==='undefined')return false;
 try{
  const cache=await caches.open('transformers-cache');
  for(const graph of GRAPHS[found.family]||[])if(!await cache.match(`https://huggingface.co/${found.repository}/resolve/${found.revision}/onnx/${graph}${SUFFIX[dtype]}.onnx`))return false;
  return true;
 }catch{return false}
}
