import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon, MachinesIcon } from "../../components/ui/Icons";
import { Badge } from "../../components/ui/Badge";
import { Section } from "../../components/ui/Card";
import "./machines.css";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion, type LocalPairingCode } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import type { HostDeviceView, MachineView } from "../../state/room-types";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { actionableAgent } from "../../services/host-agents";
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
    ? machine.selectable && status.reachable === true ? status.state === "running" ? t("hosts.thisComputer") : t("hosts.connected") : hostStatusText(status, t)
    : machine.state === "checking" ? t("hosts.checking")
      : machine.state === "offline" || machine.state === "revoked" || machine.state === "failed"
      ? t("hosts.remoteNoResponse") : t("hosts.connected");
  const reachable = machine.local ? machine.selectable && status.reachable === true : machine.state === "connected";
  return { name, subtitle, reachable };
}

/* The paired machines, as Settings' own navigation lists them (MachineNav): under Machines a sub-entry per machine —
 * its name and a dot for its state, said in words to a screen reader and in its tooltip — and Add a machine last. The
 * machine chosen has its page in the pane (MachineList): its state, this computer's service (the local one), its
 * agents, its paired devices and pairing another, and forgetting it. Machines itself is the first machine, or, with
 * none, a word and Add. On a phone, whose sections are a strip, the machines come at the pane's head instead. */

/** A machine's state for its dot and its words. */
function machineState(machine: MachineView, copy: ReturnType<typeof machineCopy>, t: HostTranslate) {
  return copy.reachable ? { tone: "positive", label: t("hosts.online") }
    : machine.state === "checking" ? { tone: "neutral", label: t("hosts.checking") } : { tone: "danger", label: t("hosts.unavailable") };
}

function useNotice() {
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  return (machine: MachineView) => !!machine.pairingId && hostAgents[machine.pairingId]?.status === "ready" &&
    hostAgents[machine.pairingId]?.value?.agents.some(actionableAgent) === true;
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
          <button key={machine.id} type="button" className="ui-nav-item ui-nav-item--sub machine-entry" title={state.label + " · " + copy.subtitle} aria-label={`${copy.name}, ${state.label} · ${copy.subtitle}`}
            data-name={copy.name} data-state={machine.state} data-in-use={machine.inUse || undefined} data-local={machine.local || undefined}
            aria-current={current && shown?.id === machine.id ? "page" : undefined}
            onClick={() => store?.patch({ settingsSection: "machines", machinesView: { machine: machine.id } })}>
            <span className="machine-nav-dot" data-tone={state.tone} aria-hidden="true" />
            <span className="machine-nav-name">{copy.name}</span>
            {notice(machine) && <Badge tone="warning" className="ui-nav-badge">{t("agents.notice")}</Badge>}
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
 *  paired with it and pairing another, and forgetting it. */
function HostDetail({ machine, copy, notice }: { machine: MachineView; copy: ReturnType<typeof machineCopy>; notice: boolean }) {
  const t = hostTranslator();
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
          <h3>{copy.name}</h3>
          <p className="muted">{[machine.inUse ? t("hosts.inUse") : "", copy.subtitle, reach].filter(Boolean).join(" · ")}</p>
        </div>
        <Badge tone={copy.reachable ? "positive" : machine.state === "checking" ? "neutral" : "danger"} dot>{copy.reachable ? t("hosts.online") : machine.state === "checking" ? t("hosts.checking") : t("hosts.unavailable")}</Badge>
        {notice && <Badge tone="warning">{t("agents.notice")}</Badge>}
        {!machine.inUse && machine.selectable !== false && <Button variant="secondary" size="sm" aria-label={t("hosts.use", { machine: copy.name })}
          onClick={() => window.sidevoiceActions?.chooseMachine(machine.pairingId || machine.id)}>{t("hosts.useShort")}</Button>}
      </header>
      {machine.local && <section className="host-section" aria-labelledby={"host-status-" + machine.id}>
        <h4 id={"host-status-" + machine.id}>{t("hosts.section.service")}</h4>
        <LocalHostStatusPanel status={status} />
      </section>}
      <section className="host-section" ref={agents}>
        <HostAgentsPanel fp={machine.pairingId ?? null} />
      </section>
      <section className="host-section">
        <MachineDevicesPanel machine={machine} name={copy.name} />
      </section>
      {!machine.local && machine.pairingId && <ForgetMachine fp={machine.pairingId} name={copy.name} />}
    </section>
  );
}

/** Forgetting a machine on this device: its pairing dropped here, and the machine asked to revoke it. */
function ForgetMachine({ fp, name }: { fp: string; name: string }) {
  const t = hostTranslator();
  const [asking, setAsking] = useState(false);
  return (
    <section className="host-section host-forget">
      <h4>{t("hosts.section.thisDevice")}</h4>
      {asking ? <div className="device-revoke-confirm" role="group" aria-label={t("hosts.forget", { machine: name })}>
        <span className="muted">{t("hosts.confirmForget")}</span>
        <Button variant="danger" size="sm" onClick={() => void window.sidevoiceActions?.forgetMachine(fp)}>{t("hosts.forgetConfirm")}</Button>
        <Button variant="ghost" size="sm" autoFocus onClick={() => setAsking(false)}>{t("hosts.cancel")}</Button>
      </div> : <div className="host-forget-row">
        <p className="muted">{t("hosts.forgetHint", { machine: name })}</p>
        <Button variant="ghost" tone="danger" size="sm" onClick={() => setAsking(true)}>{t("hosts.forget", { machine: name })}</Button>
      </div>}
    </section>
  );
}

function LocalHostStatusPanel({ status }: { status: LocalHostStatus }) {
  const t = hostTranslator();
  const [busy, setBusy] = useState<LocalHostAction | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const details = safeLocalHostStatusDetails(status);
  const statusMessage = hostStatusText(status, t);
  const hasMethod = (action: LocalHostAction) => canRunLocalHostAction(action);
  const buttons: { action: LocalHostAction; label: string }[] = [];
  if (status.state === "running") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.restart") });
    if (hasMethod("stop")) buttons.push({ action: "stop", label: t("hosts.stop") });
  } else if (status.state === "not-installed") {
    if (hasMethod("serviceInstall")) buttons.push({ action: "serviceInstall", label: t("hosts.startAtLogin") });
  } else if (status.state === "stopped-by-person") {
    if (hasMethod("start")) buttons.push({ action: "start", label: t("hosts.start") });
  } else if (status.state === "backoff" || status.state === "failed") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry") });
  } else if (status.state === "service-failed") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry") });
    if (hasMethod("serviceInstall")) buttons.push({ action: "serviceInstall", label: t("hosts.reinstall") });
  } else if (status.state === "refused") {
    if (hasMethod("reconnect")) buttons.push({ action: "reconnect", label: t("hosts.reconnect") });
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
  async function copyDetails() {
    try { await navigator.clipboard.writeText(JSON.stringify(details, null, 2));setCopied(true);setNote(t("hosts.detailsCopied")); }
    catch { setCopied(false);setNote(t("hosts.actionFailed")); }
  }
  const cause = status.failure ? hostCause(status, t) : "";
  const failureAt = dateText(details.failure?.at);
  return (
    <div className="host-status-panel" data-state={status.state}>
      <p className="host-status-summary" role="status">{statusMessage}</p>
      {details.core?.version && <p className="muted">{t("hosts.version", { version: details.core.version })}</p>}
      {details.calls !== undefined && <p className="muted">{t("hosts.calls", { calls: details.calls })}</p>}
      {cause && status.state === "backoff" && <p className="muted">{cause}</p>}
      {status.failure && (status.state === "failed" || status.state === "service-failed") && (
        <div className="host-failure-details">
          {details.attempts !== undefined && <p>{t("hosts.failureAttempts", { attempts: details.attempts, limit: details.limit ? ` of ${details.limit}` : "" })}</p>}
          {failureAt && <p>{t("hosts.failureAt", { time: failureAt })}</p>}
        </div>
      )}
      <div className="host-action-list">
        {buttons.map(({ action, label }) => action !== "stop" || !confirmStop ? <Button key={action} variant={action === "stop" ? "ghost" : "primary"} disabled={!!busy}
          onClick={() => action === "stop" ? setConfirmStop(true) : void run(action)}>{busy === action ? t("hosts.working") : label}</Button> : null)}
        {confirmStop && <span className="host-stop-confirm" role="group" aria-label={t("hosts.stop")}>
          <span>{t("hosts.stopConfirm")}</span>
          <Button variant="danger" disabled={!!busy} onClick={() => void run("stop")}>{busy === "stop" ? t("hosts.working") : t("hosts.stop")}</Button>
          <Button variant="ghost" disabled={!!busy} onClick={() => setConfirmStop(false)}>{t("hosts.cancel")}</Button>
        </span>}
        {loginAction && <Button variant="ghost" disabled={!!busy} onClick={() => void run(loginAction)}>{installed ? t("hosts.stopAtLogin") : t("hosts.startAtLogin")}</Button>}
        {(status.state === "failed" || status.state === "service-failed") && hasMethod("revealLog") && <Button variant="ghost" disabled={!!busy} onClick={() => void run("revealLog")}>{t("hosts.viewLog")}</Button>}
        {(status.state === "failed" || status.state === "service-failed") && typeof navigator.clipboard?.writeText === "function" && <Button variant="ghost" disabled={!!busy} onClick={() => void copyDetails()}>{copied ? t("hosts.detailsCopied") : t("hosts.copyDetails")}</Button>}
      </div>
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
  const [pairing, setPairing] = useState<LocalPairingCode | null>(null);
  const [pairingFor, setPairingFor] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState(false);
  const [deviceNote, setDeviceNote] = useState("");
  const [roomUrl, setRoomUrl] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomPaired, setRoomPaired] = useState(false);
  const [roomError, setRoomError] = useState(false);
  const deviceEpoch = useRef(0);
  const pairingEpoch = useRef(0);
  const roomEpoch = useRef(0);
  const bridge = localHostBridge();
  const local = !!machine.local;
  const canPairDevices = local && typeof bridge?.pairingCode === "function";
  const canPairRoom = local && typeof bridge?.pairRoom === "function";
  const usable = local ? status.reachable === true && machine.selectable === true : machine.state === "connected" && !!machine.pairingId;
  const list = () => local ? window.sidevoiceActions?.localHostDevices?.() : window.sidevoiceActions?.machineDevices?.(machine.pairingId!);
  const drop = (id: string) => local ? window.sidevoiceActions?.revokeLocalHostDevice?.(id) : window.sidevoiceActions?.revokeMachineDevice?.(machine.pairingId!, id);
  const pairingKey = machine.pairingId || "";
  const visibleDevices = usable && devicesFor === pairingKey ? devices : [];
  const visiblePairing = usable && pairingFor === pairingKey ? pairing : null;

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
    pairingEpoch.current++;
    roomEpoch.current++;
    setLoading(false);
    setConfirmId(null);
    setDevices([]);setDevicesFor(null);setPairing(null);setPairingFor(null);setPairingError(false);
    setDeviceNote("");setRoomUrl("");setRoomCode("");setRoomBusy(false);setRoomPaired(false);setRoomError(false);
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
  async function createCode() {
    if (!usable || !bridge?.pairingCode) return;
    const epoch = ++pairingEpoch.current;
    setPairingError(false);setPairing(null);setPairingFor(null);
    try { const next = await bridge.pairingCode();if (pairingEpoch.current === epoch && usable) {setPairing(next);setPairingFor(pairingKey)} }
    catch { if (pairingEpoch.current === epoch && usable) setPairingError(true); }
  }
  async function connectRoom(event: FormEvent) {
    event.preventDefault();
    if (!usable || !bridge?.pairRoom || !roomUrl.trim() || !roomCode.trim()) return;
    const epoch = ++roomEpoch.current;
    setRoomBusy(true);setRoomError(false);setRoomPaired(false);
    try { await bridge.pairRoom(roomUrl.trim(), roomCode.trim());if (roomEpoch.current === epoch && usable){setRoomPaired(true);setRoomCode("");setPairing(null)} }
    catch { if (roomEpoch.current === epoch && usable) setRoomError(true); }
    finally { if (roomEpoch.current === epoch) setRoomBusy(false); }
  }
  return (
    <div className="host-devices-panel">
      <div className="host-devices-head">
        <h4>{t("hosts.tab.devices")}</h4>
        {usable && <Button variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>{t("hosts.retry")}</Button>}
      </div>
      {usable && loading && <p className="muted" role="status">{t("hosts.working")}</p>}
      {(!usable || error) && <p className="muted" role="alert">{t("hosts.devices.unavailable")}</p>}
      {usable && deviceNote && <p className="muted" role="status">{deviceNote}</p>}
      {usable && !loading && !error && visibleDevices.length === 0 && <p className="muted">{t("hosts.devices.empty")}</p>}
      <ul className="host-device-list">
        {visibleDevices.map((device) => (
          <li className="host-device-row" key={device.device_id}>
            <div className="host-device-copy">
              <strong>{device.name || t(device.kind === "local" ? "hosts.devices.thisApp" : "hosts.devices.thisDevice")}</strong>
              {(device.kind === "local" || device.current) && <Badge tone="accent">{t(device.kind === "local" ? "hosts.devices.thisApp" : "hosts.devices.thisDevice")}</Badge>}
              {dateText(device.created_at) && <span className="muted">{t("hosts.devices.created", { date: dateText(device.created_at) })}</span>}
              {dateText(device.last_seen_at) && <span className="muted">{t("hosts.devices.lastSeen", { date: dateText(device.last_seen_at) })}</span>}
            </div>
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
      {!local && <section className="pair-another-device">
        <h4>{t("hosts.devices.pairAnother")}</h4>
        <p className="muted">{t("hosts.devices.pairOnMachine", { machine: name })}</p>
        <code className="pair-device-command">npx @sidevoice/uplink pair-device</code>
      </section>}
      {canPairDevices && <section className="pair-another-device">
        <h4>{t("hosts.devices.pairAnother")}</h4>
        {!visiblePairing && <Button disabled={!usable} onClick={() => void createCode()}>{t("hosts.devices.generateCode")}</Button>}
        {usable && pairingError && <p role="alert">{t("hosts.devices.codeFailed")}</p>}
        {visiblePairing && <div className="local-pairing-code" role="status">
          <p>{t(`hosts.devices.reach.${visiblePairing.reach}` as never)}</p>
          {/* Selected whole on a tap or a click, so copying it is one gesture: no button of its own. */}
          <output className="issued-pairing-code" aria-label={t("hosts.devices.codeSelect")}>{visiblePairing.code}</output>
          <p className="muted">{t("hosts.devices.codeExpires", { minutes: Math.ceil(visiblePairing.expires_in / 60) })}</p>
        </div>}
        {visiblePairing?.reach === "local-only" && <>
          {canPairRoom && <form className="room-pair-form" onSubmit={connectRoom}>
            <h5>{t("hosts.devices.roomTitle")}</h5>
            <p>{t("hosts.devices.roomInstructions")}</p>
            <label>{t("hosts.devices.roomUrl")}<input value={roomUrl} autoComplete="url" onChange={(event) => setRoomUrl(event.currentTarget.value)} /></label>
            <label>{t("hosts.devices.roomCode")}<input value={roomCode} autoComplete="off" onChange={(event) => setRoomCode(event.currentTarget.value)} /></label>
            <Button type="submit" variant="primary" disabled={!usable || roomBusy || !roomUrl.trim() || !roomCode.trim()}>{t("hosts.devices.pairRoom")}</Button>
            {roomPaired && <p role="status">{t("hosts.devices.roomPaired")}</p>}
            {roomError && <p role="alert">{t("hosts.devices.roomFailed")}</p>}
          </form>}
        </>}
      </section>}
    </div>
  );
}
