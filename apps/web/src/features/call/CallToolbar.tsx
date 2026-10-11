import { useRef, useState, type SyntheticEvent } from "react";
import { JoinStatus } from "./JoinStatus";
import { AudioDevicesBar, AudioDevicesToggle } from "./AudioDevices";
import { CallButton, MicControl, MuteButton, SkipButton } from "./CallIndicators";
import { Button } from "../../components/ui/Button";
import { MoreVerticalIcon } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { callTranslator } from "./call-i18n";

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
  const t = callTranslator();
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details id="call-menu" className="call-menu" ref={menu} onToggle={returnFocus}>
      <summary className="call-button" aria-label={t("header.menu")} title={t("header.menu")}><MoreVerticalIcon size={22} /></summary>
      <div className="call-menu-panel" onClick={() => { if (menu.current) menu.current.open = false; }}>
        <Button id="stats-open" variant="ghost" tone="neutral" size="sm">{t("header.stats")}</Button>
      </div>
    </details>
  );
}

/* The call's controls in the middle — the microphone with its level, skip, the call, and ⋮ — in one tray under the
 * join's line, and the transcript's button at the right edge. */
export function CallToolbar() {
  const t = callTranslator();
  const [devicesOpen, setDevicesOpen] = useState(false);
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
    </footer>
  );
}
