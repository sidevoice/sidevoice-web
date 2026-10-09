import { DialogFrame } from "../../components/ui/DialogFrame";
import { GeneralIcon, MachinesIcon } from "../../components/ui/Icons";
import { MachineList } from "../room/MachineList";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";

function GeneralSettings() {
  return <section id="pane-general" aria-labelledby="settings-general">
    <h3>Idioma de la interfaz</h3><label>Idioma<NativeSelect id="ui-language" defaultValue="en"><option value="es">Español</option><option value="en">English</option></NativeSelect></label><p className="muted">Cambia los textos de la web.</p><p className="muted">La configuración se guarda en este dispositivo; la sala no conserva ninguna copia. Cada dispositivo tiene la suya.</p><Button id="reset-settings" variant="ghost">Restablecer toda la configuración de este dispositivo</Button><p className="muted" id="reset-settings-note" role="status" /><p className="muted">Compilación <code id="build-id">{(window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev"}</code></p>
  </section>;
}

function MachineSettings() {
  return <section id="pane-machines" aria-labelledby="settings-machines" hidden><MachineList /></section>;
}

export function SettingsDialog() {
  return (
    <DialogFrame id="language-settings" className="settings-dialog" labelledBy="settings-title" title="Configuración" closeId="settings-close" footer={<div className="settings-footer"><p id="settings-error" role="alert" /><Button type="submit" form="language-form" variant="primary">Guardar cambios</Button></div>}>
      <form id="language-form">
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Secciones de configuración">
            <Button variant="ghost" id="settings-general" aria-controls="pane-general" aria-pressed="true"><GeneralIcon /> General</Button>
            <Button variant="ghost" id="settings-machines" aria-controls="pane-machines" aria-pressed="false"><MachinesIcon /> Máquinas</Button>
          </nav>
          <div className="settings-content"><GeneralSettings /><MachineSettings /></div>
        </div>
      </form>
    </DialogFrame>
  );
}
