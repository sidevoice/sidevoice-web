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

/** The core's refusal of a request from a session it no longer has registered in the room (dropped, restarted, or the
 *  call moved to no conversation). */
export const DEVICE_ABSENT='room.browser_absent';

/**
 * Whether a refusal means the call's session was lost and the page should join again: the room says this device is
 * absent, while the page believes it is in a call, on the session the refused request was made under (a request of an
 * earlier session, refused late, says nothing of the one now), and no rejoin is already under way.
 * @param {unknown} refusal
 * @param {{inCall: boolean, sameSession: boolean, reconnecting: boolean}} page
 * @returns {boolean}
 */
export function shouldRejoin(refusal,{inCall,sameSession,reconnecting}){
 return refusalError(refusal).key===DEVICE_ABSENT&&inCall&&sameSession&&!reconnecting;
}
