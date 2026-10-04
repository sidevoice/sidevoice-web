import { describe, expect, it } from "vitest";
import {
  createOnboardingRepository,
  emptyOnboardingRecord,
  hasMatchingTrial,
  mergeOnboardingRecord,
  normalizeOnboardingRecord,
  resumeOnboarding,
  stageTrialKey,
  type OnboardingPort,
  type ResumeFacts,
} from "./onboarding-state";

function memoryStorage(seed: Record<string, string> = {}, fail = false): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key) { return data.get(key) ?? null; },
    key(index) { return [...data.keys()][index] ?? null; },
    removeItem(key) { data.delete(key); },
    setItem(key, value) { if (fail) throw new Error("quota"); data.set(key, value); },
  } as Storage;
}

describe("onboarding record and resume", () => {
  it("resumes each approved B step from live host facts and matching tries", () => {
    const facts = {
      record: emptyOnboardingRecord(), canHostAgents: true, localReady: false, localInstallStarted: false,
      remoteReady: false, hostFp: "host-a", sttStageKey: "stt-1", ttsStageKey: "tts-1",
    };
    expect(resumeOnboarding(facts)).toBe("W1");
    facts.record = mergeOnboardingRecord(facts.record, { choice: "agents" });
    expect(resumeOnboarding(facts)).toBe("W2");
    facts.localReady = true;
    expect(resumeOnboarding(facts)).toBe("W3");
    facts.record = mergeOnboardingRecord(facts.record, { agents_done: true });
    expect(resumeOnboarding(facts)).toBe("W4");
    facts.record = mergeOnboardingRecord(facts.record, { trials: { "host-a": { stt: "stt-1" } } });
    expect(resumeOnboarding(facts)).toBe("W4v");
    facts.record = mergeOnboardingRecord(facts.record, { trials: { "host-a": { tts: "tts-1" } } });
    expect(resumeOnboarding(facts)).toBe("W6");
    facts.ttsStageKey = "tts-2";
    expect(resumeOnboarding(facts)).toBe("W4v");
  });

  it("takes remote only clients straight to pairing and resumes after a real pairing", () => {
    const record = normalizeOnboardingRecord({ choice: "agents", agents_done: true, test_passed: true });
    const facts: ResumeFacts = { record, canHostAgents: false, localReady: false, localInstallStarted: false, remoteReady: false,
      hostFp: null, sttStageKey: null, ttsStageKey: null };
    expect(resumeOnboarding(facts)).toBe("W2r");
    facts.remoteReady = true;
    facts.hostFp = "remote-a";
    facts.sttStageKey = "stt-a";
    facts.ttsStageKey = "tts-a";
    expect(resumeOnboarding(facts)).toBe("W4");
  });

  it("confirms browser writes and fails closed when page storage rejects them", async () => {
    const repo = createOnboardingRepository({ storage: memoryStorage() });
    const before = await repo.read();
    const saved = await repo.patch(before, { completed_at: 123, deferred_at: null });
    expect(saved.completed_at).toBe(123);
    expect(await repo.read()).toEqual(saved);
    const failing = createOnboardingRepository({ storage: memoryStorage({}, true) });
    await expect(failing.patch(emptyOnboardingRecord(), { completed_at: 456 })).rejects.toMatchObject({ key: "onboarding.write_failed" });
  });

  it("reads back an ambiguous native write and only accepts confirmed completion", async () => {
    let durable = emptyOnboardingRecord();
    const nativePort: OnboardingPort = {
      async read() { return durable; },
      async patch(update) {
        durable = mergeOnboardingRecord(durable, update);
        throw new Error("ack timeout after durable write");
      },
    };
    const repo = createOnboardingRepository({ nativePort, nativeExpected: true });
    const saved = await repo.patch(emptyOnboardingRecord(), { completed_at: 789 });
    expect(saved.completed_at).toBe(789);
    expect(await repo.read()).toEqual(saved);

    const unavailable: OnboardingPort = { async read() { return emptyOnboardingRecord(); }, async patch() { throw new Error("rejected"); } };
    const blocked = createOnboardingRepository({ nativePort: unavailable, nativeExpected: true });
    await expect(blocked.patch(emptyOnboardingRecord(), { completed_at: 790 })).rejects.toMatchObject({ key: "onboarding.write_failed" });
  });

  it("keys trial acknowledgements to host and stable effective stage data", () => {
    const first = stageTrialKey("fp", { place: "device", model: "whisper", options: { language: "auto", context: "" } });
    const same = stageTrialKey("fp", { options: { context: "", language: "auto" }, model: "whisper", place: "device" });
    expect(first).toBe(same);
    const record = mergeOnboardingRecord(emptyOnboardingRecord(), { trials: { fp: { stt: first } } });
    expect(hasMatchingTrial(record, "fp", "stt", same)).toBe(true);
    expect(hasMatchingTrial(record, "other", "stt", same)).toBe(false);
    expect(hasMatchingTrial(record, "fp", "stt", stageTrialKey("fp", { place: "device", model: "other" }))).toBe(false);
    expect(stageTrialKey("fp", { stage: { place: "provider", model: "one" }, language: "en" }))
      .not.toBe(stageTrialKey("fp", { stage: { place: "provider", model: "one" }, language: "fr" }));
  });
});
