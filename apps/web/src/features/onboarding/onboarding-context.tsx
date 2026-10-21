import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { localHostBridge } from "../../services/desktop-host";
import { createMicrophoneAccess, type MicrophoneSnapshot } from "../../services/microphone-access";
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
import { useVoiceReadiness, type VoiceModelRow } from "../call/VoiceModels";
import type { VoiceReadiness } from "./onboarding-flow";

/* The first-run setup over the real room: the basics (W0: appearance, languages), where the agents run (W1), this
 * computer prepared (W2) and its agents connected (W3), or another machine paired (W2r), the microphone allowed (W4m),
 * transcription (W4) and voice
 * (W4v) chosen on this device (trying them is suggested, not required), the end of turn (W5), and Ready (W6). Its own record says what the person answered; the machine, its pairing and the device's voice settings
 * say what is done, read live, so a step already achieved is never asked for again. */

type ErrorKey = OnboardingStorageError["key"] | "onboarding.prerequisites";

interface OnboardingValue {
  ready: boolean;
  record: OnboardingRecord;
  /** The first setup is done: the one fact every reader of its completion uses (the room, the floating card, the new
   *  highlights, What's new): its completion stored, or entered this session though it could not be stored. */
  done: boolean;
  /** A paired machine answers this device now, here or elsewhere. */
  machineAnswers: boolean;
  /** The call's voice as it stands (transcription and voice), with the rows of the models it needs. */
  voice: { state: VoiceReadiness; rows: VoiceModelRow[]; sttReady: boolean; ttsReady: boolean };
  /** "Continue without …": the step passed and kept as such. */
  skip(step: "microphone" | "machine" | "stt" | "tts"): Promise<boolean>;
  error: ErrorKey | null;
  open: boolean;
  step: OnboardingStep;
  path: "agents" | "remote" | null;
  canHostAgents: boolean;
  localReady: boolean;
  remoteReady: boolean;
  /** Whether the microphone may be used here (microphone-access.ts), and whether that is all the setup needs of it. */
  microphone: MicrophoneSnapshot & { ready: boolean };
  /** Asks for the microphone (Allow, Check again). */
  requestMicrophone(): Promise<void>;
  /** Reads the microphone's state again without asking (Refresh status). */
  /** Where the app can open the system's microphone settings. */
  openMicrophoneSettings: (() => Promise<void>) | null;
  /** Whether the voice settings being edited for `task` are the ones the person tried. */
  tried(task: "stt" | "tts"): boolean;
  openWizard(step?: OnboardingStep): void;
  goTo(step: OnboardingStep): void;
  setPath(path: "agents" | "remote"): Promise<boolean>;
  markAgentsDone(): Promise<boolean>;
  /** The microphone's step passed (Continue, allowed): kept, also for a browser that cannot say so without asking again. */
  markMicrophoneDone(): Promise<boolean>;
  markBasicsDone(): Promise<boolean>;
  markTurnDone(): Promise<boolean>;
  /** Records that the person went on with the settings being edited for `task`, tried or not. */
  markChosen(task: "stt" | "tts"): Promise<boolean>;
  /** What's new: the person's answer for each feature shown. */
  markFeatures(ids: string[], state: "seen" | "done" | "later"): Promise<boolean>;
  /** Records that the settings being edited for `task` worked. */
  markTried(task: "stt" | "tts"): Promise<boolean>;
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

/** What the setup reads of the room, and nothing else. */
interface RoomForSetup {
  machines: RoomViewState["machines"];
  facts: Pick<RoomViewState["facts"], "machineLinks" | "localHostStatus" | "voiceSettings" | "voiceDraft" | "machinesReady">;
}

/** A paired machine this device reaches now (its link answers), local or not. */
function answering(room: RoomForSetup, local: boolean) {
  return room.machines.find((machine) => machine.local === local && !!machine.pairingId && !machine.revoked
    && room.facts.machineLinks[machine.pairingId]?.reach === "ok") ?? null;
}

/** Only an opened stream or the app's live permission answer confirms this device's microphone. */
function microphoneReady(microphone: MicrophoneSnapshot) {
  return microphone.state === "granted" || microphone.state === "none";
}

/** What resume reads of the microphone: whether the permissions step was passed with it allowed, and it still is (or there
 *  is nothing to ask). Required to call in this release (operator, 2026-10-16); the setup lets it be passed without
 *  ("Continue without …"), and the call area then asks for it. */
function microphoneFacts(microphone: MicrophoneSnapshot, record: OnboardingRecord) {
  return { passed: microphone.state === "none" || (record.microphone_done && microphoneReady(microphone)) || record.microphone_skipped };
}

/** What resume reads of the room: which machines answer, and the device's kept voice settings; and the microphone. */
function liveFacts(room: RoomForSetup, microphone: { passed: boolean }) {
  const kept = room.facts.voiceSettings;
  return {
    microphonePassed: microphone.passed,
    localReady: !!answering(room, true) && room.facts.localHostStatus.state === "running",
    remoteReady: !!answering(room, false),
    sttKey: kept ? trialKey(kept.stt) : null,
    ttsKey: kept ? trialKey(kept.tts) : null,
  };
}

export function OnboardingProvider({ children, repository: given, startAt }: { children: ReactNode; repository?: OnboardingRepository; startAt?: OnboardingStep }) {
  // Only what it reads: this wraps the whole room, and the whole snapshot is new on every publish of the store (the room's
  // beats, the voice's cues), which would draw everything under it again each time (desktop#149).
  const machines = useRoomStore((state) => state.machines);
  const machineLinks = useRoomStore((state) => state.facts.machineLinks);
  const localHostStatus = useRoomStore((state) => state.facts.localHostStatus);
  const voiceSettings = useRoomStore((state) => state.facts.voiceSettings);
  const voiceDraft = useRoomStore((state) => state.facts.voiceDraft);
  const machinesReady = useRoomStore((state) => state.facts.machinesReady);
  const room = useMemo<RoomForSetup>(() => ({ machines, facts: { machineLinks, localHostStatus, voiceSettings, voiceDraft, machinesReady } }),
    [machines, machineLinks, localHostStatus, voiceSettings, voiceDraft, machinesReady]);
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
  // Read for the setup's whole life: the platform's answer, live (a permission changed in the browser or the system's
  // settings is seen at once).
  const [microphoneAccess] = useState(() => createMicrophoneAccess());
  useEffect(() => () => microphoneAccess.dispose(), [microphoneAccess]);
  const microphone = useSyncExternalStore(microphoneAccess.subscribe, microphoneAccess.getSnapshot, microphoneAccess.getSnapshot);
  const voice = useVoiceReadiness();
  const machineAnswers = !!answering(room, true) || !!answering(room, false);
  // Entered from Ready though its completion could not be stored: entered for this session all the same.
  const [entered, setEntered] = useState(false);
  const done = !!record.completed_at || entered;
  // Resume asks the microphone's step until it was passed with Continue (or there is nothing to ask): allowed already,
  // it still shows, saying so (operator, 2026-10-16).
  const live = liveFacts(room, microphoneFacts(microphone, record));
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

  // Once the record and the machines are known: an unfinished setup opens where it stands, and opens again whenever it
  // is found closed unfinished.
  useEffect(() => {
    // Where it resumes depends on this device's voice settings too (what was chosen): it waits for them as well as the
    // machines, which the runtime may know first.
    if (!ready || !room.facts.machinesReady || !room.facts.voiceSettings || microphone.state === "checking") return;
    if (decided.current && (done || open || startAt)) return;
    // A step asked for (the storyboard's) opens there, whatever the record says.
    if (startAt) { decided.current = true; setStep(startAt); setOpen(true); return; }
    if (done) return;
    decided.current = true;
    // A machine already running here (an \`npx\` install) is the agents path, chosen.
    if (live.localReady && !record.choice) void persist({ choice: "agents" });
    setStep(resume(live.localReady && !record.choice ? { ...record, choice: "agents" } : record, live));
    setOpen(true);
  }, [ready, record, room.facts.machinesReady, room.facts.voiceSettings, microphone.state, live, persist, resume, startAt, done, open]);

  // Arriving at Ready completes the setup, whatever was passed without.
  useEffect(() => {
    if (!open || step !== "W6" || record.completed_at || startAt) return;
    void persist({ completed_at: Math.floor(Date.now() / 1000), baseline_release: RELEASE });
  }, [open, step, record.completed_at, startAt, persist]);

  // The desktop's floating call card shows only once the first setup is finished and its wizard is closed: the room
  // says so in its facts, which the card's host passes on (FLOATING-CARD-SPEC FC1).
  const setupDone = done && !open;
  useEffect(() => { roomStore.patch({ setupDone }); }, [roomStore, setupDone]);

  const draft = room.facts.voiceDraft ?? room.facts.voiceSettings;
  const value: OnboardingValue = {
    ready, record, error, open, step, canHostAgents, done, machineAnswers,
    voice,
    skip: (what) => persist(what === "microphone" ? { microphone_skipped: true } : what === "machine" ? { machine_skipped: true } : what === "stt" ? { stt_skipped: true } : { tts_skipped: true }),
    path: canHostAgents ? record.choice : "remote",
    localReady: live.localReady,
    remoteReady: live.remoteReady,
    microphone: { ...microphone, ready: microphoneReady(microphone) },
    requestMicrophone: () => microphoneAccess.request(),
    openMicrophoneSettings: microphoneAccess.openSettings,
    tried: (task) => !!draft && record.trials[task] === trialKey(draft[task]),
    openWizard(requested) {
      setError(null);
      setStep(requested ?? resume(recordRef.current, live));
      setOpen(true);
    },
    goTo: (next) => { setError(null); setStep(next); },
    setPath: (path) => persist({ choice: path }),
    markAgentsDone: () => persist({ agents_done: true }),
    markMicrophoneDone: () => persist({ microphone_done: true, microphone_skipped: false }),
    markBasicsDone: () => persist({ basics_done: true }),
    markTurnDone: () => persist({ turn_done: true }),
    markFeatures: (ids, state) => persist({ features: Object.fromEntries(ids.map((id) => [id, { state, at: Date.now() }])) }),
    markChosen(task) {
      const key = draft ? trialKey(draft[task]) : null;
      return key ? persist({ chosen: { [task]: key }, ...(task === "stt" ? { stt_skipped: false } : { tts_skipped: false }) }) : Promise.resolve(false);
    },
    markTried(task) {
      const key = draft ? trialKey(draft[task]) : null;
      return key ? persist({ trials: { [task]: key } }) : Promise.resolve(false);
    },
    // Ready always enters — stored if it can be, for this session if not.
    async complete() {
      const saved = recordRef.current.completed_at ? true : await persist({ completed_at: Math.floor(Date.now() / 1000), baseline_release: RELEASE });
      setEntered(true); setError(null); setOpen(false);
      return saved;
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
