/* How a voice cuts a text into the pieces it synthesizes one after another, so a turn starts sounding before
 * it is all synthesized: at sentence ends, and at `limit` characters at most. One chunker for every voice — the
 * page's Kokoro (engine.js) and the desktop app's native engine (native-worker.js) — so both cut alike. */
export function splitText(text,limit=160){const chunks=[];let current='';for(const word of String(text||'').trim().split(/\s+/).filter(Boolean)){if(current&&(current.length+word.length+1)>limit){chunks.push(current);current=''}current+=(current?' ':'')+word;if(/[.!?;:]$/.test(word)){chunks.push(current);current=''}}if(current)chunks.push(current);return chunks}
