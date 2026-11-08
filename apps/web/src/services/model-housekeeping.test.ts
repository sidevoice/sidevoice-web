import { expect, test } from "vitest";
import { defaultVoiceSettings } from "./voice-settings.js";
import { DELETE_UNUSED_DAYS, DELETE_UNUSED_KEY, modelPurposes, readDeleteUnused, staleModels, writeDeleteUnused } from "./model-housekeeping.js";

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

test("only models not in use, last used longer ago than asked, are deleted on their own; never when asked", () => {
  const now = Date.now();
  expect(staleModels(catalogs(now), defaultVoiceSettings(), null, now)).toEqual([]);
  expect(staleModels(catalogs(now), defaultVoiceSettings(), 30, now)).toEqual(["whisper-large", "moonshine-tiny"]);
  expect(staleModels(catalogs(now), defaultVoiceSettings(), 90, now)).toEqual(["moonshine-tiny"]);
});

test("a week is the default, and the choices are 7, 30, 90 days and never", () => {
  expect(DELETE_UNUSED_DAYS).toEqual([7, 30, 90, null]);
  const storage = () => { const kept = new Map<string, string>(); return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) } as unknown as Storage; };
  const fresh = storage();
  expect(readDeleteUnused(fresh)).toBe(7);
  expect(readDeleteUnused(null)).toBe(7);
  fresh.setItem(DELETE_UNUSED_KEY, "5");
  expect(readDeleteUnused(fresh)).toBe(7);
  for (const days of DELETE_UNUSED_DAYS) { writeDeleteUnused(fresh, days); expect(readDeleteUnused(fresh)).toBe(days); }
});

test("by default a model unused for a week goes, but never one in use, one being edited, or one the engine says nothing about", () => {
  const now = Date.now();
  const settings = defaultVoiceSettings();
  // whisper-base (saved) and silero-vad are 200 days unused, yet in use.
  expect(staleModels(catalogs(now), settings, 7, now)).toEqual(["whisper-large", "moonshine-tiny"]);
  const editing = { ...settings, stt: { ...settings.stt, model: "whisper-large" } };
  expect(staleModels(catalogs(now), settings, 7, now, editing)).toEqual(["moonshine-tiny"]);
  expect(staleModels(catalogs(now), null, 7, now)).toEqual([]);
});
