import type { MessageKey } from "./en";

/** The call controls card's texts in Spanish. A missing key falls back to English. */
export const es: Partial<Record<MessageKey, string>> = {
  "card.agent.idle": "El agente está parado",
  "card.agent.working": "El agente está trabajando",
  "card.agent.speaking": "El agente está hablando",
  "card.reconnecting": "Reconectando…",
  "card.switchConversation": "Cambiar de conversación",
  "card.conversations": "Conversaciones",
  "card.openApp": "Abrir Sidevoice",
  "card.mute": "Silenciar",
  "card.unmute": "Activar micrófono",
  "card.shortcut": "{action} ({shortcut})",
  "card.devices": "Micrófono y altavoz",
  "card.microphone": "Micrófono",
  "card.speaker": "Altavoz",
  "card.systemDefault": "Predeterminado del sistema",
  "card.skip": "Saltar lo que está sonando",
  "card.hangUp": "Colgar",
  "card.yourMicrophone": "Tu micrófono",
  "card.youAreMuted": "Estás silenciado",
};
