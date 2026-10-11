import { useContext, useEffect, useRef, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { AddIcon, EditIcon, MachinesIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { Input } from "../../components/ui/Input";
import { InfoTip } from "../../components/ui/InfoTip";
import { Tooltip } from "../../components/ui/Tooltip";
import { Switch } from "../../components/ui/Switch";
import { Badge } from "../../components/ui/Badge";
import type { HostMessageKey } from "../settings/messages/en";
import { Section } from "../../components/ui/Card";
import "./machines.css";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import type { HostDeviceView, MachineView } from "../../state/room-types";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { NewDot, useHighlights } from "../highlights/highlights";
import { canRunLocalHostAction, hostCause, hostStatusText, localHostBridgeErrorText, runLocalHostAction, safeLocalHostCount, safeLocalHostStatusDetails, type LocalHostAction } from "../settings/local-host-status";

function dateText(value: string | number | null | undefined) {
  if (value == null) return "";
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** A machine's name, and what its row says about it: this computer, connected, not checked, no response. */
function machineCopy(machine: MachineView, status: LocalHostStatus, t: HostTranslate) {
  const name = machine.host || (machine.local ? t("hosts.thisComputer") : t("hosts.unnamed"));
  const subtitle = machine.local
    ? machine.state === "connected" ? status.state === "running" ? t("hosts.thisComputer") : t("hosts.connected") : hostStatusText(status, t)
    : machine.state === "checking" ? t("hosts.checking")
      : machine.state === "offline" || machine.state === "revoked" || machine.state === "failed"
      ? t("hosts.remoteNoResponse") : t("hosts.connected");
  const reachable = machine.state === "connected";
  return { name, subtitle, reachable };
}

/* The paired machines, as Settings' own navigation lists them (MachineNav): under Machines a sub-entry per machine —
 * its name and a dot for its state, said in words to a screen reader and in its tooltip — and Add a machine last. The
 * machine chosen has its page in the pane (MachineList): its state, this computer's service (the local one), its
 * agents, the devices paired with it (pairing goes from a device to the machine: Add a machine, and pair-device on
 * the machine), and forgetting it. Machines itself is the first machine, or, with
 * none, a word and Add. On a phone, whose sections are a strip, the machines come at the pane's head instead. */

/** A machine's state for its dot and its words. */
function machineState(machine: MachineView, copy: ReturnType<typeof machineCopy>, t: HostTranslate) {
  return copy.reachable ? { tone: "positive", label: t("hosts.online") }
    : machine.state === "checking" ? { tone: "neutral", label: t("hosts.checking") } : { tone: "danger", label: t("hosts.unavailable") };
}

/** Whether something new (an agent it found) is under a machine: its entry's dot. */
function useNotice() {
  const news = useHighlights();
  return (machine: MachineView) => !!machine.pairingId && news.some((item) => item.machine === machine.pairingId);
}

/** The machine shown: the one chosen, else the first. */
function shownMachine(machines: MachineView[], picked: string | null) {
  return (picked ? machines.find((machine) => machine.id === picked) : null) ?? machines[0] ?? null;
}

/** The machines under Machines in Settings' navigation, and Add a machine after them. */
export function MachineNav({ current }: { current: boolean }) {
  const t = hostTranslator();
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const picked = useRoomStore((state) => state.facts.machinesView.machine);
  const store = useContext(RoomStoreContext);
  const notice = useNotice();
  const shown = shownMachine(machines, picked);
  return (
    <div className="machine-nav">
      {machines.map((machine) => {
        const copy = machineCopy(machine, status, t);
        const state = machineState(machine, copy, t);
        return (
          <button key={machine.id} type="button" className="ui-nav-item ui-nav-item--sub machine-entry" title={copy.name + " · " + state.label + " · " + copy.subtitle} aria-label={`${copy.name}, ${state.label} · ${copy.subtitle}`}
            data-name={copy.name} data-state={machine.state} data-local={machine.local || undefined}
            aria-current={current && shown?.id === machine.id ? "page" : undefined}
            onClick={() => store?.patch({ settingsSection: "machines", machinesView: { machine: machine.id } })}>
            {/* This computer, an icon before its name; the name cut short when long (whole in the title); the state's dot
                last. An entry never grows past the column. */}
            {machine.local && <span className="machine-nav-here" title={t("hosts.thisComputer")}><ThisComputerIcon /><span className="sr-only">{t("hosts.thisComputer")}</span></span>}
            <span className="machine-nav-name">{copy.name}</span>
            {notice(machine) && <NewDot label={t("highlights.navNew")} />}
            <span className="machine-nav-dot" data-tone={state.tone} aria-hidden="true" />
          </button>
        );
      })}
      <button type="button" className="ui-nav-item ui-nav-item--sub machine-nav-add" onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("hosts.add")}</button>
    </div>
  );
}

export function MachineList() {
  const t = hostTranslator();
  const machines = useRoomStore((state) => state.machines);
  const agentRequest = useRoomStore((state) => state.facts.settingsAgentRequest);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const picked = useRoomStore((state) => state.facts.machinesView.machine);
  const store = useContext(RoomStoreContext);
  const notice = useNotice();
  const localMachine = machines.find((machine) => machine.local) ?? null;
  const hasLocalHost = !!localMachine || status.state !== "absent" || status.installed === true;

  // Asked for a machine's agents (an agent waiting): that machine's page, once per request. `machines` is a new list
  // after every change to the store, this patch included: the request is answered once, and only with a change, or
  // the two would feed each other without end.
  const answered = useRef<number | null>(null);
  useEffect(() => {
    if (!agentRequest?.fp || answered.current === agentRequest.id) return;
    const machine = machines.find((entry) => entry.pairingId === agentRequest.fp);
    if (!machine) return;
    answered.current = agentRequest.id;
    if (picked !== machine.id) store?.patch({ machinesView: { machine: machine.id } });
  }, [agentRequest, machines, picked]);

  const shown = shownMachine(machines, picked);
  const copy = shown ? machineCopy(shown, status, t) : null;
  return (
    <Section id="machines" title={t("hosts.title")} description={t("hosts.description")}>
      {/* A phone's sections are a strip across the top, with no room for the machines: they come with the pane. */}
      <div className="machines-inline"><MachineNav current /></div>
      {machines.length === 0 && <div className="machines-empty"><p className="muted">{t("hosts.none")}</p>
        <Button id="pair-device-open" variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("hosts.add")}</Button></div>}
      {shown && copy && <HostDetail machine={shown} copy={copy} notice={notice(shown)} />}
      <LocalHostInstallEntry showCta={!hasLocalHost} className="local-install-entry--machines" holdSuccess />
    </Section>
  );
}

/** Where this device reaches a machine, as its page says it. */
function reachText(machine: MachineView, t: HostTranslate) {
  if (machine.local) return "";
  if (machine.reach === "direct") return t("hosts.reach.direct");
  if (machine.reach === "room") return t("hosts.reach.room");
  if (machine.reach === "away" || machine.reach === "offline" || machine.reach === "revoked") return t("hosts.reach.none");
  return "";
}

/** A machine's page: whether it answers and how, then this computer's service (the local one), its agents, the devices
 *  paired with it, and forgetting it. */
function HostDetail({ machine, copy, notice }: { machine: MachineView; copy: ReturnType<typeof machineCopy>; notice: boolean }) {
  const t = hostTranslator();
  // Renaming the machine on this device: the name being typed, or null.
  const [naming, setNaming] = useState<string | null>(null);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const agentRequest = useRoomStore((state) => state.facts.settingsAgentRequest);
  const agents = useRef<HTMLElement>(null);
  // Asked for its agents (a new agent waiting): its agents in view.
  useEffect(() => { if (agentRequest?.fp && agentRequest.fp === machine.pairingId) agents.current?.scrollIntoView?.({ block: "start" }); }, [agentRequest, machine.pairingId]);
  const reach = reachText(machine, t);
  return (
    <section className="host-detail" aria-label={copy.name}>
      <header className="host-detail-header">
        <span className="machine-icon" aria-hidden="true"><MachinesIcon size={20} /></span>
        <div className="host-detail-copy">
          {naming !== null ? <form className="host-rename" onSubmit={(event) => { event.preventDefault(); window.sidevoiceActions?.renameMachine?.(machine.pairingId || machine.id, naming.trim() || null); setNaming(null); }}>
              <Input aria-label={t("hosts.renameLabel")} value={naming} maxLength={60} autoFocus onChange={(event) => setNaming(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNaming(null); } }} />
              <Button type="submit" size="sm" variant="primary">{t("hosts.devices.renameSave")}</Button>
              <Button size="sm" variant="ghost" tone="neutral" onClick={() => setNaming(null)}>{t("hosts.cancel")}</Button>
            </form>
            : <h3 className="host-name">{copy.name}
              {machine.pairingId && <Button variant="ghost" tone="neutral" size="icon-sm" className="host-rename-open" aria-label={t("hosts.rename", { machine: copy.name })} title={t("hosts.rename", { machine: copy.name })}
                onClick={() => setNaming(copy.name)}><EditIcon size={14} /></Button>}
            </h3>}
          {/* Renamed here: whose name it really is, and the way back to it. */}
          {machine.alias && naming === null && <p className="host-alias muted">{t("hosts.aliasOf", { name: machine.machineHost ?? "" })}
            <Button variant="ghost" size="sm" onClick={() => window.sidevoiceActions?.renameMachine?.(machine.pairingId || machine.id, null)}>{t("hosts.aliasReset")}</Button></p>}
          <p className="muted">{[copy.subtitle, reach].filter(Boolean).join(" · ")}</p>
        </div>
        <Badge tone={copy.reachable ? "positive" : machine.state === "checking" ? "neutral" : "danger"} dot>{copy.reachable ? t("hosts.online") : machine.state === "checking" ? t("hosts.checking") : t("hosts.unavailable")}</Badge>
      </header>
      {/* Sidevoice on the machine, as a card on every machine's page: this computer's with its controls; another's to read. */}
      <section className="host-section" aria-labelledby={"host-status-" + machine.id}>
        {machine.local ? <LocalHostStatusPanel status={status} titleId={"host-status-" + machine.id} name={copy.name} />
          : <RemoteHostCard machine={machine} name={copy.name} titleId={"host-status-" + machine.id} />}
      </section>
      <section className="host-section" ref={agents}>
        <HostAgentsPanel fp={machine.pairingId ?? null} />
      </section>
      <section className="host-section">
        <MachineDevicesPanel machine={machine} name={copy.name} />
      </section>
    </section>
  );
}

/** Another machine's Sidevoice, to read: how this device reaches it (directly, through the room, not at all), whether
 *  without encryption, and — where the machine says — its Sidevoice version. No controls: it is run there. */
function RemoteHostCard({ machine, name, titleId }: { machine: MachineView; name: string; titleId: string }) {
  const t = hostTranslator();
  const info = useRoomStore((state) => machine.pairingId ? state.facts.remoteHostStatus?.[machine.pairingId] : undefined);
  useEffect(() => { if (machine.pairingId && machine.state === "connected") void window.sidevoiceActions?.loadMachineInfo?.(machine.pairingId); }, [machine.pairingId, machine.state]);
  const state: { tone: "positive" | "neutral" | "warning" | "danger"; label: HostMessageKey } = machine.revoked ? { tone: "danger", label: "hosts.state.revoked" }
    : machine.state === "connected" ? { tone: "positive", label: machine.reach === "room" ? "hosts.state.throughRoom" : "hosts.state.connected" }
    : machine.state === "checking" ? { tone: "neutral", label: "hosts.state.checking" } : { tone: "danger", label: "hosts.state.offline" };
  return (
    <div className="host-status-card" data-tone={state.tone} data-remote>
      <div className="host-status-head">
        <h4 id={titleId}>{t("hosts.serviceOn", { machine: name })}</h4>
        <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{t(state.label)}</span>
      </div>
      {(machine.insecure || info?.version) && <dl className="host-status-facts">
        {info?.version && <div className="host-status-product">{t("hosts.productVersion", { version: info.version })}</div>}
        {machine.insecure && <div><Badge tone="warning" dot>{t("hosts.notEncrypted")}</Badge></div>}
      </dl>}
    </div>
  );
}

/** Where this computer's service stands, as one word and its dot. */
function serviceState(status: LocalHostStatus): { tone: "positive" | "neutral" | "warning" | "danger"; label: HostMessageKey } {
  switch (status.state) {
    case "running": return { tone: "positive", label: "hosts.state.running" };
    case "starting": case "installing": case "backoff": return { tone: "warning", label: "hosts.state.starting" };
    case "failed": case "service-failed": case "refused": case "incompatible": return { tone: "danger", label: "hosts.state.failed" };
    default: return { tone: "neutral", label: "hosts.state.stopped" };
  }
}

/* This computer's service as a status card: its state with its dot, first; its version ("Sidevoice 0.8.1");
 * Start at sign-in as a switch; and the card's actions — Restart and Stop while it runs (Stop asks first when calls are
 * active, as they end), Start when stopped, Retry or Reinstall when it failed. What failed, its log and details below. */
function LocalHostStatusPanel({ status, titleId, name }: { status: LocalHostStatus; titleId: string; name: string }) {
  const t = hostTranslator();
  const [busy, setBusy] = useState<LocalHostAction | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const details = safeLocalHostStatusDetails(status);
  const statusMessage = hostStatusText(status, t);
  const hasMethod = (action: LocalHostAction) => canRunLocalHostAction(action);
  const state = serviceState(status);
  const calls = details.calls ?? 0;
  const buttons: { action: LocalHostAction; label: string; variant: "primary" | "secondary" | "ghost" }[] = [];
  if (status.state === "running") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.restart"), variant: "secondary" });
    if (hasMethod("stop")) buttons.push({ action: "stop", label: t("hosts.stop"), variant: "ghost" });
  } else if (status.state === "not-installed") {
    if (hasMethod("serviceInstall")) buttons.push({ action: "serviceInstall", label: t("hosts.start"), variant: "primary" });
  } else if (status.state === "stopped-by-person") {
    if (hasMethod("start")) buttons.push({ action: "start", label: t("hosts.start"), variant: "primary" });
  } else if (status.state === "backoff" || status.state === "failed") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry"), variant: "primary" });
  } else if (status.state === "service-failed") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry"), variant: "primary" });
    if (hasMethod("serviceInstall")) buttons.push({ action: "serviceInstall", label: t("hosts.reinstall"), variant: "secondary" });
  } else if (status.state === "refused") {
    if (hasMethod("reconnect")) buttons.push({ action: "reconnect", label: t("hosts.reconnect"), variant: "primary" });
  }
  const installed = status.installed ?? (status.service !== "none" && status.service !== undefined);
  const loginAction: LocalHostAction | null = status.state === "absent" || (!installed && status.state === "not-installed") ? null
    : installed ? hasMethod("serviceUninstall") ? "serviceUninstall" : null
      : hasMethod("serviceInstall") ? "serviceInstall" : null;
  async function run(action: LocalHostAction) {
    if (busy) return;
    setBusy(action);setNote("");
    try { await runLocalHostAction(action);if (action === "stop") setConfirmStop(false); }
    catch { setNote(t("hosts.actionFailed")); }
    finally { setBusy(null); }
  }
  const bridge = localHostBridge();
  const canSetLogin = typeof bridge?.setStartAtLogin === "function";
  async function setLogin(enabled: boolean) {
    if (busy || !bridge?.setStartAtLogin) return;
    setBusy(loginAction);setNote("");
    try { await bridge.setStartAtLogin(enabled); }
    catch { setNote(t("hosts.actionFailed")); }
    finally { setBusy(null); }
  }
  async function copyDetails() {
    try { await navigator.clipboard.writeText(JSON.stringify(details, null, 2));setCopied(true);setNote(t("hosts.detailsCopied")); }
    catch { setCopied(false);setNote(t("hosts.actionFailed")); }
  }
  const cause = status.failure ? hostCause(status, t) : "";
  const failureAt = dateText(details.failure?.at);
  const failed = status.state === "failed" || status.state === "service-failed";
  return (
    <div className="host-status-card" data-state={status.state} data-tone={state.tone}>
      <div className="host-status-head">
        <h4 id={titleId}>{t("hosts.serviceOn", { machine: name })}</h4>
        <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{t(state.label)}</span>
      </div>
      {/* The facts, compact; then what the state means where it says more than its word. */}
      <dl className="host-status-facts">
        {/* One version, the product's as the person installed it (never the core's or the connector's). */}
        {details.product_version && <div className="host-status-product">{t("hosts.productVersion", { version: details.product_version })}</div>}
      </dl>
      {status.state !== "running" && <p className="host-status-summary">{statusMessage}</p>}
      {/* Stopped by the person: Start brings it back (the app runs the service), and without start at sign-in it would not
          come back by itself either. Only this computer's machine has this card: a remote one is never stopped from here. */}
      {status.state === "stopped-by-person" && <p className="muted">{t(installed ? "hosts.stoppedNote" : "hosts.stoppedNoLoginNote")}</p>}
      {cause && status.state === "backoff" && <p className="muted">{cause}</p>}
      {status.failure && failed && (
        <div className="host-failure-details">
          {details.attempts !== undefined && <p>{t("hosts.failureAttempts", { attempts: details.attempts, limit: details.limit ? ` of ${details.limit}` : "" })}</p>}
          {failureAt && <p>{t("hosts.failureAt", { time: failureAt })}</p>}
        </div>
      )}
      {/* Start at sign-in is its own: it changes only whether the service starts at the next sign-in, never whether it
          runs now. Where the app can only set it by installing or removing the service (which starts or stops it too),
          it is shown, and says why it cannot change here. */}
      {loginAction && <label className="host-status-login">
        <span><span className="host-status-login-label">{t("hosts.startAtSignIn")}</span>
          <span className="muted">{t(canSetLogin ? "hosts.startAtSignInHint" : "hosts.startAtSignInUnavailable")}</span></span>
        <Switch checked={installed} disabled={!!busy || !canSetLogin} aria-label={t("hosts.startAtSignIn")} onChange={(next) => void setLogin(next)} />
      </label>}
      {confirmStop ? <div className="host-stop-confirm" role="group" aria-label={t("hosts.stop")}>
          <p>{t("hosts.stopConfirm")}</p>
          <span className="host-action-list">
            <Button variant="ghost" tone="neutral" size="sm" autoFocus disabled={!!busy} onClick={() => setConfirmStop(false)}>{t("hosts.cancel")}</Button>
            <Button variant="danger" size="sm" loading={busy === "stop"} onClick={() => void run("stop")}>{t("hosts.stop")}</Button>
          </span>
        </div>
        : (buttons.length > 0 || failed) && <div className="host-action-list host-status-actions">
          {buttons.map(({ action, label, variant }) => <Button key={action} size="sm" variant={variant} tone={action === "stop" ? "danger" : undefined} loading={busy === action} disabled={!!busy && busy !== action}
            onClick={() => action === "stop" && calls > 0 ? setConfirmStop(true) : void run(action)}>{label}</Button>)}
          {failed && hasMethod("revealLog") && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run("revealLog")}>{t("hosts.viewLog")}</Button>}
          {failed && typeof navigator.clipboard?.writeText === "function" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void copyDetails()}>{copied ? t("hosts.detailsCopied") : t("hosts.copyDetails")}</Button>}
        </div>}
      {note && <p className="muted" role="status">{note}</p>}
      <LocalHostUpdateControl status={status} />
    </div>
  );
}

function LocalHostUpdateControl({ status }: { status: LocalHostStatus }) {
  const t = hostTranslator();
  const [report, setReport] = useState<LocalHostVersion | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalHostBridgeError | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let current = true;
    const bridge = localHostBridge();
    if (typeof bridge?.version !== "function" || typeof bridge.update !== "function") {
      setReport(null);
      setChecking(false);
      return () => { current = false; };
    }
    setChecking(true);
    void bridge.version().then((next) => { if (current) setReport(next); })
      .catch(() => { if (current) setReport(null); })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [status.state, status.core?.version, status.core?.api]);

  const bridge = localHostBridge();
  if (checking || typeof bridge?.version !== "function" || typeof bridge.update !== "function") return null;

  async function refreshVersion() {
    const nextBridge = localHostBridge();
    if (typeof nextBridge?.version !== "function") return;
    try { setReport(await nextBridge.version()); } catch { setReport(null); }
  }

  async function update() {
    const nextBridge = localHostBridge();
    if (report?.update !== "available" || typeof nextBridge?.version !== "function" || typeof nextBridge.update !== "function" || busy) return;
    setBusy(true);setError(null);setNote("");
    try {
      const current = await nextBridge.version();
      setReport(current);
      if (current.update !== "available") return;
      await nextBridge.update();
      await refreshVersion();
    }
    catch (reason) { setError(normalizeLocalHostBridgeError(reason)); }
    finally { setBusy(false); }
  }

  async function copyErrorDetails() {
    if (!error) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
      setNote(t("localInstall.detailsCopied"));
    } catch { setNote(t("localInstall.detailsCopyFailed")); }
  }

  if (!report) return null;
  if (report.update === "newer-installed") return <p className="host-update-guidance" role="status">{t("hosts.update.newerInstalled")}</p>;
  if (report.update === "incompatible") return <p className="host-update-guidance" role="status">{report.core_api == null
    ? t("hosts.update.incompatibleUnknown") : t("hosts.update.incompatible", { api: report.core_api })}</p>;
  if (report.update !== "available") return null;

  const calls = safeLocalHostCount(status.calls);
  const waitingForCalls = calls !== undefined && calls > 0;
  return (
    <div className="host-update-control" aria-live="polite">
      {waitingForCalls && <p className="muted">{t("hosts.update.waitCalls", { calls })}</p>}
      {error && <div className="local-install-error" role="alert">
        <p>{localHostBridgeErrorText(error, t)}</p>
        <div className="local-install-actions">
          <Button variant="ghost" onClick={() => void copyErrorDetails()}>{t("localInstall.copyDetails")}</Button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      </div>}
      <Button variant="primary" disabled={busy || waitingForCalls} onClick={() => void update()}>
        {busy ? t("hosts.update.working") : error ? t("hosts.update.retry") : t("hosts.update.button")}
      </Button>
    </div>
  );
}

function MachineDevicesPanel({ machine, name }: { machine: MachineView; name: string }) {
  const t = hostTranslator();
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [devices, setDevices] = useState<HostDeviceView[]>([]);
  const [devicesFor, setDevicesFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deviceNote, setDeviceNote] = useState("");
  const deviceEpoch = useRef(0);
  const bridge = localHostBridge();
  const local = !!machine.local;
  const usable = machine.state === "connected" && !!machine.pairingId;
  const list = () => local ? window.sidevoiceActions?.localHostDevices?.() : window.sidevoiceActions?.machineDevices?.(machine.pairingId!);
  const ownName = useRoomStore((state) => state.facts.deviceName);
  const shownName = (device: HostDeviceView) => (device.current && ownName) || device.name
    || t(device.kind === "local" && !local ? "hosts.devices.thisMachine" : "hosts.devices.thisDevice");
  const drop = (id: string) => local ? window.sidevoiceActions?.revokeLocalHostDevice?.(id) : window.sidevoiceActions?.revokeMachineDevice?.(machine.pairingId!, id);
  const pairingKey = machine.pairingId || "";
  const visibleDevices = usable && devicesFor === pairingKey ? devices : [];

  async function refresh() {
    const epoch = ++deviceEpoch.current;
    if (!usable) { setError(true);setDevices([]);return; }
    if (!(local ? window.sidevoiceActions?.localHostDevices : window.sidevoiceActions?.machineDevices)) { setError(true);return; }
    setLoading(true);setError(false);
    try { const next = await list() ?? [];if (deviceEpoch.current === epoch && usable) {setDevices(next);setDevicesFor(pairingKey)} }
    catch { if (deviceEpoch.current === epoch && usable) setError(true); }
    finally { if (deviceEpoch.current === epoch) setLoading(false); }
  }
  useEffect(() => {
    deviceEpoch.current++;
    setLoading(false);
    setConfirmId(null);
    setDevices([]);setDevicesFor(null);
    setDeviceNote("");
    if (!usable) {
      setError(true);
      return;
    }
    setError(false);
    void refresh();
  }, [usable, machine.pairingId]);
  async function revoke(id: string) {
    if (!usable || !(local ? window.sidevoiceActions?.revokeLocalHostDevice : window.sidevoiceActions?.revokeMachineDevice)) return;
    const epoch = ++deviceEpoch.current;
    setLoading(true);setError(false);
    try {
      await drop(id);
      if (deviceEpoch.current !== epoch || !usable) return;
      setConfirmId(null);setDeviceNote(t("hosts.devices.revoked"));
      const next = await list() ?? [];
      if (deviceEpoch.current === epoch && usable) {setDevices(next);setDevicesFor(pairingKey)}
    }
    catch { if (deviceEpoch.current === epoch && usable) setError(true); }
    finally { if (deviceEpoch.current === epoch) setLoading(false); }
  }
  return (
    <div className="host-devices-panel">
      <div className="host-devices-head">
        <h4>{t("hosts.tab.devices")}</h4>
      </div>
      {usable && loading && <p className="muted" role="status">{t("hosts.working")}</p>}
      {/* The list is read once as the page opens; reading it again is offered only when that failed. */}
      {!usable && <p className="muted" role="alert">{t("hosts.devices.unavailable")}</p>}
      {usable && error && !loading && <Alert tone="danger" live title={t("hosts.devices.unavailable")}
        action={<Button size="sm" onClick={() => void refresh()}>{t("hosts.retry")}</Button>} />}
      {usable && deviceNote && <p className="muted" role="status">{deviceNote}</p>}
      {usable && !loading && !error && visibleDevices.length === 0 && <p className="muted">{t("hosts.devices.empty")}</p>}
      <ul className="host-device-list">
        {visibleDevices.map((device) => (
          <li className="host-device-row" key={device.device_id}>
            <div className="host-device-copy">
              {/* The name and, on the same line, whether it is this device: the name gives way (an ellipsis), the tag never. */}
              <span className="host-device-title">
                {/* This device by the name it has now (General's), however the machine last heard it. */}
                <strong title={shownName(device)}>{shownName(device)}</strong>
                {/* This device; or, in another machine's list, that machine's own Sidevoice (paired with itself), which is
                    not revocable from here. */}
                {(device.kind === "local" || device.current) && <Badge tone="accent">{t(device.kind === "local" && !local ? "hosts.devices.thisMachine" : "hosts.devices.thisDevice")}</Badge>}
                {device.kind === "local" && !local && <InfoTip label={t("hosts.devices.thisMachineInfoLabel")}>{t("hosts.devices.thisMachineInfo")}</InfoTip>}
              </span>
              {dateText(device.created_at) && <span className="muted">{t("hosts.devices.created", { date: dateText(device.created_at) })}</span>}
              {dateText(device.last_seen_at) && <span className="muted">{t("hosts.devices.lastSeen", { date: dateText(device.last_seen_at) })}</span>}
            </div>
            {device.current && !local && machine.pairingId && (confirmId === device.device_id ? (
              <span className="device-revoke-confirm" role="group" aria-label={t("hosts.forget", { machine: name })}>
                <span className="muted">{t("hosts.confirmForget")}</span>
                <Button variant="danger" size="sm" onClick={() => void window.sidevoiceActions?.forgetMachine(machine.pairingId!)}>{t("hosts.forgetConfirm")}</Button>
                <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirmId(null)}>{t("hosts.cancel")}</Button>
              </span>
            ) : <Tooltip content={t("hosts.forgetHint", { machine: name })}>
              <Button variant="ghost" tone="danger" size="sm" onClick={() => setConfirmId(device.device_id)}>{t("hosts.forget", { machine: name })}</Button>
            </Tooltip>)}
            {usable && device.kind !== "local" && !device.current && (confirmId === device.device_id ? (
              <span className="device-revoke-confirm" role="group" aria-label={t("hosts.devices.revoke", { device: device.name || device.device_id })}>
                <span className="muted">{t("hosts.devices.revokeConfirm")}</span>
                <Button variant="danger" size="sm" disabled={loading} onClick={() => void revoke(device.device_id)}>{t("hosts.devices.revoke", { device: device.name || device.device_id })}</Button>
                <Button variant="ghost" size="sm" disabled={loading} onClick={() => setConfirmId(null)}>{t("hosts.cancel")}</Button>
              </span>
            ) : <Button variant="ghost" size="sm" disabled={loading} onClick={() => setConfirmId(device.device_id)}>{t("hosts.devices.revoke", { device: device.name || device.device_id })}</Button>)}
          </li>
        ))}
      </ul>
    </div>
  );
}
