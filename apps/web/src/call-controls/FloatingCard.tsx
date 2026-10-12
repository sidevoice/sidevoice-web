/* The floating card's options 1–4 (VARIANTS `floating-card`, briefs/FLOATING-CARD-SPEC.md §3–6). Options 1–3 are a
 * picture-in-picture of the conversation's own bicho on its stage — the "video" of the call — with chips over it and the
 * controls near the pointer; option 2 adds a caption under it (the words being said), option 3 the other
 * conversations. Option 4 is a pill with every control in view. They share one state model, one control set and one
 * Tab order (card-view.ts, §2.2–2.3); the plumbing with the host is card-shell.tsx.
 *
 * DOM order is Tab order (§2.3): the conversation, Size, Open Sidevoice; Hear it, Keep, Close; the devices, the
 * microphone, Mute agents, Skip, the end; the strip. Chips and the controls row are laid over the tile by position, so
 * the order never follows the layout. Controls that wait for the pointer are always in the DOM, hidden at rest and
 * shown near the pointer or with focus inside. Nothing here is a live region: the room announces. */
import { useEffect, useReducer, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ChevronIcon, CloseIcon, HandIcon, HangupIcon, HarnessIcon, LargerIcon, MachinesIcon, MicrophoneIcon, MicrophoneOffIcon, OpenAppIcon,
  PowerIcon, SkipIcon, SmallerIcon, SpeakerIcon, SpeakerOffIcon, VoiceIcon, WarningIcon,
} from "../components/ui/Icons";
import { avatarFor, avatarTone, type AvatarMood } from "../features/avatar/avatar-spec";
import { avatarColor } from "../features/avatar/bicho-draw";
import { CharacterAvatar } from "../features/avatar/CharacterAvatar";
import { StageBackdrop, StageDesk, useSceneScale, WantedPoster, type PosterWords } from "../features/avatar/StageScene";
import type { ParticipantView } from "../state/room-types";
import { ConversationPicker, DevicePicker, duration, useCardShell, useNow, useWave, type CardShell } from "./card-shell";
import {
  cardView, elsewhere, hearIt, idleWarning, isVoiceSwitch, micControl, rowView, stripOrder,
  type CardView, type Elsewhere, type FloatingCard, type HearItView,
} from "./card-view";
import type { CallControlsHost, CallControlsState, CallSnapshot, CardCaption } from "./host";
import type { Translate } from "./i18n";
import "./floating-card.css";

/** Where the card keeps its size (options 1–3), in its own storage: the same on every display. */
export const SIZE_KEY = "sidevoice.callCard.size";
/** Without a caption to beat to, the mouth beats this often while the agent speaks (an estimate). */
export const MOUTH_BEAT_MS = 180;
/** How many other conversations the strip shows before "+N", at each size. */
export const STRIP_MAX = { S: 6, L: 8 } as const;
/** How many characters the caption's line holds before its words scroll on (an estimate of 13 and 14 px text). */
const CAPTION_LINE = { S: 38, L: 44 } as const;

type Size = "S" | "L";

function useCardSize(): [Size, () => void] {
  const [size, setSize] = useState<Size>(() => {
    try { return globalThis.localStorage?.getItem(SIZE_KEY) === "L" ? "L" : "S"; } catch { return "S"; }
  });
  const toggle = () => setSize((now) => {
    const next = now === "S" ? "L" : "S";
    try { globalThis.localStorage?.setItem(SIZE_KEY, next); } catch { /* This card only. */ }
    return next;
  });
  return [size, toggle];
}

/** The mouth's beat while the agent speaks: each word the caption has said (FC8), else every MOUTH_BEAT_MS. */
function useMouthKey(speaking: boolean, caption: CardCaption | null | undefined): string | number | undefined {
  const [tick, step] = useReducer((n: number) => n + 1, 0);
  const said = speaking && caption?.who === "agent" && caption.spoken !== null
    ? caption.current + "|" + caption.current.slice(0, caption.spoken).split(/\s+/).filter(Boolean).length : null;
  useEffect(() => {
    if (!speaking || said !== null) return;
    const timer = setInterval(step, MOUTH_BEAT_MS);
    return () => clearInterval(timer);
  }, [speaking, said !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!speaking) return undefined;
  return said ?? tick;
}

/** `value`, or the last one it had: once the call is over (the exit notice) the snapshot no longer names its
 *  conversation, and the card still shows whose call it was. */
function useLast<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(value ?? null);
  if (value) last.current = value;
  return value || last.current;
}

function posterWords(t: Translate): PosterWords {
  return { title: t("card.poster.title"), status: t("card.poster.status"), fine: [t("card.poster.fine1"), t("card.poster.fine2"), t("card.poster.fine3")] };
}

/** The tile's scene: the conversation's bicho on its stage, as the stage draws it (no bubble, no badge, no models). */
function Scene({ seed, mood, mouthKey, t }: { seed: string; mood: AvatarMood; mouthKey: string | number | undefined; t: Translate }) {
  const spec = avatarFor(seed);
  return (
    <div className="stage-scene" aria-hidden="true">
      <StageBackdrop seed={seed} tone={avatarColor(spec)} />
      {mood === "offline" && <WantedPoster spec={spec} seed={seed} words={posterWords(t)} language={document.documentElement.lang || "en"} />}
      <CharacterAvatar className="stage-agent" spec={spec} mood={mood} size="stage" desk={mood === "working"} mouthKey={mouthKey} />
      <StageDesk seed={seed} />
    </div>
  );
}

/** The person's microphone as the card shows it: five bars of its level. Named only where they carry the state. */
function Bars({ levels, still, name }: { levels: number[]; still?: boolean; name?: string }) {
  return (
    <span className="fc-bars" data-still={still || undefined} role={name ? "img" : undefined} aria-label={name} aria-hidden={name ? undefined : true}>
      {levels.map((level, i) => <i key={i} style={{ "--l": still ? 0 : Math.min(1, level / 60) } as CSSProperties} />)}
    </span>
  );
}

/** O4 beside the title: an amber hand and the count (B's marks elsewhere), or a dot (unread elsewhere). Decorative: its
 *  words are the conversation button's description. */
function ElsewhereMark({ others }: { others: Elsewhere }) {
  return others.kind === "hand"
    ? <span className="fc-o4" data-kind="hand" aria-hidden="true"><HandIcon size={11} filled /><span>{others.count}</span></span>
    : <span className="fc-o4" data-kind="dot" aria-hidden="true" />;
}

/** Hear it, or its busy and unanswered states (B, FC9), with the amber hand of the mark. */
function MarkNotice({ hear, mark, row, run, className }: { hear: HearItView; mark: ParticipantView["mark"]; row: ParticipantView; run: CardShell["run"]; className: string }) {
  const asking = hear.state === "asking";
  return (
    <span className={className} data-state={hear.state}>
      {hear.state !== "no-answer" && <HandIcon size={13} filled={mark !== "wants-to-talk"} />}
      {hear.state === "no-answer"
        ? <span className="fc-mark-note">{hear.visible}</span>
        : <button type="button" className="fc-hear" aria-label={hear.name} title={hear.name} aria-disabled={asking || undefined} aria-busy={asking || undefined}
            onClick={(event) => { if (!asking) run({ command: "hear-it", threadId: row.threadId }, event); }}>
            {asking && <span className="fc-spinner" aria-hidden="true" />}{hear.visible}
          </button>}
    </span>
  );
}

interface BodyProps { host: CallControlsHost; state: CallControlsState; t: Translate; exit: string | null; onDismiss(): void }

export function FloatingCardBody({ variant, ...props }: BodyProps & { variant: Exclude<FloatingCard, "today"> }) {
  return variant === "pill" ? <PillCard {...props} /> : <PipCard {...props} option={variant} />;
}

/** The controls every option has (§2.3), in their Tab order: the devices and the microphone, Mute agents (B), Skip and
 *  the end — Hang up (A), Turn off voice (B). */
function CallControls({ call, shell, shortcut, levels, pill = false, t, className }: { call: CallSnapshot; shell: CardShell; shortcut: string; levels?: number[]; pill?: boolean; t: Translate; className: string }) {
  const { panel, openPanel, run } = shell;
  const voice = isVoiceSwitch(call);
  const mic = micControl(call, shortcut, t);
  const waiting = call.agentsMuted ? call.wantToTalk : 0;
  const waitingText = waiting ? t(waiting === 1 ? "card.waiting.one" : "card.waiting.other", { n: waiting }) : null;
  // The pill shows Skip only while something plays, in a slot of its own left of the microphone (§6); the
  // picture-in-picture keeps it after Mute agents, disabled while nothing plays (§3).
  const skip = (!pill || call.canSkip) && (
    <button type="button" className="card-skip" disabled={!call.canSkip} title={t("card.skip")} aria-label={t("card.skip")} onClick={(event) => run({ command: "skip-reply" }, event)}>
      <SkipIcon size={17} />
    </button>
  );
  return (
    <div className={className}>
      {pill && skip}
      <span className="card-mic" data-muted={mic.pressed || undefined}>
        <button type="button" className="card-devices" aria-expanded={panel === "devices"} title={t("card.devices")} aria-label={t("card.devices")}
          onClick={(event) => openPanel("devices", event.currentTarget)} disabled={!call.devices}>
          {levels ? <Bars levels={levels} still={mic.pressed} /> : null}<ChevronIcon size={13} />
        </button>
        <button type="button" className="card-mute" aria-pressed={mic.pressed} title={mic.title} aria-label={mic.name}
          disabled={mic.disabled} aria-disabled={mic.reason ? true : undefined} aria-description={mic.reason ?? undefined}
          onClick={(event) => { if (!mic.reason) run({ command: "toggle-mute" }, event); }}>
          {mic.pressed ? <MicrophoneOffIcon size={17} /> : <MicrophoneIcon size={17} />}
        </button>
      </span>
      {voice && <button type="button" className="card-agents" aria-pressed={call.agentsMuted} title={[t("card.muteAgents"), waitingText].filter(Boolean).join(" · ")}
        aria-label={t("card.muteAgents")} aria-description={waitingText ?? undefined} onClick={(event) => run({ command: "toggle-agents" }, event)}>
        {call.agentsMuted ? <SpeakerOffIcon size={17} /> : <SpeakerIcon size={17} />}
        {waiting > 0 && <span className="card-agents-badge" aria-hidden="true">{waiting > 9 ? "9+" : waiting}</span>}
      </button>}
      {!pill && skip}
      {voice
        ? <button type="button" className="card-voice-off" title={t("card.voiceOff")} aria-label={t("card.voiceOff")} onClick={(event) => run({ command: "voice-off" }, event)}>
            <PowerIcon size={17} />
          </button>
        : <button type="button" className="card-hangup" title={t("card.hangUp")} aria-label={t("card.hangUp")} onClick={(event) => run({ command: "hang-up" }, event)}>
            <HangupIcon size={18} />
          </button>}
    </div>
  );
}

/** The picker and the devices, below the card. In B every conversation can be chosen but while switching (D5); in A only
 *  one that is there, as today. */
function Panels({ call, shell, t }: { call: CallSnapshot; shell: CardShell; t: Translate }) {
  const { panel, setPanel, run } = shell;
  if (panel === "conversations") return (
    <ConversationPicker call={call} t={t}
      disabled={(row) => isVoiceSwitch(call) ? row.switching : row.switching || !row.available || row.reach === "offline"}
      onSelect={(threadId, event) => { setPanel(null); run({ command: "select-participant", threadId }, event); }} />
  );
  if (panel === "devices") return <DevicePicker call={call} run={run} t={t} />;
  return null;
}

/** The conversation button's description: what it does, and O4's words. */
function titleDescription(others: Elsewhere | null, t: Translate) {
  return [t("card.switchConversation"), others?.text].filter(Boolean).join(". ");
}

/* ---------- options 1–3: the picture-in-picture ---------- */

function PipCard({ host, state, option, t, exit, onDismiss }: BodyProps & { option: "pip" | "caption" | "strip" }) {
  const call = state.call;
  const shell = useCardShell(host, state, { keyboard: true });
  const { panel, openPanel, expanded, run } = shell;
  const [size, toggleSize] = useCardSize();
  const now = useNow(1000);
  const sceneRef = useSceneScale();
  const view = cardView(call, t);
  const others = elsewhere(call, t);
  const hear = hearIt(call, view.row, t);
  const idle = exit ? null : idleWarning(call, t);
  const voice = isVoiceSwitch(call);
  const muted = !call.micEnabled;
  const levels = useWave(state.level, muted);
  const caption = state.caption ?? null;
  const mouthKey = useMouthKey(view.mood === "speaking", caption);
  const seed = useLast(view.row?.threadId ?? call.conversation);
  const mood = exit ? "idle" : view.mood;
  const tone = seed ? avatarTone(avatarColor(avatarFor(seed))) as CSSProperties : undefined;
  // Option 2's chip says the title alone: the caption says the state. With no conversation, the chip says that.
  const chip = option === "caption" ? call.title || view.line : view.line;
  const sub = [view.row?.machine, view.row?.model, view.row?.effort, duration(call.since, now)].filter(Boolean).join(" · ");
  const keep = (event: MouseEvent) => run({ command: "keep-alive" }, event);
  const close = (event: MouseEvent) => { run({ command: "dismiss" }, event); onDismiss(); };
  const openApp = (event: MouseEvent) => run({ command: "open-app" }, event);

  return (
    <div ref={shell.card} className="fc fc-pip" data-option={option} data-size={size} data-expanded={expanded || undefined}
      data-state={view.state} data-exit={exit ? "" : undefined} {...shell.handlers}>
      <div ref={sceneRef} className="fc-tile stage-tile" data-mood={mood ?? "idle"} data-dim={(!exit && view.state === "S3") || undefined}
        data-ring={(!exit && view.state === "S4") || undefined} style={tone} onDoubleClick={toggleSize}>
        {seed && mood ? <Scene seed={seed} mood={mood} mouthKey={mouthKey} t={t} /> : <span className="fc-brand" aria-hidden="true"><VoiceIcon size={40} /></span>}
      </div>

      {!exit && <div className="fc-top">
        <div className="fc-who">
          <button type="button" className="card-title fc-chip fc-title" aria-expanded={panel === "conversations"} title={chip}
            aria-description={titleDescription(option === "strip" ? null : others, t)} translate="no"
            onClick={(event) => openPanel("conversations", event.currentTarget)}>
            <span className="fc-title-text">{chip}</span>
            <span className="fc-chevron" aria-hidden="true"><ChevronIcon size={12} /></span>
            {option !== "strip" && others && <ElsewhereMark others={others} />}
          </button>
          {sub && !exit && <span className="fc-sub" translate="no">{view.row?.harness && <HarnessIcon harness={view.row.harness} size={10} />}{view.row?.machine && <MachinesIcon size={10} />}<span>{sub}</span></span>}
        </div>
        {!exit && <span className="fc-tools">
          <button type="button" className="fc-tool" aria-label={t(size === "S" ? "card.size.larger" : "card.size.smaller")} title={t(size === "S" ? "card.size.larger" : "card.size.smaller")}
            onClick={toggleSize}>{size === "S" ? <LargerIcon size={14} /> : <SmallerIcon size={14} />}</button>
          <button type="button" className="fc-tool" aria-label={t("card.openApp")} title={t("card.openApp")} onClick={openApp}><OpenAppIcon size={14} /></button>
        </span>}
      </div>}

      {hear && view.row && !exit && <MarkNotice hear={hear} mark={view.row.mark} row={view.row} run={run} className="fc-chip fc-mark" />}
      {idle && option !== "caption" && (
        <div className="fc-banner">
          <WarningIcon size={14} />
          <span className="fc-banner-text">{idle.text}</span>
          <button type="button" className="fc-keep" onClick={keep}>{idle.keep}</button>
        </div>
      )}
      {exit && option !== "caption" && (
        <div className="fc-exit">
          <p className="fc-exit-text">{exit}</p>
          <button type="button" className="fc-exit-open" onClick={openApp}><OpenAppIcon size={14} />{t("card.openApp")}</button>
          <button type="button" className="fc-tool fc-close" aria-label={t("card.notice.close")} title={t("card.notice.close")} onClick={close}><CloseIcon size={14} /></button>
        </div>
      )}
      {!exit && (
        <span className="fc-chip fc-you" aria-hidden="true" data-muted={muted || undefined} data-turn={call.turn ?? undefined}
          title={muted ? t("card.micMuted") : call.micSilent ? t("card.micSilent") : undefined}>
          {voice && call.agentsMuted && <SpeakerOffIcon size={13} />}
          <span className="fc-you-mic">{muted ? <MicrophoneOffIcon size={13} /> : <MicrophoneIcon size={13} />}</span>
          <Bars levels={levels} still={muted || call.busy || call.micSilent} />
        </span>
      )}

      {option === "caption" && <Caption call={call} view={view} caption={caption} exit={exit} idle={idle} size={size} levels={levels}
        t={t} keep={keep} close={close} openApp={openApp} />}

      {!exit && <CallControls call={call} shell={shell} shortcut={state.muteShortcut} t={t} className="fc-controls" />}

      {option === "strip" && !exit && <Strip call={call} shell={shell} size={size} t={t} />}

      <Panels call={call} shell={shell} t={t} />
    </div>
  );
}

/** Option 2's caption (§4): one fixed-height strip under the tile, the first row that applies. */
function Caption({ call, view, caption, exit, idle, size, levels, t, keep, close, openApp }: {
  call: CallSnapshot; view: CardView; caption: CardCaption | null; exit: string | null; idle: { text: string; keep: string } | null;
  size: Size; levels: number[]; t: Translate; keep(event: MouseEvent): void; close(event: MouseEvent): void; openApp(event: MouseEvent): void;
}) {
  let row: string, content: ReactNode;
  if (exit) {
    row = "exit";
    content = <>
      <p className="fc-caption-text">{exit}</p>
      <button type="button" className="fc-exit-open" onClick={openApp}><OpenAppIcon size={13} />{t("card.openApp")}</button>
      <button type="button" className="fc-tool fc-close" aria-label={t("card.notice.close")} title={t("card.notice.close")} onClick={close}><CloseIcon size={13} /></button>
    </>;
  } else if (idle) {
    row = "idle";
    content = <><WarningIcon size={14} /><p className="fc-caption-text">{idle.text}</p><button type="button" className="fc-keep" onClick={keep}>{idle.keep}</button></>;
  } else if (["S0", "S1", "S2", "S3"].includes(view.state)) {
    row = "state";
    content = <p className="fc-caption-text">{view.stateWords}</p>;
  } else if (call.turn || caption?.who === "you") {
    row = "you";
    content = <p className="fc-caption-text" translate="no"><b className="fc-who-said">{t("card.caption.you")} ·</b>{" "}
      {call.turn === "listening" ? <Bars levels={levels} name={t("card.turn.listening")} />
        : call.turn === "transcribing" ? <span className="fc-transcribing">{t("card.turn.transcribing")}</span>
          : <span className="fc-sent" key={caption?.current}>{caption?.current}</span>}</p>;
  } else if (view.state === "S4" && caption?.who === "agent" && caption.source === "voice" && caption.spoken !== null) {
    row = "speaking";
    content = <Karaoke caption={caption} budget={CAPTION_LINE[size]} />;
  } else if (isVoiceSwitch(call) && caption?.who === "agent" && caption.source === "written") {
    row = "written";
    content = <p className="fc-caption-text fc-written" translate="no"><span className="fc-dim">{t("card.caption.inWriting")} ·</span> {caption.current}</p>;
  } else if (view.state === "S7") {
    row = "working";
    content = <p className="fc-caption-text"><span className="fc-spinner" aria-hidden="true" />{t("card.caption.working")}</p>;
  } else if (caption?.who === "agent" && caption.source === "voice" && caption.spoken === null) {
    row = "ended";
    content = <p className="fc-caption-text fc-dim" translate="no">{caption.current}</p>;
  } else {
    row = "state";
    content = <p className="fc-caption-text">{view.stateWords}</p>;
  }
  return <div className="fc-caption" role="group" aria-label={t("card.caption.label")} data-row={row}>{content}</div>;
}

/** The reply being said (§4 row 5): the chunk before, dim, on one line; the chunk now, its said words lit. A chunk
 *  longer than the line moves on by whole words, so the word being said stays in view. */
function Karaoke({ caption, budget }: { caption: CardCaption; budget: number }) {
  const spoken = caption.spoken ?? 0;
  let from = 0;
  if (caption.current.length > budget && spoken > budget - 8) {
    for (const match of caption.current.matchAll(/\S+/g)) {
      if (spoken - (match.index ?? 0) <= budget - 8) { from = match.index ?? 0; break; }
    }
  }
  const said = caption.current.slice(from, Math.max(from, spoken)), rest = caption.current.slice(Math.max(from, spoken));
  return (
    <div className="fc-karaoke" translate="no">
      <p className="fc-karaoke-previous">{caption.previous}</p>
      <p className="fc-karaoke-current">{from > 0 && "…"}<span className="fc-said">{said}</span><span className="fc-unsaid">{rest}</span></p>
    </div>
  );
}

/** Option 3's strip (§5): the other conversations, at a glance, one click each. Its order holds while the pointer is
 *  over the card, so nothing moves under a click. */
function Strip({ call, shell, size, t }: { call: CallSnapshot; shell: CardShell; size: Size; t: Translate }) {
  const kept = useRef<string[] | null>(null);
  const order = stripOrder(call, shell.inside ? kept.current : null);
  kept.current = order.map((row) => row.threadId);
  if (!order.length) return null;
  const max = STRIP_MAX[size];
  const shown = order.length > max ? order.slice(0, max) : order;
  const hidden = order.slice(shown.length);
  return (
    <div className="fc-strip" role="group" aria-label={t("card.strip.label")}>
      {shown.map((row) => {
        const view = rowView(call, row, t);
        return (
          <button type="button" key={row.threadId} className="fc-strip-row" aria-label={view.name} title={view.reason ?? view.name}
            aria-disabled={view.disabled || undefined} aria-description={view.reason ?? undefined}
            onClick={(event) => { if (!view.disabled) shell.run({ command: "select-participant", threadId: row.threadId }, event); }}>
            <span className="fc-small-avatar">
              <CharacterAvatar spec={avatarFor(row.threadId)} mood={view.mood} size="small" unread={row.unread > 0} />
              <span className="fc-dot" data-state={view.dot} aria-hidden="true">{view.marked && <HandIcon size={9} filled={view.dot === "waiting-for-you"} />}</span>
            </span>
          </button>
        );
      })}
      {hidden.length > 0 && (
        <button type="button" className="fc-strip-more" aria-label={t("card.strip.more", { n: hidden.length })} aria-expanded={shell.panel === "conversations"}
          onClick={(event) => shell.openPanel("conversations", event.currentTarget)}>
          +{hidden.length}{hidden.some((row) => row.mark) && <HandIcon size={10} filled />}
        </button>
      )}
    </div>
  );
}

/* ---------- option 4: the pill ---------- */

function PillCard({ host, state, t, exit, onDismiss }: BodyProps) {
  const call = state.call;
  const shell = useCardShell(host, state, { keyboard: true });
  const { panel, openPanel, expanded, run } = shell;
  const view = cardView(call, t);
  const others = elsewhere(call, t);
  const hear = hearIt(call, view.row, t);
  const idle = exit ? null : idleWarning(call, t);
  const voice = isVoiceSwitch(call);
  const muted = !call.micEnabled;
  const levels = useWave(state.level, muted);
  const seed = useLast(view.row?.threadId ?? call.conversation);
  const small = view.row && !exit ? rowView(call, view.row, t) : null;
  const ring = view.state === "S4";
  const mood: AvatarMood = exit ? "idle" : view.mood ?? "idle";
  const openApp = (event: MouseEvent) => run({ command: "open-app" }, event);
  // With no conversation (S0) the title button says so, and opens the picker.
  const lastTitle = useLast(call.title);
  const titleText = exit ? lastTitle ?? "" : view.state === "S0" ? view.line : call.title;
  // Its state line: the state's words and O4; your bars while your turn is open (they carry the words as their name).
  const stateLine = call.turn === "listening" || call.turn === "transcribing"
    ? <Bars levels={levels} still={call.turn === "transcribing"} name={t(call.turn === "listening" ? "card.turn.listening" : "card.turn.transcribing")} />
    : <span className="fc-pill-words">{view.stateWords}{others && <> · <ElsewhereMark others={others} /></>}</span>;

  return (
    <div ref={shell.card} className="fc fc-pill" data-model={voice ? "b" : "a"} data-expanded={expanded || undefined} data-state={view.state}
      data-exit={exit ? "" : undefined} data-notice={exit || idle ? "" : undefined} {...shell.handlers}>
      <div className="fc-pill-row">
        <span className="fc-pill-avatar" data-ring={ring || undefined} data-dim={view.state === "S3" || undefined} aria-hidden="true"
          style={seed ? avatarTone(avatarColor(avatarFor(seed))) as CSSProperties : undefined}>
          {seed && (view.mood || exit) ? <CharacterAvatar spec={avatarFor(seed)} mood={mood} size="small" /> : <VoiceIcon size={22} />}
          {small && <span className="fc-dot" data-state={small.dot}>{small.marked && <HandIcon size={9} filled={small.dot === "waiting-for-you"} />}</span>}
        </span>
        <div className="fc-pill-text">
          <button type="button" className="card-title fc-pill-title" aria-expanded={panel === "conversations"} title={titleText}
            aria-description={titleDescription(others, t)} translate="no"
            onClick={(event) => openPanel("conversations", event.currentTarget)}>
            <span className="fc-title-text">{titleText}</span>
            <span className="fc-chevron" aria-hidden="true"><ChevronIcon size={12} /></span>
          </button>
          <span className="fc-pill-state">
            {exit || view.state === "S0" ? null : view.state === "S3" ? <span className="fc-pill-words">{view.line}</span> : stateLine}
            {hear && view.row && !exit && <MarkNotice hear={hear} mark={view.row.mark} row={view.row} run={run} className="fc-pill-hear" />}
          </span>
        </div>
        <span className="fc-pill-open">
          {!exit && <button type="button" className="fc-tool" aria-label={t("card.openApp")} title={t("card.openApp")} onClick={openApp}><OpenAppIcon size={14} /></button>}
        </span>
        {!exit && <CallControls call={call} shell={shell} shortcut={state.muteShortcut} levels={levels} pill t={t} className="fc-pill-controls" />}
      </div>
      {(exit || idle) && (
        <div className="fc-pill-notice">
          <WarningIcon size={14} />
          <p className="fc-pill-notice-text">{exit ?? idle!.text}</p>
          {exit
            ? <>
                {/* The pill's row is narrow: the reason gets the room, Open Sidevoice says itself by its name. */}
                <button type="button" className="fc-tool fc-exit-icon" aria-label={t("card.openApp")} title={t("card.openApp")} onClick={openApp}><OpenAppIcon size={13} /></button>
                <button type="button" className="fc-tool fc-close" aria-label={t("card.notice.close")} title={t("card.notice.close")}
                  onClick={(event) => { run({ command: "dismiss" }, event); onDismiss(); }}><CloseIcon size={13} /></button>
              </>
            : <button type="button" className="fc-keep" onClick={(event) => run({ command: "keep-alive" }, event)}>{idle!.keep}</button>}
        </div>
      )}
      <Panels call={call} shell={shell} t={t} />
    </div>
  );
}
