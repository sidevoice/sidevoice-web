import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { desktopAppBridge, localHostBridge } from "../../services/desktop-host";
import {
  createOnboardingRepository,
  emptyOnboardingRecord,
  resumeOnboarding,
  stageTrialKey,
  type OnboardingPatch,
  type OnboardingRecord,
  type OnboardingStep,
  type OnboardingStorageError,
} from "../../services/onboarding-state";
import { effectiveStage, stageProblem, withVoicesChosen } from "../../state/stage-settings.js";
import { stageContext } from "../../state/room-session-state.js";
import { RoomStoreContext, useRoomStore, type RoomViewState } from "../../state/room-store";

interface OnboardingContextValue {
  ready: boolean;
  record: OnboardingRecord;
  error: OnboardingStorageError["key"] | "onboarding.prerequisites" | null;
  open: boolean;
  step: OnboardingStep;
  path: "agents" | "remote" | null;
  canHostAgents: boolean;
  localAgents: { id: string; label: string; version?: string | null }[];
  localAgentsLoading: boolean;
  localAgentsError: boolean;
  stageKey(task: "stt" | "tts", language?: string): string | null;
  trialled(task: "stt" | "tts", key?: string | null): boolean;
  openWizard(step?: OnboardingStep): void;
  goTo(step: OnboardingStep): void;
  setPath(path: "agents" | "remote"): Promise<boolean>;
  markAgentsDone(): Promise<boolean>;
  markTrial(task: "stt" | "tts", key: string | null): Promise<boolean>;
  defer(): Promise<void>;
  complete(): Promise<boolean>;
  rescanLocalAgents(): Promise<void>;
}

const Context = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("OnboardingProvider is missing");
  return value;
}

export function useOptionalOnboarding() {
  return useContext(Context);
}

function liveHost(room: RoomViewState) {
  const fp = room.facts.pairingInUse;
  const machine = room.machines.find((candidate) => candidate.pairingId === fp);
  return fp && machine && machine.selectable && !machine.revoked && room.facts.node === fp && room.facts.nodeReach === "ok"
    ? { fp, machine } : null;
}

function stageKeyFor(room: RoomViewState, record: OnboardingRecord, task: "stt" | "tts", language?: string) {
  const selected = liveHost(room);
  const { facts } = room;
  if (!selected || facts.stagePreparation.host !== selected.fp || facts.stagePreparation.status !== "ready") return null;
  const view = room.stages?.[task];
  const raw = facts.stageDraft?.[task] ?? facts.voicePreferences?.[task];
  const ctx = stageContext(facts);
  const stage = effectiveStage(ctx, task, raw);
  if (!view || !stage?.model || !view.editable || view.modelsLoading || view.modelsError ||
      !view.models.some((model) => model.id === stage.model) || stageProblem(ctx, task, withVoicesChosen(ctx, stage))) return null;
  if (stage.place !== "device") {
    const provider = facts.integrations?.providers.find((row) => row.id === stage.place);
    const catalog = facts.remoteModels[`${stage.place}:${task}`];
    if (facts.integrationsStatus !== "ready" || !provider?.configured || !catalog?.models?.some((model) => model.id === stage.model)) return null;
  }

  let actualLanguage = language;
  if (task === "stt" && !actualLanguage) {
    const configured = (stage.options as Record<string, unknown> | undefined)?.language;
    actualLanguage = typeof configured === "string" && configured !== "auto" ? configured : facts.speechLanguage;
  }
  if (task === "tts" && !actualLanguage) {
    const voice = view.options.find((option) => option.kind === "voice" && option.perLanguage);
    const supported = voice?.kind === "voice" && voice.perLanguage ? voice.rows.map((row) => row.language) : [];
    const matchingPrevious = supported.find((candidate) =>
      record.trials[selected.fp]?.tts === stageTrialKey(selected.fp, { stage, language: candidate }));
    actualLanguage = matchingPrevious || (supported.includes(facts.speechLanguage) ? facts.speechLanguage : supported[0]);
  }
  if (!actualLanguage) return null;
  return stageTrialKey(selected.fp, { stage, language: actualLanguage });
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const room = useRoomStore((state) => state);
  const roomStore = useContext(RoomStoreContext);
  if (!roomStore) throw new Error("useRoomStore must be used inside RoomProvider");
  const facts = room.facts;
  const machines = room.machines;
  const app = desktopAppBridge();
  const bridge = localHostBridge();
  const canHostAgents = !!bridge;
  const repository = useMemo(() => createOnboardingRepository({
    nativePort: app?.onboarding ?? null,
    nativeExpected: !!app,
  }), [app]);
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<OnboardingRecord>(emptyOnboardingRecord);
  const [error, setError] = useState<OnboardingStorageError["key"] | "onboarding.prerequisites" | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("W1");
  const [localAgents, setLocalAgents] = useState<OnboardingContextValue["localAgents"]>([]);
  const [localAgentsLoading, setLocalAgentsLoading] = useState(false);
  const [localAgentsError, setLocalAgentsError] = useState(false);
  const [localAgentsScanned, setLocalAgentsScanned] = useState(false);
  const firstDecision = useRef(false);
  const recordRef = useRef(record);
  const writes = useRef(Promise.resolve());

  const fp = facts.pairingInUse;
  const stageKey = useCallback((task: "stt" | "tts", language?: string) => stageKeyFor(room, record, task, language), [room, record]);
  const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
  const currentMachine = machines.find((machine) => machine.pairingId === fp && machine.selectable && !machine.revoked);
  const selectedRouteReady = !!currentMachine && facts.node === fp && facts.nodeReach === "ok";
  const localReady = !!currentMachine?.local && selectedRouteReady && facts.localHostStatus.state === "running";
  const remoteReady = !!currentMachine && !currentMachine.local && selectedRouteReady;
  const hostFp = fp;
  const sttKey = stageKey("stt");
  const ttsKey = stageKey("tts");
  const setupStep = resumeOnboarding({ record, canHostAgents, localReady,
    localInstallStarted: false, remoteReady, hostFp, sttStageKey: sttKey, ttsStageKey: ttsKey });

  useEffect(() => {
    let current = true;
    void repository.read().then((loaded) => {
      if (!current) return;
      recordRef.current = loaded;
      setRecord(loaded);
      setError(null);
    }).catch((reason: unknown) => {
      if (!current) return;
      const key = reason && typeof reason === "object" && "key" in reason
        ? (reason as OnboardingStorageError).key : "onboarding.read_failed";
      setError(key);
    }).finally(() => { if (current) setReady(true); });
    return () => { current = false; };
  }, [repository]);

  useEffect(() => {
    if (!ready || firstDecision.current || record.completed_at || record.deferred_at) return;
    if (!facts.machinesReady) return;
    firstDecision.current = true;
    const hasMachine = machines.some((machine) => machine.selectable && !!machine.pairingId);
    if (!record.deferred_at || !hasMachine || localReady) {
      setStep(setupStep);
      setOpen(true);
    }
  }, [ready, record.completed_at, record.deferred_at, facts.machinesReady, machines, localReady, setupStep]);

  const persist = useCallback(async (update: OnboardingPatch) => {
    const operation = writes.current.then(async () => {
      try {
        const saved = await repository.patch(recordRef.current, update);
        recordRef.current = saved;
        setRecord(saved);
        setError(null);
        return true;
      } catch (reason) {
        const key = reason && typeof reason === "object" && "key" in reason
          ? (reason as OnboardingStorageError).key : "onboarding.write_failed";
        setError(key);
        return false;
      }
    });
    writes.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [repository]);

  const openWizard = useCallback((requested?: OnboardingStep) => {
    setStep(requested ?? resumeOnboarding({ record, canHostAgents, localReady, localInstallStarted: false,
      remoteReady, hostFp, sttStageKey: sttKey, ttsStageKey: ttsKey }));
    setOpen(true);
  }, [record, canHostAgents, localReady, remoteReady, hostFp, sttKey, ttsKey]);

  const rescanLocalAgents = useCallback(async () => {
    const current = localHostBridge();
    if (!current?.agents) { setLocalAgents([]); setLocalAgentsError(false); setLocalAgentsScanned(true); return; }
    setLocalAgentsLoading(true);
    setLocalAgentsError(false);
    try {
      const result = await current.agents();
      const rows = Array.isArray(result?.agents) ? result.agents : [];
      setLocalAgents(rows.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const item = row as Record<string, unknown>;
        const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : "";
        const label = typeof item.label === "string" ? item.label : typeof item.name === "string" ? item.name : id;
        return id && label ? [{ id, label, version: typeof item.version === "string" ? item.version : null }] : [];
      }));
      setLocalAgentsScanned(true);
    } catch { setLocalAgentsError(true); setLocalAgentsScanned(true); }
    finally { setLocalAgentsLoading(false); }
  }, []);

  useEffect(() => {
    if (open && step === "W1" && canHostAgents && !localAgentsScanned && !localAgentsLoading)
      void rescanLocalAgents();
  }, [open, step, canHostAgents, localAgentsLoading, localAgentsScanned, rescanLocalAgents]);

  const value: OnboardingContextValue = {
    ready, record, error, open, step, path: !canHostAgents ? "remote" : record.choice,
    canHostAgents, localAgents, localAgentsLoading, localAgentsError,
    stageKey,
    trialled: (task, key) => {
      const expected = key === undefined ? stageKey(task) : key;
      return !!fp && !!expected && record.trials[fp]?.[task] === expected;
    },
    openWizard,
    goTo: setStep,
    async setPath(path) { return persist({ choice: path, deferred_at: null }); },
    async markAgentsDone() { return persist({ agents_done: true }); },
    async markTrial(task, key) {
      if (!fp) return false;
      return persist({ trials: { [fp]: { [task]: key } } });
    },
    async defer() {
      if (await persist({ deferred_at: Math.floor(Date.now() / 1000) })) setOpen(false);
    },
    async complete() {
      const selected = liveHost(roomStore.getState());
      if (!selected || !await window.sidevoiceActions?.prepareOnboardingStages?.(selected.fp)) {
        const latest = roomStore.getState();
        const latestFp = latest.facts.pairingInUse;
        const latestMachine = latest.machines.find((machine) => machine.pairingId === latestFp && machine.selectable && !machine.revoked);
        const routeReady = !!latestMachine && latest.facts.node === latestFp && latest.facts.nodeReach === "ok";
        const step = resumeOnboarding({ record: recordRef.current, canHostAgents, localReady: !!latestMachine?.local && routeReady && latest.facts.localHostStatus.state === "running",
          localInstallStarted: false, remoteReady: !!latestMachine && !latestMachine.local && routeReady, hostFp: latestFp,
          sttStageKey: stageKeyFor(latest, recordRef.current, "stt"), ttsStageKey: stageKeyFor(latest, recordRef.current, "tts") });
        setStep(step);
        setOpen(true);
        setError("onboarding.prerequisites");
        return false;
      }
      const latest = roomStore.getState();
      const latestFp = latest.facts.pairingInUse;
      const latestMachine = latest.machines.find((machine) => machine.pairingId === latestFp && machine.selectable && !machine.revoked);
      const routeReady = !!latestMachine && latest.facts.node === latestFp && latest.facts.nodeReach === "ok";
      const step = resumeOnboarding({ record: recordRef.current, canHostAgents, localReady: !!latestMachine?.local && routeReady && latest.facts.localHostStatus.state === "running",
        localInstallStarted: false, remoteReady: !!latestMachine && !latestMachine.local && routeReady, hostFp: latestFp,
        sttStageKey: stageKeyFor(latest, recordRef.current, "stt"), ttsStageKey: stageKeyFor(latest, recordRef.current, "tts") });
      if (step !== "W6") {
        setStep(step);
        setOpen(true);
        setError("onboarding.prerequisites");
        return false;
      }
      const saved = await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null });
      if (saved) setOpen(false);
      return saved;
    },
    rescanLocalAgents,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
