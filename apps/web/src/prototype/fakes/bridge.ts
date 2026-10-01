/* PROTOTYPE ONLY — a fake `window.__sidevoiceDesktop.host` (ONBOARDING_AND_HOSTS.md §4.7) driven by a scenario: the
 * local host's state timeline, the answers to each call, the install with byte progress, «Esta app» and the reset. */
import type { AppDiagnostics, AppSettings, BridgeResult, DesktopHost, InstallProgress, LocalHostState, LocalPairing, OnboardingState, ResetStep } from "../../services/desktop-host";
import type { CallAnswer, Scenario, TimedState, Toggles } from "../scenario";
import type { FakeHosts } from "./hosts";
import { LOCAL_BASE, ROOM_URL } from "./hosts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CORE = { pid: 4242, version: "0.4.0", api: 3, launch_id: "7c1d" };
const CORE_BYTES = 92_400_000;

export interface FakeBridge { host: DesktopHost; note(text: string): void }

export function createFakeBridge(scenario: Scenario, toggles: Toggles, hosts: FakeHosts, onNote: (text: string) => void, onRelaunch: (scenario: string) => void): DesktopHost {
  const seed = scenario.bridge?.localHost ?? { states: [{ state: "absent", after_ms: 0 }] };
  const local = hosts.byAlias.get("local");
  let state: LocalHostState = { state: "absent" };
  const listeners = new Set<(s: LocalHostState) => void>();
  const callIndex = new Map<string, number>();
  let timers: ReturnType<typeof setTimeout>[] = [];
  let installAbort: (() => void) | null = null;
  let onboarding: OnboardingState | null = scenario.onboarding ? { ...scenario.onboarding } : null;
  let settings: AppSettings = { muteShortcut: "CmdOrCtrl+Shift+M", callControlsAlways: false };
  let resetFailed = false;

  if (toggles.resumeAt) {
    const at = String(toggles.resumeAt);
    onboarding = { choice: "agents", deferred_at: Math.floor(Date.now() / 1000) - 3600, agents_done: ["W4", "W5"].includes(at), test_passed: false };
  }

  function emit(next: Partial<LocalHostState> & { state: LocalHostState["state"] }) {
    const { after_ms: _after, ...rest } = next as TimedState;
    state = { ...state, ...rest, since: Date.now() / 1000 };
    if (state.failure && !state.failure.at) state.failure = { ...state.failure, at: Math.floor(Date.now() / 1000) - 40 };
    if (state.state === "running") { state.failure = null; state.core = { ...CORE, ...(rest.core ?? state.core ?? {}) }; }
    if (local && state.state === "running" && !local.refused) local.reachable = true;
    for (const listener of listeners) listener(state);
  }
  function play(states: TimedState[]) {
    for (const timer of timers) clearTimeout(timer);
    timers = states.map((s) => setTimeout(() => emit(s), s.after_ms));
  }
  function scripted(name: string): CallAnswer | null {
    const list = seed.calls?.[name];
    if (!list?.length) return null;
    const index = callIndex.get(name) ?? 0;
    callIndex.set(name, index + 1);
    return list[Math.min(index, list.length - 1)];
  }
  const failing = (): TimedState[] => [
    { state: "starting", after_ms: 0 },
    { state: "backoff", after_ms: 1500, attempts: 1, failure: { key: "bind.port-in-use", detail: "8768", step: "bind" } },
    { state: "backoff", after_ms: 4000, attempts: 2, failure: { key: "bind.port-in-use", detail: "8768", step: "bind" } },
    { state: "failed", after_ms: 6500, failure: { key: "bind.port-in-use", detail: "8768", step: "bind", attempts: 5, at: Math.floor(Date.now() / 1000) + 6,
      log_tail: ["INFO  sidevoice_core.server: starting (launch 9e2f)", "ERROR [Errno 48] error while attempting to bind on address ('127.0.0.1', 8768): address already in use"] } },
  ];
  async function call(name: string, fallback: TimedState[], extra?: () => void): Promise<BridgeResult> {
    const answer = scripted(name);
    await sleep(answer?.delay_ms ?? 400);
    if (answer && !answer.ok) return { ok: false, error: answer.error ?? { key: "failed" } };
    extra?.();
    const restarts = ["start", "restart", "serviceInstall"].includes(name);
    play(restarts && toggles.coreFailing ? failing() : answer?.states ?? fallback);
    return { ok: true };
  }
  const startStates: TimedState[] = [{ state: "starting", after_ms: 0 }, { state: "running", after_ms: 1600 }];

  const pairing = (): LocalPairing | null => {
    if (!local || ["absent", "installing"].includes(state.state)) return null;
    return { fp: local.fp, public_key: local.publicKey, device_id: hosts.selfDevice("local"), token: "session-secret", urls: [LOCAL_BASE], rv: null, host: local.name, local: true };
  };

  const initial = toggles.localTokenWrite && seed.states[0]?.state === "running"
    ? [{ state: "failed" as const, after_ms: 0, failure: { key: "app.storage", step: "pair" } }] : seed.states;
  state = { ...state, ...initial[0], core: ["absent", "installing"].includes(initial[0].state) ? null : { ...CORE, ...(initial[0].core ?? {}) } };
  if (initial.length > 1) setTimeout(() => play(initial.slice(1)), 0);

  const diagnostics: AppDiagnostics = {
    version: "0.9.0", os: "macOS 15.1", arch: "arm64", accelerators: ["cpu", "coreml"], memory_mb: 16384,
    webview: { microphone: true, secureContext: true, webCrypto: !toggles.w2rNoWebCrypto },
    engine: {
      packages: (scenario.installed ?? []).length ? [{ engine: "sherpa-onnx", version: "1.12.9", bytes: 31_000_000 }] : [],
      builds: (scenario.installed ?? []).map((model) => ({ model: model.startsWith("whisper") ? "Whisper " + model.split("-")[1] : "Kokoro 82M", task: model.startsWith("whisper") ? "stt" as const : "tts" as const, engine: "sherpa-onnx", bytes: model.startsWith("whisper") ? 207_000_000 : 132_000_000 })),
    },
    headset: { supported: true, muteGesture: true },
  };

  const host: DesktopHost = {
    version: 1,
    platform: String(toggles.appPlatform || "") || (scenario.platform ?? "macos-aarch64"),
    hostsAgents: (scenario.platform ?? "macos-aarch64") === "macos-aarch64",
    computerName: scenario.hosts?.local?.name ?? "MacBook de Ana",
    localHost: {
      async state() { return state; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      async pairing() { return pairing(); },
      start: () => call("start", startStates),
      stop: () => call("stop", [{ state: "stopped-by-person", after_ms: 300 }]),
      restart: () => call("restart", startStates),
      serviceInstall: () => call("serviceInstall", startStates),
      serviceUninstall: () => call("serviceUninstall", [{ state: "not-installed", after_ms: 600 }]),
      reconnect: () => call("reconnect", [{ state: "running", after_ms: 500 }], () => { if (local) local.refused = false; }),
      async revealLog() { onNote("revealLog"); return { ok: true }; },
      async pairingCode() {
        const answer = scripted("pairingCode");
        await sleep(500);
        if (answer && !answer.ok) return { ok: false, error: answer.error ?? { key: "failed" } };
        return { ok: true, code: hosts.code("local"), expires_in: 600, reach: answer?.reach ?? "room" };
      },
      async pairRoom() {
        const answer = scripted("pairRoom");
        await sleep(answer?.delay_ms ?? 1200);
        if (answer && !answer.ok) return { ok: false, error: answer.error ?? { key: "failed" } };
        if (local) local.rv = { url: ROOM_URL, node: "local-node" };
        play([{ state: "starting", after_ms: 0 }, { state: "running", after_ms: 1200 }]);
        return { ok: true };
      },
      update: () => call("update", [{ state: "starting", after_ms: 0 }, { state: "running", after_ms: 2400, update: null }]),
      async agents() {
        await sleep(700);
        if (toggles.w1NoAgents) return [];
        return (local?.agents ?? seed.agents ?? []).map((a) => ({ ...a }));
      },
      install(onProgress: (p: InstallProgress) => void) {
        return new Promise<BridgeResult>((resolve) => {
          let cancelled = false;
          installAbort = () => { cancelled = true; };
          const duration = (seed.install?.duration_ms ?? 6000) * (toggles.slowDownload ? 6 : 1);
          const error = toggles.offline ? "install.network" : String(toggles.w2Error || "");
          emit({ state: "installing" });
          const started = Date.now();
          const fail = (key: string, step: InstallProgress["step"], at: number) => {
            onProgress({ step, done: Math.round(CORE_BYTES * at), total: CORE_BYTES });
            emit({ state: toggles.w2Kept ? "running" : "absent" });
            resolve({ ok: false, error: { key, detail: key === "install.authenticity" ? "signer workflow" : undefined, kept: !!toggles.w2Kept } as never });
          };
          const tick = () => {
            if (cancelled) { emit({ state: "absent" }); resolve({ ok: false, error: { key: "cancelled" } }); return; }
            const fraction = Math.min(1, (Date.now() - started) / duration);
            if (error && ["install.network", "install.proxy", "install.disk"].includes(error) && fraction >= 0.42) return fail(error, "download", 0.42);
            if (error === "install.no-bundle") return fail(error, "download", 0);
            onProgress({ step: "download", done: Math.round(CORE_BYTES * fraction), total: CORE_BYTES });
            if (fraction < 1) { setTimeout(tick, 120); return; }
            if (error === "install.checksum" || error === "install.authenticity") { setTimeout(() => fail(error, "verify", 1), 900); return; }
            const steps: InstallProgress["step"][] = ["verify", "service", "connect"];
            steps.forEach((step, i) => setTimeout(() => { if (!cancelled) onProgress({ step, done: 0, total: 0 }); }, 700 * i));
            setTimeout(() => {
              if (cancelled) return;
              if (toggles.coreFailing) { play(failing()); resolve({ ok: false, error: { key: "launch.exited", detail: "1" } }); return; }
              play(startStates);
              resolve({ ok: true });
            }, 700 * steps.length);
          };
          tick();
        });
      },
      async cancel() { installAbort?.(); },
    },
    app: {
      async settings() { return settings; },
      async update(patch) {
        await sleep(250);
        if (patch.muteShortcut !== undefined) {
          const value = patch.muteShortcut.trim();
          if (value && !/^((CmdOrCtrl|Cmd|Ctrl|Alt|Option|Shift|Super)\+)+([A-Z0-9]|F\d{1,2}|Space)$/i.test(value))
            return { ok: false, error: { key: "shortcut.invalid", detail: value } };
          settings = { ...settings, muteShortcut: value };
          if (/^CmdOrCtrl\+Q$/i.test(value)) return { ok: true, warning: "shortcut.conflict" };
          return { ok: true };
        }
        settings = { ...settings, ...patch };
        return { ok: true };
      },
      async diagnostics() { return diagnostics; },
      async headsetTest() { await sleep(2500); },
      async reset({ machine }, onStep) {
        const script = scenario.bridge?.app?.reset;
        const ids: ResetStep["id"][] = machine ? ["hang-up", "machine", "app"] : ["hang-up", "revoke", "app"];
        const steps: ResetStep[] = ids.map((id) => ({ id, state: "pending" }));
        for (const step of steps) {
          step.state = "running"; onStep(steps.map((s) => ({ ...s })));
          await sleep(900);
          if (script?.fail_once === step.id && !resetFailed) {
            resetFailed = true;
            step.state = "failed"; step.error = script.error ?? { key: "failed" };
            for (const later of steps.slice(steps.indexOf(step) + 1)) later.state = "pending";
            onStep(steps.map((s) => ({ ...s })));
            return { ok: false, error: step.error };
          }
          step.state = "done";
          if (step.id === "machine") step.leaves = script?.leaves;
          onStep(steps.map((s) => ({ ...s })));
        }
        await sleep(1400);
        onRelaunch(machine ? script?.relaunch?.machine ?? "P2" : script?.relaunch?.app ?? "P3");
        return { ok: true };
      },
    },
    onboarding: {
      async read() { return onboarding; },
      async write(patch) { onboarding = { ...(onboarding ?? {}), ...patch }; return onboarding; },
    },
  };
  return host;
}
