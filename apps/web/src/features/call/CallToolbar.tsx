import { JoinStatus } from "./JoinStatus";
import { CallButton, MicControl, MuteButton } from "./CallIndicators";
import { CapabilityColumn, EngineColumn, LightsSummary } from "../conversation/StatusColumns";
import { Button } from "../../components/ui/Button";
import { TranscriptIcon } from "../../components/ui/Icons";
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

/* The bar's three parts: what this call has switched on at the left edge, the controls island in the
 * middle, what listens, speaks and thinks at the right edge. Facts at the sides, actions in the middle.
 * The secondary actions that lived here behind ⋯ are the header's now (RoomHeader). */
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
          <TranscriptToggle />
          <CallButton />
        </div>
      </div>
      <EngineColumn />
    </footer>
  );
}
