import { useRef, useState, type SyntheticEvent } from "react";
import { JoinStatus } from "./JoinStatus";
import { AudioDevicesBar, AudioDevicesToggle } from "./AudioDevices";
import { CallButton, MicControl, MuteButton, SkipButton } from "./CallIndicators";
import { Button } from "../../components/ui/Button";
import { MoreVerticalIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { TranscriptEntry } from "./TranscriptEntry";
import { translator } from "../../i18n/translator";
import { useRoomStore } from "../../state/room-store";

/* The call's secondary actions, behind ⋮ beside the call's own, opening upwards. Its id and class are the runtime's:
 * it binds the statistics dialog to #stats-open, closes the menu when the statistics open, and closes it on a click
 * outside or Escape (`.call-menu`). However it closes, focus that was in it, or went nowhere, goes back to ⋮; focus a
 * dialog took stays there. Settings is the header's gear (RoomHeader). */
function returnFocus(event: SyntheticEvent<HTMLDetailsElement>) {
  const menu = event.currentTarget;
  const now = document.activeElement;
  if (!menu.open && (!now || now === document.body || menu.contains(now))) menu.querySelector("summary")?.focus();
}

function CallMenu() {
  const t = translator();
  const menu = useRef<HTMLDetailsElement>(null);
  const output = useRoomStore((state) => state.facts.speechOutput);
  return (
    <details id="call-menu" className="call-menu" ref={menu} onToggle={returnFocus}>
      <summary className="call-button" aria-label={t("header.menu")} title={t("header.menu")}><MoreVerticalIcon size={22} /></summary>
      <div className="call-menu-panel" onClick={() => { if (menu.current) menu.current.open = false; }}>
        <Button variant="ghost" tone="neutral" size="sm" aria-pressed={output === "agents_muted"}
          onClick={() => window.sidevoiceActions?.setSpeechOutput?.(output === "agents_muted" ? "on" : "agents_muted")}>{t(output === "agents_muted" ? "toolbar.agentsUnmute" : "toolbar.agentsMute")}</Button>
        <Button variant="ghost" tone="neutral" size="sm" aria-pressed={output === "voice_off"}
          onClick={() => window.sidevoiceActions?.setSpeechOutput?.(output === "voice_off" ? "on" : "voice_off")}>{t(output === "voice_off" ? "toolbar.voiceOn" : "toolbar.voiceOff")}</Button>
        <Button id="stats-open" variant="ghost" tone="neutral" size="sm">{t("header.stats")}</Button>
      </div>
    </details>
  );
}

/* The call's controls in the middle — the microphone with its level, skip, the call, and ⋮ — in one tray under the
 * join's line, and the transcript's button at the right edge. */
export function CallToolbar() {
  const t = translator();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const narrow = useMedia(NARROW_QUERY);
  return (
    <footer className="call-bar">
      <AudioDevicesBar id="audio-devices" open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <div className="controls" id="call-controls">
        <JoinStatus />
        <div className="call-actions">
          <MicControl>
            <span id="mic-level-meter" className="sr-only" role="meter" aria-label={t("toolbar.micLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
            <AudioDevicesToggle open={devicesOpen} controls="audio-devices" onToggle={() => setDevicesOpen((was) => !was)} />
            <MuteButton />
          </MicControl>
          <SkipButton />
          <CallButton />
          <CallMenu />
        </div>
      </div>
      {/* On a desktop, the transcript's button at the bar's right end, a round button as the bar's, level with them. */}
      {!narrow && <div className="call-bar-end"><TranscriptEntry /></div>}
    </footer>
  );
}
