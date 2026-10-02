import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { MachinesIcon } from "../../components/ui/Icons";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion, type LocalPairingCode } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import type { HostDeviceView, MachineView } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { hostTranslator } from "../settings/host-i18n";
import { canRunLocalHostAction, hostCause, hostStatusText, localHostBridgeErrorText, runLocalHostAction, safeLocalHostCount, safeLocalHostStatusDetails, type LocalHostAction } from "../settings/local-host-status";

function dateText(value: string | number | null | undefined) {
  if (value == null) return "";
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MachineList() {
  const t = hostTranslator();
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [selected, setSelected] = useState<string | null>(null);
  const localMachine = machines.find((machine) => machine.local) ?? null;
  const hasLocalHost = !!localMachine || status.state !== "absent" || status.installed === true;
  const selectedMachine = selected ? machines.find((machine) => machine.id === selected && machine.local) ?? null : null;

  if (selectedMachine && localMachine) return <HostDetail machine={selectedMachine} onBack={() => setSelected(null)} />;

  return (
    <div className="machines" id="machines">
      <h3><MachinesIcon /> {t("hosts.title")}</h3>
      {machines.length === 0 && <p className="muted">{t("hosts.none")}</p>}
      <div className="machine-list">
        {machines.map((machine) => {
          const machineName = machine.host || (machine.local ? t("hosts.thisComputer") : t("hosts.unnamed"));
          const subtitle = machine.local
            ? machine.selectable && status.reachable === true ? status.state === "running" ? t("hosts.thisComputer") : t("hosts.connected") : hostStatusText(status, t)
            : machine.state === "checking" ? t("hosts.checking")
              : machine.state === "offline" || machine.state === "revoked" || machine.state === "failed"
              ? t("hosts.remoteNoResponse") : t("hosts.connected");
          return (
            <div className="machine-row" key={machine.id} data-state={machine.state} data-in-use={machine.inUse || undefined} data-local={machine.local || undefined}>
              <div className="machine-summary">
                <span className="machine-state" data-state={machine.state} aria-hidden="true"><span className="dot" /></span>
                <span className="machine-copy">
                  <span className="machine-name">{machineName}</span>
                  <span className="machine-brief muted">{[machine.inUse ? t("hosts.inUse") : "", subtitle].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="machine-actions">
                  {!machine.inUse && machine.selectable !== false && <Button variant="ghost" size="compact" className="machine-action" aria-label={t("hosts.use", { machine: machineName })}
                    onClick={() => window.sidevoiceActions?.chooseMachine(machine.pairingId || machine.id)}>{t("hosts.use", { machine: machineName })}</Button>}
                  {machine.local && <Button variant="ghost" size="compact" className="machine-action" aria-label={t("hosts.open", { machine: machineName })}
                    onClick={() => setSelected(machine.id)}>{t("hosts.open", { machine: machineName })}</Button>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pairing">
        <Button id="pair-device-open" variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.openPairing()}>{t("hosts.add")}</Button>
        <LocalHostInstallEntry showCta={!hasLocalHost} className="local-install-entry--machines" holdSuccess />
      </div>
    </div>
  );
}

function HostDetail({ machine, onBack }: { machine: MachineView; onBack: () => void }) {
  const t = hostTranslator();
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [tab, setTab] = useState<"status" | "devices">("status");
  return (
    <section className="host-detail" aria-labelledby="host-detail-title">
      <Button variant="ghost" size="compact" onClick={onBack}>{t("hosts.pageBack")}</Button>
      <header className="host-detail-header">
        <div><h3 id="host-detail-title">{machine.host || t("hosts.unnamed")}</h3><p className="muted">{t("hosts.thisComputer")}</p></div>
      </header>
      <div className="host-tabs" role="tablist" aria-label={t("hosts.title")}>
        <Button variant="ghost" role="tab" aria-selected={tab === "status"} onClick={() => setTab("status")}>{t("hosts.tab.status")}</Button>
        <Button variant="ghost" role="tab" aria-selected={tab === "devices"} onClick={() => setTab("devices")}>{t("hosts.tab.devices")}</Button>
      </div>
      {tab === "status" ? <LocalHostStatusPanel status={status} /> : <LocalHostDevicesPanel machine={machine} />}
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

function LocalHostDevicesPanel({ machine }: { machine: MachineView }) {
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
  const [pairingCopied, setPairingCopied] = useState(false);
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
  const canPairDevices = typeof bridge?.pairingCode === "function";
  const canPairRoom = typeof bridge?.pairRoom === "function";
  const usable = status.reachable === true && machine.selectable === true;
  const pairingKey = machine.pairingId || "";
  const visibleDevices = usable && devicesFor === pairingKey ? devices : [];
  const visiblePairing = usable && pairingFor === pairingKey ? pairing : null;

  async function refresh() {
    const epoch = ++deviceEpoch.current;
    if (!usable) { setError(true);setDevices([]);return; }
    const action = window.sidevoiceActions?.localHostDevices;
    if (!action) { setError(true);return; }
    setLoading(true);setError(false);
    try { const next = await action();if (deviceEpoch.current === epoch && usable) {setDevices(next);setDevicesFor(pairingKey)} }
    catch { if (deviceEpoch.current === epoch && usable) setError(true); }
    finally { if (deviceEpoch.current === epoch) setLoading(false); }
  }
  useEffect(() => {
    deviceEpoch.current++;
    pairingEpoch.current++;
    roomEpoch.current++;
    setLoading(false);
    setConfirmId(null);
    setDevices([]);setDevicesFor(null);setPairing(null);setPairingFor(null);setPairingError(false);setPairingCopied(false);
    setDeviceNote("");setRoomUrl("");setRoomCode("");setRoomBusy(false);setRoomPaired(false);setRoomError(false);
    if (!usable) {
      setError(true);
      return;
    }
    setError(false);
    void refresh();
  }, [usable, machine.pairingId]);
  async function revoke(id: string) {
    const action = window.sidevoiceActions?.revokeLocalHostDevice;
    if (!usable || !action) return;
    const epoch = ++deviceEpoch.current;
    setLoading(true);setError(false);
    try {
      await action(id);
      if (deviceEpoch.current !== epoch || !usable) return;
      setConfirmId(null);setDeviceNote(t("hosts.devices.revoked"));
      const next = await window.sidevoiceActions?.localHostDevices?.() ?? [];
      if (deviceEpoch.current === epoch && usable) {setDevices(next);setDevicesFor(pairingKey)}
    }
    catch { if (deviceEpoch.current === epoch && usable) setError(true); }
    finally { if (deviceEpoch.current === epoch) setLoading(false); }
  }
  async function createCode() {
    if (!usable || !bridge?.pairingCode) return;
    const epoch = ++pairingEpoch.current;
    setPairingError(false);setPairingCopied(false);setPairing(null);setPairingFor(null);
    try { const next = await bridge.pairingCode();if (pairingEpoch.current === epoch && usable) {setPairing(next);setPairingFor(pairingKey)} }
    catch { if (pairingEpoch.current === epoch && usable) setPairingError(true); }
  }
  async function copyPairingCode() {
    if (!usable || !visiblePairing) return;
    try { await navigator.clipboard.writeText(visiblePairing.code);setPairingCopied(true);setDeviceNote(t("hosts.devices.codeCopied")); }
    catch { setPairingCopied(false);setError(true); }
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
        {usable && <Button variant="ghost" size="compact" disabled={loading} onClick={() => void refresh()}>{t("hosts.retry")}</Button>}
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
              {(device.kind === "local" || device.current) && <span className="muted">{t(device.kind === "local" ? "hosts.devices.thisApp" : "hosts.devices.thisDevice")}</span>}
              {dateText(device.created_at) && <span className="muted">{t("hosts.devices.created", { date: dateText(device.created_at) })}</span>}
              {dateText(device.last_seen_at) && <span className="muted">{t("hosts.devices.lastSeen", { date: dateText(device.last_seen_at) })}</span>}
            </div>
            {usable && device.kind !== "local" && (confirmId === device.device_id ? (
              <span className="device-revoke-confirm" role="group" aria-label={t("hosts.devices.revoke", { device: device.name || device.device_id })}>
                <span className="muted">{t("hosts.devices.revokeConfirm")}</span>
                <Button variant="danger" size="compact" disabled={loading} onClick={() => void revoke(device.device_id)}>{t("hosts.devices.revoke")}</Button>
                <Button variant="ghost" size="compact" disabled={loading} onClick={() => setConfirmId(null)}>{t("hosts.cancel")}</Button>
              </span>
            ) : <Button variant="ghost" size="compact" disabled={loading} onClick={() => setConfirmId(device.device_id)}>{t("hosts.devices.revoke", { device: device.name || device.device_id })}</Button>)}
          </li>
        ))}
      </ul>
      {canPairDevices && <section className="pair-another-device">
        <h4>{t("hosts.devices.pairAnother")}</h4>
        <Button variant="primary" disabled={!usable} onClick={() => void createCode()}>{t("hosts.devices.generateCode")}</Button>
        {usable && pairingError && <p role="alert">{t("hosts.devices.codeFailed")}</p>}
        {visiblePairing && <div className="local-pairing-code" role="status">
          <p>{t(`hosts.devices.reach.${visiblePairing.reach}` as never)}</p>
          <output>{visiblePairing.code}</output>
          {typeof navigator.clipboard?.writeText === "function" && <Button variant="ghost" size="compact" disabled={!usable} onClick={() => void copyPairingCode()}>{pairingCopied ? t("hosts.devices.codeCopied") : t("hosts.devices.copyCode")}</Button>}
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
