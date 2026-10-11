import { useRef } from "react";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, TranscriptIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { useTranscriptUnread } from "../conversation/transcript-unread";
import { callTranslator } from "./call-i18n";
import { ConversationAvatar } from "./ConversationAvatar";

/* The one way into the whole transcript (TranscriptPanel), in the stage tile, on a phone and a desktop alike — a phone
 * raises it as a sheet, a desktop docks it at the call's right. Three to compare (VARIANTS `transcript-entry`):
 * A, a strip at the tile's foot with the latest line and what is unread (a tap, or a swipe up, raises it); B, a round
 * button in the tile's corner with a dot when something is unread; C, "Send a message" where the person's turn shows,
 * which raises it with the text box ready. It keeps #transcript-toggle, where focus goes back when it closes. */
export const TRANSCRIPT_ENTRY = ["peek", "button", "turn"] as const;

/** The line a strip shows: its end, which is where an agent asks what it waits for, cut at a word. */
export function lineEnd(text: string, max = 72) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const tail = flat.slice(-max);
  const cut = tail.indexOf(" ");
  return "…" + (cut > 0 && cut < 16 ? tail.slice(cut + 1) : tail);
}

export function TranscriptEntry({ row }: { row: ParticipantView | null }) {
  const t = callTranslator();
  const variant = useVariant("transcript-entry", TRANSCRIPT_ENTRY);
  const open = useCallLayout((state) => state.transcriptOpen);
  const toggle = useCallLayout((state) => state.toggleTranscript);
  const messages = useRoomStore((state) => state.conversation.messages);
  const unread = useTranscriptUnread();
  const from = useRef<number | null>(null);
  const label = open ? t("transcript.hide") : unread ? t("transcript.showUnread", { n: unread }) : t("transcript.show");
  const common = { id: "transcript-toggle", "aria-controls": "transcript", "aria-expanded": open, "aria-haspopup": "dialog" as const };

  if (variant === "button") return (
    <Button {...common} variant="secondary" size="icon" className="transcript-entry transcript-entry--button" aria-label={label} title={label} onClick={toggle}>
      <TranscriptIcon size={20} />{unread > 0 && <span className="transcript-entry-dot" aria-hidden="true" />}
    </Button>
  );

  if (variant === "turn") return (
    <button type="button" {...common} className="transcript-entry transcript-entry--turn" aria-label={label}
      onClick={() => {
        if (!open) toggle();
        // Focused inside the tap itself, or a phone's keyboard does not come up.
        const box = document.getElementById("text-message") as HTMLTextAreaElement | null;
        if (box && !box.disabled) box.focus();
      }}>
      <TranscriptIcon size={18} /><span>{t("transcript.send")}</span>
      {unread > 0 && <span className="transcript-entry-count" aria-hidden="true">{unread}</span>}
    </button>
  );

  // The latest line that is not on the stage already: a reply still playing is in the bubble above, so the one
  // before it shows; the person's words are theirs, after "You:".
  const shown = [...messages].reverse().find((message) => !(message.role === "assistant" && message.audio === "playing"));
  return (
    <button type="button" {...common} className="transcript-entry transcript-entry--peek" aria-label={label}
      onClick={toggle}
      onPointerDown={(event) => { from.current = event.clientY; }}
      onPointerMove={(event) => { if (from.current !== null && from.current - event.clientY > 24) { from.current = null; if (!open) toggle(); } }}
      onPointerUp={() => { from.current = null; }}>
      {!shown ? <><TranscriptIcon size={18} /><span className="transcript-entry-line muted">{t("transcript.nothingYet")}</span></>
        : <>
          {shown.role === "assistant" && row ? <span className="transcript-entry-face" aria-hidden="true"><ConversationAvatar row={row} /></span>
            : <span className="transcript-entry-who">{shown.role === "user" ? t("transcript.you") : shown.name}</span>}
          <span className="transcript-entry-line" translate="no">{lineEnd(shown.text)}</span>
        </>}
      {unread > 0 && <span className="transcript-entry-count" aria-hidden="true">{unread}</span>}
      <ChevronIcon size={16} className="transcript-entry-chevron" />
    </button>
  );
}
