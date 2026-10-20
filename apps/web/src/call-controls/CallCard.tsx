/* The desktop app's floating call card (sidevoice/sidevoice-desktop#4, redesigned in sidevoice-web#88): a call surface
 * that floats over the person's other apps while the room's window is not in front. Three formats, picked in Settings →
 * Floating card (state/floating-card.ts), as closed on 2026-10-19 (sidevoice-playground#131,
 * briefs/UX-DECISIONS-2026-10-19.md "Call card: final"):
 *
 * - the title card: the conversation's avatar, its title, machine and model, what is happening, and your
 *   wave; near the pointer, today's call controls. Its captions are plain lines, as a transcript reads.
 * - the picture-in-picture (default): the room's own stage tile (StageTile) under the room's title block, and the room's call bar
 *   (CardCallBar) under it. Its captions are the stage's balloons.
 * - just the avatar: the conversation's creature, on nothing; the stage's balloons above or below it (their tails toward
 *   it); the pointer on the creature shows, right under it (past its balloons where they open below), a compact card: the
 *   title card's first row and its controls row, nothing between (sidevoice-playground#131, "C1: the compact card").
 *
 * Every format: the conversations control (their mark, how many, ▾) right after the title, whose list drops from it; ×
 * always (hidden for this call), the gear and "open Sidevoice" near the pointer; captions on the card's own toggle
 * (state/captions.ts, shared with the room's call bar). What opens from the card (captions, lists) opens toward the
 * screen's middle (`place`). The room's components draw on the card's own store (card-room.ts); the host's state and the
 * plumbing are card-shell.tsx. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { CaptionsIcon, CaptionsOffIcon, ChevronIcon, CloseIcon, ConversationsIcon, HangupIcon, HarnessIcon, MachinesIcon, MicrophoneIcon,
  MicrophoneOffIcon, OpenAppIcon, SettingsIcon, SkipIcon } from "../components/ui/Icons";
import { Button } from "../components/ui/Button";
import { ConversationPicker, DevicePicker, useCardShell, useHostState, useWave, type CardShell } from "./card-shell";
import { hasUnread, moodText } from "../features/call/conversation-state";
import { ConversationAvatar } from "../features/call/ConversationAvatar";
import { useConversationAvatar, useConversationAvatars } from "../features/call/conversation-avatars";
import { CharacterAvatar } from "../features/avatar/CharacterAvatar";
import { avatarFor, avatarTone, SIDEVOICE_MASCOT, type AvatarSpec } from "../features/avatar/avatar-spec";
import { avatarColor } from "../features/avatar/bicho-draw";
import { StageBalloons, StageTile } from "../features/call/CallStage";
import { CardCallBar } from "../features/call/CallToolbar";
import { KaraokeText } from "../features/conversation/KaraokeText";
import { VoiceWaveform } from "../features/conversation/VoiceWaveform";
import { DeliveryMark } from "../features/conversation/MessageBubble";
import { PagedText, PAGE_MS } from "../features/call/PagedText";
import { SENT_LEAVING_MS, useAgentTurns, useSentTurns, useSpokenTo } from "../features/call/speech-reading";
import { useStageConversation } from "../features/call/stage-view";
import { useRoomStore } from "../state/room-store";
import { receiptView } from "../state/room-session-state.js";
import { setCaptions, useCaptions } from "../state/captions";
import { CARD_WIDTHS, PIP_MIN_HEIGHT, PIP_MIN_WIDTH, useFloatingCard, type CardFormat, type CardSize } from "../state/floating-card";
import type { ParticipantView } from "../state/room-types";
import type { CallControlsHost, CallControlsState } from "./host";
import type { Translate } from "../i18n/translator";

export { CARD_MARGIN, CLICK_GUARD_MS, DRAG_THRESHOLD_PX, HIDE_DELAY_MS, PANEL_CLOSE_MS, SHOW_DELAY_MS, WAVE_SAMPLE_MS, duration } from "./card-shell";
import { CARD_MARGIN } from "./card-shell";

type Place = NonNullable<CallControlsState["place"]>;
const UPPER_RIGHT: Place = { vertical: "upper", horizontal: "right" };

export function CallCard({ host, t }: { host: CallControlsHost; t: Translate }) {
  const state = useHostState(host);
  const prefs = useFloatingCard();
  if (!state || !state.call.joined) return null;
  // Each call gets a card of its own: nothing of the last one (a panel, the wave, a drag) carries over; nor of another
  // format.
  return <FloatingCard key={(state.call.since ?? "call") + prefs.format} host={host} state={state} format={prefs.format} size={prefs.size} t={t} />;
}

/** Who the card shows: the call's conversation; else the first in the list; else Sidevoice's own mascot. */
function useCardAgent(state: CallControlsState): { threadId: string | null; spec: AvatarSpec } {
  const threadId = state.call.conversation ?? state.call.participants[0]?.threadId ?? null;
  return { threadId, spec: threadId ? avatarFor(threadId) : SIDEVOICE_MASCOT };
}

function FloatingCard({ host, state, format, size, t }: { host: CallControlsHost; state: CallControlsState; format: CardFormat; size: CardSize; t: Translate }) {
  const custom = format === "pip" && state.size ? state.size : null;
  const shell = useCardShell(host, state, format === "pip" && host.resize ? { minWidth: PIP_MIN_WIDTH + 2 * CARD_MARGIN, minHeight: PIP_MIN_HEIGHT + 2 * CARD_MARGIN } : undefined, format === "avatar");
  const place = state.place ?? UPPER_RIGHT;
  const captions = useCaptions();
  const width = custom ? custom.width - 2 * CARD_MARGIN : CARD_WIDTHS[format][size];
  const style = { "--card-w": width + "px", ...(custom ? { "--card-h": custom.height - 2 * CARD_MARGIN + "px" } : {}) } as CSSProperties;
  const body = format === "card" ? <TitleCard state={state} shell={shell} t={t} />
    : format === "pip" ? <PictureCard host={host} state={state} shell={shell} place={place} sized={!!custom} t={t} />
      : <AvatarCard state={state} shell={shell} t={t} />;
  return (
    <div ref={shell.card} className="floating-card" data-format={format} data-size={custom ? "custom" : size} data-open={place.vertical === "upper" ? "down" : "up"}
      data-side={place.horizontal} data-expanded={shell.expanded || undefined} data-flow={shell.flow || undefined} data-dragging={shell.dragging || undefined} data-captions={captions ? "on" : "off"} style={style} {...shell.handlers}>
      {body}
      {shell.panel && format === "card" && <PanelCard state={state} shell={shell} t={t} />}
      {shell.panel && format === "pip" && (!custom || place.vertical === "lower") && <PanelCard state={state} shell={shell} t={t} />}
      {format === "card" && captions && <CaptionLines state={state} t={t} />}
    </div>
  );
}

// ---------- what every format has ----------

/** The header's unread cue: the list's own "!" (the avatars' tag, bichos .bang) on the control's corner. Decorative: the
 *  control's name says how many conversations have unread replies. */
function UnreadBang() {
  return <span className="card-unread-bang" aria-hidden="true"><svg viewBox="-10.5 -13.5 21 27"><rect x="-9" y="-12" width="18" height="24" rx="6" /><text y="7" textAnchor="middle">!</text></svg></span>;
}

/** The way to the other conversations: their mark, how many, and ▾ (▴ while the list is down), right after the title. */
function ConversationsButton({ state, shell, t }: { state: CallControlsState; shell: CardShell; t: Translate }) {
  const count = state.call.participants.length;
  const open = shell.panel === "conversations";
  const unread = state.call.participants.filter((row) => hasUnread(row, null)).length;
  const name = unread ? t("card.conversationsCountUnread", { n: count, unread }) : t("card.conversationsCount", { n: count });
  return (
    <button type="button" className="card-conversations-button" aria-expanded={open} aria-haspopup="dialog"
      aria-label={name} title={unread ? name : t("card.switchConversation")} onClick={() => shell.setPanel(open ? null : "conversations")}>
      <ConversationsIcon size={14} /><span>{count}</span><ChevronIcon size={12} className="card-conversations-chevron" />
      {unread > 0 && <UnreadBang />}
    </button>
  );
}

/** The open list or devices panel. It sits against the control that opened it: after the card (A1, the picture at a preset size), under the
 *  header of a resized picture (CardHeading), or under/over the avatar's compact card (AvatarCard). */
function PanelCard({ state, shell, t }: { state: CallControlsState; shell: CardShell; t: Translate }) {
  return (
    <div className="call-card card-panel-card">
      {shell.panel === "conversations" && <Conversations state={state} shell={shell} t={t} />}
      {shell.panel === "devices" && <DevicePicker call={state.call} run={shell.run} t={t} />}
    </div>
  );
}

function Conversations({ state, shell, t }: { state: CallControlsState; shell: CardShell; t: Translate }) {
  return (
    <ConversationPicker call={state.call} t={t}
      // The call can only go to a conversation that is there; the room browses the others.
      disabled={(row) => row.switching || !row.available || row.reach === "offline"}
      lead={(row: ParticipantView) => <ConversationAvatar row={row} />}
      onSelect={(threadId) => { shell.setPanel(null); shell.run({ command: "select-participant", threadId }); }} />
  );
}

/** × (always), and near the pointer the gear (Settings → Floating card) and "open Sidevoice". */
function CardActions({ shell, t, close = true }: { shell: CardShell; t: Translate; close?: boolean }) {
  return (
    <span className="card-actions">
      <span className="card-actions-hover">
        <button type="button" className="card-action" title={t("card.openApp")} aria-label={t("card.openApp")} onClick={() => shell.run({ command: "open-app" })}>
          <OpenAppIcon size={15} />
        </button>
        <button type="button" className="card-action" title={t("card.settings")} aria-label={t("card.settings")} onClick={() => shell.run({ command: "open-settings" })}>
          <SettingsIcon size={15} />
        </button>
      </span>
      {close && <button type="button" className="card-action card-hide" title={t("card.hide")} aria-label={t("card.hide")} onClick={() => shell.run({ command: "hide" })}>
        <CloseIcon size={15} />
      </button>}
    </span>
  );
}

/** The agent's creature, as the stage draws it for its conversation, in the same state as every copy of it. */
function CardFigure({ state, size, label }: { state: CallControlsState; size: "small" | "stage"; label?: string }) {
  const agent = useCardAgent(state);
  const avatars = useConversationAvatars();
  const avatar = useConversationAvatar(agent.threadId);
  return <CharacterAvatar spec={agent.spec} state={avatar} size={size} mouth="playback" label={label}
    mouthLevel={agent.threadId ? avatars.mouth(agent.threadId) : undefined} />;
}

// ---------- A1: the title card ----------

/** Your microphone: the last samples of its level; flat and crossed out when muted, flat while reconnecting. */
function YourWave({ level, muted, still, t }: { level: number; muted: boolean; still: boolean; t: Translate }) {
  const levels = useWave(level, muted);
  return (
    <span className="your-wave" data-muted={muted || undefined} data-still={still || undefined} role="img"
      aria-label={muted ? t("card.youAreMuted") : t("card.yourMicrophone")}>
      {/* Each bar scales (transform) from its full 16px instead of changing height: WebKit composites a scale, while a
          height per sample laid out and repainted the card 10 times a second (desktop#149). */}
      {levels.map((level, i) => <i key={i} style={{ transform: muted || still ? undefined : `scaleY(${Math.max(3, Math.round(level * 0.16)) / 16})` }} />)}
    </span>
  );
}

/** A1's two rows; `compact` (just the avatar's card) keeps A1's first row without the face, the machine, the state and your
 *  wave, over A1's controls row, which is always out. */
function TitleCard({ state, shell, t, compact = false }: { state: CallControlsState; shell: CardShell; t: Translate; compact?: boolean }) {
  const call = state.call;
  const { panel, setPanel, expanded, run } = shell;
  const muted = !call.micEnabled;
  const reconnecting = call.busy;
  const captions = useCaptions();
  const selected = call.participants.find((participant) => participant.selected);
  const agent = useCardAgent(state);
  const muteLabel = muted ? t("card.unmute") : t("card.mute");
  // What is happening, in one line: you muted, the call reconnecting, else what the agent acts out.
  const line = reconnecting ? t("card.reconnecting") : muted ? t("card.youAreMuted") : moodText(call.mood, t);
  const tone = agent.threadId ? avatarColor(agent.spec) : undefined;
  return (
    <div ref={compact ? undefined : shell.body} className={"call-card title-card" + (compact ? " compact-card" : "")} data-expanded={expanded || undefined}>
      <div className="card-row">
        {!compact && <span className="card-face" style={tone ? avatarTone(tone) as CSSProperties : undefined}>
          <CardFigure state={state} size="small" label={t("stage.agentState", { title: call.title, state: moodText(call.mood, t) })} />
        </span>}
        <div className="card-who">
          <span className="card-title">
            <span className="card-title-text" title={call.title} translate="no">{call.title}</span>
            <ConversationsButton state={state} shell={shell} t={t} />
          </span>
          {!compact && <span className="card-sub">{[
            selected?.machine && <span key="machine" className="card-machine"><MachinesIcon size={11} /> <span>{selected.machine}</span></span>,
            (selected?.harness || selected?.model) && <span key="harness" className="card-harness">{selected?.harness && <HarnessIcon harness={selected.harness} size={11} />} <span>{[selected?.model, selected?.effort].filter(Boolean).join(" · ")}</span></span>,
          ].filter(Boolean).flatMap((part, i) => (i ? [<span key={"dot" + i} aria-hidden="true">·</span>, part] : [part]))}</span>}
          {!compact && <span className="card-state" data-mood={reconnecting ? "reconnecting" : muted ? "muted" : call.mood}><i aria-hidden="true" />{line}</span>}
        </div>
        {!compact && <YourWave level={state.level} muted={muted} still={reconnecting} t={t} />}
      </div>
      <span className="card-corner"><CardActions shell={shell} t={t} /></span>

      {(expanded || compact) && (
        <div className="card-controls">
          <span className="card-mic" data-muted={muted || undefined}>
            <button type="button" className="card-devices" aria-expanded={panel === "devices"} title={t("card.devices")} aria-label={t("card.devices")}
              onClick={() => setPanel(panel === "devices" ? null : "devices")} disabled={!call.devices}>
              <ChevronIcon size={13} />
            </button>
            <button type="button" className="card-mute" aria-pressed={muted} disabled={call.micDisabled}
              title={state.muteShortcut ? t("card.shortcut", { action: muteLabel, shortcut: state.muteShortcut }) : muteLabel} aria-label={muteLabel}
              onClick={() => run({ command: "toggle-mute" })}>
              {muted ? <MicrophoneOffIcon size={17} /> : <MicrophoneIcon size={17} />}
            </button>
          </span>
          <button type="button" className="card-captions" aria-pressed={captions} title={t(captions ? "toolbar.captionsHide" : "toolbar.captionsShow")}
            aria-label={t(captions ? "toolbar.captionsHide" : "toolbar.captionsShow")} onClick={() => setCaptions(!captions)}>
            {captions ? <CaptionsIcon size={17} /> : <CaptionsOffIcon size={17} />}
          </button>
          <button type="button" className="card-skip" disabled={!call.canSkip} title={t("card.skip")} aria-label={t("card.skip")} onClick={() => run({ command: "skip-reply" })}>
            <SkipIcon size={17} />
          </button>
          <button type="button" className="card-hangup" title={t("card.hangUp")} aria-label={t("card.hangUp")} onClick={() => run({ command: "hang-up" })}>
            <HangupIcon size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

/** The title card's captions: what is being said, as a transcript reads — a line per speaker, its name over it. The
 *  agent's reply lit as it is heard, a few lines at a time; yours, the voice's bars (and the room's Cancel sending) while
 *  you speak and it is transcribed, then what was sent, for its moment. */
function CaptionLines({ state, t }: { state: CallControlsState; t: Translate }) {
  const stage = useStageConversation();
  const conversation = useRoomStore((store) => store.conversation);
  const reply = stage.isTarget ? conversation.saying ?? null : null;
  const spokenTo = useSpokenTo(reply, stage.speaking, conversation.messages);
  const said = useAgentTurns(reply, spokenTo).filter((turn) => !turn.leaving).at(-1) ?? null;
  const { turns, done } = useSentTurns(conversation);
  const sent = turns.filter((turn) => turn.thread === conversation.thread).at(-1) ?? null;
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => done(sent.key), PAGE_MS + SENT_LEAVING_MS);
    return () => window.clearTimeout(timer);
  }, [sent, done]);
  const pending = !!conversation.pendingPhase;
  const delivery = sent ? conversation.messages.find((message) => message.role === "user" && (message.segment ?? String(message.time)) === sent.key)?.delivery : undefined;
  const receipt = delivery && receiptView(delivery).label ? delivery : null;
  const lines: ReactNode[] = [];
  if (said) lines.push(
    <p key="agent" className="caption-line" data-role="assistant">
      <b translate="no">{state.call.title}</b>
      <PagedText measure={said.text} follow=".karaoke-played" lines={2} turn="page" fixed>
        <KaraokeText text={said.text} playback="playing" range={said.spoken > 0 ? { from: 0, to: Math.min(said.spoken, said.text.length) } : null} />
      </PagedText>
    </p>);
  if (pending) lines.push(
    <p key="you" className="caption-line" data-role="user">
      <b>{t("card.you")}</b>
      <span className="caption-live">
        <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />
        {conversation.pendingCancellable && <Button variant="ghost" tone="neutral" size="sm" className="cancel-input"
          onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>}
      </span>
    </p>);
  else if (sent) lines.push(
    <p key={sent.key} className="caption-line" data-role="user">
      <b>{t("card.you")}</b>
      <span>{sent.text}{receipt && <span className="receipt" data-state={receipt} role="status" aria-label={receiptView(receipt).label}><DeliveryMark state={receipt} /></span>}</span>
    </p>);
  if (!lines.length) return null;
  return <div className="call-card card-captions-lines" aria-live="off">{lines}</div>;
}

// ---------- B1: the picture-in-picture ----------

/** The room's title block for the call's conversation: its title, then its machine on the line under it (`machine`). */
function CardHeading({ state, shell, t, panelBelow = false }: { state: CallControlsState; shell: CardShell; t: Translate; panelBelow?: boolean }) {
  const stage = useStageConversation();
  const title = stage.title || state.call.title;
  const host = stage.row?.machine ?? state.call.participants.find((row) => row.selected)?.machine ?? null;
  return (
    <header className="card-heading" translate="no">
      <span className="card-heading-name">
        <span className="card-heading-title" title={title}>{title}</span>
        <ConversationsButton state={state} shell={shell} t={t} />
      </span>
      {host && <span className="stage-machine"><MachinesIcon size={12} /><span>{host}</span></span>}
      <CardActions shell={shell} t={t} />
      {panelBelow && shell.panel && <PanelCard state={state} shell={shell} t={t} />}
    </header>
  );
}

/** The resize grip, in the corner toward the screen's middle: the host follows the pointer and keeps the size. */
function ResizeGrip({ host, place }: { host: CallControlsHost; place: Place }) {
  const edge = ((place.vertical === "upper" ? "s" : "n") + (place.horizontal === "right" ? "w" : "e")) as "nw" | "ne" | "sw" | "se";
  const active = useRef<number | null>(null);
  if (!host.resize) return null;
  return <span className="card-grip" data-edge={edge} aria-hidden="true"
    onPointerDown={(event) => { if (event.button > 0) return; active.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); host.resize!("start", edge); }}
    onPointerMove={(event) => { if (active.current === event.pointerId) host.resize!("move", edge); }}
    onPointerUp={(event) => { if (active.current !== event.pointerId) return; active.current = null; host.resize!("end", edge); }}
    onPointerCancel={() => { if (active.current === null) return; active.current = null; host.resize!("end", edge); }} />;
}

/** A label of an icon and words never shows as its icon alone (playground callcard.mjs `noStubs`): with fewer than about three
 *  characters of its words in view, the stage's model badge goes whole. Read again as the stage is resized. */
function useNoStubs(stage: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const read = () => {
      for (const label of node.querySelectorAll<HTMLElement>(".stage-badge")) {
        label.style.visibility = "";
        const text = label.querySelector<HTMLElement>(":scope > span:last-child");
        if (!text || getComputedStyle(label).display === "none") continue;
        const least = parseFloat(getComputedStyle(text).fontSize) * 0.55 * 3;
        if (text.clientWidth < Math.min(least, text.scrollWidth)) label.style.visibility = "hidden";
      }
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    const tile = node.querySelector(".stage-tile");
    if (tile) observer.observe(tile);
    return () => observer.disconnect();
  }, [stage]);
}

function PictureCard({ host, state, shell, place, sized, t }: { host: CallControlsHost; state: CallControlsState; shell: CardShell; place: Place; sized: boolean; t: Translate }) {
  const stage = useRef<HTMLDivElement>(null);
  useNoStubs(stage);
  return (
    <div ref={shell.body} className="picture-card" data-sized={sized || undefined}>
      <CardHeading state={state} shell={shell} t={t} panelBelow={sized && place.vertical === "upper"} />
      <div ref={stage} className="picture-stage"><StageTile card /></div>
      <CardCallBar />
      <ResizeGrip host={host} place={place} />
    </div>
  );
}

// ---------- C1: just the avatar ----------

/** Once open, the compact card holds while the pointer is anywhere in its hull: the box around the creature and the card, and the
 *  gaps between them, HULL_PX wider all round. Crossing the gap never folds it; leaving the hull does, after the usual delay
 *  (operator, 2026-10-20). */
const HULL_PX = 16;
function inHull(root: HTMLElement | null, event: { clientX: number; clientY: number }): boolean {
  if (!root) return false;
  const boxes = [...root.querySelectorAll(".avatar-figure, .avatar-compact .compact-card, .avatar-compact .card-panel-card")].map((node) => node.getBoundingClientRect()).filter((box) => box.width && box.height);
  if (!boxes.length) return false;
  return event.clientX >= Math.min(...boxes.map((box) => box.left)) - HULL_PX && event.clientX <= Math.max(...boxes.map((box) => box.right)) + HULL_PX
    && event.clientY >= Math.min(...boxes.map((box) => box.top)) - HULL_PX && event.clientY <= Math.max(...boxes.map((box) => box.bottom)) + HULL_PX;
}

function AvatarCard({ state, shell, t }: { state: CallControlsState; shell: CardShell; t: Translate }) {
  const captions = useCaptions();
  const place = state.place ?? UPPER_RIGHT;
  const opensDown = place.vertical === "upper";
  const [balloonsUp, setBalloonsUp] = useState(false);
  const balloons = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { zone } = shell;
  // What the pointer is on: inside an open card's hull it is on the card; else what is under it.
  const zoneAt = (event: ReactPointerEvent, under: "none" | "creature" | "card") => (shell.expanded && inHull(root.current, event) ? "card" : under);
  // Whether a balloon is out, for the stack to take room only then (the window is the creature's box at rest), and, where the
  // balloons open below, how far they reach (--balloon-reach, from the creature's feet): the card goes just past them while the
  // window counts their whole room (call-card.css), so a balloon coming or going never moves the creature.
  useEffect(() => {
    const node = balloons.current, card = root.current;
    if (!node || !card) return;
    const read = () => {
      const out = !!node.querySelector(".speech-bubble");
      setBalloonsUp(out);
      const figure = card.querySelector<HTMLElement>(".avatar-figure");
      card.style.setProperty("--balloon-reach", out ? node.offsetHeight - 0.1 * (figure?.offsetHeight ?? 0) + "px" : "0px");
    };
    read();
    const mutations = new MutationObserver(read), sizes = new ResizeObserver(read);
    mutations.observe(node, { childList: true, subtree: true });
    sizes.observe(node);
    return () => { mutations.disconnect(); sizes.disconnect(); };
  }, [captions]);
  // Tab reaching the card (it is there while folded) opens it; Escape, with focus in it or nowhere, folds it and blurs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || shell.panel || !shell.expanded) return;
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest(".avatar-compact")) return;
      event.preventDefault();
      zone.fold();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shell.panel, shell.expanded, zone]);
  return (
    // A grid in one column: the creature, its balloons on the side toward the screen's middle (above or below), and under both
    // the compact card (call-card.css). The card is in the window's flow only while it shows, so the window holds what shows.
    <div ref={root} className="avatar-card" data-balloons={balloonsUp || undefined} onPointerLeave={(event) => zone.aim((event.relatedTarget as Element | null)?.closest?.(".floating-card") ? zoneAt(event, "none") : "none")}
      onPointerMove={(event) => { if (shell.expanded && event.pointerType === "mouse") zone.aim(zoneAt(event, "none") === "card" ? "card" : (event.target as Element).closest(".avatar-figure") ? "creature" : (event.target as Element).closest(".avatar-compact") ? "card" : "none"); }}>
      <div ref={shell.body} className="avatar-figure" onPointerOver={(event) => zone.aim(zoneAt(event, "creature"))}>
        <CardFigure state={state} size="stage" label={t("stage.agentState", { title: state.call.title, state: moodText(state.call.mood, t) })} />
      </div>
      {captions && <div ref={balloons} className={"avatar-balloons" + (opensDown ? " balloon--tail-up" : "")} onPointerOver={(event) => zone.aim(zoneAt(event, "none"))}>
        <StageBalloons />
      </div>}
      <div className="avatar-compact" onPointerOver={(event) => { if ((event.target as Element).closest(".compact-card, .card-panel-card")) zone.aim("card"); }}
        onFocus={(event) => { if ((event.target as Element).matches(":focus-visible")) zone.focusWithin(true); }}
        onBlur={(event) => { if (!(event.relatedTarget as Element | null)?.closest?.(".avatar-compact")) zone.focusWithin(false); }}>
        <TitleCard state={state} shell={shell} t={t} compact />
        {shell.panel && <PanelCard state={state} shell={shell} t={t} />}
      </div>
    </div>
  );
}
