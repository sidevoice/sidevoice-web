import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "../../components/ui/Tooltip";
import { shortcutTip } from "../../components/ui/Keycaps";
import { ariaKeyShortcuts } from "../../state/shortcuts";
import { Button } from "../../components/ui/Button";
import type { ConversationView } from "../../state/room-types";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import type { Translate } from "../../i18n/translator";
import { BalloonTail } from "./BalloonTail";
import { PAGE_MS, PagedText } from "./PagedText";
import { SENT_LEAVING_MS, useSentTurns, type SentTurn } from "./speech-reading";

/* The person's balloon at the tile's foot, drawn as the agent's is (call-view.css), its tail out of the tile's corner
 * toward whoever is speaking. While they speak, and while it is transcribed, it keeps one size: the voice's bars, long
 * and fine as a voice note, over the way to take the turn back; transcribing, the bars shimmer. Once transcribed, what
 * is sent takes their place with a little pop, growing from their footprint where it needs more room: three lines at a
 * time (PagedText), each page PAGE_MS, the balloon staying until the last is read (no cap). The transcript has it all. */

/* Speaking again while a turn just sent shows: it lifts away at once from where the new bars come in. Never queued:
 * the bars say at once that they are heard. */

interface Footprint { width: number; height: number }

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One turn sent, on its own clock: shown its time (in "pages", a page's time per page, uncapped), then leaving for
 *  SENT_LEAVING_MS, then done. `cut`: the person spoke again — it leaves at once. `from`: the bars' balloon it takes
 *  the place of, which it pops out of. */
function SentBubble({ turn, cut, under, from, onDone }: { turn: SentTurn; cut: boolean; under: boolean; from: Footprint | null; onDone: (key: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shown = (pages ?? 1) * PAGE_MS;
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
    if (leaving || pages == null) return;
    const next = window.setTimeout(() => setLeaving(true), shown);
    return () => window.clearTimeout(next);
  }, [leaving, shown, pages]);
  useEffect(() => { if (cut) setLeaving(true); }, [cut]);
  useEffect(() => {
    if (!leaving) return;
    const next = window.setTimeout(() => onDone(turn.key), SENT_LEAVING_MS);
    return () => window.clearTimeout(next);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className="speech-bubble person-bubble" data-sent="" data-leaving={leaving || undefined} data-under={under || undefined} translate="no">
      <span className="person-said"><PagedText measure={turn.text} onPages={setPages}>{turn.text}</PagedText></span>
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
  const newest = turns[turns.length - 1]?.key;
  return (
    <div className="person-turns">
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} onDone={done}
        cut={pending} under={pending} from={!pending && turn.key === newest ? footprint.current : null} />)}
      {pending && (
        <div key="live" ref={live} className="speech-bubble person-bubble" data-live="" translate="no">
          <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />
          {/* Its row kept whether or not the turn can be taken back now, so the balloon never changes size. */}
          <div className="person-live-actions">
            {conversation.pendingCancellable && <Tooltip action content={shortcutTip(t("stage.cancelTurn"), "cancelInput")}>
              <Button variant="ghost" tone="neutral" size="sm" className="cancel-input" aria-keyshortcuts={ariaKeyShortcuts("cancelInput")}
                onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>
            </Tooltip>}
          </div>
          <BalloonTail shape="person" />
        </div>
      )}
    </div>
  );
}
