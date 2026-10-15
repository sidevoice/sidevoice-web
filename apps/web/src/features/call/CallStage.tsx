import { useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
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
import { sounding, useAgentTurns, useSpokenTo, type AgentTurn } from "./speech-reading";
import { PagedText } from "./PagedText";
import { useStageConversation, type StageConversation } from "./stage-view";
import { BalloonTail } from "./BalloonTail";
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

/* The balloon is made of the agent's own skin (decided 2026-10-15: its colour, pale, its ink and its gloss). Still
 * compared on the live page (lib/variants.ts, the playground's VARIANTS panel): `balloonPlace` center (its tail out of
 * its bottom-left corner) or left (pushed left of the agent, its tail out of its bottom-right corner toward it);
 * three lines at a time (decided 2026-10-15); `balloonPaging` scroll (a line at a time) or page (a page at a time, the last one shorter). */
const BALLOON_PLACES = ["center", "left"] as const;
const BALLOON_PAGING = ["scroll", "page"] as const;

/** One reply on the stage, in a speech balloon whose tail points down at the agent (call-view.css): a few lines at a
 *  time (PagedText), lit as the voice says them, moving on with the words heard. */
function AgentBubble({ turn }: { turn: AgentTurn }) {
  const place = useVariant("balloonPlace", BALLOON_PLACES);
  const paging = useVariant("balloonPaging", BALLOON_PAGING);
  return (
    <div className="speech-bubble stage-bubble" data-place={place} data-visible="" data-leaving={turn.leaving || undefined} aria-hidden="true" translate="no">
      <PagedText measure={turn.text} follow=".karaoke-played" lines={3} turn={paging}>
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

function StageName({ stage, className, tone, children }: { stage: StageConversation; className: string; tone: string; children?: ReactNode }) {
  const Tag = className === "stage-title" ? "header" : "div";
  return (
    // Its own tint: above the tile on a desktop, outside the tile that carries it.
    <Tag className={className} translate="no" style={avatarTone(tone) as CSSProperties}>
      <span className="stage-heading">
        <h2 title={stage.title}><span>{stage.title}</span></h2>
        {stage.row?.machine && <span className="stage-machine"><MachinesIcon size={12} /><span>{stage.row.machine}</span></span>}
      </span>
      {/* Under them, as a subtitle: what the call is talked to with (until the title's detail view comes). */}
      {children}
    </Tag>
  );
}

/** The agent's replies on the stage: the one sounding, followed as it is heard; once its last words are said it stays
 *  PAGE_MS, then leaves. A new reply over it: the one before lifts away at once (as the person's sent turn does). */
function AgentBubbles({ reply, spokenTo, onUp }: { reply: ChatMessage | null; spokenTo: number | null; onUp: (up: boolean) => void }) {
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

/** The stage; `notice`, what the room says over it (App: where an update waits), at the tile's top, taking no room of
 *  its own. */
export function CallStage({ notice }: { notice?: ReactNode } = {}) {
  const t = translator();
  const stage = useStageConversation();
  const sceneRef = useSceneScale();
  const [balloonUp, setBalloonUp] = useState(false);
  // Under its balloon the agent holds still (operator, 2026-10-15): work that starts meanwhile waits for it to go.
  const mood = balloonUp && stage.mood === "working" ? "speaking" : stage.mood;
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
      <StageName stage={stage} className="stage-title" tone={tone}>
        {!narrow && <span className="stage-title-tags"><VoiceModels /></span>}
      </StageName>
      {/* The tile keeps its form factor's shape, as a slide does: as large as the room allows, centred, the app's own
          background around it (useSceneScale fits it in its slot; call-view.css names the shapes). What the tile says —
          the name, the voice models, the replies, the badge — is laid on the tile, at its corners. */}
      <div ref={sceneRef} className="stage-slot">
      <div className="stage-tile" data-mood={mood} data-app={desktopHost() ? "" : undefined} style={avatarTone(tone) as CSSProperties}>
        <div className="stage-notice">{notice}</div>
        <div className="stage-canvas">
          <div className="stage-scene">
            <StageBackdrop seed={stage.threadId} tone={tone} />
            {stage.mood === "offline" && <WantedPoster spec={spec} seed={stage.threadId} words={posterWords(t)} language={uiLanguage()} />}
            <CharacterAvatar className="stage-agent" spec={spec} mood={mood} size="stage" unread={stage.unread > 0} desk={mood === "working"} still={balloonUp}
              mouth="playback" playbackThreadId={stage.threadId} label={t("stage.agentState", { title: stage.title, state: moodText(stage.mood, t) })} />
            <StageDesk seed={stage.threadId} />
          </div>
        </div>
        <StageName stage={stage} className="stage-name" tone={tone} />
        {narrow && <VoiceModels />}
        <div className="stage-top">
          {/* Its own conversation's: another one on the stage starts with none of the replies before it. */}
          <AgentBubbles key={stage.threadId} reply={reply} spokenTo={spokenTo} onUp={setBalloonUp} />
          {/* Working is said only to assistive tech here: the sidebar shows it. */}
          {stage.mood === "working" && <p className="sr-only" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden="true" />{t("stage.working")}</p>}
        </div>
        {/* The agent's harness, model and effort, at the tile's foot (it gives the stage its touch: operator, 2026-10-15). */}
        <div className="stage-tags"><AgentBadge stage={stage} /></div>
        <PersonTurn conversation={conversation} t={t} />
        {narrow && <TranscriptEntry />}
      </div>
      </div>
    </section>
  );
}
