import { expect, test } from "vitest";
import { createVoiceHost, providerKey, voiceConfig } from "./voice-host.js";

/* The web's VoiceHost over a VoiceCall: a fake call that records what it was asked and emits what the test says. */

type Event = { type: string; data: unknown };
function fakeCall() {
  const made: { config: unknown; asked: unknown[][]; emit: (event: Event) => void }[] = [];
  const VoiceCall = {
    create(_engine: unknown, config: unknown) {
      let listener: (event: Event) => void = () => {};
      const asked: unknown[][] = [];
      const call = {
        onEvent(fn: (event: Event) => void) { listener = fn; },
        setConfig: (next: unknown) => asked.push(["setConfig", next]),
        start: () => asked.push(["start"]),
        stop: () => asked.push(["stop"]),
        mute: (muted: boolean) => asked.push(["mute", muted]),
        setOnline: (online: boolean) => asked.push(["setOnline", online]),
        cancelInput: () => asked.push(["cancelInput"]),
        roomEvent: (event: unknown) => asked.push(["roomEvent", event]),
      };
      made.push({ config, asked, emit: (event) => listener(event) });
      return call;
    },
  };
  return { VoiceCall, made };
}
const build = (id: string) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true });
const catalogue = [
  { id: "whisper-base", capabilities: ["stt"], languages: ["es", "en"], voices: [], installed: true, builds: [build("whisper-base/int8"), { ...build("whisper-base/gpu"), available: false }] },
  { id: "kokoro-82m-v1.0", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], installed: true, builds: [build("kokoro/int8")] },
];
const engine = { models: async () => catalogue };
const settings = (patch: Record<string, unknown> = {}) => ({
  stt: { model: "whisper-base", build: null, language: "es" }, tts: { model: "kokoro-82m-v1.0", build: null, voice: null, speed: 1 },
  patience: "normal", end_of_turn: "silence", ...patch,
});

test("start needs settings first, and resolves once the call listens", async () => {
  const { VoiceCall, made } = fakeCall();
  const host = createVoiceHost(engine, { VoiceCall });
  await expect(host.start()).rejects.toMatchObject({ code: "settings-missing" });
  await host.setSettings(settings());
  expect(made).toHaveLength(1);
  const started = host.start();
  expect(host.start()).toBe(started);
  made[0].emit({ type: "state", data: { listening: "idle" } });
  made[0].emit({ type: "state", data: { listening: "muted" } });
  await expect(started).resolves.toBeUndefined();
  await expect(host.start()).resolves.toBeUndefined();
  expect(made[0].asked.filter(([name]) => name === "start")).toHaveLength(1);
});

test("a failing start rejects with the call's code, and a stop rejects a pending one as stopped", async () => {
  const { VoiceCall, made } = fakeCall();
  const host = createVoiceHost(engine, { VoiceCall });
  await host.setSettings(settings());
  const failed = host.start();
  made[0].emit({ type: "error", data: { code: "microphone-denied" } });
  await expect(failed).rejects.toMatchObject({ code: "microphone-denied" });
  const stopped = host.start();
  await host.stop();
  await expect(stopped).rejects.toMatchObject({ code: "stopped" });
});

test("the call's room messages reach the turn and playback listeners, and replies go to the call", async () => {
  const { VoiceCall, made } = fakeCall();
  const host = createVoiceHost(engine, { VoiceCall });
  const turns: unknown[] = [], played: unknown[] = [], levels: unknown[] = [];
  host.onUserTurn((t: unknown) => turns.push(t));
  host.onPlayback((p: unknown) => played.push(p));
  const off = host.onLevel((l: unknown) => levels.push(l));
  await host.setSettings(settings());
  made[0].emit({ type: "room-message", data: { type: "voice-user-turn", data: { client_msg_id: "c-1", turn_id: "t", phase: "started" } } });
  made[0].emit({ type: "room-message", data: { type: "voice-playback", data: { client_msg_id: "c-2", utterance_id: "u", status: "heard" } } });
  made[0].emit({ type: "level", data: 0.4 });
  off();
  made[0].emit({ type: "level", data: 0.5 });
  expect(turns).toEqual([{ client_msg_id: "c-1", turn_id: "t", phase: "started" }]);
  expect(played).toEqual([{ client_msg_id: "c-2", utterance_id: "u", status: "heard" }]);
  expect(levels).toEqual([0.4]);
  host.speak({ utterance_id: "u", text: "hola" });
  expect(made[0].asked.at(-1)).toEqual(["roomEvent", { type: "voice-reply", data: { utterance_id: "u", text: "hola" } }]);
});

test("new settings reconfigure the same call, and a mute chosen before it exists is applied to it", async () => {
  const { VoiceCall, made } = fakeCall();
  const host = createVoiceHost(engine, { VoiceCall });
  host.mute(true);
  await host.setSettings(settings());
  const next = settings({ tts: { model: "kokoro-82m-v1.0", build: null, voice: "ef_dora", speed: 1.1 }, patience: "calm" });
  await host.setSettings(next);
  expect(made).toHaveLength(1);
  expect(made[0].asked[0]).toEqual(["mute", true]);
  expect(made[0].asked[1]).toEqual(["setConfig", voiceConfig(next)]);
  expect(voiceConfig(next)).toMatchObject({ stt: { build: null, language: "es" }, tts: { voice: "ef_dora", speed: 1.1 }, patience: "calm", end_of_turn: "silence" });
});

test("settings the catalogue cannot take are refused before anything changes", async () => {
  const { VoiceCall, made } = fakeCall();
  const host = createVoiceHost(engine, { VoiceCall });
  await expect(host.setSettings(settings({ stt: { model: "parakeet", build: null, language: null } }))).rejects.toMatchObject({ code: "model-unknown" });
  await expect(host.setSettings(settings({ stt: { model: "kokoro-82m-v1.0", build: null, language: null } }))).rejects.toMatchObject({ code: "model-wrong-task" });
  await expect(host.setSettings(settings({ stt: { model: "whisper-base", build: "whisper-base/gpu", language: null } }))).rejects.toMatchObject({ code: "build-unfit" });
  await expect(host.setSettings(settings({ end_of_turn: "smart-turn" }))).rejects.toMatchObject({ code: "end-of-turn-unavailable" });
  expect(made).toHaveLength(0);
  await host.setSettings(settings({ stt: { model: "whisper-base", build: "whisper-base/int8", language: null } }));
  expect(made[0].config).toMatchObject({ stt: { model: "whisper-base", build: "whisper-base/int8", language: null } });
});

test("provider keys stay on this device", async () => {
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) };
  const host = createVoiceHost(engine, { VoiceCall: fakeCall().VoiceCall, storage: storage as unknown as Storage });
  await host.setProviderKey("openai", "sk-test");
  expect(await host.hasProviderKey("openai")).toBe(true);
  await host.setProviderKey("openai", null);
  expect(await host.hasProviderKey("openai")).toBe(false);
});

test("the engine reads the keys where the interface keeps them", async () => {
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) };
  const host = createVoiceHost(engine, { VoiceCall: fakeCall().VoiceCall, storage: storage as unknown as Storage });
  expect(providerKey("elevenlabs", storage as unknown as Storage)).toBeNull();
  await host.setProviderKey("elevenlabs", "xi-test");
  expect(providerKey("elevenlabs", storage as unknown as Storage)).toBe("xi-test");
});
