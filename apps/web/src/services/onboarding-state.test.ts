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
  record: basics(), canHostAgents: true, localReady: false, remoteReady: false, microphonePassed: true,
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

test("resume: the permissions right after the basics, before the machine, until passed with the microphone allowed", () => {
  const remote = { ...basics(), choice: "remote" as const };
  expect(resumeOnboarding(facts({ record: remote, remoteReady: true, microphonePassed: false }))).toBe("W4m");
  // Before the machine: no machine needed to be asked.
  expect(resumeOnboarding(facts({ record: remote, microphonePassed: false }))).toBe("W4m");
  expect(resumeOnboarding(facts({ record: { ...basics(), choice: null }, microphonePassed: false }))).toBe("W4m");
  // Required in this release (operator, 2026-10-16): passed, transcription always comes after the machine.
  expect(resumeOnboarding(facts({ record: remote, remoteReady: true }))).toBe("W4");
  // The basics come first.
  expect(resumeOnboarding(facts({ record: { ...basics(), basics_done: false }, microphonePassed: false }))).toBe("W0");
  expect(normalizeOnboardingRecord({ microphone_done: true }).microphone_done).toBe(true);
});

test("resume, live (onboardingFlow b): a machine connected anywhere and models ready count as done", () => {
  const agents = { ...basics(), choice: "agents" as const };
  // This computer was chosen, another machine was paired in Settings: on past the machine.
  expect(resumeOnboarding(facts({ record: agents, remoteReady: true }))).toBe("W2");
  expect(resumeOnboarding(facts({ record: agents, remoteReady: true, live: { sttReady: true, ttsReady: true } }))).toBe("W5");
  expect(resumeOnboarding(facts({ record: agents, remoteReady: true, live: { sttReady: true, ttsReady: false } }))).toBe("W4v");
});

test("resume, with skips (onboardingFlow d): what was passed without is passed; done, its mark no longer matters", () => {
  const remote = { ...basics(), choice: "remote" as const, machine_skipped: true };
  expect(resumeOnboarding(facts({ record: remote }))).toBe("W2r");
  expect(resumeOnboarding(facts({ record: remote, skips: true }))).toBe("W4");
  expect(resumeOnboarding(facts({ record: { ...remote, stt_skipped: true }, skips: true }))).toBe("W4v");
  expect(resumeOnboarding(facts({ record: { ...remote, stt_skipped: true, tts_skipped: true }, skips: true }))).toBe("W5");
  const agents = { ...basics(), choice: "agents" as const, machine_skipped: true };
  // This computer passed without: no agents to connect either.
  expect(resumeOnboarding(facts({ record: agents, skips: true }))).toBe("W4");
  // Skipped from where you work, no way chosen: on to the voice; without skips, where you work again.
  const unchosen = { ...basics(), machine_skipped: true };
  expect(resumeOnboarding(facts({ record: unchosen, canHostAgents: true, skips: true }))).toBe("W4");
  expect(resumeOnboarding(facts({ record: unchosen, canHostAgents: true }))).toBe("W1");
  expect(normalizeOnboardingRecord({ microphone_skipped: true, machine_skipped: true, stt_skipped: true, tts_skipped: true })).toMatchObject({ microphone_skipped: true, machine_skipped: true, stt_skipped: true, tts_skipped: true });
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
