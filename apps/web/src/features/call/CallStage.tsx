import type { CSSProperties } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { HarnessIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ChatMessage } from "../../state/room-types";
import { avatarFor, avatarTone } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { StageBackdrop, StageDesk, useSceneScale, WantedPoster, type PosterWords } from "../avatar/StageScene";
import { KaraokeText, wordEnd } from "../conversation/KaraokeText";
import { callLanguage, callTranslator, type CallTranslate } from "./call-i18n";
import { moodText } from "./conversation-state";
import { bubbleAt } from "./speech-chunks";
import { sounding, useSpokenTo } from "./speech-reading";
import { useStageConversation } from "./stage-view";
import { PersonTurn } from "./PersonTurn";
import { TranscriptEntry } from "./TranscriptEntry";
import { VoiceModels } from "./VoiceModels";
import { Tooltip } from "../../components/ui/Tooltip";
import { errorLine } from "../settings/error-message";

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

function AgentBubble({ reply, spokenTo, visible }: { reply: ChatMessage | null; spokenTo: number | null; visible: boolean }) {
  const view = reply && spokenTo !== null ? bubbleAt(reply.text, spokenTo) : null;
  return (
    <div className="speech-bubble stage-bubble" data-visible={(visible && !!view) || undefined} aria-hidden={!visible || !view} translate="no">
      {view?.previous && <span className="stage-bubble-previous">{view.previous}</span>}
      {view && <KaraokeText text={view.current.text} playback="playing" range={view.spoken > 0 ? { from: 0, to: view.spoken } : null} />}
    </div>
  );
}

/** The room's errors, above the stage (#error is the runtime's id), as people read them: what was raw about one is
 *  behind its Details. The box stays in the page so what appears in it is read out at once. */
function BootError() {
  const error = useRoomStore((state) => state.bootError);
  return <div id="error" className="stage-error" role="alert" hidden={!error}>{error && <Alert tone="danger" title={errorLine(error)} details={error.details} />}</div>;
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
  const spokenTo = useSpokenTo(reply, stage.speaking, conversation.messages);
  // A phone keeps the transcript's button in the tile's corner; a desktop has it at the bar's right (CallToolbar).
  const narrow = useMedia(NARROW_QUERY);

  if (!stage.threadId) {
    return (
      <section className="call-stage" aria-label={t("stage.label")}>
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
    <section className="call-stage" aria-label={t("stage.label")}>
      <BootError />
      {/* Named above the tile where the room has no header (a desktop), in place of the tile's own name. */}
      <header className="stage-title" translate="no">
        <h2 title={stage.title}>{stage.title}</h2>
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
          <h2 title={stage.title}>{stage.title}</h2>
          {stage.row?.machine && <span>{stage.row.machine}</span>}
        </div>
        <VoiceModels />
        <div className="stage-top">
          <AgentBubble reply={reply} spokenTo={spokenTo} visible={stage.mood === "speaking"} />
          {/* Working is said only to assistive tech here: the sidebar shows it. */}
          {stage.mood === "working" && <p className="sr-only" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden="true" />{t("stage.working")}</p>}
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
