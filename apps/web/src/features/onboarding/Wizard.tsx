/* The first-run wizard (ONBOARDING_AND_HOSTS.md §5.1, F1, F2): one dialog, two paths.
 *
 *   agents: W1 → W2 «Preparando este ordenador» → W3 agents → W4 voice → W5 test → W6
 *   remote: W1 → W2′ «Conecta con tu máquina» → W4 → W5 → W6
 *
 * Closing is «Lo haré luego»: the no-machine screen then offers «Continuar la configuración», which resumes at the
 * first step whose outcome is not durable (state/hosts/onboarding.ts). Every outcome is written where it lives —
 * the local host by the app, pairings and stages by the page — so a step is never a wizard-only state. */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { HarnessIcon, SidevoiceMark } from "../../components/ui/Icons";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { currentLanguage, useT, type Translate } from "../../i18n";
import type { BridgeError, DetectedAgent, InstallProgress } from "../../services/desktop-host";
import { refusalText } from "../../../../../packages/browser-audio/refusals.js";
import { stageContext } from "../../state/room-session-state.js";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useHosts, useHostsController, type VerifyOutcome } from "../../state/hosts/hosts-store";
import { previousStep, stepGroups, type Step } from "../../state/hosts/onboarding";
import { proposeStages, type ProposalRow } from "../../state/hosts/proposal";
import { effectiveStage, type Task } from "../../state/hosts/stage-scope";
import { StageSettings } from "../settings/StageSettings";
import { bytesText, CopyButton, useModal } from "../hosts/common";
import { PairWithCode } from "../hosts/PairWithCode";
import { IntegrationScopeContext } from "../hosts/HostPage";
import { IntegrationList } from "../settings/IntegrationList";
import { AgentRow, otherAgent } from "../hosts/AgentRow";

const TITLES: Record<Step, string> = { W1: "wizard.w1.title", W2: "wizard.w2.title", W2r: "wizard.w2r.title", W3: "wizard.w3.title", W4: "wizard.w4.title.stt", W4v: "wizard.w4.title.tts", W5: "wizard.w5.title", W6: "wizard.w6.title" };

function Indicator({ step }: { step: Step }) {
  const t = useT();
  const path = useHosts((s) => s.wizard.path);
  const groups = stepGroups(path);
  const at = groups.findIndex((group) => group.steps.includes(step));
  return (
    <ol className="wizard-steps" aria-label={t("wizard.progress")}>
      {groups.map((group, index) => (
        <li key={group.key} data-state={index < at ? "done" : index === at ? "current" : "next"} aria-current={index === at ? "step" : undefined}>{t(group.key)}</li>
      ))}
    </ol>
  );
}

export function Wizard() {
  const t = useT();
  const hosts = useHostsController();
  const wizard = useHosts((s) => s.wizard);
  const ref = useModal(wizard.open, () => void hosts.deferWizard());
  const title = useRef<HTMLHeadingElement>(null);
  // Each step starts at its question, for a screen reader and for the keyboard, not at «Lo haré luego».
  useEffect(() => { if (wizard.open) title.current?.focus(); }, [wizard.open, wizard.step]);
  return (
    <dialog ref={ref} id="wizard" className="wizard-dialog" aria-labelledby="wizard-title">
      <div className="wizard-head">
        <span className="wizard-brand"><SidevoiceMark size={18} /> {t("wizard.eyebrow")}</span>
        <Button variant="ghost" size="compact" className="wizard-later" onClick={() => void hosts.deferWizard()}>{t("wizard.later")}</Button>
      </div>
      <Indicator step={wizard.step} />
      <h2 id="wizard-title" ref={title} tabIndex={-1}>{t(TITLES[wizard.step])}</h2>
      <div className="wizard-body">
        {wizard.open && <StepBody step={wizard.step} />}
      </div>
    </dialog>
  );
}

/** A step's action row: «Atrás» at its start (except on W1 and W6), the step's own actions at its end. */
function Actions({ children }: { children?: React.ReactNode }) {
  const t = useT();
  const hosts = useHostsController();
  const wizard = useHosts((s) => s.wizard);
  const back = wizard.step === "W6" ? null : previousStep(wizard.step, wizard.path);
  return (
    <div className="wizard-actions">
      {back && <Button variant="ghost" className="wizard-back" onClick={() => hosts.goTo(back, back === "W1" ? null : undefined)}>{t("wizard.back")}</Button>}
      {children}
    </div>
  );
}

function StepBody({ step }: { step: Step }) {
  switch (step) {
    case "W1": return <W1 />;
    case "W2": return <W2 />;
    case "W2r": return <W2r />;
    case "W3": return <W3 />;
    case "W4": return <StageStep key="stt" task="stt" />;
    case "W4v": return <StageStep key="tts" task="tts" />;
    case "W5": return <W5 />;
    case "W6": return <W6 />;
  }
}

// ----- W1 -----
function W1() {
  const t = useT();
  const hosts = useHostsController();
  const localState = useHosts((s) => s.local?.state ?? null);
  const [found, setFound] = useState<DetectedAgent[] | null>(null);
  const chosen = useHosts((s) => s.onboarding?.choice ?? null);
  const [choice, setChoice] = useState<"agents" | "remote" | null>(chosen);
  useEffect(() => {
    let live = true;
    void hosts.localAgents().then((agents) => {
      if (!live) return;
      const present = (agents ?? []).filter((agent) => agent.present);
      setFound(present);
      setChoice((current) => current ?? (present.length ? "agents" : "remote"));
    });
    return () => { live = false; };
  }, [hosts]);
  async function next() {
    if (!choice) return;
    await hosts.choosePath(choice);
    hosts.goTo(choice === "remote" ? "W2r" : localState === "running" ? "W3" : "W2", choice);
  }
  return (
    <>
      <p className="muted">{t("wizard.w1.lead")}</p>
      <fieldset className="choice-cards">
        <legend className="sr-only">{t("wizard.w1.title")}</legend>
        {(["agents", "remote"] as const).map((value) => (
          <label key={value} className="choice-card" data-checked={choice === value || undefined}>
            <input type="radio" name="w1-choice" value={value} checked={choice === value} onChange={() => setChoice(value)} />
            <span className="choice-copy">
              <strong>{t(value === "agents" ? "wizard.w1.yes" : "wizard.w1.no")}</strong>
              <span className="muted">{t(value === "agents" ? "wizard.w1.yesDetail" : "wizard.w1.noDetail")}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <DetectedAgents found={found} />
      <Actions><Button variant="primary" disabled={!choice} onClick={() => void next()}>{t("wizard.continue")}</Button></Actions>
    </>
  );
}

/** What the connector's modules detected on this computer (§4.4 `detect`), as they report it: the only place W1
 *  names agents. Nothing is connected here; W3 asks. */
function DetectedAgents({ found }: { found: DetectedAgent[] | null }) {
  const t = useT();
  return (
    <section className="detected" aria-labelledby="detected-title" aria-busy={found === null}>
      {found === null ? <p className="muted small" role="status">{t("wizard.w1.searching")}</p>
        : found.length === 0 ? <p className="muted small" role="status">{t("wizard.w1.none")}</p> : <>
          <span id="detected-title" className="muted small">{t("wizard.w1.detected")}</span>
          <ul className="detected-list">
            {found.map((agent) => (
              <li key={agent.id} className="detected-agent" title={agent.version ?? undefined}>
                <HarnessIcon harness={agent.id} size={14} /> {agent.label}
              </li>
            ))}
          </ul>
        </>}
    </section>
  );
}

// ----- W2 -----
const INSTALL_STEPS: InstallProgress["step"][] = ["download", "verify", "service", "connect"];

function W2() {
  const t = useT();
  const hosts = useHostsController();
  const local = useHosts((s) => s.local);
  const paired = useHosts((s) => !!s.localPairing);
  const install = useHosts((s) => s.install);
  const outcome = install.status === "idle" ? "running" : install.status;
  const progress = install.progress;
  const error = install.error as (BridgeError & { kept?: boolean }) | null;
  // Arriving at W2 starts the install, unless one is already under way or over (the wizard was closed meanwhile).
  useEffect(() => { if (install.status === "idle") void hosts.localInstall(); }, [hosts, install.status]);
  useEffect(() => {
    if (outcome === "done" && local?.state === "running" && paired) {
      const timer = setTimeout(() => hosts.goTo("W3"), 700);
      return () => clearTimeout(timer);
    }
  }, [outcome, local?.state, paired, hosts]);
  const at = progress ? INSTALL_STEPS.indexOf(progress.step) : 0;
  const lang = currentLanguage();
  const details = () => [t("wizard.w2.title"), error ? `${error.key}${error.detail ? " · " + error.detail : ""}` : "", error?.message ?? ""].filter(Boolean).join("\n");
  return (
    <>
      <p className="muted">{t("wizard.w2.lead")}</p>
      <ol className="install-steps">
        {INSTALL_STEPS.map((step, index) => {
          const state = outcome === "done" || index < at ? "done" : index === at ? (outcome === "failed" ? "failed" : outcome === "cancelled" ? "cancelled" : "running") : "next";
          return (
            <li key={step} data-state={state}>
              <span className="install-mark" aria-hidden="true" />
              <span>{t("wizard.w2.step." + step)}{step === "download" && <span className="muted"> · {t("wizard.w2.size")}</span>}</span>
              {step === "download" && index === at && progress && progress.total > 0 && outcome === "running" && (
                <span className="install-progress">
                  <progress max={progress.total} value={progress.done} aria-label={t("wizard.w2.step.download")} />
                  <span className="muted">{bytesText(progress.done, lang)} / {bytesText(progress.total, lang)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {outcome === "done" && <p role="status" className="ok-line">{local?.state === "running" ? t("wizard.w2.ready") : t("wizard.w2.starting")}</p>}
      {outcome === "cancelled" && <p role="status" className="muted">{t("wizard.w2.cancelled")}</p>}
      {outcome === "failed" && error && (
        <div className="problem" role="alert">
          <p><strong>{t("failure." + error.key, { detail: error.detail ?? "" })}</strong></p>
          {t("remedy." + error.key) !== "remedy." + error.key && <p className="muted">{t("remedy." + error.key)}</p>}
          {error.kept && <p className="muted">{t("wizard.w2.kept")}</p>}
        </div>
      )}
      <Actions>
        {outcome === "running" && <Button onClick={() => void hosts.localCancelInstall()}>{t("common.cancel")}</Button>}
        {(outcome === "failed" || outcome === "cancelled") && <>
          <Button variant="ghost" onClick={async () => { await hosts.choosePath("remote"); hosts.goTo("W2r", "remote"); }}>{t("wizard.w2.withoutAgents")}</Button>
          {outcome === "failed" && <CopyButton text={details} label={t("common.copyDetails")} size="default" />}
          <Button variant="primary" onClick={() => void hosts.localInstall()}>{t("common.retry")}</Button>
        </>}
      </Actions>
    </>
  );
}

// ----- W2′ -----
function W2r() {
  const t = useT();
  const hosts = useHostsController();
  return (
    <>
      <p className="muted">{t("wizard.w2r.lead")}</p>
      <PairWithCode onPaired={(fp) => { void hosts.loadIntegrations(fp); hosts.goTo("W4"); }} renderActions={(submit) => <Actions>{submit}</Actions>} />
    </>
  );
}

// ----- W3 -----
export function agentStatusKey(agent: DetectedAgent): string {
  if (agent.registration === "connected") return "agents.connected";
  if (agent.registration === "foreign") return "agents.foreign";
  if (agent.connect === "manual") return "agents.manual";
  return "agents.willConnect";
}

function W3() {
  const t = useT();
  const hosts = useHostsController();
  const fp = useHosts((s) => s.localPairing?.fp ?? null);
  const listing = useHosts((s) => (fp ? s.agents[fp] : undefined));
  useEffect(() => { if (fp) void hosts.loadAgents(fp, true); }, [fp, hosts]);
  const agents = useMemo(() => (listing?.value?.agents ?? []).filter((a) => a.present), [listing]);
  async function next() { await hosts.markOnboarding({ agents_done: true }); hosts.goTo("W4"); }
  if (!fp || !listing || listing.status === "loading" && !listing.value) return <p className="muted" role="status">{t("agents.scanning")}</p>;
  if (listing.status === "failed" && !listing.value)
    return (
      <div className="problem" role="alert">
        <p>{t(listing.error === "no-connector" ? "agents.noConnector" : "agents.scanFailed")}</p>
        <Actions><Button variant="ghost" onClick={() => void next()}>{t("agents.notNow")}</Button><Button variant="primary" onClick={() => void hosts.loadAgents(fp, true)}>{t("common.retry")}</Button></Actions>
      </div>
    );
  const anyConnected = agents.some((a) => a.registration === "connected");
  const other = otherAgent(listing.value?.custom, t("agents.other"));
  return (
    <>
      <p className="muted">{t(agents.length ? "wizard.w3.lead" : "wizard.w3.none")}</p>
      <ul className="agent-rows">
        {agents.map((agent) => <AgentRow key={agent.id} fp={fp} agent={agent} mode="wizard" />)}
        {other && <AgentRow key={other.id} fp={fp} agent={other} mode="wizard" />}
      </ul>
      <Actions><Button variant="primary" onClick={() => void next()}>{anyConnected || agents.length === 0 ? t("wizard.continue") : t("agents.notNow")}</Button></Actions>
    </>
  );
}

export function ManualConfig({ agent }: { agent: DetectedAgent }) {
  const t = useT();
  if (!agent.manual) return null;
  return (
    <div className="manual-config">
      <p className="muted">{t("agents.manualHint", { file: agent.manual.file })}</p>
      <pre><code>{agent.manual.snippet}</code></pre>
      <CopyButton text={agent.manual.snippet} label={t("agents.copyConfig")} />
    </div>
  );
}

// ----- W4 / W4v -----
function useStageContext() {
  const store = useContext(RoomStoreContext);
  useRoomStore((s) => s.stages);
  return store ? stageContext(store.facts) : null;
}

/** Transcription (W4) and voice (W4v): the stage's own settings pane, the same one Configuración shows, starting from
 *  what suits this device best (model-first D14). A device model is downloaded, loaded and checked before it counts. */
function StageStep({ task }: { task: Task }) {
  const t = useT();
  const hosts = useHostsController();
  const scope = useContext(IntegrationScopeContext);
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const chosen = useHosts((s) => !!effectiveStage(s.scope, s.inUse, task));
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const ctx = useStageContext();
  const [advancing, setAdvancing] = useState(false);
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const check = view?.check ?? null;
  const ready = !!ctx?.offers && integrations?.status !== "loading";
  useEffect(() => { if (inUse && (!integrations || integrations.status === "idle")) void hosts.loadIntegrations(inUse); }, [inUse, integrations, hosts]);
  const next = task === "stt" ? "W4v" : "W5";
  // «Descargar y continuar»: once the shown model is checked and saved, the wizard moves on by itself.
  useEffect(() => { if (advancing && chosen && check?.phase !== "running") hosts.goTo(next); }, [advancing, chosen, check?.phase, hosts, next]);
  useEffect(() => { if (check?.phase === "failed" || check === null) setAdvancing(false); }, [check]);
  // A key typed here, accepted by its provider, makes its place choosable: the panel goes.
  const keyed = useHosts((s) => !!keyFor && !!s.inUse && !!s.integrations[s.inUse]?.value?.providers.find((p) => p.id === keyFor)?.configured);
  useEffect(() => { if (keyed) setKeyFor(null); }, [keyed]);
  if (!ready || !view) return <p className="muted" role="status">{t("wizard.w4.measuring")}</p>;
  const offer = (ctx?.offers as { model: string; engine: string; download_size: number }[] | null)?.find((o) => o.model === view.model);
  const installed = !!offer && (ctx?.installed as { model: string; engine: string }[]).some((b) => b.model === offer.model && b.engine === offer.engine);
  const needsDownload = view.place === "device" && !!offer && !installed;
  const busy = !!check && ["running", "slow"].includes(check.phase);
  function proceed() {
    setAdvancing(true);
    if (chosen) { hosts.goTo(next); return; }
    const actions = window.sidevoiceActions;
    if (check?.phase === "consent") { actions?.decideStage(task, true); return; }
    actions?.chooseStageModel(task, view!.model);
    actions?.decideStage(task, true);
  }
  return (
    <>
      <p className="muted">{t(task === "stt" ? "wizard.w4.lead.stt" : "wizard.w4.lead.tts")}</p>
      {view.unconfigured && !keyFor && <p className="problem">{t("wizard.w4.noOffer")}</p>}
      <div className="wizard-stage">
        {/* A provider with no key asks for it here, not in Configuración. */}
        <StageSettings task={task} onMissingPlace={setKeyFor} />
      </div>
      {keyFor && inUse && scope && (
        <div className="inline-key">
          <p className="howto-label">{t("wizard.w4.keyFor", { provider: view.places.find((p) => p.id === keyFor)?.label ?? keyFor })}</p>
          <RoomStoreContext.Provider value={scope.storeFor(inUse)}><IntegrationList only={[keyFor]} /></RoomStoreContext.Provider>
          <Button variant="ghost" size="compact" onClick={() => setKeyFor(null)}>{t("common.cancel")}</Button>
        </div>
      )}
      <Actions>
        <Button variant="primary" disabled={busy || advancing && !chosen || !view.model}
          onClick={proceed}>
          {chosen && !check ? t("wizard.continue") : needsDownload ? t("wizard.w4.downloadContinue", { size: bytesText(offer!.download_size, currentLanguage()) }) : t("wizard.w4.useContinue")}
        </Button>
      </Actions>
    </>
  );
}

// ----- W5 -----
type Echo = { state: "idle" | "listening" | "heard" | "replied" | "failed" | "silent"; heard?: string; reply?: string; error?: { key: string; stage?: Task } };

function W5() {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const inputs = useRoomStore((s) => s.audioDevices.inputs);
  const [echo, setEcho] = useState<Echo>({ state: "idle" });
  const [level, setLevel] = useState(0);
  const [picking, setPicking] = useState(false);
  const [microphone, setMicrophone] = useState(() => inputs[0]?.id ?? "default");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function start() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setEcho({ state: "listening" });
    void hosts.echoTest(inUse, {
      level: (value) => { if (!controller.signal.aborted) setLevel(value); },
      heard: (text) => { if (!controller.signal.aborted) setEcho({ state: "heard", heard: text }); },
      replied: (text) => { if (!controller.signal.aborted) setEcho((e) => ({ ...e, state: "replied", reply: text })); },
      failed: (key, stage) => { if (!controller.signal.aborted) setEcho((e) => ({ ...e, state: "failed", error: { key, stage } })); },
      silent: () => { if (!controller.signal.aborted) setEcho({ state: "silent" }); },
    }, controller.signal).finally(() => setLevel(0));
  }
  async function works() { abort.current?.abort(); await hosts.markOnboarding({ test_passed: true }); hosts.goTo("W6"); }
  async function skip() { abort.current?.abort(); hosts.goTo("W6"); }
  return (
    <>
      <p className="muted">{t("wizard.w5.lead")}</p>
      <div className="echo-panel" data-state={echo.state}>
        <div className="level-meter" role="meter" aria-label={t("wizard.w5.level")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <span style={{ width: Math.round(level * 100) + "%" }} />
        </div>
        {echo.state === "idle" && <p className="echo-prompt">{t("wizard.w5.prompt")}</p>}
        {echo.state === "listening" && <p className="echo-prompt" role="status">{t("wizard.w5.listening")}</p>}
        {echo.heard && <p className="echo-line"><span className="muted">{t("wizard.w5.youSaid")}</span> «{echo.heard}»</p>}
        {echo.reply && <p className="echo-line"><span className="muted">{t("wizard.w5.reply")}</span> «{echo.reply}»</p>}
        {echo.state === "silent" && <p className="row-error" role="alert">{t("wizard.w5.silent")}</p>}
        {echo.state === "failed" && echo.error && (
          <div className="problem" role="alert">
            <p>{t("echo." + echo.error.key)}</p>
            {t("echo." + echo.error.key + ".remedy") !== "echo." + echo.error.key + ".remedy" && <p className="muted">{t("echo." + echo.error.key + ".remedy")}</p>}
            {echo.error.stage && <Button size="compact" variant="ghost" onClick={() => hosts.goTo(echo.error?.stage === "stt" ? "W4" : "W4v")}>{t(echo.error.stage === "stt" ? "wizard.w5.changeStt" : "wizard.w5.changeTts")}</Button>}
          </div>
        )}
      </div>
      {picking && (
        <label className="ui-field">{t("wizard.w5.microphone")}
          <NativeSelect value={microphone} onChange={(event) => { setMicrophone(event.currentTarget.value); void window.sidevoiceActions?.selectAudioDevice("input", event.currentTarget.value); setPicking(false); start(); }}>
            {inputs.map((input) => <option key={input.id} value={input.id}>{input.label}</option>)}
          </NativeSelect>
        </label>
      )}
      <Actions>
        {echo.state !== "replied" && <Button variant="ghost" onClick={() => void skip()}>{t("wizard.w5.skip")}</Button>}
        {echo.state === "idle" ? <Button variant="primary" onClick={start}>{t("wizard.w5.start")}</Button> : <>
          <Button variant="ghost" onClick={() => setPicking(true)}>{t("wizard.w5.notHearing")}</Button>
          <Button onClick={start}>{t("wizard.w5.repeat")}</Button>
          <Button variant="primary" disabled={echo.state !== "replied"} onClick={() => void works()}>{t("wizard.w5.works")}</Button>
        </>}
      </Actions>
    </>
  );
}

// ----- W6 -----
function W6() {
  const t = useT();
  const hosts = useHostsController();
  return (
    <>
      <p className="done-lead">{t("wizard.w6.lead")}</p>
      <p className="ask-agent">«{t("wizard.w6.ask")}»</p>
      <Actions><Button variant="primary" onClick={() => void hosts.finishWizard()}>{t("wizard.w6.go")}</Button></Actions>
    </>
  );
}
