import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { CallIcon, HangupIcon, MicrophoneIcon, MicrophoneOffIcon, SkipIcon, WarningIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import { cn } from "../../lib/cn";

/* The lights and notes of the call bar. Each one is a projection of the session store and nothing else
 * writes them: the runtime records the fact, React paints it. The microphone level is the one
 * exception, and it is not in the store — it changes with every reading, so the runtime writes it onto the page
 * itself (MicWave). */

export function ScreenLock() {
  const lock = useRoomStore((state) => state.screenLock);
  return (
    <span id="screen-lock" className="screen-lock" role="status" data-state={lock.state || undefined} hidden={!lock.state}>
      <i className="screen-lock-dot" aria-hidden="true" />
      <span id="screen-lock-text" className="sr-only">{lock.state ? lock.note : ""}</span>
    </span>
  );
}

/* Skip what is sounding without saying anything: speaking over a reply to stop it also sends a message. Only this
 * device skips; the reply stays written. */
export function SkipButton() {
  const t = translator();
  const playing = useRoomStore((state) => state.facts.botLive);
  return (
    <Button id="skip-reply" variant="ghost" className="call-button" disabled={!playing} aria-label={t("toolbar.skip")} title={t("toolbar.skip")}
      onClick={() => window.sidevoiceActions?.skipReply()}>
      <SkipIcon size={22} />
    </Button>
  );
}

/* The microphone's level, as five bars on the devices' button at the left of the microphone (as Meet, and the room
 * before): the runtime writes it as `--mic-fill` on #mic-control on every reading, and the bars take their height from
 * it in CSS (call-view.css), so no render happens per reading. */
export function MicWave() {
  return <span className="mic-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
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
    <Button id="mute" variant="ghost" className={cn("call-button", mic.holding && "holding")} aria-label={mic.label} title={silent ?? mic.title}
      aria-description={silent ?? undefined} data-silent={silent ? true : undefined}
      aria-pressed={mic.pressed} disabled={mic.disabled} aria-keyshortcuts="Meta+D Control+D"
      onClick={() => window.sidevoiceActions?.toggleMic()}>
      {mic.pressed ? <MicrophoneOffIcon size={22} /> : <MicrophoneIcon size={22} />}
    </Button>
  );
}

export function CallButton() {
  const call = useRoomStore((state) => state.call);
  return (
    <Button id="connect" variant="primary" className={cn("call-button", call.joined && "joined", call.busy && "reconnecting")}
      aria-label={call.label} title={call.label} onClick={() => void window.sidevoiceActions?.toggleCall()}>
      {call.joined ? <HangupIcon /> : <CallIcon />}
    </Button>
  );
}

export function MicControl({ children }: { children: React.ReactNode }) {
  const mic = useRoomStore((state) => state.mic);
  const silent = useMicSilent();
  return <div id="mic-control" className="mic-control" data-muted={String(!mic.enabled)} data-silent={silent ? true : undefined}>
    {silent && <span className="mic-silent-note" role="status"><WarningIcon size={14} />{silent}</span>}
    {children}
  </div>;
}
