import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { SidevoiceMark } from "../../components/ui/Icons";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { StageEditor } from "../settings/StageEditor";
import { HostIntegrationsPanel } from "../hosts/HostIntegrationsPanel";
import { hostTranslator } from "../settings/host-i18n";
import { useOnboarding } from "./onboarding-context";
import { useRoomStore } from "../../state/room-store";
import type { OnboardingStep } from "../../services/onboarding-state";

const groups: { key: string; steps: OnboardingStep[] }[] = [
  { key: "wizard.group.where", steps: ["W1", "W2"] },
  { key: "wizard.group.agents", steps: ["W3", "W2r"] },
  { key: "wizard.group.transcription", steps: ["W4"] },
  { key: "wizard.group.voice", steps: ["W4v"] },
  { key: "wizard.group.ready", steps: ["W6"] },
];

function previous(step: OnboardingStep, path: "agents" | "remote" | null, canHostAgents: boolean): OnboardingStep | null {
  if (step === "W3") return canHostAgents ? "W1" : null;
  if (step === "W4") return path === "agents" ? "W3" : canHostAgents ? "W2r" : null;
  if (step === "W4v") return "W4";
  if (step === "W6") return "W4v";
  if (step === "W2" || step === "W2r") return canHostAgents ? "W1" : null;
  return null;
}

function messageKey(key: string) {
  const suffix = key.replace("onboarding.", "");
  return `wizard.error.${suffix}` as Parameters<ReturnType<typeof hostTranslator>>[0];
}

export function Wizard() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  const facts = useRoomStore((state) => state.facts);
  const machines = useRoomStore((state) => state.machines);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const touchedChoice = useRef(false);
  const [choice, setChoice] = useState<"agents" | "remote" | null>(onboarding.record.choice);
  const [copyStatus, setCopyStatus] = useState("");
  const [integrationProvider, setIntegrationProvider] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
  const localReady = !!localMachine && facts.localHostStatus.state === "running";
  const remoteReady = machines.some((machine) => !machine.local && machine.selectable && !!machine.pairingId);
  const fp = facts.pairingInUse;

  useEffect(() => {
    if (onboarding.record.choice) setChoice(onboarding.record.choice);
  }, [onboarding.record.choice]);

  useEffect(() => {
    if (touchedChoice.current || onboarding.record.choice || !onboarding.canHostAgents) return;
    setChoice(onboarding.localAgents.length ? "agents" : "remote");
  }, [onboarding.canHostAgents, onboarding.localAgents.length, onboarding.record.choice]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (onboarding.open && !element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    } else if (!onboarding.open && element.open) {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    }
  }, [onboarding.open]);

  useEffect(() => { if (onboarding.open) title.current?.focus(); }, [onboarding.open, onboarding.step]);

  useEffect(() => {
    if (onboarding.step !== "W4" && onboarding.step !== "W4v") setIntegrationProvider(null);
  }, [onboarding.step]);

  useEffect(() => {
    if (!onboarding.open) return;
    if (onboarding.step === "W2" && localReady) onboarding.goTo("W3");
    if (onboarding.step === "W2r" && remoteReady) onboarding.goTo("W4");
  }, [onboarding.open, onboarding.step, localReady, remoteReady]);

  useEffect(() => {
    if (!onboarding.open || onboarding.step !== "W3" || !localMachine?.pairingId || facts.pairingInUse === localMachine.pairingId) return;
    window.sidevoiceActions?.chooseMachine(localMachine.pairingId);
  }, [onboarding.open, onboarding.step, localMachine?.pairingId, facts.pairingInUse]);

  async function choosePath(next: "agents" | "remote") {
    touchedChoice.current = true;
    setChoice(next);
    if (!await onboarding.setPath(next)) return;
    if (next === "agents") onboarding.goTo(localReady ? "W3" : "W2");
    else onboarding.goTo(remoteReady ? "W4" : "W2r");
  }

  async function finishAgents() {
    if (!await onboarding.markAgentsDone()) return;
    onboarding.goTo("W4");
  }

  async function complete() {
    setCompleting(true);
    await onboarding.complete();
    setCompleting(false);
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(t("noMachine.setupCommand"));
      setCopyStatus(t("noMachine.commandCopied"));
    } catch { setCopyStatus(t("noMachine.commandCopyFailed")); }
  }

  const path = onboarding.path ?? choice;
  const stageTask = onboarding.step === "W4" ? "stt" : onboarding.step === "W4v" ? "tts" : null;
  const stageValid = stageTask ? onboarding.trialled(stageTask) : false;
  const currentGroup = groups.findIndex((group) => group.steps.includes(onboarding.step));
  const back = previous(onboarding.step, path, onboarding.canHostAgents);
  const error = onboarding.error ? t(messageKey(onboarding.error)) : "";
  const label = (step: OnboardingStep) => t(`wizard.title.${({ W1: "where", W2: "install", W2r: "pair", W3: "agents", W4: "stt", W4v: "tts", W6: "ready" } as const)[step]}` as Parameters<ReturnType<typeof hostTranslator>>[0]);

  return <>
    <dialog ref={dialog} id="wizard" className="wizard-dialog" aria-labelledby="wizard-title"
      onCancel={(event) => { event.preventDefault(); void onboarding.defer(); }}>
      <div className="wizard-head">
        <span className="wizard-brand"><SidevoiceMark size={18} /> {t("wizard.eyebrow")}</span>
        {onboarding.step !== "W6" && <Button type="button" variant="ghost" size="compact" className="wizard-later" onClick={() => void onboarding.defer()}>{t("wizard.later")}</Button>}
      </div>
      <ol className="wizard-steps" aria-label={t("wizard.progress")}>
        {groups.map((group, index) => <li key={group.key} data-state={index < currentGroup ? "done" : index === currentGroup ? "current" : "next"}
          aria-current={index === currentGroup ? "step" : undefined}>{t(group.key as Parameters<ReturnType<typeof hostTranslator>>[0])}</li>)}
      </ol>
      <h2 id="wizard-title" ref={title} tabIndex={-1}>{label(onboarding.step)}</h2>
      <div className="wizard-body">
        {error && onboarding.step !== "W6" && <p className="stage-try-error" role="alert">{error}</p>}
        {onboarding.step === "W1" && <section className="wizard-choice-step">
          <p>{t("wizard.where.body")}</p>
          <div className="wizard-choices" role="radiogroup" aria-label={t("wizard.title.where")}>
            {onboarding.canHostAgents && <button type="button" role="radio" aria-checked={choice === "agents"} className="wizard-choice"
              onClick={() => { touchedChoice.current = true; setChoice("agents"); }}>
              <span className="wizard-choice-mark" aria-hidden="true" />{t("wizard.choice.local")}
            </button>}
            <button type="button" role="radio" aria-checked={choice === "remote"} className="wizard-choice"
              onClick={() => { touchedChoice.current = true; setChoice("remote"); }}>
              <span className="wizard-choice-mark" aria-hidden="true" />{t("wizard.choice.remote")}
            </button>
          </div>
          {onboarding.canHostAgents && <div className="wizard-detected" aria-live="polite">
            <p className="ui-field-label">{t("wizard.detected")}</p>
            {onboarding.localAgentsLoading ? <p className="muted">{t("wizard.detecting")}</p>
              : onboarding.localAgents.length ? <ul>{onboarding.localAgents.map((agent) => <li key={agent.id}>{agent.label}{agent.version ? ` ${agent.version}` : ""}</li>)}</ul>
                : <p className="muted">{onboarding.localAgentsError ? t("agents.unreachable") : t("wizard.noAgents")}</p>}
            <Button type="button" variant="ghost" size="compact" onClick={() => void onboarding.rescanLocalAgents()}>{t("agents.refresh")}</Button>
          </div>}
        </section>}

        {onboarding.step === "W2" && <section className="wizard-install-step">
          <p>{t("localInstall.description")}</p>
          <LocalHostInstallEntry showCta source="no-machine" followActive holdSuccess className="wizard-install-entry" />
          <Button type="button" variant="ghost" size="compact" onClick={() => void choosePath("remote")}>{t("wizard.installRemote")}</Button>
        </section>}

        {onboarding.step === "W2r" && <section className="wizard-pair-step">
          <p>{t("wizard.pairIntro")}</p>
          <div className="setup-command"><code>{t("noMachine.setupCommand")}</code>
            <Button type="button" variant="ghost" size="compact" onClick={() => void copyCommand()}>{t("noMachine.copyCommand")}</Button>
          </div>
          {copyStatus && <p className="muted" role="status">{copyStatus}</p>}
          <p className="muted">{t("wizard.remoteRouteNote")}</p>
          <Button type="button" variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}>{t("wizard.pairCode")}</Button>
        </section>}

        {onboarding.step === "W3" && <section className="wizard-agents-step">
          {fp ? <HostAgentsPanel fp={fp} /> : <p className="muted" role="status">{t("wizard.noAgentsConnected")}</p>}
          {fp && facts.hostAgents[fp]?.status === "ready" && facts.hostAgents[fp]?.value?.agents.length === 0 &&
            <p className="muted">{t("wizard.noAgentsConnected")}</p>}
        </section>}

        {onboarding.step === "W4" && <StageEditor key={`setup-stt-${fp ?? "none"}`} task="stt" setup
          onConfigureProvider={setIntegrationProvider} />}
        {onboarding.step === "W4v" && <StageEditor key={`setup-tts-${fp ?? "none"}`} task="tts" setup
          onConfigureProvider={setIntegrationProvider} />}
        {integrationProvider && fp && stageTask && <section className="wizard-provider-keys">
          <div className="wizard-provider-keys-heading">
            <h3>{t("settings.integrations")}</h3>
            <Button type="button" variant="ghost" size="compact" onClick={() => setIntegrationProvider(null)}>{t("wizard.hideProviderKeys")}</Button>
          </div>
          <HostIntegrationsPanel key={`wizard-integrations-${fp}`} fp={fp} focusProvider={integrationProvider} />
        </section>}

        {onboarding.step === "W6" && <section className="wizard-ready-step">
          <p>{t("wizard.readyBody")}</p>
          {error && <p className="stage-try-error" role="alert">{error}</p>}
        </section>}
      </div>
      <div className="wizard-actions">
        {back && <Button type="button" variant="default" className="wizard-back" onClick={() => onboarding.goTo(back)}>{t("wizard.back")}</Button>}
        {onboarding.step === "W1" && <Button type="button" variant="primary" disabled={!choice} onClick={() => choice && void choosePath(choice)}>{t("wizard.continue")}</Button>}
        {onboarding.step === "W2" && localReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W3")}>{t("wizard.continue")}</Button>}
        {onboarding.step === "W2r" && remoteReady && <Button type="button" variant="primary" onClick={() => onboarding.goTo("W4")}>{t("wizard.continue")}</Button>}
        {onboarding.step === "W3" && <>
          <Button type="button" variant="ghost" onClick={() => void finishAgents()}>{t("wizard.agentsSkip")}</Button>
          <Button type="button" variant="primary" onClick={() => void finishAgents()}>{t("wizard.agentsDone")}</Button>
        </>}
        {stageTask && <Button type="button" variant="primary" disabled={!stageValid} onClick={() => onboarding.goTo(stageTask === "stt" ? "W4v" : "W6")}>{t("wizard.continue")}</Button>}
        {onboarding.step === "W6" && <Button type="button" variant="primary" disabled={completing} onClick={() => void complete()}>
          {completing ? t("localInstall.preparing") : error ? t("wizard.retryCompletion") : t("wizard.enter")}
        </Button>}
      </div>
    </dialog>
  </>;
}

export function SetupPending() {
  const t = hostTranslator();
  const onboarding = useOnboarding();
  return <section className="setup-pending" aria-labelledby="setup-pending-title">
    <h1 id="setup-pending-title">{t("wizard.pendingTitle")}</h1>
    <p>{t("wizard.pendingBody")}</p>
    <Button type="button" variant="primary" onClick={() => onboarding.openWizard()}>{t("wizard.continueSetup")}</Button>
  </section>;
}
