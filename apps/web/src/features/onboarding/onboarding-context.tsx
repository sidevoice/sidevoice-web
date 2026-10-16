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
import { useOnboardingFlow, type FlowRules, type OnboardingFlow, type VoiceReadiness } from "./onboarding-flow";

/* The first-run setup over the real room: the basics (W0: appearance, languages), where the agents run (W1), this
 * computer prepared (W2) and its agents connected (W3), or another machine paired (W2r), the microphone allowed (W4m),
 * transcription (W4) and voice
 * (W4v) chosen on this device (trying them is suggested, not required), the end of turn (W5), and Ready (W6). Its own record says what the person answered; the machine, its pairing and the device's voice settings
 * say what is done, read live, so a step already achieved is never asked for again. */

type ErrorKey = OnboardingStorageError["key"] | "onboarding.prerequisites";

interface OnboardingValue {
  ready: boolean;
  record: OnboardingRecord;
  /** How the setup behaves (onboarding-flow.ts): read by the wizard and the room, decided there alone. */
  flow: OnboardingFlow;
  rules: FlowRules;
  /** The first setup is done: the one fact every reader of its completion uses (the room, the floating card, the new
   *  highlights, What's new). Per flow: its completion stored; in b also a machine answering with the voice ready; in d
   *  also entered this session though the completion could not be stored. */
  done: boolean;
  /** A paired machine answers this device now, here or elsewhere. */
  machineAnswers: boolean;
  /** The call's voice as it stands (transcription and voice), with the rows of the models it needs. */
  voice: { state: VoiceReadiness; rows: VoiceModelRow[]; sttReady: boolean; ttsReady: boolean };
  /** "Continue without …" (d): the step passed and kept as such. */
  skip(step: "machine" | "stt" | "tts"): Promise<boolean>;
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

/** Whether the setup has what it needs of the microphone: allowed, or nothing to ask here; where the browser cannot say
 *  without asking, allowed once in this setup. */
function microphoneReady(microphone: MicrophoneSnapshot, record: OnboardingRecord) {
  return microphone.state === "granted" || microphone.state === "none" || (!microphone.known && microphone.state === "prompt" && record.microphone_done);
}

/** What resume reads of the microphone: whether the permissions step was passed with it allowed, and it still is (or there
 *  is nothing to ask). Required in this release (operator, 2026-10-16): no way past without it. */
function microphoneFacts(microphone: MicrophoneSnapshot, record: OnboardingRecord) {
  return { passed: microphone.state === "none" || (record.microphone_done && microphoneReady(microphone, record)) };
}

/** What resume reads of the room: which machines answer, and the device's kept voice settings; and the microphone. */
function liveFacts(room: RoomViewState, microphone: { passed: boolean }) {
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
  // Read for the setup's whole life: the platform's answer, live (a permission changed in the browser or the system's
  // settings is seen at once).
  const [microphoneAccess] = useState(() => createMicrophoneAccess());
  useEffect(() => () => microphoneAccess.dispose(), [microphoneAccess]);
  const microphone = useSyncExternalStore(microphoneAccess.subscribe, microphoneAccess.getSnapshot, microphoneAccess.getSnapshot);
  const { flow, rules } = useOnboardingFlow();
  const voice = useVoiceReadiness();
  const machineAnswers = !!answering(room, true) || !!answering(room, false);
  const readinessMet = machineAnswers && voice.state === "ready";
  const readiness = useRef({ met: readinessMet, stt: voice.sttReady, tts: voice.ttsReady });
  readiness.current = { met: readinessMet, stt: voice.sttReady, tts: voice.ttsReady };
  // Entered from Ready though its completion could not be stored (d): entered for this session all the same.
  const [entered, setEntered] = useState(false);
  const done = !!record.completed_at || (rules.autoComplete && readinessMet) || (rules.skips && entered);
  // Resume asks the microphone's step until it was passed with Continue (or there is nothing to ask): allowed already,
  // it still shows, saying so (operator, 2026-10-16).
  const live = liveFacts(room, microphoneFacts(microphone, record));
  const resume = useCallback((current: OnboardingRecord, facts: ReturnType<typeof liveFacts>) =>
    resumeOnboarding({ record: current, canHostAgents, ...facts,
      ...(rules.liveResume ? { live: { sttReady: readiness.current.stt, ttsReady: readiness.current.tts } } : {}),
      skips: rules.skips }), [canHostAgents, rules]);

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

  // Set up by hand counts (operator, 2026-10-16): voice settings saved in Settings while the setup is put off are the
  // transcription, voice and end of turn chosen, so resuming skips what was already done there.
  const savedAt = room.facts.settingsSavedAt;
  useEffect(() => {
    const kept = room.facts.voiceSettings;
    if (!rules.pendingCard || !ready || open || record.completed_at || !record.deferred_at || !savedAt || !kept) return;
    const stt = trialKey(kept.stt), tts = trialKey(kept.tts);
    if (record.chosen.stt === stt && record.chosen.tts === tts && record.turn_done) return;
    void persist({ chosen: { ...(stt ? { stt } : {}), ...(tts ? { tts } : {}) }, turn_done: true });
  }, [savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the record and the machines are known: an unfinished setup opens where it stands, unless it was put off. Where
  // the setup is mandatory it opens again whenever it is found closed unfinished (a flow switched to it, too).
  useEffect(() => {
    // Where it resumes depends on this device's voice settings too (what was chosen): it waits for them as well as the
    // machines, which the runtime may know first.
    if (!ready || !room.facts.machinesReady || !room.facts.voiceSettings || microphone.state === "checking") return;
    if (decided.current && !(rules.mandatory && !done && !open && !startAt)) return;
    // A step asked for (the storyboard's) opens there, whatever the record says.
    if (startAt) { decided.current = true; setStep(startAt); setOpen(true); return; }
    if (done) return;
    decided.current = true;
    if (record.deferred_at && rules.canDefer) return;
    // A machine already running here (an \`npx\` install) is the agents path, chosen.
    if (live.localReady && !record.choice) void persist({ choice: "agents" });
    setStep(resume(live.localReady && !record.choice ? { ...record, choice: "agents" } : record, live));
    setOpen(true);
  }, [ready, record, room.facts.machinesReady, room.facts.voiceSettings, microphone.state, live, persist, resume, startAt, rules, done, open]);

  // b: done by any route — the completion (and the release it was set up on) written once, the moment a machine answers
  // with the voice ready. An open setup is never closed under the person.
  useEffect(() => {
    if (!rules.autoComplete || !readinessMet || record.completed_at || startAt) return;
    void persist({ completed_at: Math.floor(Date.now() / 1000), baseline_release: RELEASE });
  }, [rules.autoComplete, readinessMet, record.completed_at, startAt, persist]);

  // d: arriving at Ready completes the setup, whatever was passed without.
  useEffect(() => {
    if (!rules.skips || !open || step !== "W6" || record.completed_at || startAt) return;
    void persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null, baseline_release: RELEASE });
  }, [rules.skips, open, step, record.completed_at, startAt, persist]);


  // The desktop's floating call card shows only once the first setup is finished and its wizard is closed: the room
  // says so in its facts, which the card's host passes on (FLOATING-CARD-SPEC FC1).
  const setupDone = done && !open;
  useEffect(() => { roomStore.patch({ setupDone }); }, [roomStore, setupDone]);

  const draft = room.facts.voiceDraft ?? room.facts.voiceSettings;
  const value: OnboardingValue = {
    ready, record, error, open, step, canHostAgents, flow, rules, done, machineAnswers,
    voice,
    skip: (what) => persist(what === "machine" ? { machine_skipped: true } : what === "stt" ? { stt_skipped: true } : { tts_skipped: true }),
    path: canHostAgents ? record.choice : "remote",
    localReady: live.localReady,
    remoteReady: live.remoteReady,
    microphone: { ...microphone, ready: microphoneReady(microphone, record) },
    requestMicrophone: () => microphoneAccess.request(),
    openMicrophoneSettings: microphoneAccess.openSettings,
    tried: (task) => !!draft && record.trials[task] === trialKey(draft[task]),
    openWizard(requested) {
      setError(null);
      setStep(requested ?? resume(recordRef.current, live));
      setOpen(true);
    },
    goTo: (next) => { setError(null); setStep(next); },
    // Taken up again after "Later": c opens it by itself again from then on; b never does.
    setPath: (path) => persist({ choice: path, ...(rules.pendingCard ? { deferred_at: null } : {}) }),
    markAgentsDone: () => persist({ agents_done: true }),
    markMicrophoneDone: () => persist({ microphone_done: true }),
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
    async defer() {
      window.sidevoiceActions?.cancelVoiceTry?.();
      if (!rules.canDefer) return;
      // b: put off is set up as far as What's new goes — it lists what comes after this release, not everything.
      if (await persist({ deferred_at: Math.floor(Date.now() / 1000), ...(rules.deferBaseline ? { baseline_release: RELEASE } : {}) })) setOpen(false);
    },
    // Entering needs every step done as things stand now, and the completion read back: never an optimistic flag.
    async complete() {
      // d: Ready always enters — stored if it can be, for this session if not.
      if (rules.skips) {
        const saved = recordRef.current.completed_at ? true : await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null, baseline_release: RELEASE });
        setEntered(true); setError(null); setOpen(false);
        return saved;
      }
      // Done already (b: a machine answering with the voice ready; written once): it only closes.
      if (recordRef.current.completed_at || (rules.autoComplete && readiness.current.met)) {
        const saved = recordRef.current.completed_at ? true : await persist({ completed_at: Math.floor(Date.now() / 1000), baseline_release: RELEASE });
        if (saved) setOpen(false);
        return saved;
      }
      const now = resume(recordRef.current, liveFacts(roomStore.getState(), microphoneFacts(microphoneAccess.getSnapshot(), recordRef.current)));
      if (now !== "W6") { setStep(now); setError("onboarding.prerequisites"); return false; }
      // Set up on this release: what it already has is not news to the person.
      const saved = await persist({ completed_at: Math.floor(Date.now() / 1000), deferred_at: null, baseline_release: RELEASE });
      if (saved) setOpen(false);
      return saved;
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
