import { expect, test } from "vitest";
import { errorLine, errorMessage, roomFailure, voiceFailure, worded } from "./error-message";
import { translator } from "../../i18n/translator";

/* A failure as people read it (AGENTS.md): a known code in the bundle's words, in English and in Spanish; any other a
 * generic line about what failed, its code and its own text behind Details; a raw text never the sentence. */

const en = translator("en"), es = translator("es");
const engine = (code: string, detail?: string) => Object.assign(new Error(code), { code, params: {} }, detail ? { detail } : {});

test("a known code is the bundle's sentence, in English and in Spanish", () => {
  expect(voiceFailure(engine("download-failed"), { what: "download", t: en }))
    .toEqual({ text: "The model could not be downloaded. Check the connection and try again." });
  expect(voiceFailure(engine("download-failed"), { what: "download", t: es }))
    .toEqual({ text: "No se pudo descargar el modelo. Comprueba la conexión y vuelve a intentarlo." });
  expect(voiceFailure({ code: "microphone-denied" }, { inApp: true, t: es }).text).toMatch(/bloqueado para Sidevoice/);
  expect(roomFailure({ key: "room_is_full" }, { t: en }).text).toMatch(/maximum number of devices/);
  expect(roomFailure({ key: "room_is_full" }, { t: es }).text).toMatch(/máximo de dispositivos/);
});

test("the same failure under another name, and a build that does not fit, say why in the bundle's words", () => {
  expect(voiceFailure({ code: "synthesis-failed" }, { t: en }).text).toBe(en("voice.failure.speech-failed"));
  expect(voiceFailure({ code: "host-capabilities-memoryMb" }, { t: en }).text).toBe(en("voice.failure.host-capabilities"));
  expect(voiceFailure({ code: "wasm-memory" }, { t: es }).text)
    .toBe("Ese modelo no se puede ejecutar en este dispositivo: necesita más memoria de la que una página puede usar. Elige otro.");
  expect(voiceFailure({ code: "trial-silence" }, { t: en }).text).toBe(en("wizard.trial.silence"));
  expect(voiceFailure(new DOMException("The operation is insecure.", "SecurityError"), { t: en }).text).toBe(en("storage.blocked"));
});

test("an unknown code is the generic line about what failed; its code and its own text go to the details", () => {
  const raw = engine("format-model-unsupported", "invalid_request_error: Unsupported format model gpt-x");
  expect(voiceFailure(raw, { what: "try", t: en })).toEqual({
    text: "Something went wrong with the try.",
    details: "format-model-unsupported\ninvalid_request_error: Unsupported format model gpt-x",
  });
  expect(voiceFailure(raw, { what: "try", t: es }).text).toBe("Algo falló con la prueba.");
  expect(roomFailure(new TypeError("Failed to fetch"), { t: es }))
    .toEqual({ text: "Algo falló con la máquina.", details: "TypeError\nFailed to fetch" });
  // A caller's own generic line, in place of the generic one.
  expect(errorMessage({ key: "agents.mystery" }, { t: en, generic: en("agents.error.unknown") }))
    .toEqual({ text: "This action could not be completed.", details: "agents.mystery" });
});

test("a raw text is never the sentence, whatever shape the failure comes in", () => {
  const raw = "The native engine failed: format model ggml-small-q5 is not supported";
  for (const failure of [new Error(raw), raw, { message: raw }, { key: "internal", message: raw }, engine("internal", raw)]) {
    for (const t of [en, es]) {
      const said = voiceFailure(failure, { t });
      expect(said.text).not.toContain("format model");
      expect(said.said ?? "").not.toContain("format model");
      expect(said.details).toContain(raw);
    }
  }
  // A machine's refusal: its sentence, in whatever language it came, is only a detail.
  expect(roomFailure({ message: "The connection or conversation changed. The text was not sent." }, { t: es }))
    .toEqual({ text: "Algo falló con la máquina.", details: "The connection or conversation changed. The text was not sent." });
});

test("an engine failure that is not a provider's keeps its detail behind Details; a provider's refusal follows the sentence", () => {
  const transcription = voiceFailure(engine("transcription-failed", "400: format model whisper-1 unsupported"), { t: en });
  expect(transcription).toEqual({ text: en("voice.failure.transcription-failed"), details: "400: format model whisper-1 unsupported" });
  const rejected = voiceFailure(engine("credential-rejected", "invalid_api_key: Incorrect API key provided"), { t: es });
  expect(rejected).toEqual({ text: es("voice.failure.credential-rejected"), said: "invalid_api_key: Incorrect API key provided" });
  expect(errorLine(rejected)).toBe(es("voice.failure.credential-rejected") + " invalid_api_key: Incorrect API key provided");
});

test("a failure already worded for people is said as it is", () => {
  expect(roomFailure(worded("Ninguna máquina disponible."), { t: en })).toEqual({ text: "Ninguna máquina disponible." });
  expect(voiceFailure(Object.assign(new Error("x"), { code: "x", words: { text: "Said.", details: "raw" } }), { t: en }))
    .toEqual({ text: "Said.", details: "raw" });
});

test("nothing to go on is the generic line alone", () => {
  expect(voiceFailure(undefined, { what: "models", t: en })).toEqual({ text: "Something went wrong with the list of models." });
  expect(roomFailure(new Error(""), { t: es })).toEqual({ text: "Algo falló con la máquina." });
});

test("deleting a model: one still downloading, and one that could not be deleted, its detail only behind Details", () => {
  expect(voiceFailure(engine("model-installing"), { t: en }))
    .toEqual({ text: "This model is still downloading. Try again when it finishes." });
  expect(voiceFailure(engine("model-installing"), { t: es }))
    .toEqual({ text: "Este modelo aún se está descargando. Vuelve a intentarlo cuando termine." });
  const detail = "EBUSY: resource busy or locked, unlink '/models/whisper-small.bin'";
  expect(voiceFailure(engine("uninstall-failed", detail), { t: en })).toEqual({ text: "Couldn't delete this model.", details: detail });
  const said = voiceFailure(engine("uninstall-failed", detail), { t: es });
  expect(said).toEqual({ text: "No se pudo borrar este modelo.", details: detail });
  expect(said.text).not.toContain("EBUSY");
  expect(said.said).toBeUndefined();
});
