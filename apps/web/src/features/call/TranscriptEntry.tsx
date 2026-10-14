import { Button } from "../../components/ui/Button";
import { TranscriptIcon } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { useTranscriptUnread } from "../conversation/transcript-unread";
import { translator } from "../../i18n/translator";

/* The one way into the whole transcript (TranscriptPanel): in the stage tile's corner on a phone, at the call bar's right
 * end on a desktop (CallToolbar) — a phone raises it as a sheet, a desktop docks it at the call's right: a round button, a dot on it when something arrived
 * while it was closed (the count is in its name). It keeps #transcript-toggle, where focus goes back when it closes. */
export function TranscriptEntry() {
  const t = translator();
  const open = useCallLayout((state) => state.transcriptOpen);
  const toggle = useCallLayout((state) => state.toggleTranscript);
  const unread = useTranscriptUnread();
  const label = open ? t("transcript.hide") : unread ? t("transcript.showUnread", { n: unread }) : t("transcript.show");
  return (
    <Button id="transcript-toggle" variant="secondary" size="icon" className="transcript-entry" aria-controls="transcript" aria-expanded={open}
      aria-haspopup="dialog" aria-label={label} title={label} onClick={toggle}>
      <TranscriptIcon size={20} />{unread > 0 && <span className="transcript-entry-dot" aria-hidden="true" />}
    </Button>
  );
}
