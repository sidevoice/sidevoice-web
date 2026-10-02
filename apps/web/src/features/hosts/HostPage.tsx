import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { useRoomStore } from "../../state/room-store";
import type { MachineView, StageTask } from "../../state/room-types";
import { IntegrationList } from "../settings/IntegrationList";
import { StageSettings } from "../settings/StageSettings";
import { hostTranslator } from "../settings/host-i18n";

type HostTab = "status" | "agents" | "integrations" | "devices" | "voice" | "transcription";

interface HostPageProps {
  machine: MachineView;
  onBack(): void;
  statusPanel: ReactNode;
  devicesPanel: ReactNode;
  /** Filled by the R2 agent capability when that API is available. */
  agentsPanel?: ReactNode;
  initialTab?: HostTab;
}

/** A machine's settings. Existing R1/R4 operations are rendered by their production bridge-backed panels. */
export function HostPage({ machine, onBack, statusPanel, devicesPanel, agentsPanel, initialTab }: HostPageProps) {
  const t = hostTranslator();
  const remote = useRoomStore((state) => state.facts.remoteHostStatus[machine.pairingId ?? machine.id] ?? null);
  const [tab, setTab] = useState<HostTab>(initialTab === "agents" && (!machine.capabilities?.agents || !agentsPanel) ? "status" : initialTab ?? "status");
  const [confirmForget, setConfirmForget] = useState(false);
  const hostLabel = machine.local ? t("hosts.thisComputer") : machine.host || t("hosts.unnamed");
  const tabs: { id: HostTab; label: string }[] = [
    { id: "status", label: t("hosts.tab.status") },
    ...(machine.capabilities?.agents && agentsPanel ? [{ id: "agents" as const, label: t("settings.agents") }] : []),
    { id: "integrations", label: t("settings.integrations") },
    { id: "devices", label: t("hosts.tab.devices") },
    { id: "voice", label: t("settings.voice") },
    { id: "transcription", label: t("settings.transcription") },
  ];

  function useMachine() {
    if (machine.selectable === false) return;
    window.sidevoiceActions?.chooseMachine(machine.pairingId || machine.id);
  }

  return (
    <section className="host-detail" aria-labelledby="host-detail-title">
      <Button type="button" variant="ghost" size="compact" onClick={onBack}>{t("hosts.pageBack")}</Button>
      <header className="host-detail-header">
        <div>
          <h3 id="host-detail-title">{hostLabel}{machine.inUse && <span className="badge">{t("hosts.inUse")}</span>}</h3>
          {machine.local && <p className="muted">{t("hosts.thisComputer")}</p>}
        </div>
        {!machine.inUse && machine.selectable !== false && <Button variant="ghost" size="compact" onClick={useMachine}>{t("hosts.use", { machine: hostLabel })}</Button>}
      </header>
      <div className="host-tabs" role="tablist" aria-label={t("settings.hostSections")}>
        {tabs.map(({ id, label }) => (
          <button key={id} type="button" role="tab" id={`host-tab-${id}`} aria-controls="host-tabpanel" aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              const target = event.key === "Home" ? tabs[0]?.id : event.key === "End" ? tabs.at(-1)?.id : step ? tabs[(tabs.findIndex((item) => item.id === id) + step + tabs.length) % tabs.length]?.id : undefined;
              if (!target) return;
              event.preventDefault();
              setTab(target);
              requestAnimationFrame(() => document.getElementById(`host-tab-${target}`)?.focus());
            }}>
            {label}{id === "agents" && machine.newAgent && <span className="badge-dot" aria-label={t("hosts.newAgent")} />}
          </button>
        ))}
      </div>
      <div className="host-tabpanel" id="host-tabpanel" role="tabpanel" aria-labelledby={`host-tab-${tab}`}>
        {tab === "status" && (machine.local ? statusPanel : <RemoteStatus machine={machine} status={remote?.state ?? machine.state} />)}
        {tab === "agents" && agentsPanel}
        {tab === "integrations" && (machine.inUse ? <IntegrationList /> : <UseMachinePrompt machine={hostLabel} onUse={useMachine} />)}
        {tab === "devices" && (machine.local ? devicesPanel : <RemoteDevices />)}
        {tab === "voice" && <MachineStage machine={machine} task="tts" onUse={useMachine} />}
        {tab === "transcription" && <MachineStage machine={machine} task="stt" onUse={useMachine} />}
      </div>
      {!machine.local && <div className="host-forget">
        {confirmForget ? <span className="inline-confirm" role="group">
          <span className="muted">{t("hosts.confirmForget")}</span>
          <Button type="button" variant="danger" size="compact" onClick={() => { setConfirmForget(false); void window.sidevoiceActions?.forgetMachine(machine.pairingId || machine.id); }}>{t("hosts.forgetConfirm")}</Button>
          <Button type="button" variant="ghost" size="compact" onClick={() => setConfirmForget(false)}>{t("hosts.cancel")}</Button>
        </span> : <Button type="button" variant="ghost" size="compact" onClick={() => setConfirmForget(true)}>{t("hosts.forget", { machine: hostLabel })}</Button>}
      </div>}
    </section>
  );
}

function RemoteStatus({ machine, status }: { machine: MachineView; status: string }) {
  const t = hostTranslator();
  const checking = status === "checking";
  const label = status === "connected" ? t("hosts.connected") : status === "checking" ? t("hosts.checking") : t("hosts.remoteNoResponse");
  return (
    <div className="host-status-panel" data-state={machine.state}>
      <p className="host-status-summary" role="status">{label}</p>
      {machine.revoked && <p className="muted">{t("hosts.revokedDetail")}</p>}
      {!machine.revoked && <Button type="button" size="compact" disabled={checking}
        onClick={() => void window.sidevoiceActions?.checkMachine?.(machine.pairingId || machine.id)}>
        {checking ? t("hosts.checking") : t("hosts.retry")}
      </Button>}
    </div>
  );
}

function RemoteDevices() {
  const t = hostTranslator();
  return <div className="host-devices-panel"><h4>{t("hosts.tab.devices")}</h4><p className="muted">{t("hosts.devices.remoteHint")}</p><code>{t("hosts.devices.remoteCommand")}</code></div>;
}

function UseMachinePrompt({ machine, onUse }: { machine: string; onUse(): void }) {
  const t = hostTranslator();
  return <div className="host-tab-prompt"><p className="muted">{t("settings.useMachineFirst", { machine })}</p><Button type="button" size="compact" onClick={onUse}>{t("hosts.use", { machine })}</Button></div>;
}

function MachineStage({ machine, task, onUse }: { machine: MachineView; task: StageTask; onUse(): void }) {
  const t = hostTranslator();
  return machine.inUse ? <StageSettings task={task} /> : <UseMachinePrompt machine={machine.host || t("hosts.unnamed")} onUse={onUse} />;
}
