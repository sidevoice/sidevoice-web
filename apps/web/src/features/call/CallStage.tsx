import { useEffect, useReducer, useRef, type CSSProperties } from "react";
import { HARNESS_NAMES, HarnessIcon } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { avatarFor, avatarTone, PERSON_AVATAR } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { KaraokeText, wordEnd } from "../conversation/KaraokeText";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { callTranslator, type CallTranslate } from "./call-i18n";
import { personMood } from "./conversation-state";
import { bubbleAt, readingPosition, readOn, type Reading } from "./speech-chunks";
import { useStageConversation } from "./stage-view";

/* The call as a stage (2026-10-10): the conversation's agent fills it, and what it says plays in a bubble, a chunk at
 * a time as the voice reaches it, the spoken words lit and the chunk before kept dim above. Between turns its
 * activity stands where the bubble was. The person is the picture-in-picture in the corner, with a bubble of their
 * own while they speak. One agent: the call talks to one conversation at a time. The whole transcript is a button
 * away (TranscriptPanel). */

/** The reply sounding now. Until its row says so the voice may already be playing it: then it is the oldest one
 *  waiting, since replies are said in order. */
function sounding(messages: ChatMessage[], voiceLive: boolean) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.playback === "playing") return message;
  }
  return voiceLive ? messages.find((message) => message.role === "assistant" && message.playback === "pending") ?? null : null;
}

/** How far into `reply` the voice is (speech-chunks.ts `readOn`): its cue, or a speaking pace while it gives none — a
 *  voice that does not, or the moment before the first — so the bubble moves on and its words light up all the same.
 *  A reply that has finished, or left the list, is read from the start if it sounds again (listening again). */
function useSpokenTo(reply: ChatMessage | null, sounding: boolean, messages: ChatMessage[]): number | null {
  const reading = useRef<Reading | null>(null);
  const kept = reading.current && messages.some((message) => message.segment === reading.current!.segment && message.playback !== "complete") ? reading.current : null;
  reading.current = readOn(kept, reply?.segment ?? null, sounding, reply?.karaoke ? reply.karaoke.to : null, Date.now());
  const ticking = sounding && !!reply && reading.current?.cue === null;
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [ticking]);
  return reply && reading.current?.segment === reply.segment ? readingPosition(reading.current) : null;
}

function AgentBubble({ reply, spokenTo, visible }: { reply: ChatMessage | null; spokenTo: number | null; visible: boolean }) {
  const view = reply && spokenTo !== null ? bubbleAt(reply.text, spokenTo) : null;
  return (
    <div className="speech-bubble stage-bubble" data-visible={(visible && !!view) || undefined} aria-hidden={!visible || !view} translate="no">
      {view?.previous && <span className="stage-bubble-previous">{view.previous}</span>}
      {view && <KaraokeText text={view.current.text} playback="playing" range={view.spoken > 0 ? { from: 0, to: view.spoken } : null} />}
    </div>
  );
}

/** How much of what the person is saying their bubble holds: the latest words, a few lines; the transcript has all. */
const LIVE_TAIL = 90;
function latestWords(text: string) {
  if (text.length <= LIVE_TAIL) return text;
  const cut = text.slice(-LIVE_TAIL);
  return "…" + cut.slice(cut.indexOf(" ") + 1);
}

function PersonPip({ inCall, speaking, conversation, t }: { inCall: boolean; speaking: boolean; conversation: ConversationView; t: CallTranslate }) {
  const avatar = useRef<HTMLSpanElement>(null);
  // While the person speaks their mouth follows the microphone, written straight onto the avatar: no render per level.
  useEffect(() => {
    const node = avatar.current;
    const channel = window.sidevoiceUI?.micLevel;
    if (!speaking || !node || !channel) return;
    const unsubscribe = channel.subscribe((level) => node.style.setProperty("--mouth", String(Math.min(1, level / 45))));
    return () => { unsubscribe(); node.style.removeProperty("--mouth"); };
  }, [speaking]);
  const turn = !!(conversation.pendingText || conversation.pendingPhase);
  return (
    <div className="stage-pip" data-speaking={speaking || undefined} style={avatarTone(PERSON_AVATAR) as CSSProperties}>
      {turn && (
        <div className="speech-bubble pip-bubble" translate="no">
          {conversation.pendingText ? <span>{latestWords(conversation.pendingText)}</span>
            : <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />}
          {conversation.pendingCancellable && <button type="button" className="cancel-input" onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</button>}
        </div>
      )}
      <CharacterAvatar ref={avatar} spec={PERSON_AVATAR} mood={personMood({ inCall, speaking })} size="pip" mouth="level" label={t("stage.yourAvatar")} />
      <span className="stage-tag">{t("stage.you")}</span>
    </div>
  );
}

function BootError() {
  const error = useRoomStore((state) => state.bootError);
  return <div id="error" className="stage-error" role="alert" hidden={!error}>{error}</div>;
}

export function CallStage() {
  const t = callTranslator();
  const stage = useStageConversation();
  const conversation = useRoomStore((state) => state.conversation);
  const userLive = useRoomStore((state) => state.facts.userLive);
  const showConversations = useCallLayout((state) => state.showConversations);
  const reply = stage.isTarget ? sounding(conversation.messages, stage.speaking) : null;
  const spokenTo = useSpokenTo(reply, stage.speaking, conversation.messages);
  const personSpeaking = stage.inCall && (userLive || conversation.pendingPhase === "listening");
  const harness = stage.row?.harness ? HARNESS_NAMES[stage.row.harness] : null;

  if (!stage.threadId) {
    return (
      <section className="call-stage" aria-label={t("stage.label")}>
        <BootError />
        <div className="stage-tile stage-empty">
          <p>{t("stage.empty")}</p>
          <button type="button" className="stage-choose" onClick={showConversations}>{t("stage.chooseConversation")}</button>
        </div>
      </section>
    );
  }
  const spec = avatarFor(stage.threadId);
  return (
    <section className="call-stage" aria-label={t("stage.label")}>
      <BootError />
      <div className="stage-tile" data-mood={stage.mood} style={avatarTone(spec) as CSSProperties}>
        <div className="stage-top">
          <AgentBubble reply={reply} spokenTo={spokenTo} visible={stage.mood === "speaking"} />
          {stage.mood === "working" && <p className="stage-activity" role="status"><i className="stage-spinner" aria-hidden="true" />{t("stage.working")}</p>}
        </div>
        <CharacterAvatar className="stage-agent" spec={spec} mood={stage.mood} size="stage"
          mouthKey={reply && spokenTo !== null ? wordEnd(reply.text, spokenTo) : undefined} label={t("stage.agent", { title: stage.title })} />
        <div className="stage-tags">
          {harness && <span className="stage-tag">{stage.row?.harness && <HarnessIcon harness={stage.row.harness} size={12} />}{harness}</span>}
        </div>
        <PersonPip inCall={stage.inCall} speaking={personSpeaking} conversation={conversation} t={t} />
      </div>
    </section>
  );
}
