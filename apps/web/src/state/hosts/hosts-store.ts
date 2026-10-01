/* The hosts this client talks to and everything the onboarding, host and «Esta app» screens show about them
 * (ONBOARDING_AND_HOSTS.md §3–§5). One store, one writer per datum:
 *
 *  - the local host's state and pairing come from the app's bridge, never from storage (§4.1);
 *  - remote pairings, the host in use, the stage scope and (in a browser) the onboarding state are the page's,
 *    kept in the storage it is given;
 *  - what a host says — agents, devices, integrations, whether it answers — is asked of that host and kept under
 *    its fingerprint, so a late answer for one host never lands on another's page (§4.8).
 *
 * Everything outside the page is a dependency: the bridge, fetch (through host-api), the storage, the clock, and
 * the two things only a running call can do — verify a stage and run the echo test. */
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { createContext, useContext } from "react";
import type { AppDiagnostics, AppSettings, BridgeError, BridgeResult, DesktopHost, DetectedAgent, InstallProgress, LocalHostState, LocalPairing, OnboardingState, PairingCodeAnswer, ResetStep } from "../../services/desktop-host";
import { agentAction, deleteIntegrationKey, hostAbout, HostError, listAgents, listDevices, listIntegrations, putIntegrationKey, revokeDevice, type DeviceRow, type HostTarget } from "../../services/host-api";
import { candidateBases } from "../../services/device-pairing.js";
import type { IntegrationListing } from "../room-types";
import { hostList, hostRows, type HostList, type HostRowView, type RemoteReach, type StoredPairing, type StoredPairings } from "./host-list";
import { chooseStage, emptyScope, forgetHost, migrateStages, STAGES_KEY, useGeneral, type Stage, type StageScope, type Task } from "./stage-scope";
import { opensByItself, resumeStep, pathOf, type Path, type Step } from "./onboarding";

export const PAIRINGS_KEY = "sidevoice.pairings";
export const ONBOARDING_KEY = "sidevoice.onboarding";

type Status = "idle" | "loading" | "ready" | "failed";
export interface Remote<T> { status: Status; value: T | null; error: string | null; at: number | null }
const idle = <T,>(): Remote<T> => ({ status: "idle", value: null, error: null, at: null });

export type SettingsPane = "general" | "voice" | "transcription" | "advanced" | "app" | "host" | "add-host";
export type HostTab = "status" | "agents" | "integrations" | "devices" | "stages";

export interface HostsFacts {
  inApp: boolean;
  canHostAgents: boolean;
  local: LocalHostState | null;
  localPairing: LocalPairing | null;
  stored: StoredPairings;
  reach: Record<string, RemoteReach>;
  agents: Record<string, Remote<{ agents: DetectedAgent[]; scanned_at: number }>>;
  agentBusy: Record<string, string>;
  agentErrors: Record<string, BridgeError>;
  devices: Record<string, Remote<DeviceRow[]>>;
  integrations: Record<string, Remote<IntegrationListing>>;
  scope: StageScope;
  onboarding: OnboardingState | null;
  wizard: { open: boolean; step: Step; path: Path | null };
  settings: { open: boolean; pane: SettingsPane; host: string | null; tab: HostTab };
  reset: { open: boolean; steps: ResetStep[] | null; running: boolean };
  appSettings: AppSettings | null;
  diagnostics: AppDiagnostics | null;
  storageFailed: boolean;
  now: number;
}

export interface HostsView extends HostsFacts {
  list: HostList;
  rows: HostRowView[];
  inUse: string | null;
}

export interface VerifyProgress { phase: "download" | "load" | "check"; done?: number; total?: number }
export type VerifyOutcome = { ok: true; slow?: { latency_ms: number }; result?: Record<string, unknown> } | { ok: false; step: string; reason: { key: string; [k: string]: unknown } };

export interface EchoEvents { level(value: number): void; heard(text: string): void; replied(text: string): void; failed(key: string, stage?: Task): void; silent(): void }

export interface HostsDeps {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  bridge(): DesktopHost | null;
  now(): number;
  /** Load and verify one stage on whatever runs it (model-first §6). */
  verifyStage(task: Task, stage: Stage, host: HostTarget | null, onProgress: (progress: VerifyProgress) => void, signal: AbortSignal): Promise<VerifyOutcome>;
  /** The echo test of W5 (§4.8): resolves when it ends. */
  echoTest(host: HostTarget | null, events: EchoEvents, signal: AbortSignal): Promise<void>;
  /** Redeem a pairing code (device-pairing.js `redeemPairingCode`), rejecting with the sentence to show. */
  redeem(code: string, name: string): Promise<StoredPairing>;
}

const readJson = (storage: HostsDeps["storage"], key: string) => {
  try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
};

function readStored(storage: HostsDeps["storage"]): StoredPairings {
  const value = readJson(storage, PAIRINGS_KEY);
  const list = Array.isArray(value?.pairings) ? value.pairings as StoredPairing[] : [];
  return { inUse: typeof value?.in_use === "string" ? value.in_use : null, list };
}

function view(facts: HostsFacts): HostsView {
  const list = hostList(facts.localPairing, facts.stored);
  const newAgents = Object.fromEntries(Object.entries(facts.agents).map(([fp, remote]) =>
    [fp, !!remote.value?.agents.some((agent) => agent.present && agent.registration === "not-connected" && !agent.dismissed)]));
  // The badge is for an agent that appeared after first run (F5): not while the onboarding is still offering it.
  if (!facts.onboarding?.agents_done) for (const fp of Object.keys(newAgents)) if (fp === facts.localPairing?.fp) newAgents[fp] = false;
  return { ...facts, list, inUse: list.inUse, rows: hostRows(list, { local: facts.local, reach: facts.reach, newAgents, now: facts.now }) };
}

export type HostsStore = StoreApi<HostsView> & { facts(): HostsFacts; patch(update: Partial<HostsFacts>): void };

export function createHostsStore(seed: Partial<HostsFacts> = {}): HostsStore {
  let facts: HostsFacts = {
    inApp: false, canHostAgents: false, local: null, localPairing: null, stored: { inUse: null, list: [] }, reach: {},
    agents: {}, agentBusy: {}, agentErrors: {}, devices: {}, integrations: {}, scope: emptyScope(), onboarding: null,
    wizard: { open: false, step: "W1", path: null }, settings: { open: false, pane: "voice", host: null, tab: "status" },
    reset: { open: false, steps: null, running: false }, appSettings: null, diagnostics: null, storageFailed: false, now: 0, ...seed,
  };
  const store = createStore<HostsView>(() => view(facts)) as HostsStore;
  store.facts = () => facts;
  store.patch = (update) => { facts = { ...facts, ...update }; store.setState(view(facts), true); };
  return store;
}

/** The bridge's or a host's refusal, as the key a screen words. */
function failureOf(error: unknown): string {
  if (error instanceof HostError) return error.key;
  return error instanceof Error ? error.message : String(error);
}

export function createHostsController(store: HostsStore, deps: HostsDeps) {
  const f = () => store.facts();
  const patch = store.patch;
  const epochs = new Map<string, number>();
  const bump = (key: string) => { const next = (epochs.get(key) ?? 0) + 1; epochs.set(key, next); return next; };
  let unsubscribe: (() => void) | null = null;

  function persistPairings(stored: StoredPairings) {
    try { deps.storage.setItem(PAIRINGS_KEY, JSON.stringify({ in_use: stored.inUse, pairings: stored.list })); patch({ stored, storageFailed: false }); return true; }
    catch { patch({ storageFailed: true }); return false; }
  }
  function persistScope(scope: StageScope) {
    patch({ scope });
    try { deps.storage.setItem(STAGES_KEY, JSON.stringify(scope)); } catch { patch({ storageFailed: true }); }
  }
  async function writeOnboarding(update: OnboardingState) {
    const next = { ...(f().onboarding ?? {}), ...update };
    const bridge = deps.bridge()?.onboarding;
    patch({ onboarding: bridge ? await bridge.write(update) : next });
    if (!bridge) try { deps.storage.setItem(ONBOARDING_KEY, JSON.stringify(next)); } catch { /* the page keeps it for this visit */ }
  }

  /** The base and token a request to `fp` goes with, or null for a host this client cannot address. */
  function target(fp: string | null | undefined): HostTarget | null {
    if (!fp) return null;
    const entry = store.getState().list.entries.find((e) => e.fp === fp);
    if (!entry) return null;
    if (entry.local) return { fp, base: (entry.pairing as LocalPairing).urls[0], token: entry.pairing.token };
    const base = candidateBases(entry.pairing)[0]?.base;
    return base ? { fp, base, token: entry.pairing.token } : null;
  }

  function onLocal(state: LocalHostState) {
    const was = f().local?.state;
    patch({ local: state, now: deps.now() });
    if (state.state === "running" && was !== "running") void refreshLocalPairing();
  }

  async function refreshLocalPairing() {
    const pairing = await deps.bridge()?.localHost?.pairing() ?? null;
    patch({ localPairing: pairing });
    // A stored pairing with the local fingerprint is dropped: the local entry wins (§4.1).
    const { dropped } = store.getState().list;
    if (dropped.length) persistPairings({ ...f().stored, list: f().stored.list.filter((p) => !dropped.includes(p)) });
    if (pairing && !f().stored.inUse) persistPairings({ ...f().stored, inUse: pairing.fp });
  }

  const controller = {
    store,
    target,

    async start() {
      const bridge = deps.bridge();
      const stored = readStored(deps.storage);
      const scope = migrateStages(readJson(deps.storage, STAGES_KEY), stored.inUse);
      const onboarding = bridge?.onboarding ? await bridge.onboarding.read() : readJson(deps.storage, ONBOARDING_KEY);
      patch({ inApp: !!bridge, canHostAgents: !!bridge?.hostsAgents, stored, scope, onboarding, now: deps.now() });
      const localHost = bridge?.localHost;
      if (localHost) {
        unsubscribe?.();
        unsubscribe = localHost.subscribe(onLocal);
        onLocal(await localHost.state());
        await refreshLocalPairing();
      }
      if (bridge?.app) {
        const [appSettings, diagnostics] = await Promise.all([bridge.app.settings(), bridge.app.diagnostics?.() ?? null]);
        patch({ appSettings, diagnostics });
      }
      for (const entry of store.getState().list.entries) if (!entry.local) void controller.checkReach(entry.fp);
      const state = store.getState();
      const localReady = f().local?.state === "running" && !!f().localPairing;
      if (opensByItself(f().onboarding, f().inApp, state.list.entries.length > 0, localReady)) controller.openWizard();
    },

    stop() { unsubscribe?.(); unsubscribe = null; },

    tick() { patch({ now: deps.now() }); },

    // ----- the host in use and the list -----
    use(fp: string) { persistPairings({ ...f().stored, inUse: fp }); },
    forget(fp: string) {
      const stored = f().stored;
      const pairing = stored.list.find((p) => p.fp === fp);
      const list = stored.list.filter((p) => p.fp !== fp);
      const t = target(fp);
      persistPairings({ inUse: stored.inUse === fp ? (f().localPairing?.fp ?? list[0]?.fp ?? null) : stored.inUse, list });
      persistScope(forgetHost(f().scope, fp));
      if (t && pairing && !pairing.revoked) void revokeDevice(t, pairing.device_id).catch(() => undefined);
      if (f().settings.host === fp) patch({ settings: { ...f().settings, pane: "voice", host: null } });
    },
    async addRemote(code: string, name: string) {
      const pairing = await deps.redeem(code, name);
      const stored = f().stored;
      if (!persistPairings({ inUse: pairing.fp, list: [pairing, ...stored.list.filter((p) => p.fp !== pairing.fp)] }))
        throw new Error("storage");
      patch({ reach: { ...f().reach, [pairing.fp]: { state: "ok", via: pairing.urls.length ? "direct" : "room" } } });
      return pairing;
    },
    async checkReach(fp: string) {
      const t = target(fp);
      if (!t) return;
      const epoch = bump("reach:" + fp);
      const before = f().reach[fp];
      patch({ reach: { ...f().reach, [fp]: { ...(before ?? {}), state: before?.state === "unreachable" ? "unreachable" : "checking" } } });
      try {
        await hostAbout(t, 4000);
        if (epochs.get("reach:" + fp) !== epoch) return;
        const via = t.base.includes("/nodes/") ? "room" : "direct";
        patch({ reach: { ...f().reach, [fp]: { state: "ok", via } } });
      } catch {
        if (epochs.get("reach:" + fp) !== epoch) return;
        patch({ reach: { ...f().reach, [fp]: { state: "unreachable", since: before?.since ?? Math.floor(deps.now() / 1000) } } });
      }
    },

    // ----- the local host (§4.7) -----
    async localCall(name: "start" | "stop" | "restart" | "serviceInstall" | "serviceUninstall" | "reconnect" | "revealLog"): Promise<BridgeResult> {
      const call = deps.bridge()?.localHost?.[name];
      if (!call) return { ok: false, error: { key: "unsupported" } };
      const result = await call();
      if (name === "reconnect" && result.ok) await refreshLocalPairing();
      return result;
    },
    async localUpdate(now = false) { return deps.bridge()?.localHost?.update?.({ now }) ?? { ok: false, error: { key: "unsupported" } } as BridgeResult; },
    async localInstall(onProgress: (progress: InstallProgress) => void) {
      const install = deps.bridge()?.localHost?.install;
      if (!install) return { ok: false, error: { key: "unsupported" } } as BridgeResult;
      return install(onProgress);
    },
    async localCancelInstall() { await deps.bridge()?.localHost?.cancel?.(); },
    async localAgents() { return await deps.bridge()?.localHost?.agents?.() ?? null; },
    async pairingCode(): Promise<BridgeResult<PairingCodeAnswer>> {
      return await deps.bridge()?.localHost?.pairingCode?.() ?? { ok: false, error: { key: "unsupported" } };
    },
    async pairRoom(url: string, code: string) { return await deps.bridge()?.localHost?.pairRoom?.(url, code) ?? { ok: false, error: { key: "unsupported" } } as BridgeResult; },

    // ----- what a host says, per host -----
    async loadAgents(fp: string, rescan = false) {
      const t = target(fp);
      if (!t) return;
      const epoch = bump("agents:" + fp);
      const before = f().agents[fp] ?? idle();
      patch({ agents: { ...f().agents, [fp]: { ...before, status: "loading", error: null } } });
      try {
        const value = await listAgents(t, rescan);
        if (epochs.get("agents:" + fp) === epoch) patch({ agents: { ...f().agents, [fp]: { status: "ready", value, error: null, at: deps.now() } } });
      } catch (error) {
        if (epochs.get("agents:" + fp) === epoch) patch({ agents: { ...f().agents, [fp]: { ...before, status: "failed", error: failureOf(error) } } });
      }
    },
    async agentAction(fp: string, id: string, action: "connect" | "disconnect" | "dismiss") {
      const t = target(fp);
      if (!t) return;
      const key = fp + ":" + id;
      const errors = { ...f().agentErrors };
      delete errors[key];
      patch({ agentBusy: { ...f().agentBusy, [key]: action }, agentErrors: errors });
      try {
        const answer = await agentAction(t, id, action);
        const listing = f().agents[fp]?.value;
        if (listing) patch({ agents: { ...f().agents, [fp]: { ...f().agents[fp], value: { ...listing, agents: listing.agents.map((a) => a.id === id ? answer.agent : a) } } } });
        return answer;
      } catch (error) {
        const refusal = error instanceof HostError ? { key: error.key, message: error.message } : { key: "unreachable" };
        patch({ agentErrors: { ...f().agentErrors, [key]: refusal } });
      } finally {
        const busy = { ...f().agentBusy };
        delete busy[key];
        patch({ agentBusy: busy });
      }
    },
    async loadDevices(fp: string) {
      const t = target(fp);
      if (!t) return;
      const epoch = bump("devices:" + fp);
      const before = f().devices[fp] ?? idle();
      patch({ devices: { ...f().devices, [fp]: { ...before, status: "loading" } } });
      try {
        const answer = await listDevices(t);
        if (epochs.get("devices:" + fp) === epoch) patch({ devices: { ...f().devices, [fp]: { status: "ready", value: answer.devices, error: null, at: deps.now() } } });
      } catch (error) {
        if (epochs.get("devices:" + fp) === epoch) patch({ devices: { ...f().devices, [fp]: { ...before, status: "failed", error: failureOf(error) } } });
      }
    },
    async revoke(fp: string, deviceId: string) {
      const t = target(fp);
      if (!t) return;
      await revokeDevice(t, deviceId);
      await controller.loadDevices(fp);
    },
    async loadIntegrations(fp: string) {
      const t = target(fp);
      if (!t) return;
      const epoch = bump("integrations:" + fp);
      const before = f().integrations[fp] ?? idle();
      patch({ integrations: { ...f().integrations, [fp]: { ...before, status: "loading", error: null } } });
      try {
        const value = await listIntegrations(t);
        if (epochs.get("integrations:" + fp) === epoch) patch({ integrations: { ...f().integrations, [fp]: { status: "ready", value, error: null, at: deps.now() } } });
      } catch (error) {
        if (epochs.get("integrations:" + fp) === epoch) patch({ integrations: { ...f().integrations, [fp]: { ...before, status: "failed", error: failureOf(error) } } });
      }
    },
    async putKey(fp: string, id: string, key: string) {
      const t = target(fp);
      if (!t) throw new HostError(0, "unreachable", "");
      const value = await putIntegrationKey(t, id, key);
      patch({ integrations: { ...f().integrations, [fp]: { status: "ready", value, error: null, at: deps.now() } } });
      return value;
    },
    async deleteKey(fp: string, id: string) {
      const t = target(fp);
      if (!t) return;
      const value = await deleteIntegrationKey(t, id);
      patch({ integrations: { ...f().integrations, [fp]: { status: "ready", value, error: null, at: deps.now() } } });
    },

    // ----- stages (§3) -----
    chooseStage(fp: string | null, task: Task, stage: Stage) { persistScope(chooseStage(f().scope, fp, task, stage)); },
    useGeneral(fp: string, task: Task) { persistScope(useGeneral(f().scope, fp, task)); },
    verifyStage(task: Task, stage: Stage, fp: string | null, onProgress: (p: VerifyProgress) => void, signal: AbortSignal) {
      return deps.verifyStage(task, stage, target(fp), onProgress, signal);
    },
    echoTest(fp: string | null, events: EchoEvents, signal: AbortSignal) { return deps.echoTest(target(fp), events, signal); },

    // ----- the wizard (§5.1) -----
    resumeStep(): Step {
      const state = store.getState();
      const inUse = state.inUse;
      return resumeStep({
        onboarding: f().onboarding,
        localReady: f().local?.state === "running" && !!f().localPairing,
        remoteReady: f().stored.list.length > 0,
        stagesSet: !!(f().scope.default.stt || (inUse && f().scope.hosts[inUse]?.stt)) && !!(f().scope.default.tts || (inUse && f().scope.hosts[inUse]?.tts)),
        canHostAgents: f().canHostAgents,
      });
    },
    openWizard(step?: Step) {
      const path = pathOf({ onboarding: f().onboarding, canHostAgents: f().canHostAgents });
      patch({ wizard: { open: true, step: step ?? controller.resumeStep(), path }, settings: { ...f().settings, open: false } });
    },
    goTo(step: Step, path?: Path | null) { patch({ wizard: { ...f().wizard, step, path: path === undefined ? f().wizard.path : path } }); },
    async choosePath(path: Path) {
      await writeOnboarding({ choice: path });
      patch({ wizard: { ...f().wizard, path } });
    },
    async markOnboarding(update: OnboardingState) { await writeOnboarding(update); },
    async deferWizard() {
      await writeOnboarding({ deferred_at: Math.floor(deps.now() / 1000) });
      patch({ wizard: { ...f().wizard, open: false } });
    },
    async finishWizard() {
      await writeOnboarding({ completed_at: Math.floor(deps.now() / 1000), deferred_at: null });
      patch({ wizard: { ...f().wizard, open: false } });
    },

    // ----- settings and «Esta app» -----
    openSettings(pane: SettingsPane = "voice", host: string | null = null, tab: HostTab = "status") {
      patch({ settings: { open: true, pane, host, tab } });
    },
    closeSettings() { patch({ settings: { ...f().settings, open: false } }); },
    async updateApp(update: Partial<AppSettings>) {
      const app = deps.bridge()?.app;
      if (!app) return { ok: false, error: { key: "unsupported" } } as BridgeResult<{ warning?: string }>;
      const result = await app.update(update);
      if (result.ok) patch({ appSettings: { ...(f().appSettings as AppSettings), ...update } });
      return result;
    },
    async headsetTest() { await deps.bridge()?.app?.headsetTest?.(); },
    openReset() { patch({ reset: { open: true, steps: null, running: false } }); },
    closeReset() { if (!f().reset.running) patch({ reset: { open: false, steps: null, running: false } }); },
    async runReset(machine: boolean) {
      const reset = deps.bridge()?.app?.reset;
      if (!reset) return;
      patch({ reset: { ...f().reset, running: true } });
      const result = await reset({ machine }, (steps) => patch({ reset: { ...f().reset, steps } }));
      patch({ reset: { ...f().reset, running: false } });
      return result;
    },
  };
  return controller;
}

export type HostsController = ReturnType<typeof createHostsController>;

export const HostsContext = createContext<HostsController | null>(null);

export function useHostsController(): HostsController {
  const controller = useContext(HostsContext);
  if (!controller) throw new Error("useHostsController must be used inside HostsContext");
  return controller;
}

export function useHosts<T>(selector: (state: HostsView) => T): T {
  return useStore(useHostsController().store, selector);
}
