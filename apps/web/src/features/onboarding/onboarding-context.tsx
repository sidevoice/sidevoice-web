import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localHostBridge } from "../../services/desktop-host";
import {
  createOnboardingRepository,
  emptyOnboardingRecord,
  resumeOnboarding,
  trialKey,
  type OnboardingPatch,
  type OnboardingRecord,
  type OnboardingRepository,
  type OnboardingStep,
  type OnboardingStorageError,
} from "../../services/onboarding-state";
import { RoomStoreContext, useRoomStore, type RoomViewState } from "../../state/room-store";

/* The first-run setup over the real room: where the agents run (W1), this computer prepared (W2) or another machine
 * paired (W2r), the agents connected (W3), transcription (W4) and voice (W4v) chosen and tried on this device, and
 * Ready (W6). Its own record says what the person answered; the machine, its pairing and the device's voice settings
 * say what is done, read live, so a step already achieved is never asked for again. */

type ErrorKey = OnboardingStorageError["key"] | "onboarding.prerequisites";

interface OnboardingValue {
  ready: boolean;
  record: OnboardingRecord;
  error: ErrorKey | null;
  open: boolean;
  step: OnboardingStep;
  path: "agents" | "remote" | null;
  canHostAgents: boolean;
  localReady: boolean;
  remoteReady: boolean;
  localAgents: { id: string; label: string; version: string | null }[];
  localAgentsLoading: boolean;
  localAgentsScanned: boolean;
  /** Whether the voice settings being edited for `task` are the ones the person tried. */
  tried(task: "stt" | "tts"): boolean;
  openWizard(step?: OnboardingStep): void;
  goTo(step: OnboardingStep): void;
  setPath(path: "agents" | "remote"): Promise<boolean>;
  markAgentsDone(): Promise<boolean>;
  /** Records that the settings being edited for `task` worked. */
  markTried(task: "stt" | "tts"): Promise<boolean>;
  defer(): Promise<void>;
  complete(): Promise<boolean>;
  rescanLocalAgents(): Promise<void>;
}

const Context = createContext<OnboardingValue | null>(null);

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("OnboardingProvider is missing");
  return value;
}

/** The machine in use, when it is paired, selectable and answering. */
function machineInUse(room: RoomViewState) {
  const fp = room.facts.pairingInUse;
  const machine = room.machines.find((candidate) => candidate.pairingId === fp && candidate.selectable && !candidate.revoked);
  return machine && room.facts.node === fp && room.facts.nodeReach === "ok" ? machine : null;
}

/** What resume reads of the room: the machine in use, and the device's kept voice settings. */
function liveFacts(room: RoomViewState) {
  const machine = machineInUse(room);
  const kept = room.facts.voiceSettings;
  return {
    localReady: !!machine?.local && room.facts.localHostStatus.state === "running",
    remoteReady: !!machine && !machine.local,
    sttKey: kept ? trialKey(kept.stt) : null,
    ttsKey: kept ? trialKey(kept.tts) : null,
  };
}

export function OnboardingProvider({ children, repository: given }: { children: ReactNode; repository?: OnboardingRepository }) {
  const room = useRoomStore((state) => state);
  const roomStore = useContext(RoomStoreContext);
  if (!roomStore) throw new Error("OnboardingProvider must be inside RoomProvider");
  const repository = useMemo(() => given ?? createOnboardingRepository(), [given]);
  const canHostAgents = !!localHostBridge();
  // Read once, as the provider mounts: the room is shown or kept back from the first render.
  const [initial] = useState(() => {
    try { return { record: repository.read(), error: null }; }
    catch (reason) { return { record: emptyOnboardingRecord(), error: (reason as OnboardingStorageError).key ?? "onboarding.read_failed" }; }
  });
  const ready = true;
  const [record, setRecord] = useState<OnboardingRecord>(initial.record);
  const [error, setError] = useState<ErrorKey | null>(initial.error as ErrorKey | null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("W1");
  const [localAgents, setLocalAgents] = useState<OnboardingValue["localAgents"]>([]);
  const [localAgentsLoading, setLocalAgentsLoading] = useState(false);
  const [localAgentsScanned, setLocalAgentsScanned] = useState(false);
  const recordRef = useRef(initial.record);
  const writes = useRef(Promise.resolve());
  const decided = useRef(false);
  const live = liveFacts(room);
  const resume = useCallback((current: OnboardingRecord, facts: ReturnType<typeof liveFacts>) =>
    resumeOnboarding({ record: current, canHostAgents, ...facts }), [canHostAgents]);

  /** One write at a time, each from the record the last one left. */
  const persist = useCallback((update: OnboardingPatch) => {
    const operation = writes.current.then(async () => {
      try {
        const saved = await repository.patch(recordRef.current, update);
        recordRef.current = saved;
        setRecord(saved);
        setError(null);
        return true;
      } catch (reason) {
        setError((reason as OnboardingStorageError).key ?? "onboarding.write_failed");
        return false;
      }
    });
    writes.current = operation.then(() => undefined);
    return operation;
  }, [repository]);

  // Once the record and the machines are known: an unfinished setup opens where it stands, unless it was put off.
  useEffect(() => {
    if (!ready || decided.current || record.completed_at || !room.facts.machinesReady) return;
    decided.current = true;
    if (record.deferred_at) return;
    // A machine already running here (an \`npx\` install) is the agents path, chosen.
    if (live.localReady && !record.choice) void persist({ choice: "agents" });
    setStep(resume(live.localReady && !record.choice ? { ...record, choice: "agents" } : record, live));
    setOpen(true);
  }, [ready, record, room.facts.machinesReady, live, persist, resume]);

  const rescanLocalAgents = useCallback(async () => {
    const bridge = localHostBridge();
    if (!bridge?.agents) { setLocalAgentsScanned(true); return; }
    setLocalAgentsLoading(true);
    try {
      const result = await bridge.agents();
      setLocalAgents((Array.isArray(result?.agents) ? result.agents : []).flatMap((row) => {
        const item = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const id = typeof item.id === "string" ? item.id : "";
        const label = typeof item.label === "string" ? item.label : id;
        return id ? [{ id, label, version: typeof item.version === "string" ? item.version : null }] : [];
      }));
    } catch { setLocalAgents([]); }
    finally { setLocalAgentsLoading(false); setLocalAgentsScanned(true); }
  }, []);

  useEffect(() => {
    if (open && step === "W1" && canHostAgents && !localAgentsScanned && !localAgentsLoading) void rescanLocalAgents();
  }, [open, step, canHostAgents, localAgentsScanned, localAgentsLoading, rescanLocalAgents]);

  const draft = room.facts.voiceDraft ?? room.facts.voiceSettings;
  const value: OnboardingValue = {
    ready, record, error, open, step, canHostAgents, localAgents, localAgentsLoading, localAgentsScanned,
    path: canHostAgents ? record.choice : "remote",
    localReady: live.localReady,
    remoteReady: live.remoteReady,
    tried: (task) => !!draft && record.trials[task] === trialKey(draft[task]),
    openWizard(requested) {
      setError(null);
      setStep(requested ?? resume(recordRef.current, live));
      setOpen(true);
    },
    goTo: (next) => { setError(null); setStep(next); },
    setPath: (path) => persist({ choice: path, deferred_at: null }),
    markAgentsDone: () => persist({ agents_done: true }),
    markTried(task) {
      const key = draft ? trialKey(draft[task]) : null;
      return key ? persist({ trials: { [task]: key } }) : Promise.resolve(false);
    },
    async defer() {
      window.sidevoiceActions?.cancelVoiceTry?.();
      if (await persist({ deferred_at: Math.floor(Date.now() / 1000) })) setOpen(false);
    },
    // Entering needs every step done as things stand now, and the completion read back: never an optimistic flag.
    async complete() {
      const now = resume(recordRef.current, liveFacts(roomStore.getState()));
      if (now !== "W6") { setStep(now); setError("onboarding.prerequisites"); return false; }
      const saved = await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null });
      if (saved) setOpen(false);
      return saved;
    },
    rescanLocalAgents,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
