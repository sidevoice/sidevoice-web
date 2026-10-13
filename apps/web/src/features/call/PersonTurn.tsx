import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { SentIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import type { ConversationView } from "../../state/room-types";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import type { CallTranslate } from "./call-i18n";
import { LIVE_TAIL, SENT_LEAVING_MS, latestWords, sentShownMs, useSentTurns, type SentOnSpeech, type SentTurn } from "./speech-reading";

/** How what a spoken turn sent shows on the stage (VARIANTS `sent-text`): its latest words after a "…" (today); its
 *  first three lines, the last fading into the quieter ink before its "…"; a long one in a smaller type, four lines;
 *  its first line and the transcript's check; or three lines at a time, the next three scrolling up in their place like
 *  a page turned, the bubble staying until the last is read. The transcript always has the whole of it. */
export const SENT_TEXT = ["tail", "clamp", "shrink", "line", "pages"] as const;
/** How long each page of three lines stays, in "pages": the bubble stays a page's time per page, with no cap. */
export const SENT_PAGE_MS = 3000;
export type SentText = (typeof SENT_TEXT)[number];

/** What a turn just sent does when the person speaks again during its moment (VARIANTS `sent-repeat`): the bars take
 *  its place at once (today); it moves up above the new bubble and keeps going as it was — its pages, its time — then
 *  leaves as usual; or it lifts away at once while the bars come in. Never queued: the bars say at once that they are
 *  heard. */
export const SENT_REPEAT = ["replace", "stack", "leave"] as const;
export type SentRepeat = (typeof SENT_REPEAT)[number];
const ON_SPEECH: Record<SentRepeat, SentOnSpeech> = { replace: "drop", stack: "keep", leave: "leave" };

/** What was sent, as `mode` shows it. Clamped, its last line fades only when there is more than it shows. */
function SentWords({ text, mode, onPages }: { text: string; mode: SentText; onPages: (pages: number) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);
  const lines = mode === "line" ? 1 : mode === "clamp" ? 3 : mode === "shrink" ? 4 : undefined;
  const fades = mode === "clamp";
  useLayoutEffect(() => {
    const node = ref.current;
    setMore(fades && !!node && node.scrollHeight > node.clientHeight + 1);
  }, [text, fades]);
  if (mode === "pages") return <SentPages text={text} onPages={onPages} />;
  return (
    <span ref={ref} className="person-said" data-lines={lines} data-small={(mode === "shrink" && text.length > LIVE_TAIL) || undefined}
      data-faded={(fades && more) || undefined}>{mode === "tail" ? latestWords(text) : text}</span>
  );
}

/** "pages": three lines at a time; when there is more, the next three scroll up in their place every SENT_PAGE_MS. */
function SentPages({ text, onPages }: { text: string; onPages: (pages: number) => void }) {
  const box = useRef<HTMLSpanElement>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const line = parseFloat(getComputedStyle(node).lineHeight) || 24;
    const inner = node.firstElementChild as HTMLElement | null;
    const count = Math.max(1, Math.ceil(((inner?.scrollHeight ?? 0) - 1) / (line * 3)));
    setStep(line * 3); setPages(count); setPage(0); onPages(count);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (page >= pages - 1) return;
    const next = window.setTimeout(() => setPage((now) => now + 1), SENT_PAGE_MS);
    return () => window.clearTimeout(next);
  }, [page, pages]);
  return <span ref={box} className="person-said person-pages" data-more={page < pages - 1 || undefined}>
    <span className="person-pages-run" style={{ transform: `translateY(${-page * step}px)` }}>{text}</span>
  </span>;
}

/** One turn sent, on its own clock: shown its time (in "pages", a page's time per page, uncapped), then leaving for
 *  SENT_LEAVING_MS, then done. `cut`: the person spoke again where that ends it — leaving at once, or gone. */
function SentBubble({ turn, mode, cut, under, onDone, t }: { turn: SentTurn; mode: SentText; cut: SentOnSpeech | null; under: boolean; onDone: (key: string) => void; t: CallTranslate }) {
  const [pages, setPages] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shown = mode === "pages" ? (pages ?? 1) * SENT_PAGE_MS : sentShownMs(turn.text);
  useEffect(() => {
    if (leaving || (mode === "pages" && pages == null)) return;
    const next = window.setTimeout(() => setLeaving(true), shown);
    return () => window.clearTimeout(next);
  }, [leaving, shown, mode, pages]);
  useEffect(() => { if (cut === "leave") setLeaving(true); else if (cut === "drop") onDone(turn.key); }, [cut]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!leaving) return;
    const next = window.setTimeout(() => onDone(turn.key), SENT_LEAVING_MS);
    return () => window.clearTimeout(next);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  if (cut === "drop") return null;
  return (
    <div className="speech-bubble person-bubble" data-sent="" data-leaving={leaving || undefined} data-under={under || undefined} translate="no">
      <SentWords text={turn.text} mode={mode} onPages={setPages} />
      {mode === "line" && <span className="person-sent-check"><SentIcon size={14} /><span className="sr-only">{t("stage.sent")}</span></span>}
    </div>
  );
}

/** The person's turn at the tile's foot: while they speak and while it is transcribed, the voice's bars; once
 *  transcribed, what is sent, for its moment, then it lifts away toward the agent and fades (a plain fade under reduced
 *  motion). In "stack", what was sent before stays above the new bubble, going on as it was. */
export function PersonTurn({ conversation, t }: { conversation: ConversationView; t: CallTranslate }) {
  const mode = useVariant("sent-text", SENT_TEXT);
  const repeat = useVariant("sent-repeat", SENT_REPEAT);
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const { turns, done } = useSentTurns(conversation);
  if (!pending && !turns.length) return null;
  const onSpeech = ON_SPEECH[repeat];
  return (
    <div className="person-turns" data-repeat={repeat}>
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} mode={mode} t={t} onDone={done}
        cut={pending && onSpeech !== "keep" ? onSpeech : null} under={pending && repeat === "leave"} />)}
      {pending && (
        <div key="live" className="speech-bubble person-bubble" translate="no">
          <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />
          {conversation.pendingCancellable && <Button variant="ghost" tone="neutral" size="sm" className="cancel-input"
            onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>}
        </div>
      )}
    </div>
  );
}
