import type { CSSProperties, ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { HarnessIcon, MachinesIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ChatMessage } from "../../state/room-types";
import { avatarFor, avatarTone } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { StageBackdrop, StageDesk, useSceneScale, WantedPoster, type PosterWords } from "../avatar/StageScene";
import { KaraokeText } from "../conversation/KaraokeText";
import { uiLanguage, translator, type Translate } from "../../i18n/translator";
import { moodText } from "./conversation-state";
import { sounding, useAgentTurns, useSpokenTo, type AgentTurn } from "./speech-reading";
import { PagedText } from "./PagedText";
import { useStageConversation, type StageConversation } from "./stage-view";
import { BalloonTail } from "./BalloonTail";
import { ConversationAvatar } from "./ConversationAvatar";
import { useVariant } from "../../lib/variants";
import { PersonTurn } from "./PersonTurn";
import { TranscriptEntry } from "./TranscriptEntry";
import { VoiceModels } from "./VoiceModels";
import { Tooltip } from "../../components/ui/Tooltip";
import { errorLine } from "../settings/error-message";
import { desktopHost } from "../../services/desktop-host";

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

/* The balloon's three looks, how many lines it shows and how it moves on are compared on the live page (lib/variants.ts,
 * the playground's VARIANTS panel; 2026-10-15): `balloon` a (paper and ink, the classic comic), b (a soft blob tinted
 * with the agent's colour, following the theme) or c (the agent's own skin: its colour, pale, its ink and its gloss);
 * `balloonLines` 3 or 2; `balloonPaging` scroll (a line at a time) or page (a page at a time, the last one shorter). */
const BALLOONS = ["a", "b", "c"] as const;
const BALLOON_LINES = ["3", "2"] as const;
const BALLOON_PAGING = ["scroll", "page"] as const;

/** One reply on the stage, in a speech balloon whose tail points down at the agent (call-view.css): a few lines at a
 *  time (PagedText), lit as the voice says them, moving on with the words heard. */
function AgentBubble({ turn }: { turn: AgentTurn }) {
  const balloon = useVariant("balloon", BALLOONS);
  const lines = useVariant("balloonLines", BALLOON_LINES);
  const paging = useVariant("balloonPaging", BALLOON_PAGING);
  return (
    <div className="speech-bubble stage-bubble" data-balloon={balloon} data-visible="" data-leaving={turn.leaving || undefined} aria-hidden="true" translate="no">
      <PagedText measure={turn.text} follow=".karaoke-played" lines={Number(lines)} turn={paging}>
        <KaraokeText text={turn.text} playback="playing" range={turn.spoken > 0 ? { from: 0, to: Math.min(turn.spoken, turn.text.length) } : null} />
      </PagedText>
      {/* The bichos' gloss, on the look made of their skin. */}
      {balloon === "c" && <svg className="balloon-shine" viewBox="0 0 40 20" aria-hidden="true"><path d="M3 17Q5 4 24 3" /></svg>}
      <BalloonTail shape={balloon} />
    </div>
  );
}

/* Where the call is, over the stage (2026-10-15): the conversation's name with more presence and its machine as a chip,
 * in one of three looks compared on the live page (`stageTitle`): a (the name in a display weight after a swatch of the
 * agent's colour, inked as the bichos are, the machine's chip beside it), b (the agent's small avatar with its state
 * dot, the name over the machine's chip) or c (the name on an inked paper sticker, as the balloon, its edge in the
 * agent's colour). The same on a desktop, above the tile, and on a phone, on the tile's corner. */
const STAGE_TITLES = ["a", "b", "c"] as const;

function StageName({ stage, className, look, tone }: { stage: StageConversation; className: string; look: (typeof STAGE_TITLES)[number]; tone: string }) {
  const Tag = className === "stage-title" ? "header" : "div";
  return (
    // Its own tint: above the tile on a desktop, outside the tile that carries it.
    <Tag className={className} data-look={look} translate="no" style={avatarTone(tone) as CSSProperties}>
      {look === "b" && stage.row && <ConversationAvatar row={stage.row} />}
      <h2 title={stage.title}><span>{stage.title}</span></h2>
      {stage.row?.machine && <span className="stage-machine"><MachinesIcon size={12} /><span>{stage.row.machine}</span></span>}
    </Tag>
  );
}

/** The agent's replies on the stage: the one sounding, followed as it is heard; once its last words are said it stays
 *  PAGE_MS, then leaves. A new reply over it: the one before lifts away at once (as the person's sent turn does). */
function AgentBubbles({ reply, spokenTo }: { reply: ChatMessage | null; spokenTo: number | null }) {
  const turns = useAgentTurns(reply, spokenTo);
  return <>{turns.map((turn) => <AgentBubble key={turn.key} turn={turn} />)}</>;
}

/** The room's errors, above the stage (#error is the runtime's id), as people read them: what was raw about one is
 *  behind its Details. The box stays in the page so what appears in it is read out at once. */
function BootError() {
  const error = useRoomStore((state) => state.bootError);
  return <div id="error" className="stage-error" role="alert" hidden={!error}>{error && <Alert tone="danger" title={errorLine(error)} details={error.details} />}</div>;
}

function posterWords(t: Translate): PosterWords {
  return { title: t("stage.poster.title"), status: t("stage.poster.status"), fine: [t("stage.poster.fine1"), t("stage.poster.fine2"), t("stage.poster.fine3")] };
}

/** The stage; `notice`, what the room says over it (App: where an update waits), at the tile's top, taking no room of
 *  its own. */
export function CallStage({ notice }: { notice?: ReactNode } = {}) {
  const t = translator();
  const stage = useStageConversation();
  const sceneRef = useSceneScale();
  const conversation = useRoomStore((state) => state.conversation);
  const showConversations = useCallLayout((state) => state.showConversations);
  const reply = stage.isTarget ? sounding(conversation.messages, stage.speaking) : null;
  const spokenTo = useSpokenTo(reply, stage.speaking, conversation.messages);
  // A phone keeps the transcript's button in the tile's corner; a desktop has it at the bar's right (CallToolbar).
  const narrow = useMedia(NARROW_QUERY);
  const titleLook = useVariant("stageTitle", STAGE_TITLES);

  if (!stage.threadId) {
    return (
      <section className="call-stage" aria-label={t("stage.label")}>
        <BootError />
        <div className="stage-tile stage-empty">
          <div className="stage-notice">{notice}</div>
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
      <StageName stage={stage} className="stage-title" look={titleLook} tone={tone} />
      {/* The tile keeps its form factor's shape, as a slide does: as large as the room allows, centred, the app's own
          background around it (useSceneScale fits it in its slot; call-view.css names the shapes). What the tile says —
          the name, the voice models, the replies, the badge — is laid on the tile, at its corners. */}
      <div ref={sceneRef} className="stage-slot">
      <div className="stage-tile" data-mood={stage.mood} data-app={desktopHost() ? "" : undefined} style={avatarTone(tone) as CSSProperties}>
        <div className="stage-notice">{notice}</div>
        <div className="stage-canvas">
          <div className="stage-scene">
            <StageBackdrop seed={stage.threadId} tone={tone} />
            {stage.mood === "offline" && <WantedPoster spec={spec} seed={stage.threadId} words={posterWords(t)} language={uiLanguage()} />}
            <CharacterAvatar className="stage-agent" spec={spec} mood={stage.mood} size="stage" unread={stage.unread > 0} desk={stage.mood === "working"}
              mouth="playback" playbackThreadId={stage.threadId} label={t("stage.agentState", { title: stage.title, state: moodText(stage.mood, t) })} />
            <StageDesk seed={stage.threadId} />
          </div>
        </div>
        <StageName stage={stage} className="stage-name" look={titleLook} tone={tone} />
        <VoiceModels />
        <div className="stage-top">
          {/* Its own conversation's: another one on the stage starts with none of the replies before it. */}
          <AgentBubbles key={stage.threadId} reply={reply} spokenTo={spokenTo} />
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
      </div>
    </section>
  );
}
