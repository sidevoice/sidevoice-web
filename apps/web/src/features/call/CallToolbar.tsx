import { useRef, type SyntheticEvent } from "react";
import { JoinStatus } from "./JoinStatus";
import { CallButton, MicControl, MuteButton, SkipButton } from "./CallIndicators";
import { CapabilityColumn, EngineColumn, LightsSummary } from "../conversation/StatusColumns";
import { Button } from "../../components/ui/Button";
import { MoreVerticalIcon, TranscriptIcon } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { callTranslator } from "./call-i18n";

/** The whole transcript, behind one button of the call (TranscriptPanel). */
function TranscriptToggle() {
  const t = callTranslator();
  const open = useCallLayout((state) => state.transcriptOpen);
  const toggle = useCallLayout((state) => state.toggleTranscript);
  const label = open ? t("transcript.hide") : t("transcript.show");
  return (
    <Button id="transcript-toggle" variant="ghost" className="transcript-toggle" aria-controls="transcript" aria-expanded={open}
      aria-label={label} title={label} onClick={toggle}>
      <TranscriptIcon />
    </Button>
  );
}

/* The call's secondary actions, behind ⋯ beside the call's own. Its id and class are the runtime's: it binds the
 * statistics dialog to #stats-open, closes the menu when the statistics open, and closes it on a click outside or
 * Escape (`.call-menu`). However it closes, focus that was in it, or went nowhere, goes back to ⋯; focus a dialog
 * took stays there. Settings is the header's gear (RoomHeader). */
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
      <summary aria-label={t("header.menu")} title={t("header.menu")}><MoreVerticalIcon size={22} /></summary>
      <div className="call-menu-panel" onClick={() => { if (menu.current) menu.current.open = false; }}>
        <Button id="stats-open" variant="ghost" size="compact">{t("header.stats")}</Button>
      </div>
    </details>
  );
}

/* The bar's three parts: what this call has switched on at the left edge, the controls island in the
 * middle — the microphone, skip, the call, and ⋮ —, and at the right edge what listens, speaks and thinks, and the
 * transcript's button. Facts at the sides, the call's actions in the middle. */
export function CallToolbar() {
  const t = callTranslator();
  return (
    <footer className="call-bar">
      <CapabilityColumn />
      <LightsSummary />
      <div className="controls" id="call-controls">
        <JoinStatus />
        <div className="call-actions">
          <MicControl>
            <span id="mic-level-meter" className="sr-only" role="meter" aria-label={t("toolbar.micLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
                        <MuteButton />
          </MicControl>
          <SkipButton />
          <CallButton />
          <CallMenu />
        </div>
      </div>
      <div className="call-bar-end">
        <EngineColumn />
        <TranscriptToggle />
      </div>
    </footer>
  );
}
