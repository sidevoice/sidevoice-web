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

const TITLES: Record<Step, string> = { W1: "wizard.w1.title", W2: "wizard.w2.title", W2r: "wizard.w2r.title", W3: "wizard.w3.title", W4: "wizard.w4.title", W5: "wizard.w5.title", W6: "wizard.w6.title" };

function Indicator({ step }: { step: Step }) {
  const t = useT();
  const path = useHosts((s) => s.wizard.path);
  const groups = stepGroups(path ?? (step === "W2r" ? "remote" : "agents"));
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
    case "W4": return <W4 />;
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
      <DetectedAgents found={found} />
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
      <h3 id="detected-title">{t("wizard.w1.detected")}</h3>
      {found === null ? <p className="muted small" role="status">{t("wizard.w1.searching")}</p>
        : found.length === 0 ? <p className="muted small" role="status">{t("wizard.w1.none")}</p> : (
          <ul className="detected-list">
            {found.map((agent) => (
              <li key={agent.id} className="detected-agent" data-registration={agent.registration}>
                <span className="agent-icon"><HarnessIcon harness={agent.id} size={18} /></span>
                <span className="detected-copy">
                  <strong>{agent.label}</strong>
                  {agent.version && <span className="muted small">{agent.version}</span>}
                </span>
                <SidevoiceLink registration={agent.registration} />
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Whether Sidevoice is connected to an agent: the mark lit (lila and mustard) or off (one ink, the fourth bar at
 *  45 %, as the brand's one-ink rule draws it), always with its words — the mark alone does not say it. */
export function SidevoiceLink({ registration }: { registration: DetectedAgent["registration"] }) {
  const t = useT();
  const on = registration === "connected";
  return (
    <span className="sv-link" data-on={on || undefined} data-registration={registration}>
      <SidevoiceMark size={14} className="sv-link-mark" />
      <span>{t("wizard.w1.registration." + registration)}</span>
    </span>
  );
}

// ----- W2 -----
const INSTALL_STEPS: InstallProgress["step"][] = ["download", "verify", "service", "connect"];

function W2() {
  const t = useT();
  const hosts = useHostsController();
  const local = useHosts((s) => s.local);
  const paired = useHosts((s) => !!s.localPairing);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [outcome, setOutcome] = useState<"running" | "cancelled" | "failed" | "done">("running");
  const [error, setError] = useState<BridgeError & { kept?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setOutcome("running"); setError(null); setProgress({ step: "download", done: 0, total: 0 });
    void hosts.localInstall((p) => { if (live) setProgress(p); }).then((result) => {
      if (!live) return;
      if (result.ok) setOutcome("done");
      else if (result.error.key === "cancelled") setOutcome("cancelled");
      else { setOutcome("failed"); setError(result.error); }
    });
    return () => { live = false; };
  }, [hosts, attempt]);
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
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>{t("common.retry")}</Button>
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
  const busy = useHosts((s) => s.agentBusy);
  const errors = useHosts((s) => s.agentErrors);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState(false);
  const [connectedAny, setConnectedAny] = useState(false);
  useEffect(() => { if (fp) void hosts.loadAgents(fp, true); }, [fp, hosts]);
  const agents = useMemo(() => (listing?.value?.agents ?? []).filter((a) => a.present), [listing]);
  useEffect(() => {
    setChecked((current) => Object.fromEntries(agents.map((a) => [a.id, current[a.id] ?? (a.registration === "not-connected" && a.connect === "auto")])));
  }, [agents]);
  const chosen = agents.filter((a) => checked[a.id] && a.registration === "not-connected");
  async function connect() {
    if (!fp) return;
    setConnecting(true);
    for (const agent of chosen) {
      const answer = await hosts.agentAction(fp, agent.id, "connect");
      if (answer?.agent.registration === "connected") setConnectedAny(true);
    }
    setConnecting(false);
  }
  async function next() { await hosts.markOnboarding({ agents_done: true }); hosts.goTo("W4"); }
  if (!listing || listing.status === "loading" && !listing.value) return <p className="muted" role="status">{t("agents.scanning")}</p>;
  if (listing.status === "failed" && !listing.value)
    return (
      <div className="problem" role="alert">
        <p>{t(listing.error === "no-connector" ? "agents.noConnector" : "agents.scanFailed")}</p>
        <Actions><Button variant="ghost" onClick={() => void next()}>{t("agents.notNow")}</Button><Button variant="primary" onClick={() => fp && void hosts.loadAgents(fp, true)}>{t("common.retry")}</Button></Actions>
      </div>
    );
  const remaining = agents.filter((a) => a.registration === "not-connected");
  return (
    <>
      {agents.length === 0 ? <p className="empty-note">{t("wizard.w3.none")}</p> : (
        <ul className="agent-rows">
          {agents.map((agent) => {
            const key = fp + ":" + agent.id;
            const disabled = agent.registration !== "not-connected" || agent.connect === "manual" || connecting;
            return (
              <li key={agent.id} className="agent-row" data-registration={agent.registration}>
                <label className="agent-pick">
                  <input type="checkbox" checked={agent.registration === "connected" || !!checked[agent.id]} disabled={disabled}
                    onChange={(event) => setChecked({ ...checked, [agent.id]: event.currentTarget.checked })} />
                  <span className="agent-icon"><HarnessIcon harness={agent.id} size={18} /></span>
                  <span className="agent-copy">
                    <strong>{agent.label}</strong>{agent.version && <span className="muted"> · {agent.version}</span>}
                    <span className="muted agent-status">{busy[key] ? t("agents.connecting") : t(agentStatusKey(agent))}</span>
                  </span>
                </label>
                {agent.connect === "manual" && agent.registration === "not-connected" && <ManualConfig agent={agent} />}
                {errors[key] && (
                  <p className="row-error" role="alert">{t("agents.connectFailed", { message: errors[key].message || errors[key].key })}
                    <Button variant="ghost" size="compact" onClick={() => fp && void hosts.agentAction(fp, agent.id, "connect")}>{t("common.retry")}</Button></p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {connectedAny && <p className="ok-line" role="status">{t("agents.nextConversations")}</p>}
      <Actions>
        {chosen.length > 0 ? <>
          <Button variant="ghost" onClick={() => void next()}>{t("agents.notNow")}</Button>
          <Button variant="primary" disabled={connecting} onClick={() => void connect()}>{t("wizard.w3.connect", { n: chosen.length })}</Button>
        </> : <Button variant="primary" onClick={() => void next()}>{remaining.length && !connectedAny ? t("agents.notNow") : t("wizard.continue")}</Button>}
      </Actions>
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

// ----- W4 -----
type Run = { phase: "waiting" | "download" | "load" | "check" | "done" | "failed" | "slow"; done?: number; total?: number; cause?: string; step?: string; latency?: number; outcome?: VerifyOutcome };

function useStageContext() {
  const store = useContext(RoomStoreContext);
  useRoomStore((s) => s.stages);
  return store ? stageContext(store.facts) : null;
}

function W4() {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const ctx = useStageContext();
  const phone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 750px)").matches;
  const [choosing, setChoosing] = useState(false);
  const bothChosen = useHosts((s) => !!effectiveStage(s.scope, s.inUse, "stt") && !!effectiveStage(s.scope, s.inUse, "tts"));
  const [runs, setRuns] = useState<Partial<Record<Task, Run>> | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { if (inUse && (!integrations || integrations.status === "idle")) void hosts.loadIntegrations(inUse); }, [inUse, integrations, hosts]);
  useEffect(() => () => abort.current?.abort(), []);
  const lang = currentLanguage();
  const proposal = ctx && ctx.offers ? proposeStages(ctx as never, !!phone) : null;
  const allDone = !!runs && !!proposal && proposal.rows.every((row) => runs[row.task]?.phase === "done");
  // Nothing is written until every stage passed: a cancel or a failure leaves the previous choice in place.
  useEffect(() => {
    if (allDone && proposal) for (const row of proposal.rows) hosts.chooseStage(inUse, row.task, row.stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);
  if (!proposal || integrations?.status === "loading") return <p className="muted" role="status">{t("wizard.w4.measuring")}</p>;

  async function accept(rows: ProposalRow[]) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRuns((current) => ({ ...current, ...Object.fromEntries(rows.map((row) => [row.task, { phase: "waiting" }])) }));
    await Promise.all(rows.map(async (row) => {
      const outcome = await hosts.verifyStage(row.task, row.stage, inUse, (p) => {
        if (!controller.signal.aborted) setRuns((current) => ({ ...current, [row.task]: { phase: p.phase, done: p.done, total: p.total } }));
      }, controller.signal);
      if (controller.signal.aborted) return;
      const run: Run = outcome.ok
        ? outcome.slow ? { phase: "slow", latency: outcome.slow.latency_ms, outcome } : { phase: "done", outcome }
        : { phase: "failed", step: outcome.step, cause: refusalText(outcome.reason, ""), outcome };
      setRuns((current) => ({ ...current, [row.task]: run }));
    }));
  }
  function cancel() { abort.current?.abort(); setRuns(null); }
  function acceptSlow(task: Task) { setRuns((current) => ({ ...current, [task]: { phase: "done" } })); }
  const running = runs && Object.values(runs).some((run) => run && ["waiting", "download", "load", "check"].includes(run.phase));

  if (choosing)
    return (
      <>
        <p className="muted">{t("wizard.w4.chooseLead")}</p>
        <div className="wizard-stages">
          <h3>{t("stage.stt")}</h3><StageSettings task="stt" />
          <h3>{t("stage.tts")}</h3><StageSettings task="tts" />
        </div>
        <Actions>
          <Button variant="ghost" onClick={() => setChoosing(false)}>{t("wizard.w4.backToProposal")}</Button>
          <Button variant="primary" disabled={!bothChosen} onClick={() => hosts.goTo("W5")}>{t("wizard.continue")}</Button>
        </Actions>
        {!bothChosen && <p className="muted small">{t("wizard.w4.chooseBoth")}</p>}
      </>
    );

  if (integrations?.status === "failed" && proposal.missing.length)
    return (
      <div className="problem" role="alert">
        <p>{t("wizard.w4.integrationsFailed")}</p>
        <Actions><Button variant="primary" onClick={() => inUse && void hosts.loadIntegrations(inUse)}>{t("common.retry")}</Button></Actions>
      </div>
    );
  if (proposal.rows.length === 0)
    return (
      <div className="problem" role="alert">
        <p>{t("wizard.w4.noOffer")}</p>
        <Actions>
          {inUse && <Button variant="primary" onClick={() => hosts.openSettings("host", inUse, "integrations")}>{t("wizard.w4.openIntegrations")}</Button>}
        </Actions>
      </div>
    );

  return (
    <>
      <ul className="proposal">
        {proposal.rows.map((row) => {
          const run = runs?.[row.task];
          return (
            <li key={row.task} className="proposal-row" data-phase={run?.phase}>
              <span className="proposal-task">{t(row.task === "stt" ? "stage.stt" : "stage.tts")}</span>
              <span className="proposal-model">
                <strong>{row.model}</strong>
                <span className="muted"> · {row.place === "device" ? t("stage.place.device") : row.placeLabel}{row.place === "device" && (row.installed ? " · " + t("stage.downloaded") : " · " + bytesText(row.bytes, lang))}</span>
              </span>
              {run && <RunLine run={run} t={t} lang={lang} onUse={() => acceptSlow(row.task)} onOther={() => setChoosing(true)} />}
            </li>
          );
        })}
        {proposal.missing.map((task) => (
          <li key={task} className="proposal-row" data-phase="failed">
            <span className="proposal-task">{t(task === "stt" ? "stage.stt" : "stage.tts")}</span>
            <span className="muted">{t("wizard.w4.nothingFor")}</span>
          </li>
        ))}
      </ul>
      {!runs && <p className="muted">{proposal.bytes ? t("wizard.w4.total", { size: bytesText(proposal.bytes, lang) }) : t("wizard.w4.nothingToDownload")}</p>}
      {!runs && <p className="muted small">{t("wizard.w4.nothingBefore")}</p>}
      <Actions>
        {!runs && <>
          <Button variant="ghost" onClick={() => setChoosing(true)}>{t("wizard.w4.other")}</Button>
          <Button variant="primary" disabled={proposal.missing.length > 0} onClick={() => void accept(proposal.rows)}>{t("wizard.w4.use")}</Button>
        </>}
        {running && <Button onClick={cancel}>{t("common.cancel")}</Button>}
        {runs && !running && !allDone && <>
          <Button variant="ghost" onClick={() => setChoosing(true)}>{t("wizard.w4.other")}</Button>
          <Button variant="primary" onClick={() => void accept(proposal.rows.filter((row) => runs[row.task]?.phase !== "done"))}>{t("common.retry")}</Button>
        </>}
        {allDone && <Button variant="primary" onClick={() => hosts.goTo("W5")}>{t("wizard.continue")}</Button>}
      </Actions>
    </>
  );
}

function RunLine({ run, t, lang, onUse, onOther }: { run: Run; t: Translate; lang: string; onUse: () => void; onOther: () => void }) {
  if (run.phase === "waiting") return <span className="run-line muted">{t("check.waiting")}</span>;
  if (run.phase === "download")
    return (
      <span className="run-line">
        <span>{t("check.download")}{run.total ? ` · ${bytesText(run.done ?? 0, lang)} / ${bytesText(run.total, lang)}` : ""}</span>
        <progress max={run.total || 1} value={run.total ? run.done : undefined} />
      </span>
    );
  if (run.phase === "load" || run.phase === "check") return <span className="run-line"><span>{t("check." + run.phase)}</span><progress /></span>;
  if (run.phase === "done") return <span className="run-line ok-line">{t("check.done")}</span>;
  if (run.phase === "slow")
    return (
      <span className="run-line warn-line" role="alert">
        <span>{t("check.slow", { seconds: ((run.latency ?? 0) / 1000).toLocaleString(lang, { maximumFractionDigits: 1 }) })}</span>
        <span className="run-actions"><Button size="compact" variant="primary" onClick={onUse}>{t("check.useAnyway")}</Button><Button size="compact" variant="ghost" onClick={onOther}>{t("check.other")}</Button></span>
      </span>
    );
  return (
    <span className="run-line fail-line" role="alert">
      <span>{t("check.failed", { step: t("check.step." + (run.step ?? "check")), cause: run.cause ?? "" })}</span>
      <span className="muted">{t("check.previousKept")}</span>
    </span>
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
            {echo.error.stage && <Button size="compact" variant="ghost" onClick={() => hosts.goTo("W4")}>{t(echo.error.stage === "stt" ? "wizard.w5.changeStt" : "wizard.w5.changeTts")}</Button>}
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
