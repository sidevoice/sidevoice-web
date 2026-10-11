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
import { SpeechChoices, TranscriptionChoices, TurnChoices } from "../settings/VoiceSettings";
import { Appearance } from "../settings/SettingsDialog";
import { Group, Row } from "../../components/ui/Card";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { TryResult, useModelState, useVoiceTry, type ModelState, catalogueShown } from "../settings/ModelSetup";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import type { HostMessageKey } from "../settings/messages/en";
import { useOnboarding } from "./onboarding-context";
import "./onboarding.css";
import { useRoomStore } from "../../state/room-store";
import type { OnboardingStep } from "../../services/onboarding-state";

/* The first-run setup, one dialog over the room: of a fixed height, so nothing jumps between steps, and the whole
 * screen on a phone. Its order is the operator's: the basics (appearance, the interface's and the person's
 * languages), where the agents are (this computer prepared and its agents connected in one step, or another machine
 * paired), transcription, voice, and when a turn ends. Transcription and voice are this device's settings (as in
 * Settings); trying them is recommended, not required: Continue waits only for the chosen model to be ready. */

const GROUPS: { key: HostMessageKey; steps: OnboardingStep[] }[] = [
  { key: "wizard.group.basics", steps: ["W0"] },
  { key: "wizard.group.where", steps: ["W1"] },
  { key: "wizard.group.agents", steps: ["W2", "W3", "W2r"] },
  { key: "wizard.group.transcription", steps: ["W4"] },
  { key: "wizard.group.voice", steps: ["W4v"] },
  { key: "wizard.group.call", steps: ["W5"] },
  { key: "wizard.group.ready", steps: ["W6"] },
];

// Preparing this computer and connecting its agents are one step to the person: the same title through both.
const TITLES: Record<OnboardingStep, HostMessageKey> = {
  W0: "wizard.title.basics", W1: "wizard.title.where", W2: "wizard.title.install", W2r: "wizard.title.pair", W3: "wizard.title.install",
  W4: "wizard.title.stt", W4v: "wizard.title.tts", W5: "wizard.title.turn", W6: "wizard.title.ready",
};

const SAMPLE_MAX = 200;

function previous(step: OnboardingStep, path: "agents" | "remote" | null, canHostAgents: boolean): OnboardingStep | null {
  if (step === "W1") return "W0";
  if (step === "W2" || step === "W3") return "W1";
  if (step === "W2r") return canHostAgents ? "W1" : "W0";
  if (step === "W4") return path === "agents" ? "W3" : "W2r";
  if (step === "W4v") return "W4";
  if (step === "W5") return "W4v";
  if (step === "W6") return "W5";
  return null;
}

/** The basics: how it looks, the interface's language and the one the person speaks; Automatic and System by default. */
function BasicsStep({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [language, setLanguage] = useState(() => window.sidevoiceActions?.interfaceLanguage?.() ?? "");
  return <section className="wizard-basics">
    <p>{t("wizard.basics.body")}</p>
    <Group>
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
      <Row label={t("wizard.basics.uiLanguage")} htmlFor="wizard-ui-language">
        <NativeSelect id="wizard-ui-language" value={language} onChange={(event) => { setLanguage(event.target.value); window.sidevoiceActions?.setInterfaceLanguage?.(event.target.value); }}>
          <option value="">{t("wizard.languageAuto")}</option><option value="es">Español</option><option value="en">English</option>
        </NativeSelect>
      </Row>
      <Row label={t("wizard.basics.speech")} description={t("wizard.basics.speechHint")} htmlFor="wizard-speech-language">
        <NativeSelect id="wizard-speech-language" value={draft?.stt.language ?? ""} onChange={(event) => window.sidevoiceActions?.editVoice({ stt: { language: event.target.value || null } })}>
          <option value="">{t("wizard.languageAuto")}</option><option value="es">Español</option><option value="en">English</option>
        </NativeSelect>
      </Row>
    </Group>
  </section>;
}

/** When a turn ends, as Settings → Call has it: Smart preselected (where it runs here), Silence the other; patience. */
function TurnStep({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  useEffect(() => { if (catalogue.state === "idle") void window.sidevoiceActions?.loadVoiceCatalogue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="wizard-turn">
    <p>{t("wizard.turnIntro")}</p>
    {catalogue.state === "failed" ? <Alert tone="danger" live className="voice-catalogue-error" title={catalogue.error} />
      : !catalogueShown(catalogue) || !draft ? <p className="wizard-loading" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("voice.loading")}</p>
        : <TurnChoices draft={draft} />}
  </section>;
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
      {trial.phase === "idle" && !onboarding.tried(task) && <p className="wizard-try-hint">{t("wizard.tryHint")}</p>}
      <TryResult task={task} trial={trial} t={t} />
      {onboarding.tried(task) && trial.phase !== "running" && <Button type="button" variant="ghost" size="sm" id="wizard-try-again" onClick={stage.again}>{t("wizard.trialAgain")}</Button>}
    </div>
  </section>;
}

/** The voice steps' footer: the try, recommended (Cancel while it runs), and Continue, which waits only for the model to
 *  be ready — made ready in its own block above (ModelPrepare), as in Settings — and never for a try. */
function StageAction({ task, model, running, disabled, onTry, onCancelTry, onContinue, t }: {
  task: "stt" | "tts"; model: ModelState; running: boolean; disabled: boolean;
  onTry(): void; onCancelTry(): void; onContinue(): void; t: HostTranslate;
}) {
  const waiting = !model.model || !model.ready;
  return <>
    {waiting && <p className="ui-dialog-reason" id="wizard-stage-reason">{t(task === "stt" ? "settings.save.waitTranscription" : "settings.save.waitVoice")}</p>}
    {running ? <Button type="button" variant="secondary" id="wizard-try" onClick={onCancelTry}>{t("wizard.cancelTrial")}</Button>
      : <Button type="button" variant="secondary" id="wizard-try" disabled={disabled || waiting} onClick={onTry}>{task === "stt" ? t("wizard.speak") : t("wizard.listen")}</Button>}
    <Button type="button" variant="primary" id="wizard-stage-action" disabled={waiting || running} blockedBy={waiting ? "wizard-stage-reason" : undefined} onClick={onContinue}>{t("wizard.continue")}</Button>
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
  // The end of turn waits for its model when it is the smart one, as the voice steps wait for theirs.
  const turnModel = useModelState("end-of-turn", draft);
  const turnWaits = !!turnModel.model && !turnModel.ready;

  // W1's preselection: this computer wherever it can host agents, else another machine; what the person picks wins.
  useEffect(() => {
    if (touched.current || onboarding.record.choice) return;
    setChoice(onboarding.canHostAgents ? "agents" : "remote");
  }, [onboarding.canHostAgents, onboarding.record.choice]);

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

  async function finishBasics() {
    if (await onboarding.markBasicsDone()) onboarding.goTo(onboarding.canHostAgents ? "W1" : onboarding.remoteReady ? "W4" : "W2r");
  }

  async function finishStage(task: "stt" | "tts") {
    if (await onboarding.markChosen(task)) onboarding.goTo(task === "stt" ? "W4v" : "W5");
  }

  async function finishTurn() {
    if (await onboarding.markTurnDone()) onboarding.goTo("W6");
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
      {step === "W0" && <BasicsStep t={t} />}
      {step === "W2" && <section className="wizard-prepare">
        <p>{t("localInstall.description")}</p>
        {/* The step's own action, here: pressed, its progress shows in its place (downloading, preparing, starting…),
            with what failed and Retry; once this computer answers, its agents follow in the same step. */}
        {install.offered && <Button type="button" variant="primary" id="wizard-prepare" onClick={() => localHostInstallController.start("no-machine")}>{t("wizard.prepare")}</Button>}
        <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess className="wizard-install-entry" />
        <Button type="button" variant="ghost" size="sm" className="wizard-alternative" onClick={() => void choosePath("remote")}>{t("wizard.installRemote")}</Button>
      </section>}
      {step === "W2r" && <section>
        <p>{t("wizard.pairIntro")}</p>
        <ConnectorSteps />
        <PairingCodeForm idPrefix="wizard-pairing" rows={2} submitIn={onboarding.remoteReady ? null : footerSlot} />
      </section>}
      {step === "W3" && <section>
        <p>{t("wizard.agentsHere")}</p>
        {pairingInUse ? <HostAgentsPanel fp={pairingInUse} /> : null}
        {(!pairingInUse || (agents?.status === "ready" && agents.value?.agents.length === 0)) && <p className="muted">{t("wizard.noAgentsConnected")}</p>}
      </section>}
      {stageTask && <StageStep key={step} task={stageTask} stage={stage} t={t} />}
      {step === "W5" && <TurnStep t={t} />}
      {step === "W6" && <section><p>{t("wizard.readyBody")}</p></section>}
    </div>
    <footer className="wizard-actions">
      {back && <Button type="button" variant="ghost" tone="neutral" className="wizard-back" onClick={() => onboarding.goTo(back)}>{t("wizard.back")}</Button>}
      {step === "W0" && <Button type="button" variant="primary" onClick={() => void finishBasics()}>{t("wizard.continue")}</Button>}
      {step === "W1" && <Button type="button" variant="primary" disabled={!choice} onClick={() => choice && void choosePath(choice)}>{t("wizard.continue")}</Button>}
      {step === "W2" && onboarding.localReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W3")}>{t("wizard.continue")}</Button>}
      {step === "W2r" && onboarding.remoteReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W4")}>{t("wizard.continue")}</Button>}
      <span ref={setFooterSlot} className="wizard-slot" />
      {step === "W3" && <Button type="button" variant="primary" onClick={() => void finishAgents()}>{t("wizard.continue")}</Button>}
      {stageTask && <StageAction task={stageTask} model={model} running={trial.trial.phase === "running"}
        disabled={!draft?.[stageTask].model || (stageTask === "tts" && !sample.trim())}
        onTry={tryAgain} onCancelTry={trial.cancel} onContinue={() => void finishStage(stageTask)} t={t} />}
      {step === "W5" && <Button type="button" variant="primary" id="wizard-turn-continue" disabled={turnWaits} onClick={() => void finishTurn()}>{t("wizard.continue")}</Button>}
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
