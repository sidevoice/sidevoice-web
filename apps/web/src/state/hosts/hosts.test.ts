import { describe, expect, it } from "vitest";
import { adoptDefault, chooseStage, copyStages, effectiveStage, emptyScope, forgetHost, migrateStages, type Stage } from "./stage-scope";
import { hostList, hostRows, localBanner, localSubtitle, remoteSubtitle, type StoredPairing } from "./host-list";
import { opensByItself, previousStep, resumeStep } from "./onboarding";
import type { LocalPairing } from "../../services/desktop-host";

const device = (model: string): Stage => ({ place: "device", model, options: {}, build: null });
const provider = (place: string, model: string): Stage => ({ place, model, options: {}, build: null });

describe("stage scope (§3): per machine", () => {
  it("keeps a choice with the machine it was made for, and nowhere else", () => {
    const scope = chooseStage(emptyScope(), "nuc", "tts", device("kokoro"));
    expect(effectiveStage(scope, "nuc", "tts")?.model).toBe("kokoro");
    expect(effectiveStage(scope, "mac", "tts")).toBeNull();
    expect(scope.default).toEqual({});
  });

  it("keeps this device's models with no machine, and refuses a provider or a machine there", () => {
    const scope = chooseStage(emptyScope(), null, "stt", device("whisper-base"));
    expect(effectiveStage(scope, null, "stt")?.model).toBe("whisper-base");
    expect(() => chooseStage(emptyScope(), null, "stt", provider("openai", "whisper-1"))).toThrow();
    expect(() => chooseStage(emptyScope(), null, "stt", provider("host", "whisper-small"))).toThrow();
  });

  it("a machine takes what was chosen with none for each stage it has none of its own, and keeps its own", () => {
    const none = chooseStage(chooseStage(emptyScope(), null, "tts", device("kokoro")), null, "stt", device("whisper-base"));
    expect(effectiveStage(adoptDefault(none, "nuc"), "nuc", "tts")?.model).toBe("kokoro");
    const own = adoptDefault(chooseStage(none, "nuc", "tts", provider("elevenlabs", "flash")), "nuc");
    expect(effectiveStage(own, "nuc", "tts")?.place).toBe("elevenlabs");
    expect(effectiveStage(own, "nuc", "stt")?.model).toBe("whisper-base");
  });

  it("«Copiar de…» copies this device's models and a provider's choice (asking for a key), never the machine itself", () => {
    let scope = chooseStage(emptyScope(), "nuc", "stt", provider("host", "whisper-large-v3-turbo"));
    scope = chooseStage(scope, "nuc", "tts", provider("elevenlabs", "flash"));
    const result = copyStages(scope, "nuc", "mac", () => false);
    expect(effectiveStage(result.scope, "mac", "tts")?.place).toBe("elevenlabs");
    expect(effectiveStage(result.scope, "mac", "stt")).toBeNull();
    expect(result).toMatchObject({ copied: ["tts"], needsKey: ["tts"], notCopied: ["stt"] });
    expect(copyStages(scope, "nuc", "mac", () => true).needsKey).toEqual([]);
    const local = copyStages(chooseStage(emptyScope(), "mac", "stt", device("whisper-base")), "mac", "nuc", () => false);
    expect(effectiveStage(local.scope, "nuc", "stt")?.model).toBe("whisper-base");
  });

  it("a forgotten machine takes its stages with it", () => {
    const scope = chooseStage(emptyScope(), "nuc", "tts", provider("elevenlabs", "flash"));
    expect(forgetHost(scope, "nuc").hosts).toEqual({});
  });

  it("migrates today's per-fingerprint stages as they are: one pair per machine", () => {
    const scope = migrateStages({ mac: { stt: device("whisper-base"), tts: device("kokoro") }, nuc: { tts: provider("elevenlabs", "flash"), stt: device("whisper-tiny") } });
    expect(scope.default).toEqual({});
    expect(scope.hosts).toEqual({ mac: { stt: device("whisper-base"), tts: device("kokoro") }, nuc: { tts: provider("elevenlabs", "flash"), stt: device("whisper-tiny") } });
  });
});

const local: LocalPairing = { fp: "L", public_key: "k", device_id: "d", token: "s", urls: ["http://127.0.0.1:1"], rv: null, host: "Mac", local: true };
const remote = (fp: string, extra: Partial<StoredPairing> = {}): StoredPairing => ({ fp, host: fp.toUpperCase(), urls: [], rv: { url: "https://room.example", node: fp }, device_id: "d" + fp, token: "t", public_key: "k", ...extra });

describe("host list (§4.1, §5.2)", () => {
  it("puts the local host first and lets in_use name it", () => {
    const list = hostList(local, { inUse: "L", list: [remote("nuc")] });
    expect(list.entries.map((e) => e.fp)).toEqual(["L", "nuc"]);
    expect(list.inUse).toBe("L");
  });

  it("drops a stored pairing with the local fingerprint: the local entry wins", () => {
    const list = hostList(local, { inUse: "nuc", list: [remote("L"), remote("nuc")] });
    expect(list.entries.map((e) => e.fp)).toEqual(["L", "nuc"]);
    expect(list.dropped.map((p) => p.fp)).toEqual(["L"]);
  });

  it("falls back to the first host when in_use names nothing listed", () => {
    expect(hostList(null, { inUse: "gone", list: [remote("nuc")] }).inUse).toBe("nuc");
    expect(hostList(null, { inUse: null, list: [] }).inUse).toBeNull();
  });

  it("words each local state as F6 does", () => {
    expect(localSubtitle({ state: "backoff", attempts: 2, max_attempts: 5 }).subtitle).toEqual({ key: "host.state.backoff", params: { n: 2, of: 5 } });
    expect(localSubtitle({ state: "failed", failure: { key: "import.missing-module", detail: "soxr" } }).subtitle).toEqual({ key: "failure.import.missing-module", params: { detail: "soxr" } });
    expect(localSubtitle({ state: "service-failed", failure: { key: "start-limit" } }).cause).toEqual({ key: "service.start-limit" });
    expect(localSubtitle({ state: "incompatible", incompatible: "core-newer" }).subtitle.key).toBe("host.state.coreNewer");
  });

  it("says since when a remote host is silent", () => {
    const now = 1_000_000_000_000;
    expect(remoteSubtitle(remote("nuc"), { state: "unreachable", since: now / 1000 - 3 * 3600 }, now).subtitle).toEqual({ key: "host.remote.silentSince", params: { amount: 3, unit: "h" } });
    expect(remoteSubtitle(remote("nuc"), { state: "ok", via: "room" }, now).subtitle).toEqual({ key: "host.remote.connected" });
    expect(remoteSubtitle(remote("nuc", { revoked: true }), undefined, now).dot).toBe("fail");
  });

  it("only a running local host can be switched to, and a non-running one is a banner, not «no machine»", () => {
    const rows = hostRows(hostList(local, { inUse: "L", list: [] }), { local: { state: "stopped-by-person" }, reach: {}, newAgents: {}, now: 0 });
    expect(rows[0].usable).toBe(false);
    expect(localBanner({ state: "stopped-by-person" })).toEqual({ key: "host.state.stopped" });
    expect(localBanner({ state: "running" })).toBeNull();
    expect(localBanner({ state: "absent" })).toBeNull();
  });
});

describe("onboarding resume (§5.1)", () => {
  const facts = { onboarding: null, localReady: false, remoteReady: false, sttSet: false, ttsSet: false, canHostAgents: true };
  it("starts at W1, or at W3 when an npx core already runs (F1)", () => {
    expect(resumeStep(facts)).toBe("W1");
    expect(resumeStep({ ...facts, localReady: true })).toBe("W3");
  });
  it("resumes at the first step whose outcome is not durable", () => {
    const agents = { ...facts, onboarding: { choice: "agents" as const, deferred_at: 1 } };
    expect(resumeStep(agents)).toBe("W2");
    expect(resumeStep({ ...agents, localReady: true })).toBe("W3");
    expect(resumeStep({ ...agents, localReady: true, onboarding: { ...agents.onboarding, agents_done: true } })).toBe("W4");
    expect(resumeStep({ ...agents, localReady: true, sttSet: true, onboarding: { ...agents.onboarding, agents_done: true } })).toBe("W4v");
    expect(resumeStep({ ...agents, localReady: true, sttSet: true, ttsSet: true, onboarding: { ...agents.onboarding, agents_done: true } })).toBe("W5");
    const remote = { ...facts, onboarding: { choice: "remote" as const } };
    expect(resumeStep(remote)).toBe("W2r");
    expect(resumeStep({ ...remote, remoteReady: true, sttSet: true, ttsSet: true, onboarding: { choice: "remote" as const, test_passed: true } })).toBe("W6");
  });
  it("skips W1 where this platform cannot host agents", () => {
    expect(resumeStep({ ...facts, canHostAgents: false })).toBe("W2r");
  });
  it("opens by itself only on a first run of the app", () => {
    expect(opensByItself(null, true, false, false)).toBe(true);
    expect(opensByItself({ deferred_at: 1 }, true, false, false)).toBe(false);
    expect(opensByItself(null, false, false, false)).toBe(false);
    expect(opensByItself(null, true, true, false)).toBe(false);
  });
  it("goes back from the agents step to the question, not to the install", () => {
    expect(previousStep("W3", "agents")).toBe("W1");
    expect(previousStep("W4", "remote")).toBe("W2r");
    expect(previousStep("W1", null)).toBeNull();
  });
});
