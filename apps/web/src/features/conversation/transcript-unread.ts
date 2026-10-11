import { useEffect } from "react";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";

/* What the transcript has not shown yet: the agent's messages after the last one it showed, counted while it is closed.
 * Opening it, or another conversation coming to the call, makes everything seen (TranscriptPanel marks it). */

export function useTranscriptUnread(): number {
  const messages = useRoomStore((state) => state.conversation.messages);
  const seen = useCallLayout((state) => state.transcriptSeen);
  const open = useCallLayout((state) => state.transcriptOpen);
  if (open || !messages.length) return 0;
  const from = seen ? messages.findIndex((message) => message.segment === seen) : -1;
  // A mark this conversation does not have is another's: nothing of this one is counted until it is seen once.
  if (from < 0) return 0;
  return messages.slice(from + 1).filter((message) => message.role === "assistant").length;
}

/** Keeps the mark on the latest message while the transcript is open, and when the conversation changes. */
export function useMarkTranscriptSeen() {
  const messages = useRoomStore((state) => state.conversation.messages);
  const thread = useRoomStore((state) => state.conversation.messages.at(-1)?.thread ?? null);
  const open = useCallLayout((state) => state.transcriptOpen);
  const mark = useCallLayout((state) => state.markTranscriptSeen);
  const last = messages.at(-1)?.segment ?? null;
  useEffect(() => { if (open) mark(last); }, [open, last, mark]);
  useEffect(() => { mark(last); }, [thread]);
}
