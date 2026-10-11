import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Spanish. A missing key falls back to English. */
export const es: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Transcripción",
  "transcript.close": "Cerrar la transcripción",
  "transcript.message": "Mensaje escrito",
  "transcript.placeholder": "Escribe un mensaje…",
  "transcript.send": "Enviar",
  "transcript.sendLabel": "Enviar mensaje",

  "karaoke.playing": "Reproduciendo esta respuesta",

  "messages.group": "Mensajes de {name}",
  "messages.message": "{name}: {text}",
  "messages.interrupted": "{name}, interrumpida: {text}",
  "messages.today": "Hoy",
  "messages.yesterday": "Ayer",
  "messages.listenAgain": "Volver a escuchar",
  "messages.cancel": "Cancelar envío",
  "messages.thinking": "La conversación está trabajando en tu mensaje",
  "messages.new": "Nuevos mensajes",
  "messages.latest": "Ir al final",
  "messages.toLatest": "Ir al final de la conversación",

  "wave.listening": "Escuchando",
  "wave.listeningTitle": "Escuchando…",
  "wave.transcribing": "Transcribiendo tu intervención",
  "wave.transcribingTitle": "Transcribiendo…",
};
