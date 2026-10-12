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
import { RELEASE } from "../whats-new/catalogue";

/* The first-run setup over the real room: the basics (W0: appearance, languages), where the agents run (W1), this
 * computer prepared (W2) and its agents connected (W3), or another machine paired (W2r), transcription (W4) and voice
 * (W4v) chosen on this device (trying them is suggested, not required), the end of turn (W5), and Ready (W6). Its own record says what the person answered; the machine, its pairing and the device's voice settings
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
  /** Whether the voice settings being edited for `task` are the ones the person tried. */
  tried(task: "stt" | "tts"): boolean;
  openWizard(step?: OnboardingStep): void;
  goTo(step: OnboardingStep): void;
  setPath(path: "agents" | "remote"): Promise<boolean>;
  markAgentsDone(): Promise<boolean>;
  markBasicsDone(): Promise<boolean>;
  markTurnDone(): Promise<boolean>;
  /** Records that the person went on with the settings being edited for `task`, tried or not. */
  markChosen(task: "stt" | "tts"): Promise<boolean>;
  /** What's new: the person's answer for each feature shown. */
  markFeatures(ids: string[], state: "seen" | "done" | "later"): Promise<boolean>;
  /** Records that the settings being edited for `task` worked. */
  markTried(task: "stt" | "tts"): Promise<boolean>;
  defer(): Promise<void>;
  complete(): Promise<boolean>;
}

const Context = createContext<OnboardingValue | null>(null);

/** The setup, where there is one above (a pane drawn on its own has none). */
export function useOnboardingIfAny() { return useContext(Context); }

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("OnboardingProvider is missing");
  return value;
}

/** A paired machine this device reaches now (its link answers), local or not. */
function answering(room: RoomViewState, local: boolean) {
  return room.machines.find((machine) => machine.local === local && !!machine.pairingId && !machine.revoked
    && room.facts.machineLinks[machine.pairingId]?.reach === "ok") ?? null;
}

/** What resume reads of the room: which machines answer, and the device's kept voice settings. */
function liveFacts(room: RoomViewState) {
  const kept = room.facts.voiceSettings;
  return {
    localReady: !!answering(room, true) && room.facts.localHostStatus.state === "running",
    remoteReady: !!answering(room, false),
    sttKey: kept ? trialKey(kept.stt) : null,
    ttsKey: kept ? trialKey(kept.tts) : null,
  };
}

export function OnboardingProvider({ children, repository: given, startAt }: { children: ReactNode; repository?: OnboardingRepository; startAt?: OnboardingStep }) {
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
  const [step, setStep] = useState<OnboardingStep>("W0");
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
    // Where it resumes depends on this device's voice settings too (what was chosen): it waits for them as well as the
    // machines, which the runtime may know first.
    if (!ready || decided.current || !room.facts.machinesReady || !room.facts.voiceSettings) return;
    // A step asked for (the storyboard's) opens there, whatever the record says.
    if (startAt) { decided.current = true; setStep(startAt); setOpen(true); return; }
    if (record.completed_at) return;
    decided.current = true;
    if (record.deferred_at) return;
    // A machine already running here (an \`npx\` install) is the agents path, chosen.
    if (live.localReady && !record.choice) void persist({ choice: "agents" });
    setStep(resume(live.localReady && !record.choice ? { ...record, choice: "agents" } : record, live));
    setOpen(true);
  }, [ready, record, room.facts.machinesReady, room.facts.voiceSettings, live, persist, resume, startAt]);

  const draft = room.facts.voiceDraft ?? room.facts.voiceSettings;
  const value: OnboardingValue = {
    ready, record, error, open, step, canHostAgents,
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
    markBasicsDone: () => persist({ basics_done: true }),
    markTurnDone: () => persist({ turn_done: true }),
    markFeatures: (ids, state) => persist({ features: Object.fromEntries(ids.map((id) => [id, { state, at: Date.now() }])) }),
    markChosen(task) {
      const key = draft ? trialKey(draft[task]) : null;
      return key ? persist({ chosen: { [task]: key } }) : Promise.resolve(false);
    },
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
      // Set up on this release: what it already has is not news to the person.
      const saved = await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null, baseline_release: RELEASE });
      if (saved) setOpen(false);
      return saved;
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
