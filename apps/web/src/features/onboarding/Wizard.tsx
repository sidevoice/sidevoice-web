import { useEffect, useRef, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChoiceCard } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { ConnectorIcon, HarnessIcon, MachinesIcon, SidevoiceMark } from "../../components/ui/Icons";
import { Textarea } from "../../components/ui/Input";
import { localHostInstallController } from "../../services/local-host-install";
import { LocalHostInstallEntry, useLocalInstallOffer } from "../pairing/LocalHostInstallEntry";
import { ConnectorSteps } from "../pairing/ConnectorSteps";
import { PairingCodeForm } from "../pairing/PairingDialog";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { SpeechChoices, TranscriptionChoices } from "../settings/VoiceSettings";
import { TryResult, useModelState, useVoiceTry, type ModelState, catalogueShown } from "../settings/ModelSetup";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import type { HostMessageKey } from "../settings/messages/en";
import { useOnboarding } from "./onboarding-context";
import "./onboarding.css";
import { useRoomStore } from "../../state/room-store";
import type { OnboardingStep } from "../../services/onboarding-state";

/* The first-run setup, one dialog over the room: of a fixed height, so nothing jumps between steps, and the whole
 * screen on a phone. Its progress groups are the approved ones: where you work, agents, transcription, voice, ready.
 * Transcription and voice are this device's settings (as in Settings → Voice), each tried for real before Continue:
 * the person speaks and sees the words, or hears a sentence they can edit. */

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

/** Where the setup stands: the step and its group in words, then the five groups as a bar, done and current lit. */
function Stepper({ current, t }: { current: number; t: HostTranslate }) {
  return <div className="wizard-stepper">
    <p className="wizard-stepper-label">{t("wizard.stepOf", { n: current + 1, total: GROUPS.length, group: t(GROUPS[current].key) })}</p>
    <ol className="wizard-steps" aria-label={t("wizard.progress")}>
      {GROUPS.map((group, index) => <li key={group.key} data-state={index < current ? "done" : index === current ? "current" : "next"}
        aria-current={index === current ? "step" : undefined}><span className="sr-only">{t(group.key)}</span></li>)}
    </ol>
  </div>;
}

type StageTry = ReturnType<typeof useVoiceTry> & { sample: string; setSample(value: string): void; again(): void };

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
    {catalogue.state === "failed" ? <Alert tone="danger" live className="voice-catalogue-error" title={catalogue.error} />
      : !catalogueShown(catalogue) || !draft ? <p className="wizard-loading" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("voice.loading")}</p>
        : <div className="wizard-stage">{task === "stt" ? <TranscriptionChoices draft={draft} setup /> : <SpeechChoices draft={draft} setup />}</div>}
    {task === "tts" && <Field className="wizard-sample" label={t("wizard.sample")} aside={t("wizard.sampleCount", { count: stage.sample.length, max: SAMPLE_MAX })}>
      <Textarea id="wizard-sample" minRows={2} maxRows={4} maxLength={SAMPLE_MAX} value={stage.sample} placeholder={t("wizard.samplePlaceholder")}
        onChange={(event) => stage.setSample(event.target.value)} />
    </Field>}
    <div className="wizard-trial">
      <TryResult task={task} trial={trial} t={t} />
      {onboarding.tried(task) && trial.phase !== "running" && <Button type="button" variant="ghost" size="sm" id="wizard-try-again" onClick={stage.again}>{t("wizard.trialAgain")}</Button>}
    </div>
  </section>;
}

/** The voice steps' footer action: the try (cancel while it runs), then Continue. The model is made ready in its own
 *  block above (ModelPrepare: download, cancel, retry), as in Settings; until it is, the try waits and says why. */
function StageAction({ task, model, running, tried, disabled, onTry, onCancelTry, onContinue, t }: {
  task: "stt" | "tts"; model: ModelState; running: boolean; tried: boolean; disabled: boolean;
  onTry(): void; onCancelTry(): void; onContinue(): void; t: HostTranslate;
}) {
  const waiting = !!model.model && !model.ready;
  const [label, action, off] = running ? [t("wizard.cancelTrial"), onCancelTry, false]
    : tried && !waiting ? [t("wizard.continue"), onContinue, false]
      : [task === "stt" ? t("wizard.speak") : t("wizard.listen"), onTry, disabled || waiting];
  return <>
    {waiting && <p className="ui-dialog-reason" id="wizard-stage-reason">{t(task === "stt" ? "settings.save.waitTranscription" : "settings.save.waitVoice")}</p>}
    <Button type="button" variant="primary" id="wizard-stage-action" disabled={off} blockedBy={waiting ? "wizard-stage-reason" : undefined} onClick={action}>{label}</Button>
  </>;
}

export function Wizard() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  const machines = useRoomStore((state) => state.machines);
  const pairingInUse = useRoomStore((state) => state.facts.pairingInUse);
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Where the pairing form puts its Connect: this footer, as the step's main action.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  const [choice, setChoice] = useState<"agents" | "remote" | null>(onboarding.record.choice);
  const [completing, setCompleting] = useState(false);
  const touched = useRef(false);
  const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
  const install = useLocalInstallOffer();
  const { step } = onboarding;
  const stageTask = step === "W4" ? "stt" : step === "W4v" ? "tts" : null;
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const trial = useVoiceTry(stageTask, { onTried: (task) => void onboarding.markTried(task) });
  const model = useModelState(stageTask ?? "stt", draft);
  const [sample, setSample] = useState(() => t("wizard.sampleText"));
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

  async function complete() {
    setCompleting(true);
    await onboarding.complete();
    setCompleting(false);
  }

  function choose(next: "agents" | "remote") {
    touched.current = true;
    setChoice(next);
  }

  const current = GROUPS.findIndex((group) => group.steps.includes(step));
  const back = previous(step, onboarding.path, onboarding.canHostAgents);
  const error = onboarding.error ? t(`wizard.error.${onboarding.error.replace("onboarding.", "")}` as HostMessageKey) : "";
  const agents = pairingInUse ? hostAgents[pairingInUse] : undefined;

  return <dialog ref={dialog} id="wizard" className="wizard-dialog" aria-labelledby="wizard-title"
    onCancel={(event) => { event.preventDefault(); void onboarding.defer(); }}>
    <header className="wizard-head">
      <span className="wizard-brand"><SidevoiceMark size={18} />{t("wizard.eyebrow")}</span>
      {step !== "W6" && <Button type="button" variant="ghost" tone="neutral" size="sm" className="wizard-later" onClick={() => void onboarding.defer()}>{t("wizard.later")}</Button>}
    </header>
    <Stepper current={current} t={t} />
    <h2 id="wizard-title" className="wizard-title" ref={title} tabIndex={-1}>{t(TITLES[step])}</h2>
    <div className="wizard-body">
      {error && <Alert tone="danger" live title={error} />}
      {step === "W1" && <section>
        <p>{t("wizard.where.body")}</p>
        <div className="wizard-choices" role="radiogroup" aria-label={t("wizard.title.where")}>
          {onboarding.canHostAgents && <ChoiceCard selected={choice === "agents"} onSelect={() => choose("agents")}>
            <MachinesIcon size={20} /><strong>{t("wizard.choice.local")}</strong>
          </ChoiceCard>}
          <ChoiceCard selected={choice === "remote"} onSelect={() => choose("remote")}>
            <ConnectorIcon size={20} /><strong>{t("wizard.choice.remote")}</strong>
          </ChoiceCard>
        </div>
        {onboarding.canHostAgents && <div className="wizard-detected" aria-live="polite">
          <p className="wizard-detected-label">{t("wizard.detected")}</p>
          {onboarding.localAgentsLoading ? <p className="wizard-loading"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("wizard.detecting")}</p>
            : onboarding.localAgents.length ? <ul className="wizard-chips">{onboarding.localAgents.map((agent) => <li key={agent.id}>
              <Badge><HarnessIcon harness={agent.id} size={12} />{agent.label}{agent.version ? " " + agent.version : ""}</Badge>
            </li>)}</ul>
              : <p className="muted">{t("wizard.noAgents")}</p>}
        </div>}
      </section>}
      {step === "W2" && <section>
        <p>{t("localInstall.description")}</p>
        <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess className="wizard-install-entry" />
        <Button type="button" variant="ghost" size="sm" className="wizard-alternative" onClick={() => void choosePath("remote")}>{t("wizard.installRemote")}</Button>
      </section>}
      {step === "W2r" && <section>
        <p>{t("wizard.pairIntro")}</p>
        <ConnectorSteps />
        <PairingCodeForm idPrefix="wizard-pairing" rows={2} submitIn={onboarding.remoteReady ? null : footerSlot} />
      </section>}
      {step === "W3" && <section>
        {pairingInUse ? <HostAgentsPanel fp={pairingInUse} /> : null}
        {(!pairingInUse || (agents?.status === "ready" && agents.value?.agents.length === 0)) && <p className="muted">{t("wizard.noAgentsConnected")}</p>}
      </section>}
      {stageTask && <StageStep key={step} task={stageTask} stage={stage} t={t} />}
      {step === "W6" && <section><p>{t("wizard.readyBody")}</p></section>}
    </div>
    <footer className="wizard-actions">
      {back && <Button type="button" variant="ghost" tone="neutral" className="wizard-back" onClick={() => onboarding.goTo(back)}>{t("wizard.back")}</Button>}
      {step === "W1" && <Button type="button" variant="primary" disabled={!choice} onClick={() => choice && void choosePath(choice)}>{t("wizard.continue")}</Button>}
      {step === "W2" && (onboarding.localReady ? <Button type="button" variant="primary" onClick={() => onboarding.goTo("W3")}>{t("wizard.continue")}</Button>
        : install.offered && <Button type="button" variant="primary" onClick={() => localHostInstallController.start("no-machine")}>{t("localInstall.cta")}</Button>)}
      {step === "W2r" && onboarding.remoteReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W4")}>{t("wizard.continue")}</Button>}
      <span ref={setFooterSlot} className="wizard-slot" />
      {step === "W3" && <>
        <Button type="button" variant="ghost" tone="neutral" onClick={() => void finishAgents()}>{t("wizard.agentsSkip")}</Button>
        <Button type="button" variant="primary" onClick={() => void finishAgents()}>{t("wizard.continue")}</Button>
      </>}
      {stageTask && <StageAction task={stageTask} model={model} running={trial.trial.phase === "running"} tried={stageTried}
        disabled={!draft?.[stageTask].model || (stageTask === "tts" && !sample.trim())}
        onTry={tryAgain} onCancelTry={trial.cancel} onContinue={() => onboarding.goTo(stageTask === "stt" ? "W4v" : "W6")} t={t} />}
      {step === "W6" && <Button type="button" variant="primary" disabled={completing} onClick={() => void complete()}>
        {error ? t("wizard.retryCompletion") : t("wizard.enter")}
      </Button>}
    </footer>
  </dialog>;
}

/** What a put-off setup leaves on screen: one action, back into it where it stands. */
export function SetupPending() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  return <section className="setup-pending" aria-labelledby="setup-pending-title">
    <span className="setup-pending-mark"><SidevoiceMark size={28} /></span>
    <h1 id="setup-pending-title">{t("wizard.pendingTitle")}</h1>
    <p>{t("wizard.pendingBody")}</p>
    <Button type="button" variant="primary" onClick={() => onboarding.openWizard()}>{t("wizard.continueSetup")}</Button>
  </section>;
}
