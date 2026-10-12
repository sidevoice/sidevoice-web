import { useContext, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { ChevronIcon, CloseIcon, RefreshIcon } from "../../components/ui/Icons";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { MicWave } from "./CallIndicators";
import { callTranslator, type CallTranslate } from "./call-i18n";
import type { CallMessageKey } from "./messages/en";
import { useVoiceSwitch } from "../../state/call-model";
import { errorMessage, failureParts, type ErrorMessage } from "../settings/error-message";

/* The microphone and the speaker, as the old call bar had them: a chevron joined to the microphone's button opens a
 * bar above the call's controls with a Microphone select, a Speaker select and a refresh. The voice says what there is
 * and what is chosen (audioDevices, the same on the web and in the desktop app); a choice applies at once — the desktop
 * moves the speaker after what is playing — and is this device's from then on. A speaker this platform cannot choose
 * is shown, disabled, with why; a chosen device that went away is said once, the system's default in use since. */

/** The devices' button, joined at the left of the microphone's in one pill: it shows the microphone's level while it
 *  listens, and its chevron on hover, on focus, while the bar is open and while muted (as Meet). Opens and closes the bar. */
export function AudioDevicesToggle({ open, onToggle, controls }: { open: boolean; onToggle(): void; controls: string }) {
  const t = callTranslator();
  return (
    <button type="button" className="audio-devices-toggle" aria-expanded={open} aria-controls={controls}
      aria-label={t("devices.toggle")} title={t("devices.toggle")} onClick={onToggle}>
      <MicWave />
      <ChevronIcon size={18} className="audio-chevron" />
    </button>
  );
}

function deviceName(label: string, index: number, kind: "mic" | "speaker", t: CallTranslate) {
  // Labels are empty until the page may use the microphone: a number tells them apart meanwhile.
  return label || t(kind === "mic" ? "devices.unnamedMic" : "devices.unnamedSpeaker", { n: index + 1 });
}

/** Why a device could not be chosen: the microphone's and the speaker's own reasons in this list's words; anything else
 *  as the voice says it (error-message.ts), else this list's generic line, what it said behind Details. */
function devicesError(error: unknown, t: CallTranslate): ErrorMessage {
  const known: Record<string, CallMessageKey> = {
    "microphone-denied": "devices.error.micDenied", "microphone-unavailable": "devices.error.micUnavailable",
    "audio-output-unselectable": "devices.error.outputUnselectable", "audio-output-failed": "devices.error.outputFailed",
  };
  const key = known[failureParts(error).code];
  return key ? { text: t(key) } : errorMessage(error, { generic: t("devices.error.other") });
}

export function AudioDevicesBar({ id, open, onClose }: { id: string; open: boolean; onClose(): void }) {
  const t = callTranslator();
  const devices = useRoomStore((state) => state.facts.audioDevices);
  // With the voice switch (call model B) a device that goes is said elsewhere: a microphone turns the voice off (its
  // note), a speaker mutes the agents (theirs).
  const voiceSwitch = useVoiceSwitch();
  const lost = useRoomStore((state) => (voiceSwitch ? null : state.facts.audioLost));
  const store = useContext(RoomStoreContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  // Opened, it reads the list again (a device plugged in since).
  useEffect(() => { if (open) void window.sidevoiceActions?.refreshAudioDevices?.(); }, [open]);
  useEffect(() => {
    if (!open) return;
    // An Escape something open in it took (a select's list) closes that alone.
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  const choose = async (choice: { input?: string | null; output?: string | null }) => {
    setBusy(true); setError(null);
    try { await window.sidevoiceActions?.setAudioDevices?.(choice); }
    catch (failure) { setError(devicesError(failure, t)); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setError(null);
    try { await window.sidevoiceActions?.refreshAudioDevices?.(); } catch (failure) { setError(devicesError(failure, t)); }
    finally { setBusy(false); }
  };
  const dismissLost = () => store?.patch({ audioLost: null });
  return (
    <div id={id} className="audio-devices" role="group" aria-label={t("devices.toggle")}>
      {!devices ? <p className="audio-devices-note" role="status">{t("devices.loading")}</p> : <>
        <Field label={t("devices.mic")} className="audio-devices-field">
          <Select id="audio-input" value={devices.input ?? ""} disabled={busy} onValueChange={(input) => void choose({ input: input || null })}
            options={[{ value: "", label: t("devices.default") }, ...devices.inputs.map((device, index) => ({ value: device.id, label: deviceName(device.label, index, "mic", t) }))]} />
        </Field>
        <Field label={t("devices.speaker")} className="audio-devices-field" hint={devices.outputSelectable ? undefined : t("devices.speakerFixed")}>
          <Select id="audio-output" value={devices.outputSelectable ? devices.output ?? "" : ""} disabled={busy || !devices.outputSelectable} onValueChange={(output) => void choose({ output: output || null })}
            options={[{ value: "", label: t("devices.default") }, ...devices.outputs.map((device, index) => ({ value: device.id, label: deviceName(device.label, index, "speaker", t) }))]} />
        </Field>
      </>}
      <span className="audio-devices-actions">
        <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("devices.refresh")} title={t("devices.refresh")} disabled={busy} onClick={() => void refresh()}><RefreshIcon size={16} /></Button>
        <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("devices.close")} title={t("devices.close")} onClick={onClose}><CloseIcon size={16} /></Button>
      </span>
      {(lost?.input || lost?.output) && <p className="audio-devices-lost" role="status">
        {t(lost.input && lost.output ? "devices.lostBoth" : lost.input ? "devices.lostInput" : "devices.lostOutput")}
        <Button variant="ghost" tone="neutral" size="sm" onClick={dismissLost}>{t("devices.gotIt")}</Button>
      </p>}
      {error && <ErrorText className="audio-devices-error" role="alert" message={error} />}
    </div>
  );
}
