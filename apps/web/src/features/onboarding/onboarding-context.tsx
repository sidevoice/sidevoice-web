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
import { effectiveStage } from "../../state/stage-settings.js";
import { stageContext } from "../../state/room-session-state.js";
import { useRoomStore } from "../../state/room-store";

interface OnboardingContextValue {
  ready: boolean;
  record: OnboardingRecord;
  error: OnboardingStorageError["key"] | null;
  open: boolean;
  step: OnboardingStep;
  path: "agents" | "remote" | null;
  canHostAgents: boolean;
  localAgents: { id: string; label: string; version?: string | null }[];
  localAgentsLoading: boolean;
  localAgentsError: boolean;
  stageKey(task: "stt" | "tts"): string | null;
  trialled(task: "stt" | "tts", key?: string | null): boolean;
  openWizard(step?: OnboardingStep): void;
  goTo(step: OnboardingStep): void;
  setPath(path: "agents" | "remote"): Promise<boolean>;
  markAgentsDone(): Promise<boolean>;
  markTrial(task: "stt" | "tts", key: string): Promise<boolean>;
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

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const room = useRoomStore((state) => state);
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
  const [error, setError] = useState<OnboardingStorageError["key"] | null>(null);
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
  const context = stageContext(facts);
  const stt = effectiveStage(context, "stt", facts.stageDraft?.stt ?? facts.voicePreferences?.stt);
  const tts = effectiveStage(context, "tts", facts.stageDraft?.tts ?? facts.voicePreferences?.tts);
  const stageKey = useCallback((task: "stt" | "tts") => {
    const stage = task === "stt" ? stt : tts;
    if (!fp || !stage?.model) return null;
    const stageLanguage = (stage.options as Record<string, unknown>)?.language;
    const language = task === "stt" && typeof stageLanguage === "string" && stageLanguage !== "auto"
      ? stageLanguage : facts.speechLanguage;
    return stageTrialKey(fp, { stage, language });
  }, [facts.speechLanguage, fp, stt, tts]);
  const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
  const localReady = !!localMachine && facts.localHostStatus.state === "running";
  const remoteReady = machines.some((machine) => !machine.local && machine.selectable && !!machine.pairingId);
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
    if (!hasMachine || localReady) {
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
      const saved = await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null });
      if (saved) setOpen(false);
      return saved;
    },
    rescanLocalAgents,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
