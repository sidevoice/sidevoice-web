import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "../../components/ui/Tooltip";
import { Button } from "../../components/ui/Button";
import { ToLatestIcon, TranscriptIcon } from "../../components/ui/Icons";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { translator, type Translate } from "../../i18n/translator";
import { groupMessages } from "./group-messages";
import { MessageGroup, Speaker } from "./MessageGroup";
import { speakerName } from "./group-messages";
import { LiveVoiceBalloon } from "../call/LiveVoiceBalloon";
import { uiLocale } from "../../i18n/locale";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today and yesterday by name, any other day by its date — with its year only when it is not this one. */
export function dayLabel(time: number, t: Translate, now = Date.now()) {
  const day = new Date(time).toDateString();
  if (day === new Date(now).toDateString()) return t("messages.today");
  if (day === new Date(now - DAY_MS).toDateString()) return t("messages.yesterday");
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString(uiLocale(), { weekday: "long", day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
}

/** The messages with no word lit: a transcript nobody sees. */
const unlit = (messages: ChatMessage[]) => messages.map((message) => message.karaoke ? { ...message, karaoke: null } : message);

/** `visible`: the list is on screen. Hidden, it cannot scroll, so it lands on the latest message when it shows. */
export function MessageList({ conversation, visible = true }: { conversation: ConversationView; visible?: boolean }) {
  const t = translator();
  // Closed, it does not follow the voice word by word: nobody sees the words light, and every step would write the text of a
  // box that has no layout. It lights them as it opens.
  const groups = useMemo(() => groupMessages(visible ? conversation.messages : unlit(conversation.messages)), [conversation.messages, visible]);
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [away, setAway] = useState(false);
  const lastId = conversation.messages.at(-1)?.segment || null;
  // The dots are the agent's next run starting, so they wear its face like any run's foot.
  const agent = conversation.working ? [...conversation.messages].reverse().find((message) => message.role === "assistant") : undefined;
  const agentThread = agent?.thread ?? conversation.messages.at(-1)?.thread ?? null;

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    nearBottom.current = true;
    setAway(false);
  };

  // Anything that changes the height of the log counts, the thinking bubble included: it appeared after
  // this ran and left the view a sliver short of the bottom, which is exactly where the dots live.
  useLayoutEffect(() => {
    if (nearBottom.current) scrollToBottom("auto");
  }, [lastId, conversation.pendingText, conversation.pendingPhase, conversation.working, conversation.messages.length]);

  // Opening lands on the latest at once: "auto" would take the list's smooth scrolling and pass for being away.
  useLayoutEffect(() => {
    if (visible) scrollToBottom("instant");
  }, [visible]);

  // The text box growing as it is written in takes its height from the list: whoever was at the end stays there,
  // the latest message just above the box, as a chat keeps it.
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => { if (nearBottom.current) node.scrollTo({ top: node.scrollHeight, behavior: "instant" }); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cancel = <Tooltip action content={t("messages.cancel")}>
    <Button variant="ghost" tone="danger" size="sm" className="cancel-input" onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("messages.cancel")}</Button>
  </Tooltip>;
  // In the person's balloon it is as quiet as on the stage: its ink, not the danger colour of a draft's.
  const cancelInBalloon = <Tooltip action content={t("messages.cancel")}>
    <Button variant="ghost" tone="neutral" size="sm" className="cancel-input" onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("messages.cancel")}</Button>
  </Tooltip>;
  return (
    <div className="message-viewport-wrap">
      <div id="messages" ref={viewport} role="log" aria-live="polite" onScroll={(event) => {
        const node = event.currentTarget;
        nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        setAway(!nearBottom.current);
      }}>
        {!groups.length && !conversation.pendingText && !conversation.pendingPhase && !conversation.working &&
          <div className="messages-empty"><TranscriptIcon size={28} /><p>{t("messages.empty")}</p></div>}
        {groups.map((group, index) => {
          // A run never spans two days (groupMessages), so a day's first run is where its name goes.
          const day = new Date(group.messages[0].time).toDateString();
          const newDay = index === 0 || day !== new Date(groups[index - 1].messages[0].time).toDateString();
          return (
            <Fragment key={group.id}>
              {newDay && <p className="message-day">{dayLabel(group.messages[0].time, t)}</p>}
              <MessageGroup group={group} />
            </Fragment>
          );
        })}
        {conversation.pendingText && <div className="message-group live-draft" data-role="user"><div className="chat-message-row">
          <article className="chat-bubble" data-role="user" data-position="only" data-draft="true">
            <span>{conversation.pendingText}</span>
            {conversation.pendingCancellable && cancel}
          </article>
        </div></div>}
        {!conversation.pendingText && conversation.pendingPhase && <div className="message-group live-draft" data-role="user">
          <div className="person-turns" data-inline="">
            <LiveVoiceBalloon phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"}>{conversation.pendingCancellable && cancelInBalloon}</LiveVoiceBalloon>
          </div>
        </div>}
        {conversation.working && <div className="message-group live-draft" data-role="assistant"><div className="chat-message-row">
          <Speaker name={agent ? speakerName(agent, t) : ""} thread={agentThread} />
          <article className="chat-bubble thinking" data-role="assistant" data-position="only" aria-label={t("messages.thinking")}><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></article>
        </div></div>}
      </div>
      {away && <Button variant="secondary" size="icon-sm" className="latest-jump" aria-label={t("messages.toLatest")} title={t("messages.toLatest")} onClick={() => scrollToBottom()}>
        <ToLatestIcon />
      </Button>}
    </div>
  );
}
