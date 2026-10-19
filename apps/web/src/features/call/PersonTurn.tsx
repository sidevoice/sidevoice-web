import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "../../components/ui/Tooltip";
import { Button } from "../../components/ui/Button";
import type { ConversationView } from "../../state/room-types";
import { LiveVoiceBalloon } from "./LiveVoiceBalloon";
import type { Translate } from "../../i18n/translator";
import { BalloonTail } from "./BalloonTail";
import { DeliveryMark } from "../conversation/MessageBubble";
import { receiptView } from "../../state/room-session-state.js";
import { PAGE_MS } from "./PagedText";
import { SENT_LEAVING_MS, useSentTurns, type SentTurn } from "./speech-reading";

/* The person's balloon at the tile's foot, drawn as the agent's is (call-view.css), its tail out of the tile's corner
 * toward whoever is speaking. While they speak, and while it is transcribed, it keeps one size: the voice's bars, long
 * and fine as a voice note, over the way to take the turn back; transcribing, the bars hold their shape and blink. Once transcribed, what
 * is sent takes their place with a little pop, the same size: its first three lines, cut with an ellipsis, for PAGE_MS,
 * then it leaves. It says the words were heard right, in time to take them back; the transcript has them all (operator,
 * 2026-10-15: no scrolling through what you said yourself). */

/* Speaking again while a turn just sent shows: it lifts away at once from where the new bars come in. Never queued:
 * the bars say at once that they are heard. */

interface Footprint { width: number; height: number }

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One turn sent, on its own clock: shown PAGE_MS, then leaving for
 *  SENT_LEAVING_MS, then done. `cut`: the person spoke again — it leaves at once. `from`: the bars' balloon it takes
 *  the place of, which it pops out of. `away`: another conversation is on the stage; its clock goes on unseen. */
function SentBubble({ turn, delivery, cut, under, away, from, onDone }: { turn: SentTurn; delivery?: string; cut: boolean; under: boolean; away: boolean; from: Footprint | null; onDone: (key: string) => void }) {
  // Sent can no longer be taken back: what it shows instead is that it got there, as the transcript's checks say.
  const receipt = delivery && receiptView(delivery).label ? delivery : null;
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  // From the bars' footprint to its own, from its corner by the tail: a touch of a pop even when it is the same size.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || !from || reducedMotion() || !node.animate) return;
    const width = node.offsetWidth || 1, height = node.offsetHeight || 1;
    const scale = (was: number, now: number) => Math.min(0.96, was / now);
    node.animate([{ transform: `scale(${scale(from.width, width)}, ${scale(from.height, height)})` }, { transform: "none" }],
      { duration: 280, easing: "cubic-bezier(.3,1.4,.5,1)" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (leaving) return;
    const next = window.setTimeout(() => setLeaving(true), PAGE_MS);
    return () => window.clearTimeout(next);
  }, [leaving]);
  useEffect(() => { if (cut) setLeaving(true); }, [cut]);
  useEffect(() => {
    if (!leaving) return;
    const next = window.setTimeout(() => onDone(turn.key), SENT_LEAVING_MS);
    return () => window.clearTimeout(next);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  if (away) return null;
  return (
    <div ref={box} className="speech-bubble person-bubble" data-sent="" data-leaving={leaving || undefined} data-under={under || undefined} translate="no">
      <span className="person-said">{turn.text}</span>
      {receipt && <span className="receipt person-receipt" data-state={receipt} role="status" aria-label={receiptView(receipt).label}><DeliveryMark state={receipt} /></span>}
      <BalloonTail shape="person" />
    </div>
  );
}

/** The person's turn at the tile's foot: while they speak and while it is transcribed, the voice's bars; once
 *  transcribed, what is sent, for its moment, then it lifts away toward the agent and fades (a plain fade under reduced
 *  motion). */
export function PersonTurn({ conversation, t }: { conversation: ConversationView; t: Translate }) {
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const { turns, done } = useSentTurns(conversation);
  const live = useRef<HTMLDivElement>(null);
  // The bars' balloon, measured while it shows: what is sent next pops out of it.
  const footprint = useRef<Footprint | null>(null);
  useLayoutEffect(() => {
    if (live.current) footprint.current = { width: live.current.offsetWidth, height: live.current.offsetHeight };
  });
  if (!pending && !turns.length) return null;
  const newest = [...turns].reverse().find((turn) => turn.thread === conversation.thread)?.key;
  return (
    <div className="person-turns">
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} onDone={done}
        delivery={conversation.messages.find((message) => message.role === "user" && (message.segment ?? String(message.time)) === turn.key)?.delivery}
        cut={pending} under={pending} away={turn.thread !== conversation.thread} from={!pending && turn.key === newest ? footprint.current : null} />)}
      {pending && (
        <LiveVoiceBalloon key="live" balloonRef={live} phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"}>
          {conversation.pendingCancellable && <Tooltip action content={t("stage.cancelTurn")}>
            <Button variant="ghost" tone="neutral" size="sm" className="cancel-input"
              onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>
          </Tooltip>}
        </LiveVoiceBalloon>
      )}
    </div>
  );
}
