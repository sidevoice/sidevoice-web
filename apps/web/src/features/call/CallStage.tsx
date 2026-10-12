import { useEffect, useReducer, useRef, type CSSProperties } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { HandIcon, HarnessIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { avatarFor, avatarTone } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { StageBackdrop, StageDesk, useSceneScale, WantedPoster, type PosterWords } from "../avatar/StageScene";
import { KaraokeText, wordEnd } from "../conversation/KaraokeText";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { callLanguage, callTranslator, type CallTranslate } from "./call-i18n";
import { moodText } from "./conversation-state";
import { bubbleAt, readingMoves, readingPosition, readOn, type Reading } from "./speech-chunks";
import { useStageConversation } from "./stage-view";
import { useVoiceSwitch } from "../../state/call-model";
import { StageHearIt } from "./HearIt";
import { TranscriptEntry } from "./TranscriptEntry";
import { VoiceModels } from "./VoiceModels";
import { Tooltip } from "../../components/ui/Tooltip";

/** A harness by its product name, for the badge's tooltip; one not known, as it is reported. */
function harnessName(id: string | null | undefined) {
  if (!id) return "";
  if (/^claude/.test(id)) return "Claude Code";
  if (/^codex/.test(id)) return "Codex";
  if (/^cursor/.test(id)) return "Cursor";
  return id;
}
import "./call-view.css";

/* The call as a stage (2026-10-10): the conversation's agent fills it, and what it says plays in a bubble, a chunk at
 * a time as the voice reaches it, the spoken words lit and the chunk before kept dim above. Between turns its
 * activity stands where the bubble was. The person has no picture: a bubble of their own rises at the stage's foot
 * while they speak. One agent: the call talks to one conversation at a time. The whole transcript is a button away
 * (TranscriptPanel). Its look is call-view.css.
 *
 * The agent is the conversation's bicho, on the scene its seed rolls (features/avatar/StageScene.tsx): a backdrop, a
 * desk that slides in while it works, and a wanted poster in its place while the room cannot reach it. */

/** The reply sounding now. Until its row says so the voice may already be playing it: then it is the oldest one
 *  waiting, since replies are said in order. */
function sounding(messages: ChatMessage[], voiceLive: boolean) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.playback === "playing") return message;
  }
  return voiceLive ? messages.find((message) => message.role === "assistant" && message.playback === "pending") ?? null : null;
}

/** How far into `reply` the voice is (speech-chunks.ts `readOn`): the part sounding now, its words moving on at a
 *  speaking pace within it, or that pace from the start while the voice gives no cue yet. A reply that has finished,
 *  or left the list, is read from the start if it sounds again (listening again). */
function useSpokenTo(reply: ChatMessage | null, sounding: boolean, messages: ChatMessage[]): number | null {
  const reading = useRef<Reading | null>(null);
  const kept = reading.current && messages.some((message) => message.segment === reading.current!.segment && message.playback !== "complete") ? reading.current : null;
  reading.current = readOn(kept, reply?.segment ?? null, sounding, reply?.karaoke ?? null, Date.now());
  const ticking = !!reply && !!reading.current && readingMoves(reading.current);
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

/** What the person is saying, while they say it: their latest words (or the voice listening), and a way to take it back
 *  before it is sent. No picture of them: the transcript has what they said. */
function PersonTurn({ conversation, t }: { conversation: ConversationView; t: CallTranslate }) {
  if (!conversation.pendingText && !conversation.pendingPhase) return null;
  return (
    <div className="speech-bubble person-bubble" translate="no">
      {conversation.pendingText ? <span>{latestWords(conversation.pendingText)}</span>
        : <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />}
      {conversation.pendingCancellable && <Button variant="ghost" tone="neutral" size="sm" className="cancel-input"
        onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>}
    </div>
  );
}

/** The room's errors, above the stage (#error is the runtime's id). The box stays in the page so what appears in it is
 *  read out at once. */
function BootError() {
  const error = useRoomStore((state) => state.bootError);
  return <div id="error" className="stage-error" role="alert" hidden={!error}>{error && <Alert tone="danger" title={error} />}</div>;
}

function posterWords(t: CallTranslate): PosterWords {
  return { title: t("stage.poster.title"), status: t("stage.poster.status"), fine: [t("stage.poster.fine1"), t("stage.poster.fine2"), t("stage.poster.fine3")] };
}

export function CallStage() {
  const t = callTranslator();
  const stage = useStageConversation();
  const sceneRef = useSceneScale();
  const conversation = useRoomStore((state) => state.conversation);
  const showConversations = useCallLayout((state) => state.showConversations);
  const reply = stage.isTarget ? sounding(conversation.messages, stage.speaking) : null;
  // With the voice switch (call model B) the stage is the active conversation's, and its heading takes focus when a
  // "Hear it" that had it goes, or a phone's header avatar is picked (§3).
  const voiceSwitch = useVoiceSwitch();
  const label = voiceSwitch ? t("stage.labelActive") : t("stage.label");
  const heading = voiceSwitch ? -1 : undefined;
  const spokenTo = useSpokenTo(reply, stage.speaking, conversation.messages);
  // A phone keeps the transcript's button in the tile's corner; a desktop has it at the bar's right (CallToolbar).
  const narrow = useMedia(NARROW_QUERY);

  if (!stage.threadId) {
    return (
      <section className="call-stage" aria-label={label}>
        <BootError />
        <div className="stage-tile stage-empty">
          <p>{t("stage.empty")}</p>
          <Button className="stage-choose" onClick={showConversations}>{t("stage.chooseConversation")}</Button>
          {narrow && <TranscriptEntry />}
        </div>
      </section>
    );
  }
  const spec = avatarFor(stage.threadId);
  const tone = avatarColor(spec);
  return (
    <section className="call-stage" aria-label={label}>
      <BootError />
      {/* Named above the tile where the room has no header (a desktop), in place of the tile's own name. */}
      <header className="stage-title" translate="no">
        <h2 title={stage.title} tabIndex={heading}>{stage.title}</h2>
        {stage.row?.machine && <span>{stage.row.machine}</span>}
      </header>
      <div ref={sceneRef} className="stage-tile" data-mood={stage.mood} style={avatarTone(tone) as CSSProperties}>
        <div className="stage-scene">
          <StageBackdrop seed={stage.threadId} tone={tone} />
          {stage.mood === "offline" && <WantedPoster spec={spec} seed={stage.threadId} words={posterWords(t)} language={callLanguage()} />}
          <CharacterAvatar className="stage-agent" spec={spec} mood={stage.mood} size="stage" unread={stage.unread > 0} desk={stage.mood === "working"}
            mouthKey={reply && spokenTo !== null ? wordEnd(reply.text, spokenTo) : undefined} label={t("stage.agentState", { title: stage.title, state: moodText(stage.mood, t) })} />
          <StageDesk seed={stage.threadId} />
        </div>
        <div className="stage-name" translate="no">
          <h2 title={stage.title} tabIndex={heading}>{stage.title}</h2>
          {stage.row?.machine && <span>{stage.row.machine}</span>}
        </div>
        <VoiceModels />
        <div className="stage-top">
          <AgentBubble reply={reply} spokenTo={spokenTo} visible={stage.mood === "speaking"} />
          {stage.mood === "working" && <p className="stage-activity" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden="true" />{t("stage.working")}</p>}
          {voiceSwitch && stage.row && <StageHearIt row={stage.row} hand={<HandIcon size={16} filled={stage.row.mark !== "wants-to-talk"} />} />}
        </div>
        <div className="stage-tags">
          {(stage.row?.harness || stage.row?.model) && <Tooltip content={[harnessName(stage.row?.harness), stage.row?.model, stage.row?.effort].filter(Boolean).join(" · ")}>
            <span className="stage-tag stage-badge" tabIndex={0}>
              {stage.row?.harness && <HarnessIcon harness={stage.row.harness} size={12} />}
              <span>{[stage.row?.model, stage.row?.effort].filter(Boolean).join(" · ")}</span>
            </span>
          </Tooltip>}
        </div>
        <PersonTurn conversation={conversation} t={t} />
        {narrow && <TranscriptEntry />}
      </div>
    </section>
  );
}
