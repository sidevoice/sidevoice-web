/* The models this page runs, read from the model catalogue (models.json: sidevoice-core's, copied by
 * copy-core-catalogs.mjs and bundled by build.mjs): each model's transformers.js build, in the shapes the
 * engines have always used. The catalogue is the one list; nothing here names a model. */
import catalog from './models.json' with {type:'json'};
const engine=catalog.engines.find(e=>e.id==='transformers-js');
const pageBuild=model=>model.builds.find(b=>b.engine===engine.id);
function entry(model){
 const build=pageBuild(model);
 return {repository:build.config.repository,revision:build.config.revision,label:model.label,devices:build.accelerators||engine.accelerators,dtype:build.config.dtype,requiresFp16:(build.needs||[]).includes('webgpu-f16')};
}
const family=name=>catalog.models.filter(model=>model.family===name&&pageBuild(model));
/* The page's adapters' models by catalogue id (the id a stage saves): repository, revision, label, devices,
 * dtype per device, requiresFp16. stt-engine.js runs the whisper family, engine.js the kokoro family. */
const byId=name=>Object.fromEntries(family(name).map(model=>[model.id,entry(model)]));
export const WHISPER=byId('whisper');
export const KOKORO=byId('kokoro');
