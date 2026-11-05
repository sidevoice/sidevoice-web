import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ToLatestArrowIcon, TranscriptIcon } from "../../components/ui/Icons";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { translator, uiLanguage } from "../../i18n/translator";
import { TextLayoutContext } from "./FoldedText";
import { MessageGroup } from "./MessageGroup";
import { transcriptBlocks } from "./transcript-blocks";

export { dayLabel } from "./transcript-blocks";

/** At the foot: within this of the list's end (the reference's 24px). There it follows the newest; above it, it keeps
 *  its place and the way back shows. */
export const FOOT_PX = 24;
/** Jumping to the latest pins the list to its very foot this long, while the live turn may still grow it (T38). */
export const PIN_MS = 900;
/** When the smooth jump is taken to have arrived, and is set exactly at the foot. */
export const JUMP_SETTLE_MS = 650;

/** The messages with no word lit: a transcript nobody sees. */
const unlit = (messages: ChatMessage[]) => messages.map((message) => message.karaoke ? { ...message, karaoke: null } : message);

const reducedMotion = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** `visible`: the list is on screen. Hidden, it cannot scroll, so it lands on the latest message when it shows.
 *  `inCall`: the person is in the call; out of it the transcript is not shown, so neither is the working row.
 *
 *  It follows the newest only while at its foot; scrolled up, it keeps its place and the way back to the latest shows,
 *  with a dot once something new has come (T31, T38). The way back reaches the very foot and stays pinned there for
 *  PIN_MS while the live turn grows. Each block (a day, a run) is drawn again only when what it shows changed (T40). */
export function MessageList({ conversation: view, visible = true, inCall = true }: { conversation: ConversationView; visible?: boolean; inCall?: boolean }) {
  const t = translator();
  const language = uiLanguage();
  const conversation = useMemo(() => inCall || !view.working ? view : { ...view, working: false }, [view, inCall]);
  // Closed, it does not follow the voice word by word: nobody sees the words light, and every step would write the text of a
  // box that has no layout. It lights them as it opens.
  const messages = useMemo(() => visible ? conversation.messages : unlit(conversation.messages), [conversation.messages, visible]);
  const blocks = transcriptBlocks(conversation, messages, t, language);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atFoot = useRef(true);
  const pinnedUntil = useRef(0);
  const [away, setAway] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [width, setWidth] = useState(0);
  const [fonts, setFonts] = useState(0);
  const lastId = conversation.messages.at(-1)?.segment || null;

  const following = () => atFoot.current || performance.now() < pinnedUntil.current;
  const toFoot = (behavior: ScrollBehavior = "instant") => {
    const node = viewport.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior });
  };
  const readScroll = () => {
    const node = viewport.current;
    if (!node) return;
    const foot = node.scrollHeight - node.scrollTop - node.clientHeight < FOOT_PX;
    atFoot.current = foot;
    setAway(!foot);
    if (foot) setFresh(false);
  };

  // Something new: at the foot (or pinned there), it is followed before it is painted; above it, the place is kept and
  // the way back gets its dot. The live words lighting up are not new: they change no height.
  useLayoutEffect(() => {
    if (following()) { toFoot(); atFoot.current = true; }
    else setFresh(true);
  }, [lastId, conversation.messages.length, conversation.pendingText, conversation.pendingPhase, conversation.working]);

  // Opening lands on the latest at once: "auto" would take the list's smooth scrolling and pass for being away.
  useLayoutEffect(() => {
    if (!visible) return;
    toFoot("instant");
    atFoot.current = true;
    setAway(false);
    setFresh(false);
  }, [visible]);

  // Whatever changes the height of the list or of what it holds — the text box growing as it is written in, a message
  // opened, a reply's words wrapping as it is said — keeps whoever was at the foot there, as a chat keeps it. Its width is
  // what each long message counts its lines at.
  useEffect(() => {
    const node = viewport.current, inner = content.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(node.clientWidth);
      if (following()) toFoot();
    });
    observer.observe(node);
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  // The face loads lazily: once it has, the lines are counted again.
  useEffect(() => {
    const faces = globalThis.document?.fonts;
    if (!faces?.addEventListener) return;
    const loaded = () => setFonts((n) => n + 1);
    faces.addEventListener("loadingdone", loaded);
    return () => faces.removeEventListener("loadingdone", loaded);
  }, []);

  const jump = () => {
    pinnedUntil.current = performance.now() + PIN_MS;
    atFoot.current = true;
    setAway(false);
    setFresh(false);
    toFoot(reducedMotion() ? "instant" : "smooth");
    window.setTimeout(() => { toFoot(); readScroll(); }, JUMP_SETTLE_MS);
  };

  const empty = !blocks.length;
  return (
    <div className="message-viewport-wrap">
      <div id="messages" ref={viewport} role="log" aria-live="polite" onScroll={readScroll}>
        <TextLayoutContext.Provider value={width ? width + fonts / 1000 : 0}>
          <div className="messages-content" ref={content}>
            {empty && <div className="messages-empty"><TranscriptIcon size={28} /><p>{t("messages.empty")}</p></div>}
            {blocks.map((block) => block.kind === "day"
              ? <p className="message-day" key={block.key}>{block.label}</p>
              : <MessageGroup key={block.key} run={block.run} sig={block.sig} />)}
          </div>
        </TextLayoutContext.Provider>
      </div>
      <button type="button" className="latest-jump" data-show={away || undefined} data-new={away && fresh || undefined}
        aria-hidden={!away || undefined} tabIndex={away ? undefined : -1} aria-label={t("messages.toLatest")} title={t("messages.toLatest")} onClick={jump}>
        <ToLatestArrowIcon />
      </button>
    </div>
  );
}
