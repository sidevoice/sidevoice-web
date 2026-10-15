import { expect, test } from "vitest";
import {
  createOnboardingRepository, emptyOnboardingRecord, mergeOnboardingRecord, normalizeOnboardingRecord, resumeOnboarding, trialKey,
  ONBOARDING_STORAGE_KEY, type ResumeFacts,
} from "./onboarding-state";

/* The setup's progress on this device, where it resumes, and a completion that counts only once it reads back. */

const stt = { catalog: "local", model: "whisper-base", language: null };
const tts = { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: "v1", speed: 1 };
const basics = () => ({ ...emptyOnboardingRecord(), basics_done: true });
const facts = (patch: Partial<ResumeFacts> = {}): ResumeFacts => ({
  record: basics(), canHostAgents: true, localReady: false, remoteReady: false, microphoneReady: true,
  sttKey: trialKey(stt), ttsKey: trialKey(tts), ...patch,
});
function memory(fail: { set?: boolean; keep?: boolean } = {}) {
  const kept = new Map<string, string>();
  return { kept, storage: {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail.set) throw new DOMException("full", "QuotaExceededError"); if (fail.keep !== false) kept.set(key, value); },
  } };
}

test("a stored record is read field by field; anything else is the empty record", () => {
  expect(normalizeOnboardingRecord(null)).toEqual(emptyOnboardingRecord());
  expect(normalizeOnboardingRecord({ choice: "elsewhere", agents_done: "yes", completed_at: -1, trials: { stt: "k", tts: 3, x: "y" } }))
    .toEqual({ ...emptyOnboardingRecord(), trials: { stt: "k" } });
  const merged = mergeOnboardingRecord({ ...emptyOnboardingRecord(), trials: { stt: "a", tts: "b" } }, { choice: "remote", trials: { stt: null } });
  expect(merged).toEqual({ ...emptyOnboardingRecord(), choice: "remote", trials: { tts: "b" } });
});

test("a tried setting keys the same however it was written, and differently once it changes", () => {
  expect(trialKey({ model: "m", catalog: "local", language: null })).toBe(trialKey({ catalog: "local", language: null, model: "m" }));
  expect(trialKey({ ...stt, language: "es" })).not.toBe(trialKey(stt));
  expect(trialKey(null)).toBeNull();
});

test("resume: the basics, where the agents run, then the machine, the agents, transcription, voice, the end of turn, ready", () => {
  expect(resumeOnboarding(facts({ record: emptyOnboardingRecord() }))).toBe("W0");
  expect(resumeOnboarding(facts())).toBe("W1");
  // A browser or a phone cannot run agents: it starts by pairing another machine.
  expect(resumeOnboarding(facts({ canHostAgents: false }))).toBe("W2r");
  // An npx machine already running here is the agents path, at its agents.
  expect(resumeOnboarding(facts({ localReady: true }))).toBe("W3");
  const local = { ...basics(), choice: "agents" as const };
  expect(resumeOnboarding(facts({ record: local }))).toBe("W2");
  expect(resumeOnboarding(facts({ record: { ...local, agents_done: true }, localReady: true }))).toBe("W4");
  const remote = { ...basics(), choice: "remote" as const };
  expect(resumeOnboarding(facts({ record: remote }))).toBe("W2r");
  expect(resumeOnboarding(facts({ record: remote, remoteReady: true }))).toBe("W4");
  const tried = { ...remote, trials: { stt: trialKey(stt)!, tts: trialKey(tts)! }, turn_done: true };
  expect(resumeOnboarding(facts({ record: tried, remoteReady: true }))).toBe("W6");
  // Chosen without a try counts the same; the end of turn is its own step.
  const chosen = { ...remote, chosen: { stt: trialKey(stt)!, tts: trialKey(tts)! } };
  expect(resumeOnboarding(facts({ record: chosen, remoteReady: true }))).toBe("W5");
  expect(resumeOnboarding(facts({ record: { ...chosen, turn_done: true }, remoteReady: true }))).toBe("W6");
  // A setting changed since its try is tried again; a machine gone is paired again.
  expect(resumeOnboarding(facts({ record: tried, remoteReady: true, ttsKey: trialKey({ ...tts, voice: "v2" }) }))).toBe("W4v");
  expect(resumeOnboarding(facts({ record: tried, remoteReady: true, sttKey: null }))).toBe("W4");
  expect(resumeOnboarding(facts({ record: tried, remoteReady: false }))).toBe("W2r");
});

test("resume: the microphone, once the machine is there and before transcription, whenever it may not be used now", () => {
  const remote = { ...basics(), choice: "remote" as const };
  expect(resumeOnboarding(facts({ record: remote, remoteReady: true, microphoneReady: false }))).toBe("W4m");
  // Allowed once and blocked since: asked again, even with everything else done.
  const done = { ...remote, microphone_done: true, chosen: { stt: trialKey(stt)!, tts: trialKey(tts)! }, turn_done: true };
  expect(resumeOnboarding(facts({ record: done, remoteReady: true, microphoneReady: false }))).toBe("W4m");
  // The machine comes first: no microphone step without one.
  expect(resumeOnboarding(facts({ record: remote, microphoneReady: false }))).toBe("W2r");
  expect(normalizeOnboardingRecord({ microphone_done: true }).microphone_done).toBe(true);
});

test("the record is kept in this device's storage, and a write counts only once it reads back", async () => {
  const { kept, storage } = memory();
  const repository = createOnboardingRepository(storage);
  expect(repository.read()).toEqual(emptyOnboardingRecord());
  const saved = await repository.patch(emptyOnboardingRecord(), { completed_at: 5 });
  expect(saved.completed_at).toBe(5);
  expect(JSON.parse(kept.get(ONBOARDING_STORAGE_KEY)!).completed_at).toBe(5);
  expect(repository.read().completed_at).toBe(5);
  // A storage that refuses, or that does not keep what it was given, is a failure: never an optimistic success.
  await expect(createOnboardingRepository(memory({ set: true }).storage).patch(emptyOnboardingRecord(), { completed_at: 5 }))
    .rejects.toMatchObject({ key: "onboarding.write_failed" });
  await expect(createOnboardingRepository(memory({ keep: false }).storage).patch(emptyOnboardingRecord(), { completed_at: 5 }))
    .rejects.toMatchObject({ key: "onboarding.write_failed" });
  await expect(createOnboardingRepository(null).patch(emptyOnboardingRecord(), { completed_at: 5 })).rejects.toMatchObject({ key: "onboarding.write_failed" });
  expect(() => createOnboardingRepository({ getItem: () => { throw new DOMException("blocked", "SecurityError"); }, setItem() {} }).read())
    .toThrow(expect.objectContaining({ key: "onboarding.read_failed" }));
});
