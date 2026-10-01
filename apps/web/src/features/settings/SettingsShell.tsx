/* One Settings (ONBOARDING_AND_HOSTS.md §5.4): General · Voz · Transcripción · Esta app (in the app), then Máquinas
 * with each host and «Añadir», and Avanzado last. Integraciones is no longer a section of its own: a key is a host's,
 * so it lives on the host's page. The panes are the room's own; this frame decides which one shows.
 *
 * It is a view of the app, not a window over it (operator, 2026-10-02): it takes the place of the conversations — the
 * sections where the conversation list is, the section where the conversation is, in the same cards and colours —
 * with «Volver» (or Esc) back to them. */
import { useEffect, useState } from "react";
import { currentDeviceName, setDeviceName } from "../../state/device-name";
import { Button } from "../../components/ui/Button";
import { AdvancedIcon, AppIcon, BackIcon, GeneralIcon, MachinesIcon, SettingsIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import { useHosts, useHostsController, type SettingsPane } from "../../state/hosts/hosts-store";
import type { Task } from "../../state/hosts/stage-scope";
import { HostDot } from "../hosts/common";
import { HostList } from "../hosts/HostList";
import { HostPage } from "../hosts/HostPage";
import { AddMachine } from "../hosts/AddMachine";
import { AdvancedSettings, GeneralSettings } from "./SettingsDialog";
import { StageScopeLine } from "./StageScopeLine";
import { StageEditor } from "./StageEditor";
import { AppDiagnostics, ThisApp } from "./ThisApp";

function NavButton({ pane, current, onClick, children }: { pane: string; current: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button variant="ghost" className="nav-item" data-pane={pane} aria-current={current ? "page" : undefined} onClick={onClick}>{children}</Button>;
}

/** This device's name, as the machines it pairs with will list it. */
function DeviceNameSection() {
  const t = useT();
  const [name, setName] = useState(() => currentDeviceName((where) => t("pair.deviceName", { where })));
  return (
    <section className="pane device-name">
      <h3>{t("settings.thisDevice")}</h3>
      <label className="ui-field">{t("pair.name")}
        <input value={name} maxLength={60} autoComplete="off" onChange={(event) => setName(event.currentTarget.value)} onBlur={() => setDeviceName(name)} />
      </label>
      <p className="muted small">{t("settings.deviceNameHint")}</p>
    </section>
  );
}

function StagePane({ task }: { task: Task }) {
  const t = useT();
  return (
    <section className="pane">
      <h3>{t(task === "stt" ? "stage.stt" : "stage.tts")}</h3>
      <StageScopeLine task={task} />
      <StageEditor task={task} />
    </section>
  );
}

export function SettingsShell() {
  const t = useT();
  const hosts = useHostsController();
  const settings = useHosts((s) => s.settings);
  const rows = useHosts((s) => s.rows);
  const inApp = useHosts((s) => s.inApp);
  const go = (pane: SettingsPane, host: string | null = null) => hosts.openSettings(pane, host);
  const pane = settings.pane;
  useEffect(() => {
    if (!settings.open) return;
    // Esc goes back, unless a dialog of its own (a reset, a pairing) is the one open.
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) hosts.closeSettings(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [settings.open, hosts]);
  if (!settings.open) return null;
  return (
    <main id="settings-shell" className="settings-view settings-shell" aria-labelledby="settings-shell-title">
      <aside className="settings-side">
        <Button variant="ghost" size="compact" className="settings-back" onClick={() => hosts.closeSettings()}><BackIcon size={16} /> {t("settings.back")}</Button>
        <h2 id="settings-shell-title"><SettingsIcon size={14} /> {t("settings.title")}</h2>
        <nav className="settings-nav" aria-label={t("settings.sections")}>
          <NavButton pane="general" current={pane === "general"} onClick={() => go("general")}><GeneralIcon /> {t("settings.general")}</NavButton>
          {/* Voz and Transcripción are each machine's; only with no machine are they here (this device's models). */}
          {!rows.length && <NavButton pane="voice" current={pane === "voice"} onClick={() => go("voice")}><VoicesIcon /> {t("stage.tts")}</NavButton>}
          {!rows.length && <NavButton pane="transcription" current={pane === "transcription"} onClick={() => go("transcription")}><TranscriptionIcon /> {t("stage.stt")}</NavButton>}
          {inApp && <NavButton pane="app" current={pane === "app"} onClick={() => go("app")}><AppIcon /> {t("settings.thisApp")}</NavButton>}
          <NavButton pane="advanced" current={pane === "advanced"} onClick={() => go("advanced")}><AdvancedIcon /> {t("settings.advanced")}</NavButton>
          <div className="nav-group" role="group" aria-labelledby="nav-hosts">
            <NavButton pane="hosts" current={pane === "hosts"} onClick={() => go("hosts")}><MachinesIcon /> <span id="nav-hosts">{t("hosts.title")}</span></NavButton>
            {rows.map((row) => (
              <NavButton key={row.fp} pane="host" current={pane === "host" && settings.host === row.fp} onClick={() => go("host", row.fp)}>
                <HostDot dot={row.dot} /> <span className="nav-host-name">{row.local ? t("host.thisComputer") : row.name}</span>{row.newAgent && <span className="badge-dot" aria-label={t("hosts.newAgent")} />}
              </NavButton>
            ))}
            <NavButton pane="add-host" current={pane === "add-host"} onClick={() => go("add-host")}><span className="nav-glyph" aria-hidden="true">+</span> {t("hosts.add")}</NavButton>
          </div>
        </nav>
      </aside>
      <section className="transcript settings-main">
        <div className="settings-content">
          {pane === "general" && <><DeviceNameSection /><div className="legacy-pane"><GeneralSettings /></div></>}
          {pane === "voice" && <StagePane task="tts" />}
          {pane === "transcription" && <StagePane task="stt" />}
          {pane === "advanced" && <><div className="legacy-pane"><AdvancedSettings /></div>{inApp && <AppDiagnostics />}</>}
          {pane === "app" && <ThisApp />}
          {pane === "hosts" && <HostList />}
          {pane === "host" && settings.host && <HostPage key={settings.host} fp={settings.host} />}
          {pane === "add-host" && <AddMachine />}
        </div>
      </section>
    </main>
  );
}
