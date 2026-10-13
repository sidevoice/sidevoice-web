import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Polish. A missing key falls back to English. */
export const pl: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "Transkrypcja",
  "transcript.close": "Zamknij transkrypcję",
  "transcript.message": "Wiadomość pisemna",
  "transcript.placeholder": "Wyślij wiadomość",
  "transcript.send": "Wyślij",
  "transcript.sendLabel": "Wyślij wiadomość",

  "karaoke.playing": "Odtwarzanie tej odpowiedzi",

  "messages.group": "Wiadomości od: {name}",
  "messages.message": "{name}: {text}",
  "messages.interrupted": "{name}, przerwano: {text}",
  "messages.today": "Dzisiaj",
  "messages.empty": "Nic jeszcze nie powiedziano. Tutaj pojawi się to, co mówisz, i odpowiedzi agenta.",
  "messages.yesterday": "Wczoraj",
  "messages.listenAgain": "Odsłuchaj ponownie",
  "messages.cancel": "Anuluj wysyłanie",
  "messages.thinking": "Rozmowa pracuje nad twoją wiadomością",
  "messages.new": "Nowe wiadomości",
  "messages.latest": "Przejdź na koniec",
  "messages.toLatest": "Przejdź na koniec rozmowy",

  "wave.listening": "Słucham",
  "wave.listeningTitle": "Słucham…",
  "wave.transcribing": "Transkrypcja twojej wypowiedzi",
  "wave.transcribingTitle": "Transkrypcja…",
};
