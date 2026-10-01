/* What a refusal says to a person. sidevoice-core refuses with {key, message, ...params}, and the desktop app's
 * native engine rejects with the same shape: a stable key, the parameters it needs, and a sentence in English
 * for whoever does not know the key. A known key is said here, in the page's source language (room-i18n.js
 * pairs it with its English until #128), with its parameters; an unknown one says its own sentence. */
import catalog from './models.json' with {type:'json'};

const label=id=>catalog.providers.find(provider=>provider.id===id)?.label||String(id||'');
/** Known keys. The desktop app's native refusals join this table as they are defined. */
export const REFUSALS={
 place_host_unavailable:()=>'Ejecutar modelos en el host aún no está disponible.',
 provider_key_missing:refusal=>label(refusal.provider)+' necesita una clave de API antes de conectar.',
 voice_missing:refusal=>'Elige una voz de '+label(refusal.provider)+' antes de conectar.',
 integration_superseded:()=>'La clave se cambió o se quitó mientras se comprobaba, así que no se guardó.',
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
