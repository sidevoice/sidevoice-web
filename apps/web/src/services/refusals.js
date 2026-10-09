/* What a refusal says to a person. The room refuses with {key, message, ...params}: its message is already in the
 * call's language, so it is said as it comes; a key this page words itself is looked up first. */
/** Keys this page words itself. */
export const REFUSALS={
 host_unreachable:()=>'No se pudo contactar con la máquina.',
};
/** A refusal (an object with a key, an Error carrying one, or plain text) as the sentence to show. */
export function refusalText(refusal,fallback=''){
 if(refusal&&typeof refusal==='object'){
  const say=typeof refusal.key==='string'&&REFUSALS[refusal.key];
  if(say)return say(refusal);
  if(refusal.message)return String(refusal.message);
 }
 return typeof refusal==='string'&&refusal?refusal:fallback;
}
