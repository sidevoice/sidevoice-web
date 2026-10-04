import { describe, expect, it } from "vitest";
import { stageProblem, stageView, voiceFor, withVoicesChosen } from "./stage-settings.js";

function context(languages?: string[]) {
  const model = { id: "voice-model", label: "Voice model", ...(languages ? { languages } : {}) };
  return {
    catalog: { models: [], families: {}, providers: [{ id: "elevenlabs", label: "ElevenLabs", tasks: ["tts"],
      tts: { options: [{ id: "voice", kind: "voice", per_language: true, from: "remote.voices" }] } }] },
    offers: [], installed: [], inApp: false, language: "en",
    languages: [{ id: "en", label: "English" }, { id: "es", label: "Español" }, { id: "fr", label: "Français" }],
    remote: { "elevenlabs:tts": { models: [model], voices: [
      { id: "voice-en", label: "English voice", languages: ["en"] },
      { id: "voice-es", label: "Spanish voice", languages: ["es"] },
      { id: "voice-fr", label: "French voice", languages: ["fr"] },
    ] } },
    integrations: "ready", keyed: () => "ready", checks: {}, diagnostics: {}, pageFacts: null,
  };
}

describe("provider voice language support", () => {
  it("shows only languages listed by the selected model and saves concrete Automatic voices", () => {
    const ctx = context(["en", "fr"]);
    const stage = { place: "elevenlabs", model: "voice-model", options: {}, build: null };
    const view = stageView(ctx, "tts", stage);
    const voice = view.options.find((option: any) => option.id === "voice");
    expect(voice.rows.map((row: any) => row.language)).toEqual(["en", "fr"]);
    const english = voice.rows.find((row: any) => row.language === "en");
    expect(english.choices[1]).toMatchObject({ value: "voice-en" });
    expect(english.choices.some((choice: any) => choice.value === "voice-es")).toBe(false);
    expect(voice.rows.find((row: any) => row.language === "fr").choices.some((choice: any) => choice.value === "voice-es")).toBe(false);
    expect(withVoicesChosen(ctx, stage).options.voice).toEqual({ en: "voice-en", fr: "voice-fr" });
  });

  it("shows no provider languages when the host has not supplied the model language list", () => {
    const ctx = context();
    const stage = { place: "elevenlabs", model: "voice-model", options: {}, build: null };
    const view = stageView(ctx, "tts", stage);
    const voice = view.options.find((option: any) => option.id === "voice");
    expect(voice.rows).toEqual([]);
    expect(voiceFor(ctx, stage, "es")).toBe("");
  });

  it("drops a stored voice whose declared language the selected model does not support", () => {
    const ctx = context(["en", "fr"]);
    const stage = { place: "elevenlabs", model: "voice-model", options: { voice: { en: "voice-es" } }, build: null };
    const view = stageView(ctx, "tts", stage);
    const voice = view.options.find((option: any) => option.id === "voice");
    expect(voice.rows.find((row: any) => row.language === "en").value).toBe("");
    expect(stageProblem(ctx, "tts", stage)).toContain("Elige una voz");
  });
});
