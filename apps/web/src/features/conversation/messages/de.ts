import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in German. A missing key falls back to English. */
export const de: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Transkript",
  "transcript.close": "Transkript schließen",
  "transcript.message": "Geschriebene Nachricht",
  "transcript.placeholder": "Nachricht senden",
  "transcript.send": "Senden",
  "transcript.sendLabel": "Nachricht senden",

  "karaoke.playing": "Diese Antwort wird abgespielt",

  "messages.group": "Nachrichten von {name}",
  "messages.message": "{name}: {text}",
  "messages.interrupted": "{name}, unterbrochen: {text}",
  "messages.today": "Heute",
  "messages.empty": "Noch wurde nichts gesagt. Hier erscheint, was du sagst, und die Antworten des Agenten.",
  "messages.yesterday": "Gestern",
  "messages.listenAgain": "Erneut anhören",
  "messages.cancel": "Senden abbrechen",
  "messages.thinking": "Die Unterhaltung arbeitet an deiner Nachricht",
  "messages.new": "Neue Nachrichten",
  "messages.latest": "Zum Ende",
  "messages.toLatest": "Zum Ende der Unterhaltung",

  "wave.listening": "Hört zu",
  "wave.listeningTitle": "Hört zu…",
  "wave.transcribing": "Dein Redebeitrag wird transkribiert",
  "wave.transcribingTitle": "Wird transkribiert…",
};
