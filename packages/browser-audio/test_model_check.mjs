import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHECKS,languageFor,clip,phrase,words,wordError,transcriptProblem,audioProblem,slow,wavSamples,failure} from './model-check.js';

/* The page judges a model check like the node does (sidevoice-core tests/test_model_check.py, VerdictTest): the
 * same data (checks/, the core's copy) and the same cases. */
const SPANISH=clip('es').text;

test('a clip per language of about five seconds, the phrase it says, and English for the rest',()=>{
 for(const language of ['es','en']){
  const {url,text}=clip(language),samples=wavSamples(readFileSync(new URL('./checks/'+url.split('/').pop(),import.meta.url)).buffer.slice(0));
  assert.ok(samples.length/16000>=4&&samples.length/16000<=7,language);
  assert.ok(text);
  assert.equal(phrase(language).text,text,'a voice check speaks what the clip says');
 }
 for(const language of ['fr','auto',null,undefined]){
  assert.equal(languageFor('stt',language),'en');
  assert.deepEqual(clip(language),clip('en'));
 }
 assert.equal(clip('es').url,'/voice-browser/checks/stt-es.wav');
});

test('text close to the clip passes; nothing, or something else, does not',()=>{
 assert.equal(wordError(SPANISH,SPANISH.toUpperCase()),0);
 assert.deepEqual(words('¡Hola, transcripción!'),['hola','transcripcion']);
 assert.equal(transcriptProblem(SPANISH,' hola, esto es una prueba de transcripcion para comprobar que el modelo entiende lo que digo'),null);
 assert.equal(transcriptProblem(SPANISH,'Ola, esto es una prueba de transcripción para comprobar que el modelo entiende lo que dijo.'),null,'a small model\'s slips are not a failure');
 assert.equal(transcriptProblem(SPANISH,' ... ').key,'check_silent');
 const mismatch=transcriptProblem(SPANISH,'Thank you for watching.');
 assert.equal(mismatch.key,'check_mismatch');
 assert.equal(mismatch.heard,'Thank you for watching.');
 assert.ok(mismatch.message);
});

test('audio must be audible and last a plausible time',()=>{
 const tone=Float32Array.from({length:16000*5},(_,i)=>.3*Math.sin(i/10));
 assert.equal(audioProblem(tone,16000),null);
 assert.equal(audioProblem(new Float32Array(16000*5),16000).key,'check_silent');
 assert.equal(audioProblem(new Float32Array(0),16000).key,'check_silent');
 const short=audioProblem(tone.subarray(0,1600),16000);
 assert.deepEqual([short.key,short.seconds],['check_duration',0.1]);
});

test('slowness is measured against the comfort line',()=>{
 assert.equal(slow(CHECKS.stt.comfort_ms),false);
 assert.equal(slow(CHECKS.stt.comfort_ms+1),true);
});

test('a page engine\'s failure becomes the refusal its step means; the app\'s own refusal is kept',()=>{
 assert.equal(failure('download',Error('Failed to fetch')).key,'download_failed');
 assert.equal(failure('load',Error('no available backend found. ERR: [webgpu] RangeError: Array buffer allocation failed')).key,'memory_insufficient');
 assert.equal(failure('load',Error('Aborted(OOM)')).key,'memory_insufficient');
 const load=failure('load',Error('Unsupported model type: whisper'));
 assert.deepEqual([load.key,load.detail],['load_failed','Unsupported model type: whisper']);
 assert.equal(failure('check',Error('invalid dims')).key,'run_failed');
 const own={key:'download_corrupt',url:'https://example.com',message:'not the file'};
 assert.equal(failure('download',own),own);
});
