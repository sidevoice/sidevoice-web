import { useEffect, useMemo, useRef, useState } from "react";
import { conversationView } from "../../state/room-session-state.js";
import { useRoomStore } from "../../state/room-store";
import type { CardCaption } from "../../state/card-caption";
import type { ConversationView } from "../../state/room-types";
import { bubbleAt, type BubbleView } from "./speech-chunks";
import { latestWords, sounding, useSentTurn, useSpokenTo } from "./speech-reading";

/* The desktop card's caption (briefs/FLOATING-CARD-SPEC.md §4, FC8): the words being said in the conversation the call
 * is on, read on the stage's own clocks (speech-reading.ts), published on the room's caption channel
 * (state/card-caption.ts) for the card's host to carry. The card only draws it. */

/** How long a reply's last chunk stays on the caption once the reply has ended (the spec's row 8; an estimate). */
export const ENDED_SHOWN_MS = 20_000;
/** How much of a reply that came in writing the caption carries: its first words, which the card cuts at two lines. */
const WRITTEN_CHARS = 200;

export interface CaptionFacts {
  /** The person's turn to it is open (talking, or being transcribed). */
  open: boolean;
  /** What their spoken turn just sent, for its moment (useSentTurn). */
  sent: string | null;
  /** The reply sounding, where the voice is in it (bubbleAt). */
  live: BubbleView | null;
  /** Call model B, the agents muted: the reply that came in writing, while its mark stays. */
  written: string | null;
  /** The last chunk of a reply that just ended, for ENDED_SHOWN_MS. */
  ended: string | null;
}

/** The caption, the first that applies: the person's own turn (it wins over a reply it talks over: the person's own
 *  words matter more to them), the reply sounding, one that came in writing, one that just ended; none otherwise. */
export function cardCaption({ open, sent, live, written, ended }: CaptionFacts): CardCaption | null {
  if (open) return { who: "you", previous: "", current: "", spoken: null, source: "voice" };
  if (sent) return { who: "you", previous: "", current: latestWords(sent), spoken: null, source: "voice" };
  if (live) return { who: "agent", previous: live.previous ?? "", current: live.current.text, spoken: live.spoken, source: "voice" };
  if (written) return { who: "agent", previous: "", current: written.slice(0, WRITTEN_CHARS), spoken: null, source: "written" };
  if (ended) return { who: "agent", previous: "", current: ended, spoken: null, source: "voice" };
  return null;
}

const NO_CONVERSATION: ConversationView = { messages: [], pendingText: "", pendingPhase: "", pendingCancellable: false, working: false };

/** Publishes the caption while the room is shown; renders nothing. */
export function CardCaptionFeed() {
  const facts = useRoomStore((state) => state.facts);
  const selected = useRoomStore((state) => state.session.selected);
  const row = useRoomStore((state) => state.participants.find((participant) => participant.threadId === state.session.selected) ?? null);
  // The call's own conversation, whichever is looked at: its transcript and its open turn, as the stage reads them.
  const conversation = useMemo(() => (selected ? conversationView({ ...facts, viewedThread: selected }) : NO_CONVERSATION), [facts, selected]);
  const reply = sounding(conversation.messages, facts.botLive);
  const spokenTo = useSpokenTo(reply, facts.botLive, conversation.messages);
  const sent = useSentTurn(conversation);
  const live = reply && spokenTo !== null ? bubbleAt(reply.text, spokenTo) : null;

  // A reply that ends leaves its last chunk a while, dim.
  const [ended, setEnded] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const liveText = live?.current.text ?? null;
  useEffect(() => {
    if (liveText) {
      last.current = liveText;
      setEnded(null);
      return;
    }
    if (!last.current) return;
    setEnded(last.current);
    last.current = null;
    const timer = window.setTimeout(() => setEnded(null), ENDED_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [liveText]);

  const writtenReply = facts.callModel === "voice-switch" && facts.agentsMuted && row?.mark
    ? [...conversation.messages].reverse().find((message) => message.role === "assistant" && message.audioReason === "agentsMuted") ?? null : null;
  const caption = cardCaption({
    open: !!conversation.pendingPhase || !!conversation.pendingText, sent: sent?.text ?? null, live,
    written: writtenReply?.text ?? null, ended,
  });
  useEffect(() => { window.sidevoiceUI?.caption?.publish(caption); });
  return null;
}
