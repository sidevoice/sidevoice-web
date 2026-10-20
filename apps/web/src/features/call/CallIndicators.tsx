import { useContext } from "react";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { openSettings } from "../settings/open-settings";
import { Button } from "../../components/ui/Button";
import { CallIcon, CaptionsIcon, CaptionsOffIcon, HangupIcon, MicrophoneIcon, MicrophoneOffIcon, SkipIcon, WarningIcon } from "../../components/ui/Icons";
import { setCaptions, useCaptions } from "../../state/captions";
import { translator, type MessageKey } from "../../i18n/translator";
import { Tooltip } from "../../components/ui/Tooltip";
import { shortcutTip } from "../../components/ui/Keycaps";
import { ariaKeyShortcuts } from "../../state/shortcuts";
import { cn } from "../../lib/cn";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";

/* The lights and notes of the call bar. Each one is a projection of the session store and nothing else
 * writes them: the runtime records the fact, React paints it. The microphone level is the one
 * exception, and it is not in the store — it changes with every reading, so the runtime writes it onto the page
 * itself (MicWave). */

export function ScreenLock() {
  const t = translator();
  const lock = useRoomStore((state) => state.screenLock);
  return (
    <span id="screen-lock" className="screen-lock" role="status" data-state={lock.state || undefined} hidden={!lock.state}>
      <i className="screen-lock-dot" aria-hidden="true" />
      <span id="screen-lock-text" className="sr-only">{lock.state && lock.note ? t(lock.note as MessageKey) : ""}</span>
    </span>
  );
}

/* Skip what is sounding without saying anything: speaking over a reply to stop it also sends a message. Only this
 * device skips; the reply stays written. */
export function SkipButton() {
  const t = translator();
  const playing = useRoomStore((state) => state.facts.botLive);
  return (
    <Tooltip action content={shortcutTip(t("toolbar.skip"), "skip")}>
      <Button id="skip-reply" variant="ghost" className="call-button" disabled={!playing} aria-label={t("toolbar.skip")} aria-keyshortcuts={ariaKeyShortcuts("skip")}
        onClick={() => window.sidevoiceActions?.skipReply()}>
        <SkipIcon size={22} />
      </Button>
    </Tooltip>
  );
}


/* Captions: what is said, in balloons on the stage. On unless turned off; the same choice as the desktop app's floating
 * card (state/captions.ts, sidevoice-web#239). */
export function CaptionsButton() {
  const t = translator();
  const on = useCaptions();
  const label = t(on ? "toolbar.captionsHide" : "toolbar.captionsShow");
  return (
    <Tooltip action content={label}>
      <Button id="captions-toggle" variant="ghost" className="call-button" aria-label={label} aria-pressed={on} onClick={() => setCaptions(!on)}>
        {on ? <CaptionsIcon size={22} /> : <CaptionsOffIcon size={22} />}
      </Button>
    </Tooltip>
  );
}

/* The microphone's level, as five bars on the devices' button at the left of the microphone (as Meet, and the room
 * before): the runtime writes it as `--mic-level` on #mic-control on every reading, and the bars take their height from
 * it in CSS (call-view.css), so no render happens per reading. */
export function MicWave() {
  return <span className="mic-wave" aria-hidden="true"><i><b /></i><i><b /></i><i><b /></i><i><b /></i><i><b /></i></span>;
}

/** The microphone gives no sound though the person has not muted it: its device is held elsewhere (another app, the
 *  system), as the voice reports it (microphone "muted"). */
export function useMicSilent() {
  const t = translator();
  const silent = useRoomStore((state) => !!state.facts.ws && state.mic.enabled && state.facts.voiceState?.microphone === "muted");
  return silent ? t("mic.silent") : null;
}

export function MuteButton() {
  const mic = useRoomStore((state) => state.mic);
  const silent = useMicSilent();
  return (
    <Tooltip action content={shortcutTip(silent ?? mic.title, "mute")}>
      <Button id="mute" variant="ghost" className={cn("call-button", mic.holding && "holding")} aria-label={mic.label}
        aria-description={silent ?? undefined} data-silent={silent ? true : undefined}
        aria-pressed={mic.pressed} disabled={mic.disabled} aria-keyshortcuts={ariaKeyShortcuts("mute")}
        onClick={() => window.sidevoiceActions?.toggleMic()}>
        {mic.pressed ? <MicrophoneOffIcon size={22} /> : <MicrophoneIcon size={22} />}
      </Button>
    </Tooltip>
  );
}

export function CallButton() {
  const t = translator();
  const call = useRoomStore((state) => state.call);
  const store = useContext(RoomStoreContext);
  const onboarding = useOnboardingIfAny();
  // The microphone not allowed: the call waits, held back and saying why on hover and focus (operator, 2026-10-16);
  // pressed, it opens Settings › Permissions. A call already joined can always be left.
  const held = !call.joined && !(onboarding?.microphone?.ready ?? true);
  return (<span className="call-held">
    {/* Held: said above it, as the microphone that gives no sound is (operator, 2026-10-16). */}
    {held && <span className="call-held-note" role="status"><WarningIcon size={14} />{t("call.needsMic")}</span>}
    <Tooltip action content={held ? t("call.needsMic") : call.label}>
      <Button id="connect" variant="primary" className={cn("call-button", call.joined && "joined", call.busy && "reconnecting")}
        aria-label={call.label} disabled={held} blockedBy={held ? "connect-why" : undefined} onBlocked={() => openSettings({ section: "permissions" }, store)} onClick={() => void window.sidevoiceActions?.toggleCall()}>
        {call.joined ? <HangupIcon /> : <CallIcon />}
      </Button>
    </Tooltip>
    {held && <span id="connect-why" className="sr-only">{t("call.needsMic")}</span>}
  </span>);
}

export function MicControl({ children }: { children: React.ReactNode }) {
  const mic = useRoomStore((state) => state.mic);
  const silent = useMicSilent();
  return <div id="mic-control" className="mic-control" data-muted={String(!mic.enabled)} data-silent={silent ? true : undefined}>
    {silent && <span className="mic-silent-note" role="status"><WarningIcon size={14} />{silent}</span>}
    {children}
  </div>;
}
