import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { SidevoiceMark } from "../../components/ui/Icons";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { CONNECTOR_INSTALL } from "../pairing/connector-commands";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { SpeechChoices, TranscriptionChoices } from "../settings/VoiceSettings";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import type { HostMessageKey } from "../settings/messages/en";
import { useOnboarding } from "./onboarding-context";
import "./onboarding.css";
import { useRoomStore } from "../../state/room-store";
import type { OnboardingStep } from "../../services/onboarding-state";

/* The first-run setup, one dialog over the room. Its progress groups are the approved ones: where you work, agents,
 * transcription, voice, ready. Transcription and voice are this device's settings (as in Settings → Voice), each tried
 * for real before Continue: the person speaks and sees the words, or hears a sentence they can edit. */

const GROUPS: { key: HostMessageKey; steps: OnboardingStep[] }[] = [
  { key: "wizard.group.where", steps: ["W1", "W2"] },
  { key: "wizard.group.agents", steps: ["W3", "W2r"] },
  { key: "wizard.group.transcription", steps: ["W4"] },
  { key: "wizard.group.voice", steps: ["W4v"] },
  { key: "wizard.group.ready", steps: ["W6"] },
];

const TITLES: Record<OnboardingStep, HostMessageKey> = {
  W1: "wizard.title.where", W2: "wizard.title.install", W2r: "wizard.title.pair", W3: "wizard.title.agents",
  W4: "wizard.title.stt", W4v: "wizard.title.tts", W6: "wizard.title.ready",
};

const SAMPLE_MAX = 200;

function previous(step: OnboardingStep, path: "agents" | "remote" | null, canHostAgents: boolean): OnboardingStep | null {
  if (step === "W2" || step === "W3") return "W1";
  if (step === "W2r") return canHostAgents ? "W1" : null;
  if (step === "W4") return path === "agents" ? "W3" : "W2r";
  if (step === "W4v") return "W4";
  if (step === "W6") return "W4v";
  return null;
}

type Trial = { phase: "idle" | "running" | "done" | "failed"; text: string; error: string };

/** The try of the step's voice slot (none outside W4/W4v): running, what it heard, or why it failed. A changed setting
 *  clears it, and leaving the step stops it. */
function useTrial(task: "stt" | "tts" | null) {
  const onboarding = useOnboarding();
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [trial, setTrial] = useState<Trial>({ phase: "idle", text: "", error: "" });
  const slot = JSON.stringify(task && draft ? draft[task] : null);
  useEffect(() => { setTrial({ phase: "idle", text: "", error: "" }); }, [slot, task]);
  useEffect(() => () => window.sidevoiceActions?.cancelVoiceTry?.(), [task]);
  async function run(options: { text?: string; language?: string | null } = {}) {
    if (!task) return;
    setTrial({ phase: "running", text: "", error: "" });
    try {
      const result = await window.sidevoiceActions!.tryVoiceSettings!(task, options);
      setTrial({ phase: "done", text: result.text ?? "", error: "" });
      await onboarding.markTried(task);
    } catch (error) {
      setTrial({ phase: (error as { code?: string }).code === "trial-cancelled" ? "idle" : "failed", text: "", error: (error as Error).message });
    }
  }
  return { trial, run, cancel: () => window.sidevoiceActions?.cancelVoiceTry?.() };
}

/** A slot chosen with no model (a provider whose key just came) takes its catalogue's first runnable one. */
function useFirstModel(task: "stt" | "tts") {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  useEffect(() => {
    const slot = draft?.[task];
    if (!slot || slot.model) return;
    const first = catalogs.find((catalog) => catalog.id === slot.catalog)?.models
      .find((model) => model.capabilities.includes(task) && (!model.builds || model.builds.some((build) => build.available)));
    if (first) window.sidevoiceActions?.editVoice({ [task]: { model: first.id } });
  }, [draft, catalogs, task]);
}

type StageTry = ReturnType<typeof useTrial> & { sample: string; setSample(value: string): void; again(): void };

function StageStep({ task, stage, t }: { task: "stt" | "tts"; stage: StageTry; t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const onboarding = useOnboarding();
  const { trial } = stage;
  useFirstModel(task);
  useEffect(() => {
    if (catalogue.state === "idle") void window.sidevoiceActions?.loadVoiceCatalogue();
    window.sidevoiceActions?.editVoice({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="wizard-stage-step">
    <p>{t(task === "stt" ? "wizard.sttIntro" : "wizard.ttsIntro")}</p>
    {catalogue.state === "failed" ? <p role="alert" className="voice-catalogue-error">{catalogue.error}</p>
      : catalogue.state !== "ready" || !draft ? <p className="muted" role="status">{t("voice.loading")}</p>
        : <div className="wizard-stage">{task === "stt" ? <TranscriptionChoices draft={draft} keysInPlace /> : <SpeechChoices draft={draft} keysInPlace />}</div>}
    {task === "tts" && <label className="wizard-sample">{t("wizard.sample")}
      <textarea id="wizard-sample" rows={2} maxLength={SAMPLE_MAX} value={stage.sample} placeholder={t("wizard.samplePlaceholder")}
        onChange={(event) => stage.setSample(event.target.value)} />
      <span className="muted">{t("wizard.sampleCount", { count: stage.sample.length, max: SAMPLE_MAX })}</span>
    </label>}
    <div className="wizard-trial" aria-live="polite">
      {trial.phase === "running" && <p className="muted" role="status">{t(task === "stt" ? "wizard.listening" : "wizard.playing")}</p>}
      {trial.phase === "done" && task === "stt" && <div className="wizard-heard"><span className="muted">{t("wizard.transcript")}</span><p className="speech-bubble" id="wizard-heard">{trial.text}</p></div>}
      {onboarding.tried(task) && trial.phase !== "running" && <Button type="button" variant="ghost" size="compact" id="wizard-try-again" onClick={stage.again}>{t("wizard.trialAgain")}</Button>}
      {trial.phase === "failed" && <p className="stage-try-error" role="alert">{trial.error}</p>}
    </div>
  </section>;
}

export function Wizard() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  const machines = useRoomStore((state) => state.machines);
  const pairingInUse = useRoomStore((state) => state.facts.pairingInUse);
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [choice, setChoice] = useState<"agents" | "remote" | null>(onboarding.record.choice);
  const [copied, setCopied] = useState("");
  const [completing, setCompleting] = useState(false);
  const touched = useRef(false);
  const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
  const { step } = onboarding;
  const stageTask = step === "W4" ? "stt" : step === "W4v" ? "tts" : null;
  const trial = useTrial(stageTask);
  const [sample, setSample] = useState(() => t("wizard.sampleText"));
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const speechLanguage = useRoomStore((state) => state.facts.speechLanguage);
  const tryAgain = () => void trial.run(stageTask === "stt" ? {} : { text: sample.trim(), language: draft?.stt.language || speechLanguage });
  const stage: StageTry = { ...trial, sample, setSample, again: tryAgain };
  const stageTried = !!stageTask && onboarding.tried(stageTask);

  // W1's preselection: agents found here → here, else another machine; what the person picks wins.
  useEffect(() => {
    if (touched.current || onboarding.record.choice || !onboarding.localAgentsScanned) return;
    setChoice(onboarding.canHostAgents && onboarding.localAgents.length ? "agents" : "remote");
  }, [onboarding.canHostAgents, onboarding.localAgentsScanned, onboarding.localAgents.length, onboarding.record.choice]);
  useEffect(() => { if (!onboarding.canHostAgents && !choice) setChoice("remote"); }, [onboarding.canHostAgents, choice]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (onboarding.open && !element.open) typeof element.showModal === "function" ? element.showModal() : element.setAttribute("open", "");
    if (!onboarding.open && element.open) typeof element.close === "function" ? element.close() : element.removeAttribute("open");
  }, [onboarding.open]);
  useEffect(() => { if (onboarding.open) title.current?.focus(); }, [onboarding.open, step]);

  // A machine prepared or paired while its step is shown moves the setup on by itself.
  useEffect(() => {
    if (!onboarding.open) return;
    if (step === "W2" && onboarding.localReady) onboarding.goTo(onboarding.record.agents_done ? "W4" : "W3");
    if (step === "W2r" && onboarding.remoteReady) onboarding.goTo("W4");
  }, [onboarding.open, step, onboarding.localReady, onboarding.remoteReady, onboarding.record.agents_done]); // eslint-disable-line react-hooks/exhaustive-deps

  async function choosePath(next: "agents" | "remote") {
    if (!await onboarding.setPath(next)) return;
    if (next === "agents") {
      if (localMachine?.pairingId && pairingInUse !== localMachine.pairingId) window.sidevoiceActions?.chooseMachine(localMachine.pairingId);
      onboarding.goTo(onboarding.localReady ? "W3" : "W2");
    } else onboarding.goTo(onboarding.remoteReady ? "W4" : "W2r");
  }

  async function finishAgents() {
    if (await onboarding.markAgentsDone()) onboarding.goTo("W4");
  }

  async function copyCommand() {
    try { await navigator.clipboard.writeText(CONNECTOR_INSTALL); setCopied(t("noMachine.commandCopied")); }
    catch { setCopied(t("noMachine.commandCopyFailed")); }
  }

  async function complete() {
    setCompleting(true);
    await onboarding.complete();
    setCompleting(false);
  }

  const current = GROUPS.findIndex((group) => group.steps.includes(step));
  const back = previous(step, onboarding.path, onboarding.canHostAgents);
  const error = onboarding.error ? t(`wizard.error.${onboarding.error.replace("onboarding.", "")}` as HostMessageKey) : "";
  const agents = pairingInUse ? hostAgents[pairingInUse] : undefined;

  return <dialog ref={dialog} id="wizard" className="wizard-dialog" aria-labelledby="wizard-title"
    onCancel={(event) => { event.preventDefault(); void onboarding.defer(); }}>
    <div className="wizard-head">
      <span className="wizard-brand"><SidevoiceMark size={18} /> {t("wizard.eyebrow")}</span>
      {step !== "W6" && <Button type="button" variant="ghost" size="compact" className="wizard-later" onClick={() => void onboarding.defer()}>{t("wizard.later")}</Button>}
    </div>
    <ol className="wizard-steps" aria-label={t("wizard.progress")}>
      {GROUPS.map((group, index) => <li key={group.key} data-state={index < current ? "done" : index === current ? "current" : "next"}
        aria-current={index === current ? "step" : undefined}>{t(group.key)}</li>)}
    </ol>
    <h2 id="wizard-title" ref={title} tabIndex={-1}>{t(TITLES[step])}</h2>
    <div className="wizard-body">
      {error && <p className="stage-try-error" role="alert">{error}</p>}
      {step === "W1" && <section>
        <p>{t("wizard.where.body")}</p>
        <div className="wizard-choices" role="radiogroup" aria-label={t("wizard.title.where")}>
          {onboarding.canHostAgents && <button type="button" role="radio" aria-checked={choice === "agents"} className="wizard-choice"
            onClick={() => { touched.current = true; setChoice("agents"); }}>{t("wizard.choice.local")}</button>}
          <button type="button" role="radio" aria-checked={choice === "remote"} className="wizard-choice"
            onClick={() => { touched.current = true; setChoice("remote"); }}>{t("wizard.choice.remote")}</button>
        </div>
        {onboarding.canHostAgents && <div className="wizard-detected" aria-live="polite">
          <p className="ui-field-label">{t("wizard.detected")}</p>
          {onboarding.localAgentsLoading ? <p className="muted">{t("wizard.detecting")}</p>
            : onboarding.localAgents.length ? <ul>{onboarding.localAgents.map((agent) => <li key={agent.id}>{agent.label}{agent.version ? " " + agent.version : ""}</li>)}</ul>
              : <p className="muted">{t("wizard.noAgents")}</p>}
        </div>}
      </section>}
      {step === "W2" && <section>
        <p>{t("localInstall.description")}</p>
        <LocalHostInstallEntry showCta source="no-machine" holdSuccess className="wizard-install-entry" />
        <Button type="button" variant="ghost" size="compact" onClick={() => void choosePath("remote")}>{t("wizard.installRemote")}</Button>
      </section>}
      {step === "W2r" && <section>
        <p>{t("wizard.pairIntro")}</p>
        <div className="setup-command"><code>{CONNECTOR_INSTALL}</code>
          <Button type="button" variant="ghost" size="compact" onClick={() => void copyCommand()}>{t("noMachine.copyCommand")}</Button>
        </div>
        {copied && <p className="muted" role="status">{copied}</p>}
        <Button type="button" variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}>{t("wizard.pairCode")}</Button>
      </section>}
      {step === "W3" && <section>
        {pairingInUse ? <HostAgentsPanel fp={pairingInUse} /> : null}
        {(!pairingInUse || (agents?.status === "ready" && agents.value?.agents.length === 0)) && <p className="muted">{t("wizard.noAgentsConnected")}</p>}
      </section>}
      {stageTask && <StageStep key={step} task={stageTask} stage={stage} t={t} />}
      {step === "W6" && <section><p>{t("wizard.readyBody")}</p></section>}
    </div>
    <div className="wizard-actions">
      {back && <Button type="button" variant="default" className="wizard-back" onClick={() => onboarding.goTo(back)}>{t("wizard.back")}</Button>}
      {step === "W1" && <Button type="button" variant="primary" disabled={!choice} onClick={() => choice && void choosePath(choice)}>{t("wizard.continue")}</Button>}
      {step === "W2" && onboarding.localReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W3")}>{t("wizard.continue")}</Button>}
      {step === "W2r" && onboarding.remoteReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W4")}>{t("wizard.continue")}</Button>}
      {step === "W3" && <>
        <Button type="button" variant="ghost" onClick={() => void finishAgents()}>{t("wizard.agentsSkip")}</Button>
        <Button type="button" variant="primary" onClick={() => void finishAgents()}>{t("wizard.continue")}</Button>
      </>}
      {stageTask && <Button type="button" variant="primary" id="wizard-stage-action"
        disabled={trial.trial.phase !== "running" && !stageTried && (!draft?.[stageTask].model || (stageTask === "tts" && !sample.trim()))}
        onClick={trial.trial.phase === "running" ? trial.cancel : stageTried ? () => onboarding.goTo(stageTask === "stt" ? "W4v" : "W6") : tryAgain}>
        {trial.trial.phase === "running" ? t("wizard.cancelTrial") : stageTried ? t("wizard.continue") : stageTask === "stt" ? t("wizard.speak") : t("wizard.listen")}
      </Button>}
      {step === "W6" && <Button type="button" variant="primary" disabled={completing} onClick={() => void complete()}>
        {error ? t("wizard.retryCompletion") : t("wizard.enter")}
      </Button>}
    </div>
  </dialog>;
}

/** What a put-off setup leaves on screen: one action, back into it where it stands. */
export function SetupPending() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  return <section className="setup-pending" aria-labelledby="setup-pending-title">
    <h1 id="setup-pending-title">{t("wizard.pendingTitle")}</h1>
    <p>{t("wizard.pendingBody")}</p>
    <Button type="button" variant="primary" onClick={() => onboarding.openWizard()}>{t("wizard.continueSetup")}</Button>
  </section>;
}
