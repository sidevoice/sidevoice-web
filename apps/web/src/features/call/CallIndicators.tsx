import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { CallIcon, HangupIcon, MicrophoneIcon, SkipIcon } from "../../components/ui/Icons";
import { callTranslator } from "./call-i18n";
import { cn } from "../../lib/cn";

/* The lights and notes of the call bar. Each one is a projection of the session store and nothing else
 * writes them: the runtime records the fact, React paints it. The microphone level is the one
 * exception, and it is not here — it changes per animation frame and the meter owns its own pixels. */

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
  const t = callTranslator();
  const playing = useRoomStore((state) => state.facts.botLive);
  return (
    <Button id="skip-reply" variant="ghost" disabled={!playing} aria-label={t("toolbar.skip")} title={t("toolbar.skip")}
      onClick={() => window.sidevoiceActions?.skipReply()}>
      <SkipIcon size={24} />
    </Button>
  );
}

export function MuteButton() {
  const mic = useRoomStore((state) => state.mic);
  return (
    <Button id="mute" variant="ghost" className={cn(mic.holding && "holding")} aria-label={mic.label} title={mic.title}
      aria-pressed={mic.pressed} disabled={mic.disabled} aria-keyshortcuts="Meta+D Control+D"
      onClick={() => window.sidevoiceActions?.toggleMic()}>
      <MicrophoneIcon size={26} />
    </Button>
  );
}

export function CallButton() {
  const call = useRoomStore((state) => state.call);
  return (
    <Button id="connect" variant="primary" className={cn(call.joined && "joined", call.busy && "reconnecting")}
      aria-label={call.label} title={call.label} onClick={() => void window.sidevoiceActions?.toggleCall()}>
      {call.joined ? <HangupIcon /> : <CallIcon />}
    </Button>
  );
}

export function MicControl({ children }: { children: React.ReactNode }) {
  const mic = useRoomStore((state) => state.mic);
  return <div id="mic-control" className="mic-control" data-muted={String(!mic.enabled)}>{children}</div>;
}
