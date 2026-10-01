/* What a model check runs on this device and how its output is judged (#124 §6 step 5, #90). A model is selected
 * by loading it and checking it before it takes effect: a transcription model transcribes a bundled clip of about
 * five seconds and must give back text close to what the clip says; a voice model speaks a fixed phrase and must
 * give back audio that is not silent and lasts a plausible time.
 *
 * checks/ is sidevoice-core's (`models/checks/`, copied by copy-core-catalogs.mjs, never edited here): the same
 * clips, phrases and thresholds the node checks a provider with (`sidevoice_core/models/verdicts.py`), so a device
 * and a host judge alike. A failed verdict is a refusal like the node's: a stable key, its parameters, an English
 * sentence (refusals.js says it to a person). Pure, apart from the URL a clip is fetched from. */
import spec from './checks/checks.json' with {type:'json'};

export const CHECKS=spec;
/** Where the build serves the clips (build.mjs copies checks/ beside the workers). */
export const CHECKS_PATH='/voice-browser/checks/';

/** The language a check of `task` runs in: `language` when there is a clip or phrase for it, else the fallback. */
export function languageFor(task,language){
 const own=task==='stt'?spec.stt.clips:spec.tts.phrases;
 return typeof language==='string'&&Object.hasOwn(own,language)?language:spec.fallback;
}
/** The transcription check for a language: where its clip is, and the words it says. */
export function clip(language){
 const chosen=languageFor('stt',language),entry=spec.stt.clips[chosen];
 return {language:chosen,url:CHECKS_PATH+entry.file,text:entry.text};
}
/** The voice check's phrase for a language. */
export function phrase(language){const chosen=languageFor('tts',language);return {language:chosen,text:spec.tts.phrases[chosen]}}

/** A text as the words it says: lower case, accents and punctuation gone. */
export function words(text){
 return String(text??'').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
}
/** Word error rate of `heard` against `expected`: edits over the expected words. */
export function wordError(expected,heard){
 const said=words(expected),got=words(heard);
 if(!said.length)return got.length?1:0;
 const row=Array.from({length:got.length+1},(_,j)=>j);
 for(let i=1;i<=said.length;i++){
  let previous=row[0];row[0]=i;
  for(let j=1;j<=got.length;j++){const above=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(said[i-1]!==got[j-1]?1:0));previous=above}
 }
 return row[got.length]/said.length;
}
/** Why a transcription check failed, as a refusal, or null when `heard` is close enough to `expected`. */
export function transcriptProblem(expected,heard){
 if(!words(heard).length)return {key:'check_silent',message:'The model loaded but produced nothing.'};
 if(wordError(expected,heard)>spec.stt.max_word_error){
  const said=String(heard).trim().slice(0,200);
  return {key:'check_mismatch',heard:said,message:`The model heard something else: "${said}".`};
 }
 return null;
}
/** Why a voice check failed, as a refusal, or null when the audio is audible and lasts a plausible time. */
export function audioProblem(samples,rate){
 const count=samples?.length||0,seconds=rate?count/rate:0;
 let sum=0;for(let i=0;i<count;i++)sum+=samples[i]*samples[i];
 if(!count||Math.sqrt(sum/count)<spec.tts.min_rms)return {key:'check_silent',message:'The model loaded but produced nothing.'};
 const [low,high]=spec.tts.seconds;
 if(seconds<low||seconds>high)return {key:'check_duration',seconds:Math.round(seconds*100)/100,message:`The model produced ${seconds.toFixed(1)} s of audio for a phrase that takes about five.`};
 return null;
}
/** Whether a transcription's turn-final latency is above the comfort line: said, and the person decides (D12). */
export function slow(latencyMs){return latencyMs>spec.stt.comfort_ms}

/** A clip's samples: the checks are 16 kHz mono 16-bit PCM WAV, as checks.json says. */
export function wavSamples(buffer){
 const view=new DataView(buffer);let offset=12;
 while(offset+8<=view.byteLength){
  const id=String.fromCharCode(view.getUint8(offset),view.getUint8(offset+1),view.getUint8(offset+2),view.getUint8(offset+3)),size=view.getUint32(offset+4,true);
  if(id==='data'){const count=Math.floor(Math.min(size,view.byteLength-offset-8)/2),out=new Float32Array(count);for(let i=0;i<count;i++)out[i]=view.getInt16(offset+8+2*i,true)/32768;return out}
  offset+=8+size+(size%2);
 }
 throw Error('The check clip is not a WAV with audio in it.');
}

/** A failure in this page's engine (transformers.js, onnxruntime-web) as the refusal its step means. The desktop
 *  app's engine already rejects with one ({key, message, …}); that is kept as it is. */
export function failure(step,error){
 if(error&&typeof error==='object'&&typeof error.key==='string')return error;
 const detail=String(error?.message||error||'').slice(0,300);
 if(/out of memory|\boom\b|allocation failed|could not allocate|memory access out of bounds|RangeError: (Array buffer|WebAssembly\.Memory)/i.test(detail))
  return {key:'memory_insufficient',detail,message:'There is not enough memory for this model.'};
 if(step==='download')return {key:'download_failed',detail,message:`The download was interrupted: ${detail}`};
 if(step==='load')return {key:'load_failed',detail,message:`The engine could not load the model on this device: ${detail}`};
 return {key:'run_failed',detail,message:`The model failed while it was checked: ${detail}`};
}
