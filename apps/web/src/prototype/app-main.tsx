/* PROTOTYPE ONLY — the app as it runs inside the prototype's frame (prototype-app.html). The real room components
 * and the new screens, with everything outside the page faked behind one seam (./fakes): the hosts behind `fetch`,
 * the desktop bridge, and the engines. Never imported by src/main.tsx, so never in the production bundle. */
/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "../../../../packages/browser-audio/room-i18n.js";
import "../styles/tokens.css";
import "../styles/room.css";
import "../styles/react.css";
import "../styles/hosts.css";
import "./prototype.css";
import { currentLanguage, setLanguage, t, useT } from "../i18n";
import { systemLanguage } from "../services/system-language.js";
import { redeemPairingCode, NO_WEBCRYPTO } from "../services/device-pairing.js";
import { desktopHost } from "../services/desktop-host";
import { createRoomSessionStore } from "../state/room-session-state.js";
import { RoomStoreContext } from "../state/room-store";
import { createHostsController, createHostsStore, HostsContext, PAIRINGS_KEY, useHosts, type HostTab, type SettingsPane } from "../state/hosts/hosts-store";
import type { StoredPairing } from "../state/hosts/host-list";
import { STAGES_KEY, type StageScope } from "../state/hosts/stage-scope";
import { RoomHeader } from "../features/room/RoomHeader";
import { ParticipantSidebar } from "../features/room/ParticipantSidebar";
import { TranscriptPanel } from "../features/conversation/TranscriptPanel";
import { CallToolbar } from "../features/call/CallToolbar";
import { TooltipProvider } from "../components/ui/Tooltip";
import { Wizard } from "../features/onboarding/Wizard";
import { LocalHostBanner, NoMachine, SetupPending, useSetupPending } from "../features/onboarding/NoMachine";
import { SettingsShell } from "../features/settings/SettingsShell";
import { ResetDialog } from "../features/settings/ResetDialog";
import { IntegrationScopeContext, QrRendererContext } from "../features/hosts/HostPage";
import { StageFlowContext } from "../features/settings/StageEditor";
import { FakeQr } from "./FakeQr";
import { readParams, type Toggles } from "./scenario";
import { createFakeHosts } from "./fakes/hosts";
import { createFakeBridge } from "./fakes/bridge";
import { createFakeEngine } from "./fakes/engine";
import { createRoomAdapter } from "./room-adapter";

const params = readParams(location.search);
const { view } = params;
const scenario = fastForward(structuredClone(params.scenario), params.at);

/** A reload that lands back on wizard step `at`: what the steps before it would have left behind, made so — the
 *  local host installed and running, the agents step done, a machine paired, the stages before it chosen. Close to
 *  what was on screen, not the same choices. */
function fastForward(s: typeof params.scenario, at: string | null): typeof params.scenario {
  const order = ["W1", "W2", "W2r", "W3", "W4", "W4v", "W5", "W6"];
  const step = order.indexOf(at ?? "");
  if (step <= 0) return s;
  const remote = at === "W2r" || (!s.bridge?.localHost && at !== "W2" && at !== "W3") || (s.onboarding?.choice === "remote");
  s.onboarding = { choice: remote ? "remote" : "agents", deferred_at: Math.floor(Date.now() / 1000) - 60 };
  if (!remote && step >= order.indexOf("W3") && s.bridge?.localHost) s.bridge.localHost.states = [{ state: "running", after_ms: 0 }];
  if (!remote && step >= order.indexOf("W4")) s.onboarding.agents_done = true;
  if (remote && step >= order.indexOf("W4")) {
    const alias = Object.keys(s.hosts).find((a) => a !== "local");
    if (alias && !(s.pairings ?? []).some((p) => p.host === alias)) { s.pairings = [{ host: alias, paired_days_ago: 0 }, ...(s.pairings ?? [])]; s.in_use = alias; }
  }
  const stt = { place: "device", model: "whisper-tiny" }, tts = { place: "device", model: "kokoro-82m-v1.0" };
  if (step >= order.indexOf("W4v")) s.stages = { ...(s.stages ?? {}), default: { ...(s.stages?.default ?? {}), stt } };
  if (step >= order.indexOf("W5")) s.stages = { ...(s.stages ?? {}), default: { ...(s.stages?.default ?? {}), stt, tts } };
  if (step >= order.indexOf("W4v")) s.installed = [...new Set([...(s.installed ?? []), "whisper-tiny", ...(step >= order.indexOf("W5") ? ["kokoro-82m-v1.0"] : [])])];
  return s;
}
const toggles: Toggles = { ...params.toggles };
setLanguage(params.lang || systemLanguage(["es", "en"]));

const post = (message: Record<string, unknown>) => window.parent !== window && window.parent.postMessage({ source: "sidevoice-prototype", ...message }, "*");
let showNote: (text: string) => void = () => undefined;

/** A page storage of its own: a scenario starts from its fixture every time, and "storage failure" can be simulated. */
function memoryStorage(seed: Record<string, string>) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (toggles.w2rStorage && key === PAIRINGS_KEY) throw new Error("QuotaExceededError"); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

async function boot() {
  const inApp = view === "app" && scenario.inApp !== false;
  const localSeed = scenario.bridge?.localHost;
  const hosts = await createFakeHosts(scenario, toggles, localSeed?.agents, view);
  hosts.install();
  const fp = (alias: string) => hosts.byAlias.get(alias)?.fp ?? alias;

  // What this client has stored: in the app, the remote pairings; in a browser, this computer's host too, through the room.
  const localRunning = !!localSeed && localSeed.states[0]?.state !== "absent";
  const aliases = [...(!inApp && localRunning ? [{ host: "local", paired_days_ago: 5 }] : []), ...(scenario.pairings ?? [])];
  const pairings: StoredPairing[] = aliases.filter((p) => hosts.byAlias.has(p.host)).map((p) => {
    const host = hosts.byAlias.get(p.host)!;
    return { fp: host.fp, host: host.name, urls: host.urls, rv: host.rv, device_id: hosts.selfDevice(p.host), token: "tok-" + p.host, public_key: host.publicKey,
      paired_at: Math.floor(Date.now() / 1000) - (p.paired_days_ago ?? 1) * 86400 };
  });
  const inUseAlias = scenario.in_use ?? (inApp ? "local" : aliases[0]?.host);
  const scope: StageScope = { default: scenario.stages?.default as StageScope["default"] ?? {}, hosts: Object.fromEntries(Object.entries(scenario.stages?.hosts ?? {}).map(([alias, s]) => [fp(alias), s])) as StageScope["hosts"] };
  const storage = memoryStorage({
    [PAIRINGS_KEY]: JSON.stringify({ in_use: inUseAlias ? fp(inUseAlias) : null, pairings }),
    [STAGES_KEY]: JSON.stringify(scope),
    ...(!inApp && scenario.onboarding ? { "sidevoice.onboarding": JSON.stringify(scenario.onboarding) } : {}),
  });

  const installed = new Set(scenario.installed ?? []);
  const capabilities = inApp
    ? { runs: "native" as const, os: "macos", arch: "aarch64", has: ["cpu", "coreml"], memory_mb: 16384 }
    : { runs: "page" as const, has: toggles.noWebgpu ? ["wasm"] : ["webgpu", "webgpu-f16", "wasm"] };
  const engine = createFakeEngine(toggles, capabilities, installed, currentLanguage);
  // What the call's waveform reads from the audio runtime, fed by the fake microphone.
  window.sidevoiceAudio = { readWaveform: engine.readWaveform };

  if (inApp) window.__sidevoiceDesktop = { host: createFakeBridge(scenario, toggles, hosts, (note) => showNote(t("proto.note." + note)), (next) => post({ type: "relaunch", scenario: next })) as unknown as Record<string, unknown> };

  // A host the fixture says went silent hours ago: this client noticed then, not now.
  const store = createHostsStore({ reach: Object.fromEntries([...hosts.byAlias.values()].filter((h) => h.seed.silent_hours).map((h) => [h.fp, { state: "unreachable" as const, since: Math.floor(Date.now() / 1000) - h.seed.silent_hours! * 3600 }])) });
  const controller = createHostsController(store, {
    storage, bridge: desktopHost, now: () => Date.now(),
    verifyStage: engine.verifyStage, echoTest: engine.echoTest,
    async redeem(code, name) {
      if (toggles.w2rNoWebCrypto) throw new Error(NO_WEBCRYPTO);
      const { pairing } = await redeemPairingCode(code, { name, origin: location.origin });
      return pairing as StoredPairing;
    },
  });

  const room = createRoomSessionStore({ inApp, speechLanguage: currentLanguage() });
  const adapter = createRoomAdapter({ room, hosts: controller, capabilities, installed, noOffer: !!toggles.w4NoOffer, previewFails: toggles.w5 === "tts-error", onNote: (text) => showNote(text) });
  window.sidevoiceActions = adapter.actions;
  window.sidevoiceUI = { store: room, setBootError: (bootError) => room.patch({ bootError }) };

  // The room's conversations, for scenarios that have a working host.
  function seedRoom() {
    const state = store.getState();
    const row = state.rows.find((r) => r.fp === state.inUse);
    const live = scenario.room !== false && !!row && row.dot === "ok";
    const machine = row ? { host: row.local ? row.name : row.name, id: row.fp } : null;
    const at = Date.now() - 8 * 60_000;
    const es = currentLanguage() === "es";
    room.patch(live ? {
      sessionId: "proto",
      people: [
        { thread_id: "t1", title: es ? "sidevoice-web · onboarding" : "sidevoice-web · onboarding", available: true, harness: "claude", machine, capabilities: { working: "supported" } },
        { thread_id: "t2", title: es ? "Revisar el informe del sprint" : "Review the sprint report", available: true, harness: "codex", machine, capabilities: { working: "supported" } },
      ],
      roomBinding: room.facts.roomBinding ?? { thread_id: "t1" },
      history: [
        { segment: "h1", thread: "t1", session: "proto", role: "user", name: es ? "Tú" : "You", text: es ? "¿Qué te falta para cerrar el asistente de primer arranque?" : "What's left to close the first-run wizard?", time: at, seq: 1, status: "read" },
        { segment: "h2", thread: "t1", session: "proto", role: "assistant", name: "Claude", text: es ? "Las pantallas de W1 a W6 están; me queda la revisión de UX y servirlo por el túnel." : "W1 to W6 are in; the UX review and serving it through the tunnel are left.", time: at + 40_000, seq: 2, audio: "played" },
      ],
    } : { sessionId: null, people: [], history: [], roomBinding: null });
  }
  store.subscribe(seedRoom);

  await controller.start();
  seedRoom();
  if (scenario.scan_on_start && store.getState().localPairing) void controller.loadAgents(store.getState().localPairing!.fp);
  if (toggles.resumeAt && inApp) controller.openWizard();
  if (params.at && params.at !== "W1") controller.openWizard(params.at as never);
  // The shell keeps the step in its URL.
  let lastStep: string | null = null;
  store.subscribe((state) => {
    const step = state.wizard.open ? state.wizard.step : null;
    if (step === lastStep) return;
    lastStep = step;
    post({ type: "step", step });
    // The frame keeps it too: a hot reload reloads the frame's own URL.
    const url = new URL(location.href);
    if (step) url.searchParams.set("at", step); else url.searchParams.delete("at");
    history.replaceState(null, "", url);
  });
  if (scenario.open) controller.openSettings(scenario.open.pane as SettingsPane, scenario.open.host ? fp(scenario.open.host) : null, (scenario.open.tab ?? "status") as HostTab);
  setInterval(() => controller.tick(), 30_000);

  // The room's gear and the call menu's «Configuración» open the new Settings.
  document.addEventListener("click", (event) => {
    const target = (event.target as Element | null)?.closest?.("#settings-open, #call-settings-open");
    if (target) { event.preventDefault(); controller.openSettings("voice"); (document.getElementById("call-menu") as HTMLDetailsElement | null)?.removeAttribute("open"); }
  });

  // The frame around: live toggles, the tray menu, sample codes.
  window.addEventListener("message", (event) => {
    const data = event.data as { source?: string; type?: string; toggles?: Toggles; pane?: SettingsPane; code?: string; alias?: string; variant?: string };
    if (data?.source !== "sidevoice-shell") return;
    if (data.type === "toggles" && data.toggles) { for (const key of Object.keys(toggles)) delete toggles[key]; Object.assign(toggles, data.toggles); }
    if (data.type === "open-settings") controller.openSettings(data.pane ?? "app");
    if (data.type === "open-app") controller.closeSettings();
    if (data.type === "paste-key" && (data as { value?: string }).value) {
      const value = (data as { value: string }).value;
      const field = (document.activeElement instanceof HTMLInputElement && document.activeElement.type === "password" ? document.activeElement : null)
        ?? document.querySelector<HTMLInputElement>(".key-line input, .integration-row input[type=password]");
      if (field) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      } else void navigator.clipboard?.writeText(value).catch(() => undefined);
      post({ type: "code-sent", pasted: !!field });
    }
    if (data.type === "code" && data.alias) {
      const code = data.variant === "malformed" ? "SV1.esto-no-es-un-codigo!" : hosts.code(data.alias, (data.variant as never) ?? "valid");
      const field = document.getElementById("pair-code") as HTMLTextAreaElement | null;
      if (field) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, code);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      } else void navigator.clipboard?.writeText(code).catch(() => undefined);
      post({ type: "code-sent", pasted: !!field });
    }
  });
  post({ type: "ready", hosts: [...hosts.byAlias.values()].filter((h) => h.alias !== "local").map((h) => ({ alias: h.alias, name: h.name })) });

  createRoot(document.getElementById("root")!).render(
    <RoomStoreContext.Provider value={room}>
      <HostsContext.Provider value={controller}>
        <IntegrationScopeContext.Provider value={adapter}>
          <QrRendererContext.Provider value={(code) => <figure className="proto-qr"><FakeQr text={code} /><figcaption>{t("proto.qr")}</figcaption></figure>}>
            <StageFlowContext.Provider value={toggles.stageFlow === "C" ? "list" : toggles.stageFlow === "A" ? "try" : "configure"}>
              <TooltipProvider>
                <App />
              </TooltipProvider>
            </StageFlowContext.Provider>
          </QrRendererContext.Provider>
        </IntegrationScopeContext.Provider>
      </HostsContext.Provider>
    </RoomStoreContext.Provider>,
  );
}

function Note() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    showNote = (next) => { setText(next); clearTimeout(timer); timer = setTimeout(() => setText(null), 3500); };
    return () => clearTimeout(timer);
  }, []);
  return text ? <div className="proto-toast" role="status">{text}</div> : null;
}

function App() {
  useT();
  const noMachine = useHosts((s) => s.rows.length === 0 && (!s.local || s.local.state === "absent"));
  const setupPending = useSetupPending();
  // Settings come after setup (operator, 2026-10-01): the gear and the call menu's «Configuración» appear once it is done.
  const configured = useHosts((s) => !!s.onboarding?.completed_at);
  useEffect(() => { document.body.dataset.setup = configured ? "done" : "pending"; }, [configured]);
  return (
    <>
      <RoomHeader />
      {!setupPending && <LocalHostBanner />}
      {setupPending ? <main className="no-machine-main"><SetupPending /></main> : noMachine ? <main className="no-machine-main"><NoMachine /></main> : (
        <main>
          <ParticipantSidebar />
          <TranscriptPanel />
        </main>
      )}
      <CallToolbar />
      <Wizard />
      <SettingsShell />
      <ResetDialog />
      <Note />
      <audio id="preview-audio" />
    </>
  );
}

void boot().catch((error: unknown) => {
  document.getElementById("root")!.textContent = "Prototype failed to start: " + (error instanceof Error ? error.stack ?? error.message : String(error));
});
