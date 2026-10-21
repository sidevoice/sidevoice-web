import { useCallback, useContext, useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { Alert } from "../../components/ui/Alert";
import { UpdateNotice } from "../updates/UpdateNotice";
import { Button } from "../../components/ui/Button";
import { CloseIcon, HarnessIcon, MachinesIcon } from "../../components/ui/Icons";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import type { ChatMessage } from "../../state/room-types";
import { avatarFor, avatarTone } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { StageBackdrop, StageDesk, useSceneScale, WantedPoster, type PosterWords } from "../avatar/StageScene";
import { KaraokeText } from "../conversation/KaraokeText";
import { uiLanguage, translator, type Translate } from "../../i18n/translator";
import { moodText } from "./conversation-state";
import { useAgentTurns, useReadingClock, useSpokenFrom, type AgentTurn } from "./speech-reading";
import type { Reading } from "./speech-chunks";
import { PagedText } from "./PagedText";
import { useStageConversation, type StageConversation } from "./stage-view";
import { BalloonTail } from "./BalloonTail";
import { PersonTurn } from "./PersonTurn";
import { TranscriptEntry } from "./TranscriptEntry";
import { useVoiceModels } from "./VoiceModels";
import { harnessName, StageHeading } from "./CallDetails";
import { useConversationAvatar, useConversationAvatars, useMovingCopy } from "./conversation-avatars";
import { Tooltip } from "../../components/ui/Tooltip";
import { errorLine } from "../settings/error-message";
import { desktopHost } from "../../services/desktop-host";
import { useCaptions } from "../../state/captions";
import { useStageRef } from "./stage-visibility";

import "./call-view.css";

/* The call as a stage (2026-10-10): the conversation's agent fills it, and what it says plays in a bubble, a chunk at
 * a time as the voice reaches it, the spoken words lit and the chunk before kept dim above. Between turns its
 * activity stands where the bubble was. The person has no picture: a bubble of their own rises at the stage's foot
 * while they speak. One agent: the call talks to one conversation at a time. The whole transcript is a button away
 * (TranscriptPanel). Its look is call-view.css.
 *
 * The agent is the conversation's bicho, on the scene its seed rolls (features/avatar/StageScene.tsx): a backdrop, a
 * desk that slides in while it works, and a wanted poster in its place while the room cannot reach it. */

/* The balloon, decided 2026-10-15: made of the agent's own skin (its colour, pale, its ink and its gloss), pushed left of
 * the agent with its tail out of its bottom-right corner toward it, three lines tall, a page at a time (the last page
 * turning only as far as its last line: PagedText fixed). */

/** One reply on the stage, in a speech balloon whose tail points down at the agent (call-view.css): a few lines at a
 *  time (PagedText), lit as the voice says them, moving on with the words heard. */
function AgentBubble({ turn }: { turn: AgentTurn }) {
  return (
    <div className="speech-bubble stage-bubble" data-visible="" data-leaving={turn.leaving || undefined} aria-hidden="true" translate="no">
      <PagedText measure={turn.text} follow=".karaoke-played" lines={3} turn="page" fixed>
        <KaraokeText text={turn.text} playback="playing" range={turn.spoken > 0 ? { from: 0, to: Math.min(turn.spoken, turn.text.length) } : null} />
      </PagedText>
      {/* The bichos' gloss, as on their skin. */}
      <svg className="balloon-shine" viewBox="0 0 40 20" aria-hidden="true"><path d="M3 17Q5 4 24 3" /></svg>
      <BalloonTail shape="agent" />
    </div>
  );
}

/* Where the call is (decided 2026-10-15): the conversation's name in a display weight, and under it the machine it runs on
 * as a chip; across from them, on a desktop, what it is talked to with
 * — the voice's models; the agent's harness, model and effort stay a chip at the tile's foot. On a phone the name sits on
 * the tile's corner and the models are a dot only when one needs something. */
function AgentBadge({ stage }: { stage: StageConversation }) {
  if (!stage.row?.harness && !stage.row?.model) return null;
  const words = [stage.row?.model, stage.row?.effort].filter(Boolean).join(" · ");
  return <Tooltip content={harnessName(stage.row?.harness) || words}>
    <span className="stage-tag stage-badge" tabIndex={0}>
      {stage.row?.harness && <HarnessIcon harness={stage.row.harness} size={12} />}
      <span>{words || harnessName(stage.row?.harness)}</span>
    </span>
  </Tooltip>;
}

/** The conversation's name over its machine, opening what the call runs on (CallDetails); above the tile on a desktop,
 *  on its corner on a phone. */
function StageName({ stage, className, tone, voice }: { stage: StageConversation; className: string; tone: string;
  voice: ReturnType<typeof useVoiceModels> }) {
  const Tag = className === "stage-title" ? "header" : "div";
  return (
    // Its own tint: above the tile on a desktop, outside the tile that carries it.
    <Tag className={className} translate="no" style={avatarTone(tone) as CSSProperties}>
      <StageHeading stage={stage} voice={voice} />
    </Tag>
  );
}

/** The agent's replies on the stage: the one sounding, followed as it is heard; once its last words are said it stays
 *  PAGE_MS, then leaves. A new reply over it: the one before lifts away at once (as the person's sent turn does).
 *
 *  The words go on five times a second while the voice says them: that draws the balloons and nothing around them, so the
 *  clock is here and not in the tile (its caller keeps `reading`, so captions turned on mid-reply pick it up where it is). */
function AgentBubbles({ reading, reply, sounding, messages, onUp }: { reading: RefObject<Reading | null>; reply: ChatMessage | null;
  sounding: boolean; messages: ChatMessage[]; onUp: (up: boolean) => void }) {
  const spokenTo = useSpokenFrom(reading, reply, sounding, messages);
  const turns = useAgentTurns(reply, spokenTo);
  // Whether a balloon is on the stage, for the agent to hold still under it (no idle pastime until it has gone).
  const up = turns.length > 0;
  useEffect(() => { onUp(up); }, [up, onUp]);
  useEffect(() => () => onUp(false), [onUp]);
  return <>{turns.map((turn) => <AgentBubble key={turn.key} turn={turn} />)}</>;
}

/** The room's errors (#error is the runtime's id), as people read them: what was raw about one is behind its Details.
 *  Laid over the top of the stage, over its title rather than the call (decided 2026-10-15), never pushing anything,
 *  and closed by the person. The box stays in the page so what appears in it is read out at once. */
function BootError() {
  const t = translator();
  const error = useRoomStore((state) => state.bootError);
  const store = useContext(RoomStoreContext);
  return <div id="error" className="stage-error" role="alert" hidden={!error}>
    {error && <Alert tone="danger" title={errorLine(error)} details={error.details}
      action={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("ui.close")} onClick={() => store?.patch({ bootError: null })}><CloseIcon size={16} /></Button>} />}
  </div>;
}

function posterWords(t: Translate): PosterWords {
  return { title: t("stage.poster.title"), status: t("stage.poster.status"), fine: [t("stage.poster.fine1"), t("stage.poster.fine2"), t("stage.poster.fine3")] };
}

/** The stage. */
export function CallStage() {
  const t = translator();
  const stage = useStageConversation();
  const showConversations = useCallLayout((state) => state.showConversations);
  // A phone keeps the transcript's button in the tile's corner; a desktop has it at the bar's right (CallToolbar).
  const narrow = useMedia(NARROW_QUERY);
  // What the call runs on, behind the title (CallDetails); and whether a voice model needs something, for its dot.
  const voice = useVoiceModels();
  // Captions off (the call bar's toggle): no balloons on the stage; the transcript keeps everything said.
  const captions = useCaptions();

  if (!stage.threadId) {
    return (
      <section className="call-stage" aria-label={t("stage.label")}>
        <BootError />
        <UpdateNotice />
        <div className="stage-tile stage-empty">
          <p>{t("stage.empty")}</p>
          <Button className="stage-choose" onClick={showConversations}>{t("stage.chooseConversation")}</Button>
          {narrow && <TranscriptEntry />}
        </div>
      </section>
    );
  }
  const tone = avatarColor(avatarFor(stage.threadId));
  return (
    <section className="call-stage" aria-label={t("stage.label")}>
        <BootError />
      {/* Named above the tile where the room has no header (a desktop), in place of the tile's own name. */}
      <StageName stage={stage} className="stage-title" tone={tone} voice={voice} />
      <UpdateNotice />
      <StageTile />
    </section>
  );
}

/** The stage's tile in its slot: the conversation's agent on its scene, its balloons, its badge. The room's, and the
 *  desktop's floating card's picture-in-picture (`card`: the tile alone, 16:9 whatever the window, without the name on
 *  its corner or the transcript's button, which the card has elsewhere or not at all). */
export function StageTile({ card = false }: { card?: boolean }) {
  const t = translator();
  const stage = useStageConversation();
  const sceneRef = useSceneScale();
  // The agent is its conversation's one state, the one its thumbnails show too (conversation-avatars.ts); the stage
  // tells it when its balloon is up, for it to hold still under it.
  const avatars = useConversationAvatars();
  const avatar = useConversationAvatar(stage.threadId);
  const holdStill = useCallback((up: boolean) => { if (stage.threadId) avatars.hold(stage.threadId, up); }, [avatars, stage.threadId]);
  // The stage's agent moves (where the GPU moves it): it takes up its pastimes.
  useMovingCopy(stage.threadId);
  const conversation = useRoomStore((state) => state.conversation);
  const reply = stage.isTarget ? conversation.saying ?? null : null;
  const reading = useRef<Reading | null>(null);
  useReadingClock(reading, reply, stage.speaking, conversation.messages);
  const narrow = useMedia(NARROW_QUERY);
  const voice = useVoiceModels();
  // Captions off (the call bar's toggle): no balloons on the stage; the transcript keeps everything said.
  const captions = useCaptions();
  // The room's stage, for the desktop app's floating card (stage-visibility.ts): not the card's own picture of it.
  const stageRef = useStageRef<HTMLDivElement>(!card);
  if (!stage.threadId) return null;
  const spec = avatarFor(stage.threadId);
  const tone = avatarColor(spec);
  return (
      /* The tile keeps its form factor's shape, as a slide does: as large as the room allows, centred, the app's own
          background around it (useSceneScale fits it in its slot; call-view.css names the shapes). What the tile says —
          the name, the voice models, the replies, the badge — is laid on the tile, at its corners. */
      <div ref={sceneRef} className="stage-slot">
      <div ref={stageRef} className="stage-tile" data-mood={avatar.mood} data-app={desktopHost() ? "" : undefined} data-card={card || undefined} style={avatarTone(tone) as CSSProperties}>
        <div className="stage-canvas">
          <div className="stage-scene">
            <StageBackdrop seed={stage.threadId} tone={tone} live />
            {avatar.mood === "offline" && <WantedPoster spec={spec} seed={stage.threadId} words={posterWords(t)} language={uiLanguage()} />}
            <CharacterAvatar className="stage-agent" spec={spec} state={avatar} size="stage" desk={avatar.mood === "working"} live
              mouth="playback" mouthLevel={avatars.mouth(stage.threadId)} label={t("stage.agentState", { title: stage.title, state: moodText(stage.mood, t) })} />
            <StageDesk seed={stage.threadId} live />
          </div>
        </div>
        {!card && <StageName stage={stage} className="stage-name" tone={tone} voice={voice} />}
        <div className="stage-top">
          {/* Its own conversation's: another one on the stage starts with none of the replies before it. */}
          {captions && <AgentBubbles key={stage.threadId} reading={reading} reply={reply} sounding={stage.speaking} messages={conversation.messages} onUp={holdStill} />}
          {/* Working is said only to assistive tech here: the sidebar shows it. Not in the floating card (FLOATING-CARD-SPEC, "What
              the card leaves out"): its page has no .sr-only rule, so it would show over the creature; its figure label and state
              line carry it. */}
          {!card && stage.mood === "working" && <p className="sr-only" role="status">{t("stage.working")}</p>}
        </div>
        {/* The agent's harness, model and effort, at the tile's foot (it gives the stage its touch: operator, 2026-10-15). */}
        <div className="stage-tags"><AgentBadge stage={stage} /></div>
        {captions && <PersonTurn conversation={conversation} t={t} />}
        {narrow && !card && <TranscriptEntry />}
      </div>
      </div>
  );
}

/** The call's conversation's balloons, the stage's own, apart from a tile: the desktop card's avatar format lays them
 *  above or below the creature. The agent's (the reply sounding, followed as it is heard) and the person's (the voice's
 *  bars and the room's Cancel sending, then what was sent). */
export function StageBalloons() {
  const t = translator();
  const stage = useStageConversation();
  const avatars = useConversationAvatars();
  const holdStill = useCallback((up: boolean) => { if (stage.threadId) avatars.hold(stage.threadId, up); }, [avatars, stage.threadId]);
  const conversation = useRoomStore((state) => state.conversation);
  const reply = stage.isTarget ? conversation.saying ?? null : null;
  const reading = useRef<Reading | null>(null);
  useReadingClock(reading, reply, stage.speaking, conversation.messages);
  if (!stage.threadId) return null;
  return <>
    <div className="stage-top"><AgentBubbles key={stage.threadId} reading={reading} reply={reply} sounding={stage.speaking} messages={conversation.messages} onUp={holdStill} /></div>
    <PersonTurn conversation={conversation} t={t} />
  </>;
}
