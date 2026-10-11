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
  "state.speaking": "Hablando",
  "state.listening": "Escuchándote",
  "state.resting": "En reposo",
  "state.unread": "{n} nuevas",
  "state.withUnread": "{state} · {unread}",

  "stage.label": "Llamada",
  "stage.agentState": "{title} · {state}",
  "stage.you": "Tú",
  "stage.yourAvatar": "Tu avatar",
  "stage.working": "Trabajando…",
  "stage.empty": "Elige una conversación para hablar.",
  "stage.chooseConversation": "Elegir una conversación",
  "stage.cancelTurn": "Cancelar envío",
  "stage.poster.title": "WANTED",
  "stage.poster.status": "VIVO O EN PAUSA",
  "stage.poster.fine1": "ESTE BICHO ES FICCIÓN. CUALQUIER PARECIDO CON UN AGENTE",
  "stage.poster.fine2": "REAL QUE SE HAYA QUEDADO SIN CONEXIÓN ES PURA",
  "stage.poster.fine3": "COINCIDENCIA. SI LO VE, AVISE A SU HUMANO.",

  "toolbar.micLevel": "Nivel de micrófono",

  "transcript.show": "Ver la transcripción",
  "transcript.hide": "Ocultar la transcripción",
};
