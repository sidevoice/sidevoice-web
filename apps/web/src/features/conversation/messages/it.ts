import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Italian. A missing key falls back to English. */
export const it: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Trascrizione",
  "transcript.close": "Chiudi la trascrizione",
  "transcript.message": "Messaggio scritto",
  "transcript.placeholder": "Invia un messaggio",
  "transcript.send": "Invia",
  "transcript.sendLabel": "Invia messaggio",

  "karaoke.playing": "Riproduzione di questa risposta",

  "messages.group": "Messaggi di {name}",
  "messages.message": "{name}: {text}",
  "messages.interrupted": "{name}, interrotta: {text}",
  "messages.today": "Oggi",
  "messages.empty": "Non è ancora stato detto nulla. Qui appaiono quello che dici e le risposte dell’agente.",
  "messages.yesterday": "Ieri",
  "messages.listenAgain": "Riascolta",
  "messages.cancel": "Annulla invio",
  "messages.thinking": "La conversazione sta lavorando al tuo messaggio",
  "messages.new": "Nuovi messaggi",
  "messages.latest": "Vai in fondo",
  "messages.toLatest": "Vai in fondo alla conversazione",

  "wave.listening": "In ascolto",
  "wave.listeningTitle": "In ascolto…",
  "wave.transcribing": "Trascrizione del tuo intervento",
  "wave.transcribingTitle": "Trascrizione…",
};
