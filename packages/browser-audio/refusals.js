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
 // Why a model did not take effect (#124 §6): the node's checks (sidevoice_core/models/verdicts.py and
 // pipeline/model_check.py), this page's engines (model-check.js) and the desktop app's native engine.
 download_failed:()=>'La descarga se interrumpió.',
 download_corrupt:()=>'Lo descargado no es el archivo que nombra el catálogo (la suma de comprobación no coincide).',
 install_failed:()=>'No se pudo instalar lo descargado.',
 install_cancelled:()=>'Descarga cancelada.',
 memory_insufficient:()=>'No hay memoria suficiente para este modelo.',
 model_needs_memory:()=>'No hay memoria suficiente para este modelo.',
 load_failed:()=>'El motor no pudo cargar el modelo en este dispositivo.',
 runtime_failed:()=>'El motor no pudo ejecutar el modelo en este dispositivo.',
 build_unfit:()=>'Este dispositivo no puede ejecutar este modelo.',
 run_failed:()=>'El modelo falló mientras se comprobaba.',
 check_silent:()=>'El modelo cargó, pero no produjo nada.',
 check_mismatch:refusal=>'El modelo entendió otra cosa: «'+String(refusal.heard||'')+'»',
 check_duration:()=>'El audio generado no dura lo que debería.',
 check_invalid_audio:()=>'El modelo produjo un audio que no es una onda válida.',
 provider_key_refused:refusal=>label(refusal.provider)+' rechazó la clave.',
 provider_unreachable:refusal=>'No se pudo contactar con '+label(refusal.provider)+'.',
 provider_failed:refusal=>label(refusal.provider)+' falló: '+String(refusal.detail||''),
 host_unreachable:()=>'No se pudo contactar con la máquina.',
 check_rate_limited:()=>'Demasiadas comprobaciones seguidas; vuelve a intentarlo en un momento.',
 switch_refused:refusal=>'La llamada no aceptó el cambio'+(refusal.detail?': '+String(refusal.detail):'.'),
 apply_cancelled:()=>'Se canceló el cambio.',
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
