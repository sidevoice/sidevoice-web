import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Spanish. A missing key falls back to English. */
export const es: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Transcripción",
  "transcript.close": "Cerrar la transcripción",
  "transcript.compose": "Escribir un mensaje",
  "transcript.message": "Mensaje escrito",
  "transcript.placeholder": "Escribe un mensaje…",
  "transcript.send": "Enviar",
  "transcript.sendLabel": "Enviar mensaje",

  "karaoke.playing": "Reproduciendo esta respuesta",
};
