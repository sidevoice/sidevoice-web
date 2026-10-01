/* One host's page (ONBOARDING_AND_HOSTS.md §5.3): Estado, Agentes, Integraciones, Dispositivos, Voz y transcripción.
 * Everything shown is that host's, asked of that host and kept under its fingerprint (§4.8), so a host that
 * answers late never fills another host's page. */
import { createContext, useContext, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { HarnessIcon } from "../../components/ui/Icons";
import { currentLanguage, useT } from "../../i18n";
import type { BridgeResult, LocalHostState, PairingCodeAnswer } from "../../services/desktop-host";
import { stageContext } from "../../state/room-session-state.js";
import { stageLabel } from "../../state/stage-settings.js";
import { RoomStoreContext, useRoomStore, type RoomStore } from "../../state/room-store";
import { failurePhrase, localSubtitle, remoteSubtitle, type StoredPairing } from "../../state/hosts/host-list";
import { useHosts, useHostsController, type HostTab } from "../../state/hosts/hosts-store";
import { effectiveStage, stageSource, type Task } from "../../state/hosts/stage-scope";
import { IntegrationList } from "../settings/IntegrationList";
import { agentStatusKey, ManualConfig } from "../onboarding/Wizard";
import { CopyButton, formatWhen, HostDot, PhraseText } from "./common";

/** Draws a pairing code as a QR. The web carries no encoder yet; with none provided, the code is shown as text only. */
export const QrRendererContext = createContext<((code: string) => React.ReactNode) | null>(null);

/** Who renders a host's integrations: a room store scoped to that host, kept by whoever wires the page to the room. */
export const IntegrationScopeContext = createContext<{ storeFor(fp: string): RoomStore } | null>(null);

const TABS: HostTab[] = ["status", "agents", "integrations", "devices", "stages"];

export function HostPage({ fp }: { fp: string }) {
  const t = useT();
  const hosts = useHostsController();
  const entry = useHosts((s) => s.list.entries.find((e) => e.fp === fp) ?? null);
  const row = useHosts((s) => s.rows.find((r) => r.fp === fp) ?? null);
  const tab = useHosts((s) => s.settings.tab);
  const local = useHosts((s) => s.local);
  if (!entry || !row) return <p className="muted">{t("host.gone")}</p>;
  const route = entry.local ? t("host.thisComputer") : <PhraseText phrase={row.subtitle} />;
  return (
    <section className="host-page" aria-labelledby="host-title">
      <header className="host-head">
        <HostDot dot={row.dot} />
        <div>
          <h3 id="host-title">{entry.name || t("hosts.unnamed")}{row.inUse && <span className="badge badge-in-use">{t("hosts.inUse")}</span>}</h3>
          <p className="muted small host-facts">
            <span>{route}</span>
            {entry.local && local?.core?.version && <span> · {t("host.version", { version: local.core.version })}</span>}
            <span> · <code title={fp}>{fp.slice(0, 8)}</code></span>
          </p>
        </div>
        {!row.inUse && <Button variant="ghost" size="compact" disabled={!row.usable} onClick={() => hosts.use(fp)}>{t("hosts.use")}</Button>}
      </header>
      <div className="host-tabs" role="tablist" aria-label={t("host.sections")}>
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`host-tab-${id}`} aria-selected={tab === id} aria-controls="host-tabpanel"
            tabIndex={tab === id ? 0 : -1} onClick={() => hosts.openSettings("host", fp, id)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              const to = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : step ? TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length] : null;
              if (!to) return;
              event.preventDefault();
              hosts.openSettings("host", fp, to);
              requestAnimationFrame(() => document.getElementById(`host-tab-${to}`)?.focus());
            }}>
            {t("host.tab." + id)}{id === "agents" && row.newAgent && <span className="badge-dot" aria-label={t("hosts.newAgent")} />}
          </button>
        ))}
      </div>
      <div className="host-tabpanel" id="host-tabpanel" role="tabpanel" aria-labelledby={`host-tab-${tab}`}>
        {tab === "status" && (entry.local ? <LocalStatus /> : <RemoteStatus fp={fp} pairing={entry.pairing as StoredPairing} />)}
        {tab === "agents" && <AgentsTab fp={fp} />}
        {tab === "integrations" && <IntegrationsTab fp={fp} />}
        {tab === "devices" && <DevicesTab fp={fp} local={entry.local} />}
        {tab === "stages" && <StagesTab fp={fp} inUse={row.inUse} />}
      </div>
    </section>
  );
}

// ----- Estado -----
function useBridgeCall() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(name: string, call: () => Promise<BridgeResult | undefined>) {
    setBusy(name); setError(null);
    try {
      const result = await call();
      if (result && !result.ok) setError(result.error.key);
    } finally { setBusy(null); }
  }
  return { busy, error, run };
}

function detailsText(local: LocalHostState, t: (k: string, p?: Record<string, string | number | undefined>) => string): string {
  const f = local.failure;
  return [
    "Sidevoice · " + t("host.thisComputer"),
    "state: " + local.state,
    f ? "key: " + f.key + (f.detail ? " (" + f.detail + ")" : "") : "",
    f?.step ? "step: " + f.step : "",
    f?.attempts ? "attempts: " + f.attempts : "",
    f?.at ? "at: " + new Date(f.at * 1000).toISOString() : "",
    local.core ? "core: " + local.core.version + " · api " + local.core.api : "",
    local.service ? "service: " + local.service : "",
    ...(f?.log_tail ?? []),
  ].filter(Boolean).join("\n");
}

function LocalStatus() {
  const t = useT();
  const hosts = useHostsController();
  const local = useHosts((s) => s.local);
  const now = useHosts((s) => s.now);
  const { busy, error, run } = useBridgeCall();
  const [confirmStop, setConfirmStop] = useState(false);
  if (!local) return null;
  const view = localSubtitle(local);
  const lang = currentLanguage();
  const f = local.failure;
  const serviceOn = !["not-installed", "service-failed"].includes(local.state);
  const call = (name: Parameters<typeof hosts.localCall>[0]) => run(name, () => hosts.localCall(name));
  return (
    <div className="host-status" data-state={local.state}>
      <p className="status-line"><HostDot dot={view.dot} /> <strong>{local.state === "running" ? t("host.status.running", { calls: local.calls ?? 0 }) : <PhraseText phrase={view.subtitle} />}</strong></p>
      {local.state === "backoff" && f && <p className="muted"><PhraseText phrase={failurePhrase(f)} /></p>}
      {local.state === "refused" && <p className="muted">{t("host.refused.detail")}</p>}
      {local.state === "incompatible" && <p className="muted">{t(local.incompatible === "core-newer" ? "host.coreNewer.detail" : "host.coreOlder.detail")}</p>}
      {local.state === "service-failed" && f && <p className="muted">{t("service." + f.key)}</p>}
      {(local.state === "failed" || local.state === "service-failed") && f && (
        <dl className="cause-rows">
          {f.step && <div><dt>{t("host.cause.step")}</dt><dd>{t("step." + f.step)}</dd></div>}
          {f.attempts != null && <div><dt>{t("host.cause.attempts")}</dt><dd>{t("host.cause.attemptsValue", { n: f.attempts })}</dd></div>}
          {f.at && <div><dt>{t("host.cause.when")}</dt><dd>{formatWhen(f.at, now, lang)}</dd></div>}
        </dl>
      )}
      {f?.log_tail?.length ? <pre className="log-tail" aria-label={t("host.logTail")}>{f.log_tail.join("\n")}</pre> : null}
      {local.state === "running" && local.update && (
        <div className="notice">
          <p>{t("host.update.available", { from: local.update.from, to: local.update.to })}</p>
          {local.calls ? <p className="muted">{t("host.update.waitCall")}</p> : null}
          <div className="row-actions">
            <Button variant="primary" size="compact" disabled={!!busy} onClick={() => run("update", () => hosts.localUpdate(false))}>{t("host.update.apply")}</Button>
            {local.calls ? <Button variant="ghost" size="compact" disabled={!!busy} onClick={() => run("update", () => hosts.localUpdate(true))}>{t("host.update.now")}</Button> : null}
          </div>
        </div>
      )}
      <div className="row-actions">
        {local.state === "running" && <>
          <Button size="compact" disabled={!!busy} onClick={() => void call("restart")}>{t("host.restart")}</Button>
          {confirmStop ? (
            <span className="inline-confirm" role="group">
              <span className="muted">{t("host.stop.confirm")}</span>
              <Button variant="danger" size="compact" onClick={() => { setConfirmStop(false); void call("stop"); }}>{t("host.stop")}</Button>
              <Button variant="ghost" size="compact" onClick={() => setConfirmStop(false)}>{t("common.cancel")}</Button>
            </span>
          ) : <Button variant="ghost" size="compact" disabled={!!busy} onClick={() => setConfirmStop(true)}>{t("host.stop")}</Button>}
        </>}
        {local.state === "stopped-by-person" && <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void call("start")}>{t("host.start")}</Button>}
        {local.state === "backoff" && <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void call("restart")}>{t("host.retryNow")}</Button>}
        {local.state === "failed" && <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void call("restart")}>{t("common.retry")}</Button>}
        {local.state === "service-failed" && <>
          <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void call("restart")}>{t("common.retry")}</Button>
          <Button size="compact" disabled={!!busy} onClick={() => void call("serviceInstall")}>{t("host.reinstall")}</Button>
        </>}
        {local.state === "refused" && <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void call("reconnect")}>{t("host.reconnect")}</Button>}
        {local.state === "incompatible" && local.incompatible !== "core-newer" &&
          <Button variant="primary" size="compact" disabled={!!busy} onClick={() => run("update", () => hosts.localUpdate(true))}>{t("host.updateMachine")}</Button>}
        {["failed", "backoff", "service-failed", "running"].includes(local.state) && <Button variant="ghost" size="compact" onClick={() => void call("revealLog")}>{t("host.viewLog")}</Button>}
        {["failed", "backoff", "service-failed", "refused", "incompatible"].includes(local.state) && <CopyButton text={() => detailsText(local, t)} label={t("common.copyDetails")} />}
      </div>
      {busy && <p className="muted" role="status">{t("host.working")}</p>}
      {error && <p className="row-error" role="alert">{t("bridge." + error)}</p>}
      <label className="switch-row">
        <input type="checkbox" role="switch" checked={serviceOn} disabled={!!busy || local.state === "service-failed"}
          onChange={(event) => void call(event.currentTarget.checked ? "serviceInstall" : "serviceUninstall")} />
        <span><strong>{t("host.atLogin")}</strong><span className="muted"> {t(serviceOn ? "host.atLogin.on" : "host.atLogin.off")}</span></span>
      </label>
    </div>
  );
}

function RemoteStatus({ fp, pairing }: { fp: string; pairing: StoredPairing }) {
  const t = useT();
  const hosts = useHostsController();
  const reach = useHosts((s) => s.reach[fp]);
  const now = useHosts((s) => s.now);
  const [asking, setAsking] = useState(false);
  const view = remoteSubtitle(pairing, reach, now);
  return (
    <div className="host-status">
      <p className="status-line"><HostDot dot={view.dot} /> <strong><PhraseText phrase={view.subtitle} /></strong></p>
      {pairing.revoked && <p className="muted">{t("host.remote.revokedDetail")}</p>}
      <div className="row-actions">
        {!pairing.revoked && <Button size="compact" disabled={reach?.state === "checking"} onClick={() => void hosts.checkReach(fp)}>{reach?.state === "checking" ? t("host.checking") : t("common.retry")}</Button>}
        {asking ? (
          <span className="inline-confirm" role="group">
            <span className="muted">{t("host.forget.confirm")}</span>
            <Button variant="danger" size="compact" onClick={() => hosts.forget(fp)}>{t("host.forget.yes")}</Button>
            <Button variant="ghost" size="compact" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
          </span>
        ) : <Button variant="ghost" size="compact" onClick={() => setAsking(true)}>{t("host.forget")}</Button>}
      </div>
    </div>
  );
}

// ----- Agentes -----
function AgentsTab({ fp }: { fp: string }) {
  const t = useT();
  const hosts = useHostsController();
  const listing = useHosts((s) => s.agents[fp]);
  const busy = useHosts((s) => s.agentBusy);
  const errors = useHosts((s) => s.agentErrors);
  const now = useHosts((s) => s.now);
  const [connected, setConnected] = useState<string | null>(null);
  // Opening Agentes rescans (F5).
  useEffect(() => { void hosts.loadAgents(fp, true); }, [fp, hosts]);
  const lang = currentLanguage();
  if (!listing || (listing.status === "loading" && !listing.value)) return <p className="muted" role="status">{t("agents.scanning")}</p>;
  if (listing.status === "failed")
    return (
      <div className="problem" role="alert">
        <p>{t(listing.error === "no-connector" ? "agents.noConnector" : listing.error === "unreachable" ? "host.unreachableEdit" : "agents.scanFailed")}</p>
        <Button size="compact" onClick={() => void hosts.loadAgents(fp, true)}>{t("common.retry")}</Button>
      </div>
    );
  const agents = (listing.value?.agents ?? []).filter((a) => a.present || a.registration === "connected");
  async function act(id: string, action: "connect" | "disconnect" | "dismiss") {
    const answer = await hosts.agentAction(fp, id, action);
    if (action === "connect" && answer?.agent.registration === "connected") setConnected(answer.agent.label);
  }
  return (
    <div className="agents-tab">
      <p className="muted small scanned">
        {listing.status === "loading" ? t("agents.scanning") : t("agents.scannedAt", { when: formatWhen(Math.floor((listing.value?.scanned_at ?? 0)), now, lang) })}
        {" · "}<Button variant="ghost" size="compact" onClick={() => void hosts.loadAgents(fp, true)}>{t("agents.rescan")}</Button>
      </p>
      {agents.length === 0 ? <p className="empty-note">{t("agents.none")}</p> : (
        <ul className="agent-rows">
          {agents.map((agent) => {
            const key = fp + ":" + agent.id;
            const isNew = agent.present && agent.registration === "not-connected" && !agent.dismissed;
            return (
              <li key={agent.id} className="agent-row" data-registration={agent.registration}>
                <div className="agent-line">
                  <span className="agent-icon"><HarnessIcon harness={agent.id} size={18} /></span>
                  <span className="agent-copy">
                    <strong>{agent.label}</strong>{agent.version && <span className="muted"> · {agent.version}</span>}
                    {isNew && <span className="badge badge-new">{t("hosts.newAgent")}</span>}
                    <span className="muted agent-status">{busy[key] ? t("agents.busy." + busy[key]) : t(agent.registration === "not-connected" && agent.connect === "auto" ? "agents.notConnected" : agentStatusKey(agent))}</span>
                  </span>
                  <span className="row-actions">
                    {agent.registration === "connected" && <Button variant="ghost" size="compact" disabled={!!busy[key]} onClick={() => void act(agent.id, "disconnect")}>{t("agents.disconnect")}</Button>}
                    {agent.registration === "not-connected" && agent.connect === "auto" && <Button variant="primary" size="compact" disabled={!!busy[key]} onClick={() => void act(agent.id, "connect")}>{t("agents.connect")}</Button>}
                    {isNew && <Button variant="ghost" size="compact" disabled={!!busy[key]} onClick={() => void act(agent.id, "dismiss")}>{t("agents.notNow")}</Button>}
                  </span>
                </div>
                {agent.connect === "manual" && agent.registration === "not-connected" && <ManualConfig agent={agent} />}
                {errors[key] && <p className="row-error" role="alert">{t("agents.connectFailed", { message: errors[key].message || errors[key].key })}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {connected && <p className="ok-line" role="status">{t("agents.nextConversationsNamed", { name: connected })}</p>}
    </div>
  );
}

// ----- Integraciones -----
function IntegrationsTab({ fp }: { fp: string }) {
  const t = useT();
  const hosts = useHostsController();
  const scope = useContext(IntegrationScopeContext);
  const remote = useHosts((s) => s.integrations[fp]);
  useEffect(() => { void hosts.loadIntegrations(fp); }, [fp, hosts]);
  if (!remote || (remote.status === "loading" && !remote.value)) return <p className="muted" role="status">{t("common.loading")}</p>;
  if (remote.status === "failed" && !remote.value)
    return (
      <div className="problem" role="alert">
        <p>{t(remote.error === "unreachable" ? "host.unreachableEdit" : "integrations.failed")}</p>
        <Button size="compact" onClick={() => void hosts.loadIntegrations(fp)}>{t("common.retry")}</Button>
      </div>
    );
  if (!scope) return null;
  return <RoomStoreContext.Provider value={scope.storeFor(fp)}><IntegrationList /></RoomStoreContext.Provider>;
}

// ----- Dispositivos -----
function DevicesTab({ fp, local }: { fp: string; local: boolean }) {
  const t = useT();
  const hosts = useHostsController();
  const remote = useHosts((s) => s.devices[fp]);
  const ownId = useHosts((s) => s.list.entries.find((e) => e.fp === fp)?.pairing.device_id ?? null);
  const inApp = useHosts((s) => s.inApp);
  const now = useHosts((s) => s.now);
  const [asking, setAsking] = useState<string | null>(null);
  const [code, setCode] = useState<PairingCodeAnswer | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const qr = useContext(QrRendererContext);
  useEffect(() => { void hosts.loadDevices(fp); }, [fp, hosts]);
  const lang = currentLanguage();
  async function newCode() {
    setCodeError(null);
    const answer = await hosts.pairingCode();
    if (answer.ok) setCode({ code: answer.code, expires_in: answer.expires_in, reach: answer.reach });
    else setCodeError(answer.error.key);
  }
  async function pairRoom() {
    setRoomBusy(true); setCodeError(null);
    const result = await hosts.pairRoom(roomUrl, roomCode);
    setRoomBusy(false);
    if (result.ok) { setRoomUrl(""); setRoomCode(""); await newCode(); } else setCodeError(result.error.key);
  }
  return (
    <div className="devices-tab">
      {!remote || (remote.status === "loading" && !remote.value) ? <p className="muted" role="status">{t("common.loading")}</p>
        : remote.status === "failed" && !remote.value ? (
          <div className="problem" role="alert"><p>{t(remote.error === "unreachable" ? "host.unreachableEdit" : "devices.failed")}</p>
            <Button size="compact" onClick={() => void hosts.loadDevices(fp)}>{t("common.retry")}</Button></div>
        ) : (
          <ul className="device-rows">
            {(remote.value ?? []).map((device) => {
              const own = device.device_id === ownId;
              return (
                <li key={device.device_id} className="device-row">
                  <span className="device-copy">
                    <strong>{device.name}</strong>
                    {own && <span className="badge">{t(local && inApp ? "devices.thisApp" : "devices.thisDevice")}</span>}
                    {!own && device.kind === "local" && <span className="badge">{t("devices.appOnThisComputer")}</span>}
                    <span className="muted small">{t("devices.created", { when: formatWhen(device.created_at, now, lang) })} · {device.last_seen ? t("devices.seen", { when: formatWhen(device.last_seen, now, lang) }) : t("devices.neverSeen")}</span>
                  </span>
                  {!own && (asking === device.device_id ? (
                    <span className="inline-confirm" role="group">
                      <span className="muted">{t("devices.revoke.confirm")}</span>
                      <Button variant="danger" size="compact" onClick={() => { setAsking(null); void hosts.revoke(fp, device.device_id); }}>{t("devices.revoke")}</Button>
                      <Button variant="ghost" size="compact" onClick={() => setAsking(null)}>{t("common.cancel")}</Button>
                    </span>
                  ) : <Button variant="ghost" size="compact" onClick={() => setAsking(device.device_id)}>{t("devices.revoke")}</Button>)}
                </li>
              );
            })}
          </ul>
        )}
      <div className="pair-another">
        <h4>{t("devices.pairAnother")}</h4>
        {!local ? <p className="muted">{t("devices.remoteHint")} <code>sidevoice pair-device</code></p> : !code ? (
          <><p className="muted">{t("devices.localHint")}</p><Button size="compact" onClick={() => void newCode()}>{t("devices.showCode")}</Button></>
        ) : code.reach === "local-only" ? (
          <div className="notice">
            <p><strong>{t("devices.localOnly")}</strong></p>
            <p className="muted">{t("devices.localOnly.detail")}</p>
            <label className="ui-field">{t("devices.roomUrl")}<input value={roomUrl} placeholder={t("devices.roomUrlPlaceholder")} onChange={(e) => setRoomUrl(e.currentTarget.value)} /></label>
            <label className="ui-field">{t("devices.roomCode")}<input value={roomCode} onChange={(e) => setRoomCode(e.currentTarget.value)} /></label>
            <Button variant="primary" size="compact" disabled={roomBusy || !roomUrl.trim() || !roomCode.trim()} onClick={() => void pairRoom()}>{roomBusy ? t("devices.roomPairing") : t("devices.roomPair")}</Button>
          </div>
        ) : (
          <div className="code-card">
            {qr?.(code.code)}
            <div>
              <p className="muted small">{t("devices.codeFor", { minutes: Math.round(code.expires_in / 60) })}</p>
              <pre className="code-text">{code.code}</pre>
              <p className="muted small">{t("devices.reach." + code.reach)}</p>
              <div className="row-actions"><CopyButton text={code.code} /><Button variant="ghost" size="compact" onClick={() => void newCode()}>{t("devices.newCode")}</Button></div>
            </div>
          </div>
        )}
        {codeError && <p className="row-error" role="alert">{t("bridge." + codeError)}</p>}
      </div>
    </div>
  );
}

// ----- Voz y transcripción -----
function StagesTab({ fp, inUse }: { fp: string; inUse: boolean }) {
  const t = useT();
  const hosts = useHostsController();
  const scope = useHosts((s) => s.scope);
  const store = useContext(RoomStoreContext);
  useRoomStore((s) => s.stages);
  const ctx = store ? stageContext(store.facts) : null;
  const describe = (task: Task) => {
    const stage = effectiveStage(scope, fp, task);
    if (!stage || !ctx) return t("stages.unset");
    const label = stageLabel(ctx, task, stage);
    return stageSource(scope, fp, task) === "host" ? t("stages.hostOnly", { label }) : t("stages.general", { label: label + " · " + t("stage.place.deviceLower") });
  };
  const change = (task: Task) => {
    if (!inUse) hosts.use(fp);
    hosts.openSettings(task === "stt" ? "transcription" : "voice");
  };
  return (
    <div className="stages-tab">
      {(["tts", "stt"] as Task[]).map((task) => (
        <div key={task} className="stage-summary">
          <span><strong>{t(task === "stt" ? "stage.stt" : "stage.tts")}</strong><span className="muted"> · {describe(task)}</span></span>
          <Button variant="ghost" size="compact" onClick={() => change(task)}>{inUse ? t("stages.change") : t("stages.useAndChange")}</Button>
        </div>
      ))}
      {!inUse && <p className="muted small">{t("stages.notInUse")}</p>}
    </div>
  );
}
