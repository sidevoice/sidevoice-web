import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { ChoiceCard } from "../../components/ui/Card";
import { ArrowRightIcon, OtherMachineIcon, SidevoiceMark, ThisComputerIcon, BackIcon } from "../../components/ui/Icons";
import { localHostInstallController } from "../../services/local-host-install";
import { LocalHostInstallEntry, useLocalInstallOffer } from "../pairing/LocalHostInstallEntry";
import { PairMachine } from "../pairing/PairMachine";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { SpeechChoices, TranscriptionChoices, TurnChoices } from "../settings/VoiceSettings";
import { useTurnTry, type TurnTryHandle } from "../settings/TurnTry";
import { Appearance } from "../settings/SettingsDialog";
import { Group, Row } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { useModelState, useVoiceTry, type ModelState, type SetupTry, catalogueShown } from "../settings/ModelSetup";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { hostStatusText } from "../settings/local-host-status";
import type { HostMessageKey } from "../settings/messages/en";
import { useOnboarding } from "./onboarding-context";
import { DeviceNameField } from "../settings/DeviceNameField";
import { ReadyStep } from "./ReadyStep";
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

/** The steps in the order they come, for the side a new one slides in from. */
const ORDER: OnboardingStep[] = ["W0", "W1", "W2", "W2r", "W3", "W4", "W4v", "W5", "W6"];

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

/** The basics: how it looks, this device's name, the interface's language and the one the person speaks; Automatic and
 *  System by default. */
function BasicsStep({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [language, setLanguage] = useState(() => window.sidevoiceActions?.interfaceLanguage?.() ?? "");
  // Each language in its own name, as language pickers have them.
  const languages = [{ value: "", label: t("wizard.languageAuto") }, { value: "es", label: "Español" }, { value: "en", label: "English" }];
  return <section className="wizard-basics">
    <p>{t("wizard.basics.body")}</p>
    <Group>
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
      <Row label={t("settings.deviceName")} description={t("settings.deviceName.hint")} htmlFor="wizard-device-name"><DeviceNameField id="wizard-device-name" /></Row>
      <Row label={t("wizard.basics.uiLanguage")} htmlFor="wizard-ui-language">
        <Select id="wizard-ui-language" value={language} onValueChange={(next) => { setLanguage(next); window.sidevoiceActions?.setInterfaceLanguage?.(next); }} options={languages} />
      </Row>
      <Row label={t("wizard.basics.speech")} description={t("wizard.basics.speechHint")} htmlFor="wizard-speech-language">
        <Select id="wizard-speech-language" value={draft?.stt.language ?? ""} onValueChange={(next) => window.sidevoiceActions?.editVoice({ stt: { language: next || null } })} options={languages} />
      </Row>
    </Group>
  </section>;
}

/** When a turn ends, as Settings → Call has it: Smart preselected (where it runs here), Silence the other; patience;
 *  and its try, optional — Continue stays the step's action, and leaving the step (Continue, Back, Later) stops it. */
function TurnStep({ turnTry, tried, t }: { turnTry: TurnTryHandle; tried: boolean; t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  useEffect(() => { if (catalogue.state === "idle") void window.sidevoiceActions?.loadVoiceCatalogue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="wizard-turn">
    <p>{t("wizard.turnIntro")}</p>
    {catalogue.state === "failed" ? <Alert tone="danger" live className="voice-catalogue-error" title={catalogue.error} details={catalogue.details} />
      : !catalogueShown(catalogue) || !draft ? <p className="wizard-loading" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("voice.loading")}</p>
        : <TurnChoices draft={draft} setup turnTry={turnTry} turnTried={tried} />}
  </section>;
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

type StageTry = SetupTry & { sentence: string; setSentence(value: string): void };

/** A voice step: its slot as Settings has it, the try in the model's block (what it shows and where, the `try-result`
 *  variant's), its first try offered in the footer. The sentence to hear is edited in the block, where it is then lit
 *  as it is heard (`card`); with the try in its own dialog, beside the block (`dialog`). */
function StageStep({ task, stage, t }: { task: "stt" | "tts"; stage: StageTry; t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  useEffect(() => {
    if (catalogue.state === "idle") void window.sidevoiceActions?.loadVoiceCatalogue();
    window.sidevoiceActions?.editVoice({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The voice's sentence is the try's own, shown and editable in it (TtsTry).
  const trial: SetupTry = stage;
  return <section className="wizard-stage-step">
    <p>{t(task === "stt" ? "wizard.sttIntro" : "wizard.ttsIntro")}</p>
    {catalogue.state === "failed" ? <Alert tone="danger" live className="voice-catalogue-error" title={catalogue.error} details={catalogue.details} />
      : !catalogueShown(catalogue) || !draft ? <p className="wizard-loading" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("voice.loading")}</p>
        : <div className="wizard-stage">{task === "stt" ? <TranscriptionChoices draft={draft} setup trial={trial} /> : <SpeechChoices draft={draft} setup trial={trial} />}</div>}
  </section>;
}

/** The voice steps' footer. Once the model is ready — made ready in its own block above (ModelPrepare), as in Settings
 *  — trying it is the main action and going on without it the other; once it worked, Continue is. Trying stays
 *  optional: nothing waits for it but the model. */
/** The model steps' footer, the same in Transcription, Voice and End of turn, always one line: Back, then what it says
 *  and its actions — Try it the main one, running the step's try block (Continue without trying beside it once the
 *  model is ready; Stop while it runs; Continue once tried). `reason`: the step's model is not ready (said in the row, cut short with its whole text kept);
 *  `tryReason`: only the try can't run yet (no sentence to say, no transcription to hear a turn). Blocked actions stay focusable, saying why (`blockedBy`). */
function ModelStepFooter({ reason, tryReason, running, tried, onTry, onStop, onContinue, t }: {
  reason: string; tryReason?: string; running: boolean; tried: boolean;
  onTry(): void; onStop(): void; onContinue(): void; t: HostTranslate;
}) {
  const waiting = !!reason && !running;
  const said = waiting ? reason : !running && tryReason ? tryReason : "";
  const line = said ? <p className="wizard-reason" id="wizard-stage-reason" title={said}>{said}</p> : null;
  const blocked = (on: boolean) => ({ disabled: on, blockedBy: on ? "wizard-stage-reason" : undefined });
  const goOn = () => { if (running) onStop(); onContinue(); };
  if (tried && !running) return <Button type="button" variant="primary" id="wizard-stage-action" onClick={onContinue}>{t("wizard.continue")}</Button>;
  return <>
    {line}
    {!waiting && <Button type="button" variant="secondary" id="wizard-stage-action" onClick={goOn}>{t("wizard.continueWithoutTrying")}</Button>}
    <Button type="button" variant="primary" id="wizard-try" {...blocked(waiting || (!running && !!tryReason))} onClick={running ? onStop : onTry}>
      {running ? t("try.stop") : t("try.tryIt")}</Button>
  </>;
}

/** Why a step's model holds its footer, in the step's own words; nothing once it is ready. */
const WAIT_KEY = { stt: "settings.save.waitTranscription", tts: "settings.save.waitVoice", turn: "settings.save.waitTurn" } as const;
function waitReason(model: ModelState, slot: keyof typeof WAIT_KEY, t: HostTranslate) {
  return model.model && model.ready ? "" : t(WAIT_KEY[slot]);
}

export function Wizard() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  const machines = useRoomStore((state) => state.machines);
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Where the pairing form puts its Connect: this footer, as the step's main action.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  const [choice, setChoice] = useState<"agents" | "remote" | null>(onboarding.record.choice);
  const [completing, setCompleting] = useState(false);
  const touched = useRef(false);
  const localMachine = machines.find((machine) => machine.local && machine.state === "connected" && machine.pairingId);
  // Another machine: the one answering, else the newest paired. Every machine is live at once: none is "in use".
  const remoteMachine = machines.find((machine) => !machine.local && !machine.revoked && machine.state === "connected")
    ?? machines.find((machine) => !machine.local && !machine.revoked);
  // Whose agents the setup shows: this computer's on its path, the other machine's on the other.
  const agentsFp = (onboarding.path === "remote" ? remoteMachine?.pairingId : localMachine?.pairingId ?? remoteMachine?.pairingId) ?? null;
  const install = useLocalInstallOffer();
  const installSnapshot = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const hostStatus = useRoomStore((state) => state.facts.localHostStatus);
  // Preparing this computer, from the press (or an install already under way) until it answers or fails; a cancelled
  // install offers Prepare again.
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (installSnapshot.phase === "installing" || installSnapshot.phase === "succeeded") setPreparing(true);
    if (installSnapshot.phase === "cancelled") setPreparing(false);
  }, [installSnapshot.phase]);
  const hostFailed = hostStatus.state === "failed" || hostStatus.state === "service-failed";
  const prepare = () => { setPreparing(true); localHostInstallController.start("no-machine"); };
  const { step } = onboarding;
  const stageTask = step === "W4" ? "stt" : step === "W4v" ? "tts" : null;
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const trial = useVoiceTry(stageTask, { onTried: (task) => void onboarding.markTried(task) });
  const model = useModelState(stageTask ?? "stt", draft);
  const [sample, setSample] = useState(() => t("wizard.sampleText"));
  const speechLanguage = useRoomStore((state) => state.facts.speechLanguage);
  const tryAgain = () => void trial.run(stageTask === "stt" ? {} : { text: sample.trim(), language: draft?.stt.language || speechLanguage });
  const tried = !!stageTask && onboarding.tried(stageTask);
  const stage: StageTry = { ...trial, start: tryAgain, tried, hint: tried ? undefined : t("wizard.tryHint"), sentence: sample, setSentence: setSample };
  // The end of turn waits for its model when it is the smart one, as the voice steps wait for theirs.
  const turnModel = useModelState("end-of-turn", draft);
  const turnWaits = !!turnModel.model && !turnModel.ready;
  // The end of turn's try is the setup's, as the voice steps' are: its footer starts and stops it, the step shows it.
  // Tried once a turn has ended in it.
  const turnTry = useTurnTry({ active: onboarding.open && step === "W5", smartBlocked: turnWaits });
  const [turnTried, setTurnTried] = useState(false);
  if (turnTry.trial.turn && !turnTried) setTurnTried(true);
  const sttModel = useModelState("stt", draft);

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
  // A new step is seen to arrive: its body starts at the top (drawn anew), slides in from the side it came from, and its
  // title takes the focus, so a screen reader says it. The direction is the steps' order.
  useEffect(() => { if (onboarding.open) title.current?.focus(); }, [onboarding.open, step]);
  const travel = useRef<{ step: OnboardingStep; direction: "forward" | "back" | null }>({ step, direction: null });
  if (travel.current.step !== step) travel.current = { step, direction: ORDER.indexOf(step) < ORDER.indexOf(travel.current.step) ? "back" : "forward" };

  // A machine prepared or paired while its step shows moves the setup on by itself, to where it then stands (a machine
  // that answers after the setup opened leaves the steps already done behind). Only one that becomes ready there: a
  // step arrived at with its machine already ready (Back) stays, with Continue — Back always lands where it says.
  const readyOnArrival = useRef({ step, local: onboarding.localReady, remote: onboarding.remoteReady });
  if (readyOnArrival.current.step !== step) readyOnArrival.current = { step, local: onboarding.localReady, remote: onboarding.remoteReady };
  useEffect(() => {
    if (!onboarding.open) return;
    const arrived = readyOnArrival.current;
    if (step === "W2" && onboarding.localReady && !arrived.local) onboarding.openWizard();
    if (step === "W2r" && onboarding.remoteReady && !arrived.remote) onboarding.openWizard();
  }, [onboarding.open, step, onboarding.localReady, onboarding.remoteReady, onboarding.record.agents_done]); // eslint-disable-line react-hooks/exhaustive-deps

  async function choosePath(next: "agents" | "remote") {
    if (!await onboarding.setPath(next)) return;
    if (next === "agents") {
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
  const agents = agentsFp ? hostAgents[agentsFp] : undefined;

  const remoteName = remoteMachine?.host ?? "";

  /** Preparing this computer: its action, then its progress in its place (downloading, preparing, starting…), with
   *  what failed and Retry. Another machine instead is Back's, to the choice. */
  const prepareBlock = () => <>
    <p>{t("localInstall.description")}</p>
    {!preparing && install.offered && <Button type="button" variant="primary" id="wizard-prepare" onClick={prepare}>{t("wizard.prepare")}</Button>}
    <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess anotherMachine={false} className="wizard-install-entry" />
    {/* Installed, it waits for this computer to answer: never back to Prepare in between (the install's own state is
        cleared once its machine is chosen, before this device reaches it). */}
    {preparing && installSnapshot.phase !== "installing" && installSnapshot.phase !== "failed" && installSnapshot.phase !== "cancelled" && !onboarding.localReady && (
      hostFailed
        ? <div className="wizard-prepare-failed" role="alert"><p>{hostStatusText(hostStatus, t)}</p>
            <Button type="button" variant="primary" id="wizard-prepare-retry" onClick={prepare}>{t("wizard.prepareRetry")}</Button></div>
        : <p className="wizard-loading wizard-prepare-wait" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />
            {t(hostStatus.state === "running" ? "wizard.prepareAnswering" : "wizard.prepareStarting")}</p>)}
  </>;
  /** This computer's agents, to connect and disconnect. */
  const agentsBlock = <>
    <p>{t("wizard.agentsHere")}</p>
    {agentsFp ? <HostAgentsPanel fp={agentsFp} /> : null}
    {/* With no machine yet, the list cannot say it; with one, the list says there are none. */}
    {!agentsFp && <p className="muted">{t("wizard.noAgentsConnected")}</p>}
  </>;

  const ready = step === "W6";
  return <dialog ref={dialog} id="wizard" className="wizard-dialog" aria-labelledby="wizard-title" data-step={step} data-ready={ready || undefined}
    // Escape puts the setup off, except once it is done: Ready only goes on.
    onCancel={(event) => { event.preventDefault(); if (!ready) void onboarding.defer(); }}
    // On Ready, Escape is stopped at the key: a browser closes a modal anyway after a few cancelled Escapes. Closed
    // without the setup asking for it, it is opened again.
    onKeyDown={(event) => { if (ready && event.key === "Escape") event.preventDefault(); }}
    onClose={() => { const element = dialog.current; if (onboarding.open && element && !element.open) element.showModal?.(); }}>
    <header className="wizard-head">
      <span className="wizard-brand"><SidevoiceMark size={18} />{t("wizard.eyebrow")}</span>
      {step !== "W6" && <Button type="button" variant="ghost" tone="neutral" size="sm" className="wizard-later" onClick={() => void onboarding.defer()}>{t("wizard.later")}</Button>}
    </header>
    <Stepper current={current} t={t} />
    {!ready && <h2 id="wizard-title" className="wizard-title" ref={title} tabIndex={-1}>{t(TITLES[step])}</h2>}
    {/* Scrolled, it says so at its top edge (a line under the title, the text fading under it), so what goes under the
        title reads as scrolled, not cut. Set on the element itself: scrolling re-renders nothing. */}
    <div className="wizard-body" key={step} data-travel={travel.current.direction ?? undefined}
      onScroll={(event) => event.currentTarget.toggleAttribute("data-scrolled", event.currentTarget.scrollTop > 0)}>
      {error && !ready && <Alert tone="danger" live title={error} />}
      {step === "W1" && <section>
        <p>{t("wizard.where.body")}</p>
        <div className="wizard-choices" role="radiogroup" aria-label={t("wizard.title.where")}>
          {onboarding.canHostAgents && <ChoiceCard selected={choice === "agents"} onSelect={() => choose("agents")}>
            <ThisComputerIcon size={20} /><strong>{t("wizard.choice.local")}</strong><span className="wizard-choice-note">{t("wizard.choice.localNote")}</span>
          </ChoiceCard>}
          <ChoiceCard selected={choice === "remote"} onSelect={() => choose("remote")}>
            <OtherMachineIcon size={20} /><strong>{t("wizard.choice.remote")}</strong><span className="wizard-choice-note">{t("wizard.choice.remoteNote")}</span>
          </ChoiceCard>
        </div>
      </section>}
      {step === "W0" && <BasicsStep t={t} />}
      {step === "W2" && <section className="wizard-prepare">{prepareBlock()}</section>}
      {step === "W2r" && <section>
        <PairMachine idPrefix="wizard-pairing" rows={2} submitIn={onboarding.remoteReady ? null : footerSlot} />
      </section>}
      {step === "W3" && <section>{agentsBlock}</section>}
      {stageTask && <StageStep key={step} task={stageTask} stage={stage} t={t} />}
      {step === "W5" && <TurnStep turnTry={turnTry} tried={turnTried} t={t} />}
      {ready && <ReadyStep path={onboarding.path} machineName={remoteName} title={title} t={t} />}
      {ready && error && <Alert tone="danger" live className="wizard-ready-error" title={error} />}
    </div>
    <footer className="wizard-actions" data-model-step={stageTask || step === "W5" ? "" : undefined}>
      {back && <Button type="button" variant="ghost" tone="neutral" className="wizard-back" onClick={() => onboarding.goTo(back)}><BackIcon /><span className="wizard-back-label">{t("wizard.back")}</span></Button>}
      {step === "W0" && <Button type="button" variant="primary" onClick={() => void finishBasics()}>{t("wizard.continue")}</Button>}
      {step === "W1" && <Button type="button" variant="primary" disabled={!choice} onClick={() => choice && void choosePath(choice)}>{t("wizard.continue")}</Button>}
      {step === "W2" && onboarding.localReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W3")}>{t("wizard.continue")}</Button>}
      {step === "W2r" && onboarding.remoteReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W4")}>{t("wizard.continue")}</Button>}
      <span ref={setFooterSlot} className="wizard-slot" />
      {step === "W3" && <Button type="button" variant="primary" onClick={() => void finishAgents()}>{t("wizard.continue")}</Button>}
      {stageTask && <ModelStepFooter reason={waitReason(model, stageTask, t)}
        tryReason={stageTask === "tts" && !sample.trim() ? t("wizard.wait.sentence") : undefined}
        running={trial.trial.phase === "running"} tried={onboarding.tried(stageTask)}
        onTry={tryAgain} onStop={trial.finish} onContinue={() => void finishStage(stageTask)} t={t} />}
      {step === "W5" && <ModelStepFooter reason={turnWaits ? waitReason(turnModel, "turn", t) : ""} tryReason={sttModel.ready ? undefined : t("settings.save.waitTranscription")}
        running={turnTry.running} tried={turnTried} onTry={turnTry.start} onStop={turnTry.stop} onContinue={() => void finishTurn()} t={t} />}
      {ready && <Button type="button" variant="primary" size="lg" className="wizard-enter" loading={completing} onClick={() => void complete()}>
        {error ? t("wizard.retryCompletion") : t("wizard.enter")}<ArrowRightIcon />
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
