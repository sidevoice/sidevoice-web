import { DialogFrame } from "../../components/ui/DialogFrame";
import { GeneralIcon, IntegrationsIcon, MachinesIcon, VoicesIcon } from "../../components/ui/Icons";
import { VoiceSettings } from "./VoiceSettings";
import { ProviderKeys } from "./ProviderKeys";
import { MachineList } from "../room/MachineList";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { hostTranslator } from "./host-i18n";

function GeneralSettings() {
  const t = hostTranslator();
  return <section id="pane-general" aria-labelledby="settings-general">
    <h3>{t("settings.general.language")}</h3>
    <label>{t("settings.general.languageLabel")}<NativeSelect id="ui-language" defaultValue="en"><option value="es">Español</option><option value="en">English</option></NativeSelect></label>
    <p className="muted">{t("settings.general.languageHint")}</p>
    <h3>{t("settings.general.device")}</h3>
    <p className="muted">{t("settings.general.deviceHint")}</p>
    <Button id="reset-settings" variant="danger" size="sm" className="settings-reset">{t("settings.general.reset")}</Button>
    <p className="muted" id="reset-settings-note" role="status" />
    <p className="muted settings-build">{t("settings.general.build")} <code id="build-id">{(window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev"}</code></p>
  </section>;
}

function MachineSettings() {
  return <section id="pane-machines" aria-labelledby="settings-machines" hidden className="settings-machines"><MachineList /></section>;
}

export function SettingsDialog() {
  return (
    <DialogFrame id="language-settings" className="settings-dialog" labelledBy="settings-title" title="Configuración" closeId="settings-close" footer={<div className="settings-footer"><p id="settings-error" role="alert" /><Button type="submit" form="language-form" variant="primary">Guardar cambios</Button></div>}>
      <form id="language-form">
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Secciones de configuración">
            <Button variant="ghost" id="settings-general" aria-controls="pane-general" aria-pressed="true"><GeneralIcon /> General</Button>
            <Button variant="ghost" id="settings-voice" aria-controls="pane-voice" aria-pressed="false"><VoicesIcon /> Voz</Button>
            <Button variant="ghost" id="settings-providers" aria-controls="pane-providers" aria-pressed="false"><IntegrationsIcon /> Proveedores</Button>
            <Button variant="ghost" id="settings-machines" aria-controls="pane-machines" aria-pressed="false"><MachinesIcon /> Máquinas</Button>
          </nav>
          <div className="settings-content"><GeneralSettings /><VoiceSettings /><ProviderKeys /><MachineSettings /></div>
        </div>
      </form>
    </DialogFrame>
  );
}
