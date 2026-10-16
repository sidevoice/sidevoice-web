import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useContext, useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { Select } from "../../components/ui/Select";
import { Group, Row } from "../../components/ui/Card";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { ChevronIcon, MicrophoneIcon, SpeakerIcon } from "../../components/ui/Icons";
import { overlayContainer, useOverlayPortal } from "../../components/ui/Tooltip";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { MicWave } from "./CallIndicators";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { errorMessage, failureParts, type ErrorMessage } from "../settings/error-message";

/* The microphone and the speaker, as Meet has them: the chevron joined to the microphone's button opens a small panel
 * right above it, clear of the call's tray (below only where there is no room above) with a Microphone select and a Speaker select. The voice
 * says what there is and what is chosen (audioDevices, the same on the web and in the desktop app) and follows a device
 * plugged in or out by itself; opening the panel reads the list again. A choice applies at once — the desktop moves the
 * speaker after what is playing — and is this device's from then on. A speaker this platform cannot choose is shown,
 * disabled, with why; a chosen device that went away is said once, the system's default in use since.
 *
 * With a mouse, resting on the chevron opens it, and it stays while the pointer is on the chevron or on the panel; it
 * closes a moment after the pointer leaves both. A click on the chevron, a key (Enter, Space, ArrowUp) or a tap opens it
 * held instead — and a click holds one the pointer opened, as does using it. Held, a click outside, Escape or the
 * chevron close it, and focus that was in it goes back to the chevron. */

/** How long the pointer rests on the chevron before the panel opens (passing over it opens nothing), and how long the
 *  panel stays once the pointer has left the chevron and the panel (the way from one to the other). */
const HOVER_OPEN_MS = 100;
const HOVER_CLOSE_MS = 300;

/** The devices' button, joined at the left of the microphone's in one pill, and the panel it opens. The button shows
 *  the microphone's level while it listens, and its chevron on hover, on focus, while the panel is open and while
 *  muted (as Meet). */
export function AudioDevices() {
  const t = translator();
  const provided = useOverlayPortal();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // "hover": the pointer opened it and takes it away. "held": a click, a key or a tap opened it, or it was used.
  const [mode, setMode] = useState<"hover" | "held">("held");
  const timer = useRef<number | undefined>(undefined);
  const wait = () => window.clearTimeout(timer.current);
  const after = (ms: number, then: () => void) => { wait(); timer.current = window.setTimeout(then, ms); };
  useEffect(() => wait, []);
  const show = (how: "hover" | "held") => { wait(); setMode(how); setOpen(true); };
  const hide = () => { wait(); setOpen(false); };
  const hold = () => { wait(); setMode("held"); };
  // Only a mouse points without pressing: a touch or a pen opens it with its tap.
  const pointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    wait();
    if (!open) after(HOVER_OPEN_MS, () => show("hover"));
  };
  const pointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (!open) wait();
    else if (mode === "hover") after(HOVER_CLOSE_MS, hide);
  };
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => next ? show("held") : hide()}>
      <PopoverPrimitive.Trigger asChild ref={trigger}>
        <button type="button" className="audio-devices-toggle" aria-controls="audio-devices" aria-label={t("devices.toggle")}
          onPointerEnter={pointerEnter} onPointerLeave={pointerLeave}
          // A click opens it held, holds one the pointer opened, and closes one held (instead of Radix's own toggle).
          onClick={(event) => { event.preventDefault(); if (!open) show("held"); else if (mode === "hover") hold(); else hide(); }}
          onKeyDown={(event) => { if (event.key === "ArrowUp" && !open) { event.preventDefault(); show("held"); } }}>
          <MicWave />
          <ChevronIcon size={18} className="audio-chevron" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={overlayContainer(provided, trigger.current)}>
        <PopoverPrimitive.Content id="audio-devices" className="ui-popover audio-devices" side="top" align="start" sideOffset={16}
          collisionPadding={12} aria-label={t("devices.toggle")}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") wait(); }} onPointerLeave={pointerLeave}
          onPointerDown={hold} onFocus={hold}
          // Opened by the pointer, it takes no focus, and gives none back when the pointer takes it away.
          onOpenAutoFocus={(event) => { if (mode === "hover") event.preventDefault(); }}
          onCloseAutoFocus={(event) => { if (mode === "hover") event.preventDefault(); }}>
          <DeviceChoices />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function deviceName(label: string, index: number, kind: "mic" | "speaker", t: Translate) {
  // Labels are empty until the page may use the microphone: a number tells them apart meanwhile.
  return label || t(kind === "mic" ? "devices.unnamedMic" : "devices.unnamedSpeaker", { n: index + 1 });
}

/** Why a device could not be chosen: the microphone's and the speaker's own reasons in this list's words; anything else
 *  as the voice says it (error-message.ts), else this list's generic line, what it said behind Details. */
function devicesError(error: unknown, t: Translate): ErrorMessage {
  const known: Record<string, MessageKey> = {
    "microphone-denied": "devices.error.micDenied", "microphone-unavailable": "devices.error.micUnavailable",
    "audio-output-unselectable": "devices.error.outputUnselectable", "audio-output-failed": "devices.error.outputFailed",
  };
  const key = known[failureParts(error).code];
  return key ? { text: t(key) } : errorMessage(error, { generic: t("devices.error.other") });
}

/** The devices to choose and what choosing does: the list read again where it is drawn, busy while a choice is made,
 *  why a choice failed. The call's panel and Settings › Call share it. */
function useDeviceChoices() {
  const t = translator();
  const devices = useRoomStore((state) => state.facts.audioDevices);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  useEffect(() => { void window.sidevoiceActions?.refreshAudioDevices?.(); }, []);
  const choose = async (choice: { input?: string | null; output?: string | null }) => {
    setBusy(true); setError(null);
    try { await window.sidevoiceActions?.setAudioDevices?.(choice); }
    catch (failure) { setError(devicesError(failure, t)); }
    finally { setBusy(false); }
  };
  const inputs = devices ? [{ value: "", label: t("devices.default") }, ...devices.inputs.map((device, index) => ({ value: device.id, label: deviceName(device.label, index, "mic", t) }))] : [];
  const outputs = devices ? [{ value: "", label: t("devices.default") }, ...devices.outputs.map((device, index) => ({ value: device.id, label: deviceName(device.label, index, "speaker", t) }))] : [];
  return { t, devices, busy, error, choose, inputs, outputs };
}

/** Settings › Call: the microphone and the speaker as rows, the same choices as the call's panel, the system's by
 *  default (operator, 2026-10-16: where people look for them). */
export function AudioDeviceRows() {
  const { t, devices, busy, error, choose, inputs, outputs } = useDeviceChoices();
  // Both always there (operator, 2026-10-16): without the microphone allowed, or before the list is read, each stays on
  // the system's device, held back, saying why.
  const allowed = useOnboardingIfAny()?.microphone?.ready ?? true;
  const usable = !!devices && allowed;
  const fallback = [{ value: "", label: t("devices.default") }];
  const why = !allowed ? t("devices.needsMic") : !devices ? t("devices.loading") : undefined;
  return <Group title={t("devices.toggle")}>
    <Row label={t("devices.mic")} description={why}>
      <Select id="settings-audio-input" aria-label={t("devices.mic")} leading={<MicrophoneIcon />} value={usable ? devices.input ?? "" : ""} disabled={busy || !usable}
        onValueChange={(input) => void choose({ input: input || null })} options={usable ? inputs : fallback} />
    </Row>
    <Row label={t("devices.speaker")} description={usable && !devices.outputSelectable ? t("devices.speakerFixed") : undefined}>
      <Select id="settings-audio-output" aria-label={t("devices.speaker")} leading={<SpeakerIcon />} value={usable && devices.outputSelectable ? devices.output ?? "" : ""}
        disabled={busy || !usable || !devices.outputSelectable} onValueChange={(output) => void choose({ output: output || null })} options={usable ? outputs : fallback} />
    </Row>
    {error && <ErrorText className="audio-devices-error" role="alert" message={error} />}
  </Group>;
}

/** What the panel holds: the microphone and the speaker to choose, a lost device said once, and why a choice failed. */
function DeviceChoices() {
  // Drawn only while the panel is open: opened, it reads the list again.
  const { t, devices, busy, error, choose, inputs, outputs } = useDeviceChoices();
  const lost = useRoomStore((state) => state.facts.audioLost);
  const store = useContext(RoomStoreContext);
  const dismissLost = () => store?.patch({ audioLost: null });
  return <>
    {!devices ? <p className="audio-devices-note" role="status">{t("devices.loading")}</p> : <>
      {/* Each box says what it holds by its icon, before the device chosen; its name is for screen readers. */}
      <div className="audio-devices-choice">
        <Select id="audio-input" aria-label={t("devices.mic")} leading={<MicrophoneIcon />} value={devices.input ?? ""} disabled={busy} onValueChange={(input) => void choose({ input: input || null })}
          options={inputs} />
      </div>
      <div className="audio-devices-choice">
        <Select id="audio-output" aria-label={t("devices.speaker")} aria-describedby={devices.outputSelectable ? undefined : "audio-output-hint"} leading={<SpeakerIcon />} value={devices.outputSelectable ? devices.output ?? "" : ""} disabled={busy || !devices.outputSelectable} onValueChange={(output) => void choose({ output: output || null })}
          options={outputs} />
        {!devices.outputSelectable && <p className="ui-field-hint" id="audio-output-hint">{t("devices.speakerFixed")}</p>}
      </div>
    </>}
    {(lost?.input || lost?.output) && <p className="audio-devices-lost" role="status">
      {t(lost.input && lost.output ? "devices.lostBoth" : lost.input ? "devices.lostInput" : "devices.lostOutput")}
      <Button variant="ghost" tone="neutral" size="sm" onClick={dismissLost}>{t("devices.gotIt")}</Button>
    </p>}
    {error && <ErrorText className="audio-devices-error" role="alert" message={error} />}
  </>;
}
