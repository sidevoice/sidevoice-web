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
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { CancelGlyph, MicIcon } from "./StageVoice";

/* The person's balloon at the tile's foot, drawn as the agent's is (call-view.css), its tail out of the tile's corner
 * toward whoever is speaking. While they speak, and while it is transcribed, it keeps one size: the voice's bars, long
 * and fine as a voice note, over the way to take the turn back; transcribing, the bars hold their shape and blink. Once transcribed, what
 * is sent takes their place with a little pop, the same size: its first three lines, cut with an ellipsis, for PAGE_MS,
 * then it leaves. It says the words were heard right, in time to take them back; the transcript has them all (operator,
 * 2026-10-15: no scrolling through what you said yourself). */

/* Speaking again while a turn just sent shows: it lifts away at once from where the new bars come in. Never queued:
 * the bars say at once that they are heard. */

/* The stage's look (`look="card"`, the design reference's T36, without streamed words: production has none): under the
 * creature, an icon pill where the words will come, the microphone and the voice's bars while they speak, "Transcribing"
 * while it is, and the × to take the turn back on it (T27: clicking it lifts the turn away); then what was sent pops out
 * of it, a white card as the agent's, cut to three lines, for PAGE_MS, and lifts away. The same clocks as the balloon's. */
export type PersonTurnLook = "balloon" | "card";

interface Footprint { width: number; height: number }

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One turn sent, on its own clock: shown PAGE_MS, then leaving for
 *  SENT_LEAVING_MS, then done. `cut`: the person spoke again — it leaves at once. `from`: the bars' balloon it takes
 *  the place of, which it pops out of. `away`: another conversation is on the stage; its clock goes on unseen. */
function SentBubble({ turn, delivery, cut, under, away, from, onDone, look }: { turn: SentTurn; delivery?: string; cut: boolean; under: boolean; away: boolean; from: Footprint | null; onDone: (key: string) => void; look: PersonTurnLook }) {
  // Sent can no longer be taken back: what it shows instead is that it got there, as the transcript's checks say.
  const receipt = delivery && receiptView(delivery).label ? delivery : null;
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  // From the bars' footprint to its own, from its corner by the tail: a touch of a pop even when it is the same size.
  useLayoutEffect(() => {
    const node = box.current;
    // The card pops out of the pill as every card on the stage pops in (stage-voice.css), not from the pill's footprint.
    if (look === "card" || !node || !from || reducedMotion() || !node.animate) return;
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
  if (look === "card") return (
    <div ref={box} className="vcap card person sent" data-leaving={leaving || undefined} translate="no">
      <span className="vcap-said"><span>{turn.text}</span></span>
    </div>
  );
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
export function PersonTurn({ conversation, t, look = "balloon", cut: over = false }: { conversation: ConversationView; t: Translate; look?: PersonTurnLook;
  /** Something newer took the stage's place for it (the agent's reply, under the creature): what was sent lifts away. */
  cut?: boolean }) {
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const { turns, done } = useSentTurns(conversation);
  const taken = useTakenBack(pending);
  const live = useRef<HTMLDivElement>(null);
  // The bars' balloon, measured while it shows: what is sent next pops out of it.
  const footprint = useRef<Footprint | null>(null);
  useLayoutEffect(() => {
    if (live.current) footprint.current = { width: live.current.offsetWidth, height: live.current.offsetHeight };
  });
  if (look === "card") {
    if (!pending && !turns.length && !taken.leaving) return null;
    const transcribing = conversation.pendingPhase === "transcribing";
    return <>
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} onDone={done} look="card" cut={pending || over} under={false} away={turn.thread !== conversation.thread} from={null} />)}
      {(pending || taken.leaving) && (
        <div key={"live-" + taken.round} className="vcap card person pill" data-phase={transcribing ? "transcribing" : "listening"} data-leaving={taken.leaving || undefined} translate="no">
          <span className="lead"><MicIcon />{transcribing
            ? <span className="tlabel" role="status">{t("stage.transcribing")}<span className="ell" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
            : <VoiceWaveform phase="listening" />}</span>
          {(conversation.pendingCancellable || taken.leaving) && <Tooltip action content={t("stage.cancelTurn")}>
            <button type="button" className="cancel" aria-label={t("stage.cancelTurn")} disabled={taken.leaving}
              onClick={() => { taken.take(); void window.sidevoiceActions?.cancelInput(); }}><CancelGlyph /></button>
          </Tooltip>}
        </div>
      )}
    </>;
  }
  if (!pending && !turns.length) return null;
  const newest = [...turns].reverse().find((turn) => turn.thread === conversation.thread)?.key;
  return (
    <div className="person-turns">
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} onDone={done} look="balloon"
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

/** The turn taken back (T27): its pill stays, lifting away, for SENT_LEAVING_MS after the × is pressed, whatever the room
 *  does with the turn meanwhile; a new turn after it starts a new pill (`round`). */
function useTakenBack(pending: boolean) {
  const [leaving, setLeaving] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!leaving) return;
    const next = window.setTimeout(() => { setLeaving(false); setRound((n) => n + 1); }, SENT_LEAVING_MS);
    return () => window.clearTimeout(next);
  }, [leaving]);
  // Speaking again before it has gone: the new turn's pill comes in at once, the one taken back gone.
  const was = useRef(pending);
  useEffect(() => {
    if (pending && !was.current && leaving) { setLeaving(false); setRound((n) => n + 1); }
    was.current = pending;
  }, [pending, leaving]);
  return { leaving, round, take: () => setLeaving(true) };
}
