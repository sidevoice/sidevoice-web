/* PROTOTYPE ONLY — the part of the room controller the new screens need, standing in for it: it projects the hosts
 * store into the room store the real panes read (StageSettings, IntegrationList), and answers their actions with the
 * §3 rules (state/hosts/stage-scope.ts). In the real app this is room-session-controller.js's job (R3-b). */
import { createRoomSessionStore, stageContext } from "../state/room-session-state.js";
import { diagnosticsText, deviceBuild, stageLabel, withBuild, withModel, withOption, withPlace, withVoicesChosen, DEVICE } from "../state/stage-settings.js";
import { offers as resolveOffers } from "../../../../packages/browser-audio/offers";
import modelCatalog from "../../../../packages/browser-audio/models.json";
import voiceCatalog from "../../../../packages/browser-audio/catalog.json";
import { currentLanguage, t } from "../i18n";
import type { RoomStore } from "../state/room-store";
import type { SidevoiceActions, StageTask } from "../state/room-types";
import type { HostsController } from "../state/hosts/hosts-store";
import { effectiveStage, type Stage } from "../state/hosts/stage-scope";

type Facts = RoomStore["facts"];

const REMOTE_MODELS = {
  "elevenlabs:tts": {
    models: [{ id: "eleven_flash_v2_5", label: "Flash v2.5", description: "Latencia baja, 32 idiomas" }, { id: "eleven_multilingual_v2", label: "Multilingual v2", description: "Más expresiva, más lenta" }],
    voices: [{ id: "lucia", label: "Lucía", languages: ["es"] }, { id: "mateo", label: "Mateo", languages: ["es"] }, { id: "valentina", label: "Valentina", languages: ["es"] },
      { id: "rachel", label: "Rachel", languages: ["en"] }, { id: "adam", label: "Adam", languages: ["en"] }, { id: "celine", label: "Céline", languages: ["fr"] },
      { id: "giulia", label: "Giulia", languages: ["it"] }, { id: "ines", label: "Inês", languages: ["pt"] }, { id: "aarav", label: "Aarav", languages: ["hi"] }],
  },
  "openai:stt": { models: [{ id: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" }, { id: "gpt-4o-transcribe", label: "gpt-4o-transcribe" }, { id: "whisper-1", label: "whisper-1" }] },
};

/** PROTOTYPE: a description per model, as the catalogue would carry them (design/RESEARCH-HANDY.md). */
const DESCRIPTIONS: Record<string, { es: string; en: string }> = {
  "whisper-tiny": { es: "El más ligero: rápido, menos preciso", en: "The lightest: fast, less accurate" },
  "whisper-base": { es: "Equilibrado: rápido y bastante preciso", en: "Balanced: fast and fairly accurate" },
  "whisper-small": { es: "Más preciso, algo más lento", en: "More accurate, a bit slower" },
  "whisper-large-v3-turbo": { es: "El más preciso; pide más memoria", en: "The most accurate; needs more memory" },
  "kokoro-82m-v1.0": { es: "Natural y ligera, 8 idiomas", en: "Natural and light, 8 languages" },
};
function describe(catalog: typeof modelCatalog) {
  const lang = currentLanguage() === "es" ? "es" : "en";
  return { ...catalog, models: catalog.models.map((m) => ({ ...m, description: DESCRIPTIONS[m.id]?.[lang] })) };
}

export interface AdapterOptions {
  room: RoomStore;
  hosts: HostsController;
  capabilities: Parameters<typeof resolveOffers>[1];
  installed: Set<string>;
  noOffer: boolean;
  /** The «tts-error» variant: the voice does not play. */
  previewFails: boolean;
  onNote(text: string): void;
}

export function createRoomAdapter({ room, hosts, capabilities, installed, noOffer, previewFails, onNote }: AdapterOptions) {
  const scoped = new Map<string, RoomStore>();
  let integrationFp: string | null = null;
  const aborts: Partial<Record<StageTask, AbortController>> = {};
  const f = () => room.facts;
  const offers = noOffer ? [] : resolveOffers(modelCatalog as never, capabilities, "device");
  const installedBuilds = () => offers.filter((o) => installed.has(o.model)).map((o) => ({ model: o.model, engine: o.engine }));
  const inUse = () => hosts.store.getState().inUse;

  room.patch({
    modelCatalog: describe(modelCatalog) as never, voiceLanguages: voiceCatalog.languages as never, deviceCapabilities: capabilities as never,
    deviceOffers: offers as never, installedBuilds: installedBuilds(), remoteModels: REMOTE_MODELS as never,
    audioDevices: { ...f().audioDevices, inputs: [{ id: "default", label: t("proto.mic.default") }, { id: "mbp", label: "MacBook Pro" }, { id: "airpods", label: "AirPods" }],
      outputs: [{ id: "default", label: t("proto.mic.default") }] },
    pageFacts: capabilities.runs === "page" ? { adapter: capabilities.has.includes("webgpu") ? { vendor: "apple", architecture: "metal-3", device: "", description: "Apple M2" } : null, crossOriginIsolated: true, threads: 8, cores: 8 } : null,
  });

  function integrationsStatus(status: string | undefined): Facts["integrationsStatus"] {
    return status === "ready" ? "ready" : status === "failed" ? "failed" : status === "loading" ? "loading" : "idle";
  }

  function sync() {
    const state = hosts.store.getState();
    const fp = state.inUse;
    const remote = fp ? state.integrations[fp] : undefined;
    if (fp && !remote) void hosts.loadIntegrations(fp);
    const prefs = { ...(f().voicePreferences ?? {}), stt: effectiveStage(state.scope, fp, "stt"), tts: effectiveStage(state.scope, fp, "tts") };
    room.patch({
      integrations: remote?.value ?? null,
      integrationsStatus: fp ? (remote?.value && remote.status === "loading" ? "ready" : integrationsStatus(remote?.status)) : "idle",
      integrationsError: remote?.status === "failed" ? t("integrations.failed") : "",
      voicePreferences: prefs,
    });
    for (const [scopeFp, store] of scoped) {
      const listing = state.integrations[scopeFp];
      store.patch({ integrations: listing?.value ?? null, integrationsStatus: integrationsStatus(listing?.status) });
    }
  }
  hosts.store.subscribe(sync);
  sync();

  const ctx = () => stageContext(f());
  const current = (task: StageTask): Stage | null => (f().voicePreferences?.[task] as Stage | null) ?? null;
  const commit = (task: StageTask, stage: Stage | null) => {
    if (!stage) return;
    const fp = inUse();
    if (stage.place !== DEVICE && !fp) return;
    hosts.chooseStage(fp, task, (task === "tts" ? withVoicesChosen(ctx(), stage) : stage) as Stage);
    settleDraft(task);
  };
  /** What is kept is no longer a draft. The panes read both stages from the draft while there is one, so this stage's
   *  entry becomes what is kept (not a hole, which would read as the default), and the draft goes once nothing in it
   *  differs from what is kept. */
  function settleDraft(task: StageTask) {
    const draft = f().stageDraft;
    if (!draft) return;
    const kept = (f().voicePreferences ?? {}) as Record<string, unknown>;
    const next = { ...draft, [task]: kept[task] } as Record<string, unknown>;
    const pending = (["stt", "tts"] as const).some((k) => next[k] && JSON.stringify(next[k]) !== JSON.stringify(kept[k]));
    room.patch({ stageDraft: pending ? next as never : null });
  }
  const setCheck = (task: StageTask, check: Record<string, unknown> | null) => room.patch({ stageChecks: { ...f().stageChecks, [task]: check } });

  async function runCheck(task: StageTask, stage: Stage, recheck = false) {
    aborts[task]?.abort();
    const abort = new AbortController();
    aborts[task] = abort;
    const previous = stageLabel(ctx(), task, current(task));
    setCheck(task, { phase: "running", stage, previous, recheck, progress: { step: "load" } });
    const outcome = await hosts.verifyStage(task, stage, inUse(), (p) => {
      if (!abort.signal.aborted) setCheck(task, { phase: "running", stage, previous, recheck, progress: { step: p.phase, done: p.done, total: p.total } });
    }, abort.signal);
    if (abort.signal.aborted) return;
    room.patch({ installedBuilds: installedBuilds() });
    const build = deviceBuild(f().deviceOffers, stage);
    if (outcome.ok && outcome.slow) { setCheck(task, { phase: "slow", stage, previous, recheck, result: { latency_ms: outcome.slow.latency_ms } }); return; }
    if (!outcome.ok) {
      setCheck(task, { phase: "failed", stage, previous, recheck, step: outcome.step, reason: outcome.reason });
      room.patch({ stageDiagnostics: { ...f().stageDiagnostics, [task]: { stage, ok: false, step: outcome.step, reason: outcome.reason, at: Date.now(), build } } });
      return;
    }
    const result = outcome.result ?? {};
    setCheck(task, { phase: "done", stage, previous, recheck, result });
    room.patch({ stageDiagnostics: { ...f().stageDiagnostics, [task]: { stage, ok: true, ...result, at: Date.now(), build, memory: { total_mb: 16384, available_mb: 9120 } } } });
    if (!recheck) commit(task, stage);
  }

  /** A device model not on disk asks first (its size); one on disk is loaded and checked; a provider is taken. */
  function select(task: StageTask, stage: Stage | null) {
    if (!stage) return;
    if (stage.place !== DEVICE) { setCheck(task, null); commit(task, stage); return; }
    const offer = (f().deviceOffers as { model: string; download_size: number }[] | null)?.find((o) => o.model === stage.model);
    if (offer && !installed.has(stage.model)) setCheck(task, { phase: "consent", stage, previous: stageLabel(ctx(), task, current(task)), recheck: false, size: offer.download_size });
    else void runCheck(task, stage);
  }

  function storeFor(fp: string): RoomStore {
    integrationFp = fp;
    let store = scoped.get(fp);
    if (!store) {
      // Filled from the hosts store here, not by sync(): this runs while the tab renders, and sync() patches the room.
      const listing = hosts.store.getState().integrations[fp];
      store = createRoomSessionStore({ integrations: listing?.value ?? null, integrationsStatus: integrationsStatus(listing?.status) });
      scoped.set(fp, store);
    }
    return store;
  }
  const keyStore = () => (integrationFp ? scoped.get(integrationFp) : null) ?? room;
  const keyFp = () => integrationFp ?? inUse();

  const actions: SidevoiceActions = {
    async cancelInput() {}, async skipReply() {}, async replayReply() {},
    toggleMic() { onNote(t("proto.note.call")); },
    async selectAudioDevice() {},
    async toggleCall() { onNote(t("proto.note.call")); },
    selectParticipant(threadId) { room.patch({ roomBinding: { thread_id: threadId } }); },
    async closeParticipant() {},
    chooseStagePlace(task, place) { select(task, withPlace(ctx(), task, current(task), place, null) as Stage | null); },
    chooseStageModel(task, model) { select(task, withModel(ctx(), task, current(task), model) as Stage); },
    setStageOption(task, id, value, language) { commit(task, withOption(ctx(), task, current(task), id, value, language) as Stage); },
    chooseStageBuild(task, value) { commit(task, withBuild(ctx(), task, current(task), value) as Stage); },
    decideStage(task, yes) {
      const check = f().stageChecks[task] as { phase: string; stage: Stage } | null | undefined;
      if (!check) return;
      if (!yes) { setCheck(task, null); return; }
      if (check.phase === "consent") void runCheck(task, check.stage);
      else if (check.phase === "slow") { setCheck(task, { ...check, phase: "done", result: {} }); commit(task, check.stage); }
    },
    cancelStage(task) { aborts[task]?.abort(); setCheck(task, null); },
    recheckStage(task) { const stage = current(task); if (stage) void runCheck(task, stage, true); },
    async copyDiagnostics(task) {
      try { await navigator.clipboard.writeText(diagnosticsText(task, room.getState().stages?.[task]?.diagnostics)); return true; } catch { return false; }
    },
    cancelDownload() {},
    // Resolves once the sample has been heard, rejects when it does not play (the «tts-error» variant). The browser's
    // synthesis stands in for the chosen voice; where it has none, the time it would take stands in for it.
    async previewVoice(language, text) {
      const sample = text?.trim() || voiceCatalog.languages.find((l) => l.id === language)?.sample || "";
      room.patch({ previewNote: t("proto.note.preview") });
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      if (previewFails) { await wait(900); throw new Error("tts-error"); }
      const synth = window.speechSynthesis;
      if (!synth || !sample || !synth.getVoices().length) { await wait(2400); return; }
      synth.cancel();
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sample);
        utterance.lang = language;
        const timer = setTimeout(resolve, 9000);
        utterance.onend = utterance.onerror = () => { clearTimeout(timer); resolve(); };
        synth.speak(utterance);
      });
    },
    async prepareVoice() { room.patch({ prepareNote: t("proto.note.prepared") }); },
    async retryIntegrations() { const fp = inUse(); if (fp) await hosts.loadIntegrations(fp); },
    async retryGpu() {},
    chooseMachine(id) { hosts.use(id); },
    async forgetMachine(id) { hosts.forget(id); },
    async pairDevice() { return { host: null }; },
    openPairing() { hosts.openSettings("add-host"); },
    closePairing() {},
    typeIntegrationKey(id, value) {
      const store = keyStore();
      const checks = { ...store.facts.integrationChecks };
      delete checks[id];
      store.patch({ integrationDrafts: { ...store.facts.integrationDrafts, [id]: value }, integrationChecks: checks });
    },
    async checkIntegrationKey(id) {
      const store = keyStore(), fp = keyFp();
      const key = String(store.facts.integrationDrafts[id] ?? "").trim();
      if (!key || !fp) return;
      store.patch({ integrationChecks: { ...store.facts.integrationChecks, [id]: { note: t("integrations.checking"), status: "checking" } } });
      try {
        await hosts.putKey(fp, id, key);
        store.patch({ integrationDrafts: { ...store.facts.integrationDrafts, [id]: "" }, integrationChecks: { ...store.facts.integrationChecks, [id]: { note: t("integrations.verified"), status: "verified" } } });
      } catch (error) {
        const configured = store.facts.integrations?.providers.find((p) => p.id === id)?.configured;
        store.patch({ integrationChecks: { ...store.facts.integrationChecks, [id]: { note: t("integrations.refused", { message: (error as Error).message, then: t(configured ? "integrations.previousKept" : "integrations.noneStored") }), status: "refused" } } });
      }
    },
    async clearIntegrationKey(id) { const fp = keyFp(); if (fp) await hosts.deleteKey(fp, id); },
    testStage(task, stage) { void runCheck(task, stage as unknown as Stage); },
    openIntegration(id) {
      const fp = inUse();
      if (!fp) return;
      hosts.openSettings("host", fp, "integrations");
      setTimeout(() => storeFor(fp).patch({ integrationFocus: id }), 50);
    },
  };

  return { actions, storeFor, sync, settleDraft };
}
