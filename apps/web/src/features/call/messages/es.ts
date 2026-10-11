import type { CallMessageKey } from "./en";

/** The call view's texts in Spanish. A missing key falls back to English. */
export const es: Partial<Record<CallMessageKey, string>> = {
  "header.menu": "Más opciones",
  "header.settings": "Configuración",
  "header.stats": "Estadísticas de conexión",
  "header.noConversation": "Ninguna conversación seleccionada",
  "header.showConversations": "Ver las conversaciones",
  "header.otherConversation": "{title} · {state}",
  "header.allConversations": "Todas las conversaciones ({n})",

  "sidebar.title": "Conversaciones",
  "sidebar.collapse": "Contraer las conversaciones",
  "sidebar.expand": "Expandir las conversaciones",
  "sidebar.close": "Cerrar las conversaciones",
  "sidebar.empty": "Todavía no hay ninguna conversación en la sala.",
  "sidebar.unknownMachine": "Máquina desconocida",
  "sidebar.options": "Opciones de {title}",
  "sidebar.closeConversation": "Cerrar conversación",

  "state.inCall": "En llamada",
  "state.working": "Trabajando",
  "state.waiting": "Esperándote",
  "state.holding": "No puede recibir",
  "state.offline": "Desconectada",
  "state.unread": "{n} nuevas",
  "state.withUnread": "{state} · {unread}",

  "stage.label": "Llamada",
  "stage.agent": "{title}",
  "stage.you": "Tú",
  "stage.yourAvatar": "Tu avatar",
  "stage.working": "Trabajando…",
  "stage.empty": "Elige una conversación para hablar.",
  "stage.chooseConversation": "Elegir una conversación",
  "stage.cancelTurn": "Cancelar envío",

  "toolbar.micLevel": "Nivel de micrófono",
  "toolbar.skip": "Saltar lo que está sonando",

  "transcript.show": "Ver la transcripción",
  "transcript.hide": "Ocultar la transcripción",
};
