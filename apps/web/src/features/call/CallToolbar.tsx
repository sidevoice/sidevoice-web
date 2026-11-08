import { useRef, type SyntheticEvent } from "react";
import { JoinStatus } from "./JoinStatus";
import { AudioDevices } from "./AudioDevices";
import { CallButton, CaptionsButton, MicControl, MuteButton, SkipButton } from "./CallIndicators";
import { Button } from "../../components/ui/Button";
import { MoreVerticalIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { TranscriptEntry } from "./TranscriptEntry";
import { translator } from "../../i18n/translator";

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
  return (
    <details id="call-menu" className="call-menu" ref={menu} onToggle={returnFocus}>
      <summary className="call-button" aria-label={t("header.menu")} title={t("header.menu")}><MoreVerticalIcon size={22} /></summary>
      <div className="call-menu-panel" onClick={() => { if (menu.current) menu.current.open = false; }}>
        <Button id="stats-open" variant="ghost" tone="neutral" size="sm">{t("header.stats")}</Button>
      </div>
    </details>
  );
}

/* The call's controls in the middle — the microphone with its level, captions, skip, the call, and ⋮ — in one tray under the
 * join's line, and the transcript's button at the right edge. */
export function CallToolbar() {
  const t = translator();
  const narrow = useMedia(NARROW_QUERY);
  return (
    <footer className="call-bar">
      <div className="controls" id="call-controls">
        <JoinStatus />
        <div className="call-actions">
          <MicControl>
            <span id="mic-level-meter" className="sr-only" role="meter" aria-label={t("toolbar.micLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
            <AudioDevices />
            <MuteButton />
          </MicControl>
          <CaptionsButton />
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

/* The call's controls alone, for the desktop app's floating card: the microphone with its level and devices, captions,
 * skip and the call, the same components as above; no ⋮ (nothing of it belongs on a card), no join line, no transcript. */
export function CardCallBar() {
  const t = translator();
  return (
    <footer className="call-bar card-call-bar">
      <div className="controls" id="call-controls">
        <div className="call-actions">
          <MicControl>
            <span id="mic-level-meter" className="sr-only" role="meter" aria-label={t("toolbar.micLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
            <AudioDevices />
            <MuteButton />
          </MicControl>
          <CaptionsButton />
          <SkipButton />
          <CallButton />
        </div>
      </div>
    </footer>
  );
}
