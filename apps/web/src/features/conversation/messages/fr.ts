import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in French. A missing key falls back to English. */
export const fr: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Transcription",
  "transcript.close": "Fermer la transcription",
  "transcript.message": "Message écrit",
  "transcript.placeholder": "Envoyez un message",
  "transcript.send": "Envoyer",
  "transcript.sendLabel": "Envoyer le message",
  "karaoke.playing": "Lecture de cette réponse",
  "messages.group": "Messages de {name}",
  "messages.message": "{name} : {text}",
  "messages.interrupted": "{name}, interrompu : {text}",
  "messages.today": "Aujourd’hui",
  "messages.empty": "Rien n’a encore été dit. Ce que vous dites et les réponses de l’agent apparaissent ici.",
  "messages.yesterday": "Hier",
  "messages.listenAgain": "Réécouter",
  "messages.cancel": "Annuler l’envoi",
  "messages.thinking": "La conversation traite votre message",
  "messages.new": "Nouveaux messages",
  "messages.latest": "Aller à la fin",
  "messages.toLatest": "Aller à la fin de la conversation",
  "wave.listening": "Écoute",
  "wave.listeningTitle": "Écoute…",
  "wave.transcribing": "Transcription de ce que vous avez dit",
  "wave.transcribingTitle": "Transcription…",
};
