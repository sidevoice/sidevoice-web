/** The sentence offered to say when trying a transcription model, by speech language (not the UI's): what is said is
 *  in the language the model transcribes. */
export const SAY_SAMPLES: Record<string, string> = {
  es: "Mañana repasamos el diseño con calma.",
  en: "Let's go over the design tomorrow.",
};

export const saySample = (language: string) => SAY_SAMPLES[language] ?? SAY_SAMPLES.en;

/** The sentence a transcription try last offered to say. The prototype's microphone «says» it; a real one hears
 *  whatever the person says. */
export const offeredSentence = { current: "" };
