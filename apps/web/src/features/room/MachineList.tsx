import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { AddIcon, EditIcon, NotEncryptedIcon, OtherMachineIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { Input } from "../../components/ui/Input";
import { currentDeviceName } from "../../state/device-name";
import { InfoTip } from "../../components/ui/InfoTip";
import { Tooltip } from "../../components/ui/Tooltip";
import { Switch } from "../../components/ui/Switch";
import { Badge } from "../../components/ui/Badge";
import { Section } from "../../components/ui/Card";
import "./machines.css";
import { desktopBuild, localHostBridge, type LocalHostStatus } from "../../services/desktop-host";
import type { HostDeviceView, MachineView } from "../../state/room-types";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { LocalHostInstallEntry } from "../pairing/LocalHostInstallEntry";
import { useThisComputerSection } from "../../state/this-computer";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
import { NewAtEnd, NewOnIcon, useHighlights } from "../highlights/highlights";
import { motionOf, useSettingsLevels } from "../settings/settings-levels";
import { MenuRow } from "../settings/SettingsMenu";
import { machineStatus } from "../settings/machine-status";
import { ThisDeviceVersion } from "../settings/UpdatesSettings";
import { MachineEntryCopy, MachineEntryState, MachineState, StateOnIcon, machineEntryName, machineEntryTitle } from "../settings/MachineState";
import { canRunLocalHostAction, hostCause, hostStatusText, runLocalHostAction, safeLocalHostStatusDetails, type LocalHostAction } from "../settings/local-host-status";

function dateText(value: string | number | null | undefined) {
  if (value == null) return "";
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** A machine's name: the one it has here, else this computer's or an unnamed machine's. */
export function machineName(machine: MachineView, t: HostTranslate) {
  return machine.host || (machine.local ? t("hosts.thisComputer") : t("hosts.unnamed"));
}

/* The paired machines, as Settings' own navigation lists them (MachineNav): under Machines a sub-entry per machine —
 * its name on one line and its state in words on the next (machineStatus words it, here as everywhere), the whole of
 * it in its tooltip and in its name to a screen reader — and Add a machine last. The machine chosen has its page in the
 * pane (MachineList): its state, this computer's service (the local one), its agents, the devices paired with it
 * (pairing goes from a device to the machine: Add a machine, and pair-device on the machine), and forgetting it.
 * Machines itself is the first machine, or, with none, a word and Add. On a phone, whose Settings is a menu of levels
 * (settings-levels.tsx), Machines is always a list — a row each, its state in words under its name, Add a machine last
 * — and a machine is a page of its own under it. */

/** How many new things (agents it found) are under a machine: its entry's mark. */
function useNotice() {
  const news = useHighlights();
  return (machine: MachineView) => machine.pairingId ? news.filter((item) => item.machine === machine.pairingId).length : 0;
}

/** The machines Machines lists: every one, or, with this computer in its own section, the other machines. */
function useListedMachines() {
  const own = useThisComputerSection();
  const machines = useRoomStore((state) => state.machines);
  return own ? machines.filter((machine) => !machine.local) : machines;
}

/** What Machines' row says under its name in a phone's Settings: none yet; the one machine and its state; how many, and
 *  how many of them connected. */
export function useMachinesSummary() {
  const t = hostTranslator();
  const own = useThisComputerSection();
  const machines = useListedMachines();
  const status = useRoomStore((state) => state.facts.localHostStatus);
  if (!machines.length) return t("settings.summary.machinesNone");
  if (machines.length > 1) return t("settings.summary.machines", { n: machines.length, online: machines.filter((machine) => machine.state === "connected").length });
  return t("settings.summary.machine", { machine: machineName(machines[0], t), state: machineStatus(machines[0], status, own, t).short });
}

/** The machine shown: the one chosen, else the first. */
function shownMachine(machines: MachineView[], picked: string | null) {
  return (picked ? machines.find((machine) => machine.id === picked) : null) ?? machines[0] ?? null;
}

/** The machines under Machines in Settings' navigation, and Add a machine after them. */
export function MachineNav({ current }: { current: boolean }) {
  const t = hostTranslator();
  // With this device in a section of its own, these are the remote machines, and said so.
  const own = useThisComputerSection();
  const machines = useListedMachines();
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const picked = useRoomStore((state) => state.facts.machinesView.machine);
  const store = useContext(RoomStoreContext);
  const notice = useNotice();
  const shown = shownMachine(machines, picked);
  return (
    <div className="machine-nav">
      {machines.map((machine) => {
        const name = machineName(machine, t);
        // This computer, listed here only where it has no section of its own, reads as any machine.
        const state = machineStatus(machine, status, own, t);
        const isNew = notice(machine);
        return (
          <button type="button" key={machine.id} className="ui-nav-item ui-nav-item--sub machine-entry" title={machineEntryTitle(name, state, t)}
            aria-label={machineEntryName(name, state, isNew, t)}
            data-name={name} data-state={machine.state} data-local={machine.local || undefined}
            aria-current={current && shown?.id === machine.id ? "page" : undefined}
            onClick={() => store?.patch({ settingsSection: "machines", machinesView: { machine: machine.id } })}>
            {/* Its icon — this computer's, or another machine's, as the setup's two choices show them — with the connected
                dot and the "new" mark on it; then its name and, where it is said, its state. An entry never grows past
                the column. */}
            <span className="machine-nav-icon" title={machine.local ? t("hosts.thisComputer") : undefined}>
              <NewOnIcon icon={<StateOnIcon icon={machine.local ? <ThisComputerIcon size={18} /> : <OtherMachineIcon size={18} />} status={state} />} isNew={isNew} />
            </span>
            <MachineEntryCopy name={name} status={state} isNew={isNew} />
          </button>
        );
      })}
      <button type="button" className="ui-nav-item ui-nav-item--sub machine-nav-add" title={t(own ? "hosts.addRemote" : "hosts.add")}
        aria-label={t(own ? "hosts.addRemote" : "hosts.add")} onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("hosts.addShort")}</button>
    </div>
  );
}

export function MachineList() {
  const t = hostTranslator();
  const machines = useListedMachines();
  const own = useThisComputerSection();
  const agentRequest = useRoomStore((state) => state.facts.settingsAgentRequest);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const picked = useRoomStore((state) => state.facts.machinesView.machine);
  const store = useContext(RoomStoreContext);
  const localMachine = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
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

  const levels = useSettingsLevels();
  const notice = useNotice();
  // The machine whose page a phone shows went (forgotten here, or revoked elsewhere): back to the list, without a slide —
  // what it showed is gone — and, forgotten here, said so: its page and its control went with it.
  const forgetting = useRef<{ id: string; name: string } | null>(null);
  const gone = levels.phone && levels.level === 3 && !!picked && !machines.some((machine) => machine.id === picked);
  useEffect(() => {
    if (!gone) return;
    if (forgetting.current?.id === picked) levels.say(t("settings.machineForgotten", { machine: forgetting.current.name }));
    forgetting.current = null;
    levels.back({ instantly: true });
  }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = machines.length === 0 && <div className="machines-empty"><p className="muted">{t(own ? "hosts.noneOther" : "hosts.none")}</p>
    <Button id="pair-device-open" variant="primary" title={t(own ? "hosts.addRemote" : "hosts.add")} aria-label={t(own ? "hosts.addRemote" : "hosts.add")}
      onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("hosts.addShort")}</Button></div>;
  // Preparing this computer is its own section's, when it has one.
  const install = !own && <LocalHostInstallEntry showCta={!hasLocalHost} className="local-install-entry--machines" holdSuccess />;
  if (levels.phone) {
    const page = picked ? machines.find((machine) => machine.id === picked) ?? null : null;
    // The list and a machine's page share the pane's scroll: during a slide both are drawn, the one left held where it
    // was scrolled (`shift`).
    const sub = levels.motion && levels.motion.from > 1 && levels.motion.to > 1 ? levels.motion : null;
    const held = (level: 2 | 3) => (motionOf(sub, level)?.startsWith("out") ? { "--level-shift": `${sub!.shift}px` } as CSSProperties : undefined);
    return (
      <Section id="machines" title={t(own ? "hosts.titleRemote" : "hosts.title")}>
        <div className="settings-sublevels">
          <div className="settings-sublevel" hidden={levels.level !== 2 && !sub} inert={motionOf(sub, 2)?.startsWith("out") || undefined} data-motion={motionOf(sub, 2)} style={held(2)}>
            <p className="ui-section-description">{t("hosts.description")}</p>
            {machines.length > 0 && <ul className="settings-menu machines-menu">
              {machines.map((machine) => {
                const name = machineName(machine, t);
                // This computer, listed here only where it has no section of its own, reads as any machine.
                const state = machineStatus(machine, status, own, t);
                const isNew = notice(machine);
                return <li key={machine.id}>
                  <MenuRow className="machine-entry" data-machine={machine.id} data-name={name} data-state={machine.state} data-local={machine.local || undefined}
                    aria-label={machineEntryName(name, state, isNew, t)}
                    icon={<NewOnIcon icon={<StateOnIcon icon={machine.local ? <ThisComputerIcon size={20} /> : <OtherMachineIcon size={20} />} status={state} />} isNew={isNew} />}
                    label={<><span className="machine-nav-name">{name}</span>{state.insecure && <span className="machine-nav-insecure" aria-hidden="true"><NotEncryptedIcon size={14} /></span>}</>}
                    summary={<MachineEntryState status={state} />} end={<NewAtEnd isNew={isNew} />}
                    onClick={() => levels.open("machines", machine.id)} />
                </li>;
              })}
              {/* A dialog, not a page: no chevron. A machine paired there joins the list above it. */}
              <li><MenuRow className="settings-menu-row--add" icon={<AddIcon size={20} />} label={t(own ? "hosts.addRemote" : "hosts.add")} chevron={false}
                onClick={() => window.sidevoiceActions?.openPairing()} /></li>
            </ul>}
            {empty}
            {install}
          </div>
          <div className="settings-sublevel" hidden={levels.level !== 3 && !sub} inert={motionOf(sub, 3)?.startsWith("out") || undefined} data-motion={motionOf(sub, 3)} style={held(3)}>
            {page && <HostDetail machine={page} name={machineName(page, t)} onForget={() => { forgetting.current = { id: page.id, name: machineName(page, t) }; }} />}
          </div>
        </div>
      </Section>
    );
  }
  const shown = shownMachine(machines, picked);
  return (
    <Section id="machines" title={t(own ? "hosts.titleRemote" : "hosts.title")} description={t("hosts.description")}>
      {/* Hidden on a desktop, where the machines are under Machines in Settings' own navigation. */}
      <div className="machines-inline"><MachineNav current /></div>
      {empty}
      {shown && <HostDetail machine={shown} name={machineName(shown, t)} />}
      {install}
    </Section>
  );
}

/** This computer as a section of its own: not prepared, preparing it — the setup's
 *  block; prepared, its page as Machines shows it — whether it answers, its Sidevoice service, its agents, the devices
 *  paired with it. */
export function ThisComputerSettings() {
  const t = hostTranslator();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const store = useContext(RoomStoreContext);
  // Titled with this device's name; renaming it is General's (its one place), where the pencil takes you.
  const name = currentDeviceName((_, params) => t("pair.deviceNameBrowser", params));
  const rename = () => store?.patch({ settingsSection: "general", settingsFocus: "device-name" });
  return (
    <Section id="this-computer" title={<span className="this-device-title">{name}
      <Button variant="ghost" tone="neutral" size="icon-sm" className="this-device-rename" aria-label={t("hosts.renameDevice")} title={t("hosts.renameDevice")} onClick={rename}><EditIcon size={14} /></Button>
    </span>}>
      {local ? <HostDetail machine={local} name={machineName(local, t)} untitled />
        : <div className="this-computer-prepare">
            <p>{t("localInstall.description")}</p>
            <LocalHostInstallEntry showCta source="no-machine" holdSuccess anotherMachine={false} className="local-install-entry--machines" />
          </div>}
    </Section>
  );
}

/** Reached without encryption, as the person agreed when pairing, and why it matters: said in words on the machine's
 *  page for as long as it is so, after its state. */
function NotEncrypted() {
  const t = hostTranslator();
  return <><span className="host-detail-sep" aria-hidden="true">·</span><span className="host-insecure"><NotEncryptedIcon size={14} />{t("hosts.notEncrypted")}</span>
    <InfoTip label={t("hosts.notEncryptedAbout")}>{t("hosts.notEncryptedInfo")}</InfoTip></>;
}

/** A machine's page: whether it answers and how, then this computer's service (the local one), its agents, the devices
 *  paired with it, and forgetting it. */
function HostDetail({ machine, name, untitled = false, onForget }: { machine: MachineView; name: string; untitled?: boolean; onForget?: () => void }) {
  const t = hostTranslator();
  const own = useThisComputerSection();
  // Renaming the machine on this device: the name being typed, or null.
  const [naming, setNaming] = useState<string | null>(null);
  // Not a form: Settings is one, and a form inside it would submit the page.
  const saveAlias = () => { window.sidevoiceActions?.renameMachine?.(machine.pairingId || machine.id, naming?.trim() || null); setNaming(null); };
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const agentRequest = useRoomStore((state) => state.facts.settingsAgentRequest);
  const agents = useRef<HTMLElement>(null);
  // Asked for its agents (a new agent waiting): its agents in view.
  useEffect(() => { if (agentRequest?.fp && agentRequest.fp === machine.pairingId) agents.current?.scrollIntoView?.({ block: "start" }); }, [agentRequest, machine.pairingId]);
  // Its state, as This device's section says it where this is that section's page; the hint of what to do, if any.
  const state = machineStatus(machine, status, own, t);
  return (
    <section className="host-detail" aria-label={name}>
      <header className="host-detail-header">
        <span className="machine-icon" aria-hidden="true">{machine.local ? <ThisComputerIcon size={20} /> : <OtherMachineIcon size={20} />}</span>
        <div className="host-detail-copy">
          {untitled ? null : naming !== null ? <div className="host-rename" role="group" aria-label={t("hosts.renameLabel")}>
              <Input aria-label={t("hosts.renameLabel")} value={naming} maxLength={60} autoFocus onChange={(event) => setNaming(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNaming(null); } if (event.key === "Enter") { event.preventDefault(); saveAlias(); } }} />
              <Button size="sm" variant="primary" onClick={saveAlias}>{t("hosts.devices.renameSave")}</Button>
              <Button size="sm" variant="ghost" tone="neutral" onClick={() => setNaming(null)}>{t("hosts.cancel")}</Button>
            </div>
            : <h3 className="host-name">{name}
              {machine.pairingId && <Button variant="ghost" tone="neutral" size="icon-sm" className="host-rename-open" aria-label={t("hosts.rename", { machine: name })} title={t("hosts.rename", { machine: name })}
                onClick={() => setNaming(name)}><EditIcon size={14} /></Button>}
            </h3>}
          {/* Renamed here: whose name it really is, and the way back to it. */}
          {!untitled && machine.alias && naming === null && <p className="host-alias muted">{t("hosts.aliasOf", { name: machine.machineHost ?? "" })}
            <Button variant="ghost" size="sm" onClick={() => window.sidevoiceActions?.renameMachine?.(machine.pairingId || machine.id, null)}>{t("hosts.aliasReset")}</Button></p>}
          {/* Its state at length, under its name, and not encrypted after it. A remote machine's is said as it changes;
              this computer's service card says its own, so the page has one live state. */}
          <p className="host-detail-state"><MachineState status={state} form="long" live={!machine.local} />{state.insecure && <NotEncrypted />}</p>
          {state.hint && <p className="host-detail-hint muted">{state.hint}</p>}
        </div>
      </header>
      {/* Sidevoice on the machine, as a card on every machine's page: this computer's with its controls; another's to read. */}
      <section className="host-section" aria-labelledby={"host-status-" + machine.id}>
        {machine.local ? <LocalHostStatusPanel machine={machine} status={status} titleId={"host-status-" + machine.id} name={machine.host || null} />
          : <RemoteHostCard machine={machine} name={name} titleId={"host-status-" + machine.id} />}
      </section>
      <section className="host-section" ref={agents}>
        <HostAgentsPanel fp={machine.pairingId ?? null} />
      </section>
      <section className="host-section">
        <MachineDevicesPanel machine={machine} name={name} />
      </section>
      {!machine.local && machine.pairingId && <ForgetMachine machine={machine} name={name} onForget={onForget} />}
    </section>
  );
}

/** Forgetting a remote machine, at its page's foot: asked first — it unpairs this device from it — and, the machine
 *  not answering, done here and told to it when it is back (the controller keeps what it needs to). `onForget`: told as
 *  it is forgotten (a phone's Settings says so once it is gone). */
function ForgetMachine({ machine, name, onForget }: { machine: MachineView; name: string; onForget?: () => void }) {
  const t = hostTranslator();
  const [asking, setAsking] = useState(false);
  const open = useRef<HTMLButtonElement>(null);
  return (
    <section className="host-section host-forget" aria-label={t("hosts.forget", { machine: name })}>
      {asking ? <div className="device-revoke-confirm" role="group" aria-label={t("hosts.forget", { machine: name })}>
          <p>{t("hosts.forgetHint", { machine: name })}</p>
          <p className="muted">{machine.state === "connected" ? t("hosts.confirmForget") : t("hosts.confirmForgetOffline", { machine: name })}</p>
          <div className="host-forget-actions">
            <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => { setAsking(false); requestAnimationFrame(() => open.current?.focus()); }}>{t("hosts.cancel")}</Button>
            <Button variant="danger" size="sm" onClick={() => { onForget?.(); void window.sidevoiceActions?.forgetMachine(machine.pairingId!); }}>{t("hosts.forgetConfirm")}</Button>
          </div>
        </div>
        : <Button ref={open} variant="danger" size="sm" onClick={() => setAsking(true)}>{t("hosts.forget", { machine: name })}</Button>}
    </section>
  );
}

/** Another machine's Sidevoice, to read: where the machine says, its Sidevoice version. How this device reaches it is
 *  its page's header's, two blocks up; no controls: it is run there. */
function RemoteHostCard({ machine, name, titleId }: { machine: MachineView; name: string; titleId: string }) {
  const t = hostTranslator();
  const info = useRoomStore((state) => machine.pairingId ? state.facts.remoteHostStatus?.[machine.pairingId] : undefined);
  useEffect(() => { if (machine.pairingId && machine.state === "connected") void window.sidevoiceActions?.loadMachineInfo?.(machine.pairingId); }, [machine.pairingId, machine.state]);
  return (
    <div className="host-status-card" data-remote>
      <div className="host-status-head">
        <h4 id={titleId}>{t("hosts.serviceOn", { machine: name })}</h4>
      </div>
      {info?.version && <dl className="host-status-facts">
        {info?.version && <div className="host-status-product">{t("hosts.productVersion", { version: info.version })}</div>}
      </dl>}
    </div>
  );
}

/* This computer's service as a status card: its state with its dot, first, in This device's words (machineStatus, as
 * the app reads the service here), said as it changes; its version ("Sidevoice 0.8.1");
 * Start at sign-in as a switch; and the card's actions — Restart and Stop while it runs (Stop asks first when calls are
 * active, as they end), Start when stopped, Retry or Reinstall when it failed. What failed, its log and details below. */
function LocalHostStatusPanel({ machine, status, titleId, name }: { machine: MachineView; status: LocalHostStatus; titleId: string; name: string | null }) {
  const t = hostTranslator();
  const [busy, setBusy] = useState<LocalHostAction | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const details = safeLocalHostStatusDetails(status);
  const statusMessage = hostStatusText(status, t);
  const hasMethod = (action: LocalHostAction) => canRunLocalHostAction(action);
  const state = machineStatus(machine, status, true, t);
  // Unknown is not none: Stop asks unless the service says no call is on.
  const calls = details.calls;
  const buttons: { action: LocalHostAction; label: string; variant: "primary" | "secondary" | "ghost" }[] = [];
  if (status.state === "running") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.restart"), variant: "secondary" });
    if (hasMethod("stop")) buttons.push({ action: "stop", label: t("hosts.stop"), variant: "ghost" });
  } else if (status.state === "not-installed") {
    if (hasMethod("serviceInstall")) buttons.push({ action: "serviceInstall", label: t("hosts.start"), variant: "primary" });
  } else if (status.state === "stopped-by-person") {
    if (hasMethod("start")) buttons.push({ action: "start", label: t("hosts.start"), variant: "primary" });
  } else if (status.state === "backoff") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry"), variant: "primary" });
  } else if (status.state === "failed" || status.state === "service-failed") {
    if (hasMethod("restart")) buttons.push({ action: "restart", label: t("hosts.retry"), variant: "primary" });
  } else if (status.state === "refused") {
    if (hasMethod("reconnect")) buttons.push({ action: "reconnect", label: t("hosts.reconnect"), variant: "primary" });
  }
  // Any failure has the repair path too, whatever the system's service says of itself: reinstalling.
  if (["failed", "service-failed", "refused", "incompatible"].includes(status.state) && hasMethod("serviceInstall"))
    buttons.push({ action: "serviceInstall", label: t("hosts.reinstall"), variant: "secondary" });
  const installed = status.installed ?? (status.service !== "none" && status.service !== undefined);
  const loginAction: LocalHostAction | null = status.state === "absent" || (!installed && status.state === "not-installed") ? null
    : installed ? hasMethod("serviceUninstall") ? "serviceUninstall" : null
      : hasMethod("serviceInstall") ? "serviceInstall" : null;
  async function run(action: LocalHostAction) {
    if (busy) return;
    setBusy(action);setNote("");
    try { await runLocalHostAction(action);if (action === "stop") setConfirmStop(false); }
    catch { setNote(t("hosts.actionFailed")); }
    // Its buttons change with the state: the focus goes back to the card's title rather than to the page.
    finally { setBusy(null); requestAnimationFrame(() => document.getElementById(titleId)?.focus()); }
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
        {/* "Sidevoice on MacBook"; with no name to say yet (its pairing lost), "Sidevoice on this computer". */}
        <h4 id={titleId} tabIndex={-1}>{name ? t("hosts.serviceOn", { machine: name }) : t("hosts.section.service")}</h4>
        <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{state.short}</span>
      </div>
      {/* The facts, compact; then what the state means where it says more than its word. */}
      <dl className="host-status-facts">
        {/* One version — the app's, the Sidevoice the person installed, else its service's (never the core's or the
            connector's) — and whether it is up to date: Update available is a link to its row in Updates, where
            everything that updates is. */}
        <ThisDeviceVersion t={t} />
      </dl>
      {status.state !== "running" && <p className="host-status-summary">{statusMessage}</p>}
      {/* Stopped by the person: Start brings it back (the app runs the service), and without start at sign-in it would not
          come back by itself either. Only this computer's machine has this card: a remote one is never stopped from here. */}
      {status.state === "stopped-by-person" && <p className="muted">{t(installed ? "hosts.stoppedNote" : "hosts.stoppedNoLoginNote")}</p>}
      {cause && status.state === "backoff" && <p className="muted">{cause}</p>}
      {status.failure && failed && (details.attempts !== undefined || !!failureAt) && (
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
            <Button variant="ghost" tone="neutral" size="sm" autoFocus disabled={!!busy} onClick={() => { setConfirmStop(false); requestAnimationFrame(() => document.getElementById(titleId)?.focus()); }}>{t("hosts.cancel")}</Button>
            <Button variant="danger" size="sm" loading={busy === "stop"} onClick={() => void run("stop")}>{t("hosts.stop")}</Button>
          </span>
        </div>
        : (buttons.length > 0 || failed) && <div className="host-action-list host-status-actions">
          {buttons.map(({ action, label, variant }) => <Button key={action} size="sm" variant={variant} tone={action === "stop" ? "danger" : undefined} loading={busy === action} disabled={!!busy && busy !== action}
            onClick={() => action === "stop" && calls !== 0 ? setConfirmStop(true) : void run(action)}>{label}</Button>)}
          {failed && hasMethod("revealLog") && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run("revealLog")}>{t("hosts.viewLog")}</Button>}
          {failed && typeof navigator.clipboard?.writeText === "function" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void copyDetails()}>{copied ? t("hosts.detailsCopied") : t("hosts.copyDetails")}</Button>}
        </div>}
      {note && <p className="muted" role="status">{note}</p>}
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
  // This device by the name it has here (its setting, else its default), however the machine last heard it.
  useRoomStore((state) => state.facts.deviceName);
  const ownName = currentDeviceName((_, params) => t("pair.deviceNameBrowser", params));
  const shownName = (device: HostDeviceView) => (device.current && ownName) || device.name || t("hosts.devices.thisDevice");
  const drop = (id: string) => local ? window.sidevoiceActions?.revokeLocalHostDevice?.(id) : window.sidevoiceActions?.revokeMachineDevice?.(machine.pairingId!, id);
  const pairingKey = machine.pairingId || "";
  // A machine's own Sidevoice (paired with itself) is never listed: on this computer's page that is this device itself.
  const visibleDevices = usable && devicesFor === pairingKey ? devices.filter((device) => device.kind !== "local") : [];

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
      {usable && error && !loading && <Alert tone="danger" live title={t("hosts.devices.loadFailed")}
        action={<Button size="sm" onClick={() => void refresh()}>{t("hosts.retry")}</Button>} />}
      {usable && deviceNote && <p className="muted" role="status">{deviceNote}</p>}
      {usable && !loading && !error && visibleDevices.length === 0 && <p className="muted">{t(local ? "hosts.devices.emptyOthers" : "hosts.devices.empty")}</p>}
      <ul className="host-device-list">
        {visibleDevices.map((device) => (
          <li className="host-device-row" key={device.device_id}>
            <div className="host-device-copy">
              {/* The name and, on the same line, whether it is this device: the name gives way (an ellipsis), the tag never. */}
              <span className="host-device-title">
                {/* This device by the name it has now (General's), however the machine last heard it. */}
                <strong title={shownName(device)}>{shownName(device)}</strong>
                {device.current && <Badge tone="accent">{t("hosts.devices.thisDevice")}</Badge>}
              </span>
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
    </div>
  );
}
