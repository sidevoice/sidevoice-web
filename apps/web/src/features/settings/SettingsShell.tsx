/* One Settings (ONBOARDING_AND_HOSTS.md §5.4): General · Voz · Transcripción · Avanzado · Esta app (in the app),
 * then Máquinas with each host and «Añadir». Integraciones is no longer a section of its own: a key is a host's,
 * so it lives on the host's page. The panes are the room's own; this frame decides which one shows. */
import { Button } from "../../components/ui/Button";
import { AdvancedIcon, CloseIcon, GeneralIcon, MachinesIcon, SettingsIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import { useHosts, useHostsController, type SettingsPane } from "../../state/hosts/hosts-store";
import type { Task } from "../../state/hosts/stage-scope";
import { HostDot } from "../hosts/common";
import { HostList } from "../hosts/HostList";
import { HostPage } from "../hosts/HostPage";
import { PairWithCode } from "../hosts/PairWithCode";
import { useModal } from "../hosts/common";
import { AdvancedSettings, GeneralSettings } from "./SettingsDialog";
import { StageScopeLine } from "./StageScopeLine";
import { StageSettings } from "./StageSettings";
import { ThisApp } from "./ThisApp";

function NavButton({ pane, current, onClick, children }: { pane: string; current: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button variant="ghost" className="nav-item" data-pane={pane} aria-current={current ? "page" : undefined} onClick={onClick}>{children}</Button>;
}

function StagePane({ task }: { task: Task }) {
  const t = useT();
  return (
    <section className="pane">
      <h3>{t(task === "stt" ? "stage.stt" : "stage.tts")}</h3>
      <StageScopeLine task={task} />
      <StageSettings task={task} />
    </section>
  );
}

export function SettingsShell() {
  const t = useT();
  const hosts = useHostsController();
  const settings = useHosts((s) => s.settings);
  const rows = useHosts((s) => s.rows);
  const inApp = useHosts((s) => s.inApp);
  const ref = useModal(settings.open, () => hosts.closeSettings());
  const go = (pane: SettingsPane, host: string | null = null) => hosts.openSettings(pane, host);
  const pane = settings.pane;
  return (
    <dialog ref={ref} id="settings-shell" className="settings-dialog settings-shell" aria-labelledby="settings-shell-title">
      <div className="settings-heading">
        <h2 id="settings-shell-title"><SettingsIcon size={18} /> {t("settings.title")}</h2>
        <Button variant="ghost" size="icon" aria-label={t("settings.close")} title={t("common.close")} onClick={() => hosts.closeSettings()}><CloseIcon /></Button>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("settings.sections")}>
          <NavButton pane="general" current={pane === "general"} onClick={() => go("general")}><GeneralIcon /> {t("settings.general")}</NavButton>
          <NavButton pane="voice" current={pane === "voice"} onClick={() => go("voice")}><VoicesIcon /> {t("stage.tts")}</NavButton>
          <NavButton pane="transcription" current={pane === "transcription"} onClick={() => go("transcription")}><TranscriptionIcon /> {t("stage.stt")}</NavButton>
          <NavButton pane="advanced" current={pane === "advanced"} onClick={() => go("advanced")}><AdvancedIcon /> {t("settings.advanced")}</NavButton>
          {inApp && <NavButton pane="app" current={pane === "app"} onClick={() => go("app")}><span className="nav-glyph" aria-hidden="true">▣</span> {t("settings.thisApp")}</NavButton>}
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
        <div className="settings-content">
          {pane === "general" && <div className="legacy-pane"><GeneralSettings /></div>}
          {pane === "voice" && <StagePane task="tts" />}
          {pane === "transcription" && <StagePane task="stt" />}
          {pane === "advanced" && <div className="legacy-pane"><AdvancedSettings /></div>}
          {pane === "app" && <ThisApp />}
          {pane === "hosts" && <HostList />}
          {pane === "host" && settings.host && <HostPage key={settings.host} fp={settings.host} />}
          {pane === "add-host" && (
            <section className="pane">
              <h3>{t("hosts.add")}</h3>
              <PairWithCode use={false} submitLabel={t("hosts.addSubmit")} onPaired={(fp) => hosts.openSettings("host", fp)} />
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
