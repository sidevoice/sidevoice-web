/* A refusal of the room or a machine, as a failure this page words (features/settings/error-message.ts `roomFailure`).
 * The room refuses with {key, message, ...params} (a socket's error frame, its admission); a machine's HTTP refusal is
 * {"detail": <sentence>}, a sentence with no key. The key is what this page says it by; the sentence, in whatever
 * language it came, is only ever a detail. */
/**
 * A refusal (an object with a key, an Error carrying one, or plain text) as an Error with its `key` and its sentence.
 * @param {unknown} refusal
 * @returns {Error & {key?: string}}
 */
export function refusalError(refusal){
 if(refusal&&typeof refusal==='object'){
  const {key,message,error,reason}=/** @type {{key?: unknown, message?: unknown, error?: unknown, reason?: unknown}} */ (refusal);
  const named=typeof key==='string'&&key?key:typeof reason==='string'&&reason?reason:'';
  return Object.assign(new Error(String(message||error||'')),named?{key:named}:{});
 }
 return new Error(typeof refusal==='string'?refusal:'');
}
