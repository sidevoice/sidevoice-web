import { describe, expect, it } from "vitest";
import { chooseStage, effectiveStage, emptyScope, forgetHost, migrateStages, stageSource, useGeneral, type Stage } from "./stage-scope";
import { hostList, hostRows, localBanner, localSubtitle, remoteSubtitle, type StoredPairing } from "./host-list";
import { opensByItself, previousStep, resumeStep } from "./onboarding";
import type { LocalPairing } from "../../services/desktop-host";

const device = (model: string): Stage => ({ place: "device", model, options: {}, build: null });
const provider = (place: string, model: string): Stage => ({ place, model, options: {}, build: null });

describe("stage scope (§3)", () => {
  it("keeps device choices in the default, valid for every host", () => {
    const scope = chooseStage(emptyScope(), "nuc", "tts", device("kokoro"));
    expect(scope.default.tts?.model).toBe("kokoro");
    expect(scope.hosts).toEqual({});
    expect(effectiveStage(scope, "other", "tts")?.model).toBe("kokoro");
  });

  it("keeps a provider only as that host's override", () => {
    const scope = chooseStage(chooseStage(emptyScope(), null, "tts", device("kokoro")), "nuc", "tts", provider("elevenlabs", "flash"));
    expect(effectiveStage(scope, "nuc", "tts")?.place).toBe("elevenlabs");
    expect(effectiveStage(scope, "mac", "tts")?.place).toBe("device");
    expect(stageSource(scope, "nuc", "tts")).toBe("host");
    expect(stageSource(scope, "mac", "tts")).toBe("general");
  });

  it("refuses a provider with no host to keep it", () => {
    expect(() => chooseStage(emptyScope(), null, "stt", provider("openai", "whisper-1"))).toThrow();
  });

  it("choosing this device for a host writes the default and drops that host's override", () => {
    let scope = chooseStage(emptyScope(), "nuc", "tts", provider("elevenlabs", "flash"));
    scope = chooseStage(scope, "nuc", "tts", device("kokoro"));
    expect(scope.hosts.nuc).toBeUndefined();
    expect(scope.default.tts?.model).toBe("kokoro");
  });

  it("«Usar la configuración general» removes only that task's override", () => {
    let scope = chooseStage(emptyScope(), "nuc", "tts", provider("elevenlabs", "flash"));
    scope = chooseStage(scope, "nuc", "stt", provider("openai", "whisper-1"));
    scope = useGeneral(scope, "nuc", "tts");
    expect(scope.hosts.nuc).toEqual({ stt: provider("openai", "whisper-1") });
    expect(forgetHost(scope, "nuc").hosts).toEqual({});
  });

  it("migrates today's per-fingerprint stages", () => {
    const scope = migrateStages({ mac: { stt: device("whisper-base"), tts: device("kokoro") }, nuc: { tts: provider("elevenlabs", "flash"), stt: device("whisper-tiny") } }, "mac");
    expect(scope.default).toEqual({ stt: device("whisper-base"), tts: device("kokoro") });
    expect(scope.hosts).toEqual({ nuc: { tts: provider("elevenlabs", "flash") } });
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
    expect(remoteSubtitle(remote("nuc"), { state: "ok", via: "room" }, now).subtitle).toEqual({ key: "host.remote.viaRoom", params: { where: "room.example" } });
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
  const facts = { onboarding: null, localReady: false, remoteReady: false, stagesSet: false, canHostAgents: true };
  it("starts at W1, or at W3 when an npx core already runs (F1)", () => {
    expect(resumeStep(facts)).toBe("W1");
    expect(resumeStep({ ...facts, localReady: true })).toBe("W3");
  });
  it("resumes at the first step whose outcome is not durable", () => {
    const agents = { ...facts, onboarding: { choice: "agents" as const, deferred_at: 1 } };
    expect(resumeStep(agents)).toBe("W2");
    expect(resumeStep({ ...agents, localReady: true })).toBe("W3");
    expect(resumeStep({ ...agents, localReady: true, onboarding: { ...agents.onboarding, agents_done: true } })).toBe("W4");
    expect(resumeStep({ ...agents, localReady: true, stagesSet: true, onboarding: { ...agents.onboarding, agents_done: true } })).toBe("W5");
    const remote = { ...facts, onboarding: { choice: "remote" as const } };
    expect(resumeStep(remote)).toBe("W2r");
    expect(resumeStep({ ...remote, remoteReady: true, stagesSet: true, onboarding: { choice: "remote" as const, test_passed: true } })).toBe("W6");
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
