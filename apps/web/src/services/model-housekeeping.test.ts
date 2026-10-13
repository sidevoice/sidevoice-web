import { expect, test } from "vitest";
import { defaultVoiceSettings } from "./voice-settings.js";
import { modelPurposes, staleModels } from "./model-housekeeping.js";

const DAY = 86_400_000;
const model = (id: string, capabilities: string[], lastUsedAt?: number, family = id) =>
  ({ id, family, capabilities, lastUsedAt, builds: [{ id: id + "-b", available: true, installed: true }] });
const catalogs = (now: number) => [{ id: "local", name: null, status: { stale: false }, models: [
  model("whisper-base", ["stt"], now - 200 * DAY), model("kokoro-82m-v1.0", ["tts"], now - 200 * DAY),
  model("silero-vad", ["vad"], now - 200 * DAY), model("whisper-large", ["stt"], now - 40 * DAY), model("moonshine-tiny", ["stt"], now - 100 * DAY),
  model("never-said", ["stt"]),
] }] as never;

test("a model is in use for what the settings name it for, and the voice detector for every call", () => {
  const purposes = modelPurposes(catalogs(Date.now()), defaultVoiceSettings());
  expect(purposes("whisper-base")).toEqual(["transcription"]);
  expect(purposes("silero-vad")).toEqual(["every-call"]);
  expect(purposes("whisper-large")).toEqual([]);
});

test("only models not in use, last used longer ago than asked, are deleted on their own; never by default", () => {
  const now = Date.now();
  expect(staleModels(catalogs(now), defaultVoiceSettings(), null, now)).toEqual([]);
  expect(staleModels(catalogs(now), defaultVoiceSettings(), 30, now)).toEqual(["whisper-large", "moonshine-tiny"]);
  expect(staleModels(catalogs(now), defaultVoiceSettings(), 90, now)).toEqual(["moonshine-tiny"]);
});
