import { DialogFrame } from "../../components/ui/DialogFrame";
import { MachineList } from "../room/MachineList";
import { InfoPopover } from "../../components/models/ModelInfo";
import { StageSettings } from "./StageSettings";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { useRoomStore } from "../../state/room-store";
import { desktopAppBridge } from "../../services/desktop-host";
import { SettingsShell } from "./SettingsShell";
import { AppDiagnostics, ThisApp } from "./ThisApp";
import { hostTranslator } from "./host-i18n";

export function GeneralSettings() {
  return <section id="pane-general" aria-labelledby="settings-general" hidden>
    <h3>Idioma de la interfaz</h3><label>Idioma<NativeSelect id="ui-language" defaultValue="en"><option value="es">Español</option><option value="en">English</option></NativeSelect></label><p className="muted">Cambia los textos de la web. La voz y la transcripción se configuran por separado.</p><p className="muted">Toda la configuración se guarda en este dispositivo y se envía a la sala al entrar; la sala no conserva ninguna copia. Cada dispositivo tiene la suya. Las claves de Integraciones son la excepción: son de la máquina, y sirven a todos tus dispositivos.</p><p className="muted">Compilación <code id="build-id">{(window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev"}</code></p>
  </section>;
}

export function VoiceSettings() {
  return (
    <section id="pane-voice" aria-labelledby="settings-voice" hidden>
      <h3>Voz</h3>
      <StageSettings task="tts" />
    </section>
  );
}

export function TranscriptionSettings() {
  return (
    <section id="pane-transcription" aria-labelledby="settings-transcription" hidden>
      <h3>Transcripción</h3>
      <StageSettings task="stt" />
    </section>
  );
}

export function AdvancedSettings() {
  return (
    <section id="pane-advanced" aria-labelledby="settings-advanced" hidden>
      <h3>Tiempos de conversación</h3>
      <label>Pausa antes del audio pendiente (segundos)<input id="audio-grace-seconds" type="number" min="0" max="10" step="0.5" defaultValue="1" /></label><p className="muted">Tras enviar tu intervención, espera este margen. Si vuelves a hablar, la espera se reinicia. Por defecto: 1 segundo.</p>
      <h3>Mientras la conversación trabaja</h3>
      <label>Sonido de presencia<NativeSelect id="presence-sound" defaultValue="on"><option value="on">Activado</option><option value="off">Desactivado</option></NativeSelect></label>
      <p className="muted">Un sonido suave y continuo mientras la conversación tiene lo que dijiste y aún no responde: empieza cuando la conversación lo lee y se detiene con la primera respuesta. Sale por el mismo altavoz que la voz, así que la cancelación de eco lo cubre, y su volumen está muy por debajo del umbral del detector para no abrir una intervención. Por defecto: activado al 3,5 % de la escala. Es de este dispositivo; la sala no guarda nada.</p>
      <h3>Con la pantalla bloqueada</h3>
      <label>Mantener la llamada<NativeSelect id="locked-call" defaultValue="on"><option value="on">Activado</option><option value="off">Desactivado</option></NativeSelect></label>
      <p className="muted">Con el móvil bloqueado, la sala sigue sonando y escuchándote en vez de pausarse. Para que el iPhone no congele la página en silencio, suena un fondo inaudible muy por debajo del umbral del micrófono. Si algo suena raro al bloquear, desactívalo. Por defecto: activado. Es de este dispositivo.</p>
      <h3>Al volver a una conversación</h3>
      <label>Repetir lo que no oíste<NativeSelect id="replay-on-return-seconds" defaultValue="120"><option value="0">Desactivado</option><option value="60">Del último minuto</option><option value="120">De los últimos 2 minutos</option><option value="300">De los últimos 5 minutos</option><option value="900">De los últimos 15 minutos</option></NativeSelect></label>
      <p className="muted">Al reconectar tras un corte, o al volver a entrar en la conversación, se reproducen las respuestas de este intervalo que este dispositivo no llegó a oír, de la más antigua a la más reciente y antes que nada nuevo. Una respuesta que ya escuchaste entera, o que paraste tú, no se repite; si vuelves a hablar, la repetición se cancela. Por defecto: 2 minutos. Es de este dispositivo; la sala no guarda nada.</p>
      <h3>Fin de tu intervención</h3>
      <label>Cuánta paciencia quieres <InfoPopover description="Cuánto silencio deja la sala antes de dar por terminada tu intervención, y cuánto espera antes de entregarla por si sólo estabas cogiendo aire. Los números que hay detrás son de la sala, iguales para todos, para que un arreglo llegue a todo el mundo a la vez." label="Información sobre la paciencia" /><NativeSelect id="turn-patience" defaultValue="normal"><option value="fast">Rápido · corta antes</option><option value="normal">Normal</option><option value="calm">Tranquilo · te deja respirar</option></NativeSelect></label>
      <p className="muted">Rápido responde en cuanto callas, y es cómodo para frases sueltas. Tranquilo deja casi un segundo y medio de pausa y, si sigues hablando justo después, une las dos partes en un solo mensaje: es lo que quieres conduciendo. Se aplica al entrar en la sala; si lo cambias durante una llamada, vuelve a entrar. Por defecto: Normal.</p>
      <AppDiagnostics />
    </section>
  );
}

function MachineSettings() {
  return <section id="pane-machines" aria-labelledby="settings-machines" hidden><MachineList /></section>;
}

export function SettingsDialog() {
  const t = hostTranslator();
  const hasMachines = useRoomStore((state) => state.machines.some((machine) => !!machine.pairingId || machine.local && machine.inUse));
  const app = desktopAppBridge();
  const appAvailable = !!app?.settings && !!app.update;
  return (
    <DialogFrame id="language-settings" className="settings-dialog" labelledBy="settings-title" title={t("settings.title")} closeId="settings-close" closeLabel={t("settings.back")} closeTitle={t("settings.back")} footer={<div className="settings-footer"><p id="settings-error" role="alert" /><Button type="submit" form="language-form" variant="primary">{t("settings.save")}</Button></div>}>
      <form id="language-form">
        <SettingsShell hasMachines={hasMachines} appAvailable={appAvailable}>
          <GeneralSettings />
          {!hasMachines && <><VoiceSettings /><TranscriptionSettings /></>}
          {appAvailable && <ThisApp />}
          <AdvancedSettings />
          <MachineSettings />
        </SettingsShell>
      </form>
    </DialogFrame>
  );
}
