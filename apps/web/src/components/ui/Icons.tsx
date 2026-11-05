/* Every mark the room uses, named for what it means here and not for what it is drawn like: a screen is
 * "the machine", a plug is "the connector". Somewhere else is where they are drawn — lucide-react, the
 * standard set for React — and this file is the only place that decides which of its drawings each thing
 * in Sidevoice wears. Swapping the set is a change to this file and to nothing else.
 *
 * The exceptions are below: a product's own mark and the logos of other people's products are not
 * generic icons and are drawn here. */
import {
  Download, Trash2, Activity, Check, CheckCheck, ChevronDown, ChevronUp, Clock3, Copy, Keyboard, KeyRound,
  Monitor, Plus, Plug, RefreshCw, SlidersHorizontal, Wrench, X,
  Box, AudioWaveform, ArrowLeft, ArrowRight, RefreshCcwDot, Pencil, Laptop, Server,
  Timer, Link, Unlink, Search, ChevronLeft, ChevronRight, Eye, EyeOff, Sparkle, ShieldCheck, PictureInPicture2, Terminal,
} from "lucide-react";
import { useId, type ComponentType } from "react";
// Other products' own marks, from their brand kits (assets/logos/README.md: where each comes from and its rules).
import claudeLogo from "../../assets/logos/claude.svg?raw";
import codexLogo from "../../assets/logos/codex.svg?raw";
import cursorLogo from "../../assets/logos/cursor.svg?raw";
import elevenLabsLogo from "../../assets/logos/elevenlabs.svg?raw";
import openAiLogo from "../../assets/logos/openai.svg?raw";
import mcpLogo from "../../assets/logos/mcp.svg?raw";

type IconProps = { className?: string; size?: number };
type LucideLike = ComponentType<{ className?: string; size?: number; strokeWidth?: number; strokeLinecap?: "round"; strokeLinejoin?: "round"; "aria-hidden"?: boolean }>;

/** The room's stroke, as the state-colours demo draws its icons (2.2, round caps and joins: softer, and still legible at 12px). */
const STROKE = 2.2;

/** One drawing, wearing the room's stroke and hidden from anything that reads the page aloud. lucide draws with round caps
 *  and joins already; the demo's own paths below (`HAND`) are drawn with the same. */
function mark(Drawing: LucideLike, fallbackSize: number) {
  return function Mark({ className, size = fallbackSize }: IconProps) {
    return <Drawing className={className} size={size} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden />;
  };
}

/** The hand-drawn paths of the state-colours demo (24 grid) and, after them, the room's own in the same line (stroke 2.2, round
 *  caps and joins, corners softened): the ones a state is told by, and those in view during a call. Whatever is still lucide's
 *  below is drawn at the same stroke. */
const HAND = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  cog: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  dots: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3.4"/>',
  // The voice mark's five bars (assets/logos: the brand kit's, 3 wide, rounded): the voice going in, as transcribing is told.
  bars: '<path d="M3 10.5v3M7.5 7.5v9M12 3.5v17M16.5 7.5v9M21 10.5v3" stroke-width="3"/>',
  // A circle struck through: offline.
  offline: '<circle cx="12" cy="12" r="8.8"/><path d="M5.8 5.8l12.4 12.4"/>',
  alert: '<circle cx="12" cy="12" r="9.2"/><path d="M12 7.4v5.4M12 16.6h.01"/>',
  info: '<circle cx="12" cy="12" r="9.2"/><path d="M12 11.2v5.4M12 7.6h.01"/>',
  // The handset, earpiece at the top left (the call button turns it); hanging up lays it flat.
  phone: '<path d="M6.6 2.6c.6-.4 1.4-.3 1.9.2l2.3 2.6c.5.6.5 1.4 0 2l-1.2 1.4a11.5 11.5 0 0 0 5.6 5.6l1.4-1.2c.6-.5 1.4-.5 2 0l2.6 2.3c.5.5.6 1.3.2 1.9l-1 1.6c-.6 1-1.8 1.5-2.9 1.2A17.3 17.3 0 0 1 3.8 7.5c-.3-1.1.2-2.3 1.2-2.9z"/>',
  hangup: '<path d="M2 15.4c1.4-3.6 5.6-6.4 10-6.4s8.6 2.8 10 6.4c.3.8.1 1.6-.5 2.1l-1.6 1.4c-.7.6-1.7.6-2.4 0l-1.2-1c-.5-.4-.8-1-.8-1.7v-1.2a10.3 10.3 0 0 0-6.2 0v1.2c0 .7-.3 1.3-.8 1.7l-1.2 1c-.7.6-1.7.6-2.4 0l-1.6-1.4c-.6-.5-.8-1.3-.5-2.1z"/>',
  skip: '<path d="M5.5 5.2v13.6c0 .9 1 1.4 1.7.9l9.6-6.8c.6-.4.6-1.3 0-1.8L7.2 4.3c-.7-.5-1.7 0-1.7.9z"/><path d="M19.5 5v14"/>',
  play: '<path d="M7 4.9v14.2c0 .9 1 1.4 1.7.9l10.8-7.1c.6-.4.6-1.4 0-1.8L8.7 4c-.7-.5-1.7 0-1.7.9z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.4"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="3.6"/>',
  captions: '<rect x="2.8" y="5" width="18.4" height="14" rx="4.2"/><path d="M7 10.6h3M13.4 10.6h3.6M7 14.2h5.2M15 14.2h2"/>',
  // Two bubbles: the nearer one speaks, the other waits behind it.
  chats: '<path d="M3.4 6.9a3.4 3.4 0 0 1 3.4-3.4h6.6a3.4 3.4 0 0 1 3.4 3.4v3.7a3.4 3.4 0 0 1-3.4 3.4H9.3L6.2 16.6c-.7.5-1.6.1-1.6-.8V14a3.4 3.4 0 0 1-1.2-2.6z"/><path d="M20.6 9.6v3.5a3.4 3.4 0 0 1-3.4 3.4h-4.4"/>',
  external: '<path d="M13.2 4h6.3a.5.5 0 0 1 .5.5v6.3M19.7 4.3 11 13M17.8 14.2v3.3A2.5 2.5 0 0 1 15.3 20H6.5A2.5 2.5 0 0 1 4 17.5V8.7a2.5 2.5 0 0 1 2.5-2.5h3.3"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="4.6"/><path d="M9.6 4v16"/>',
};

// ----- the room
export const ConversationsIcon = drawn(HAND.chats, "0 0 24 24", 16, false, STROKE);
export const MachinesIcon = mark(Monitor, 16);
/** This computer, wherever a machine is shown (the setup's choice, Settings › Machines, the recap): a laptop. */
export const ThisComputerIcon = mark(Laptop, 18);
/** Another machine (one paired with this device): a server — never the same glyph as this computer's. Its square fills
 *  the whole grid where the laptop is wide and short, so it is drawn at 0.86 of its box (the laptop's area), its
 *  stroke thickened to match: the same footprint, the same weight on screen (2.2 / 0.86). */
export function OtherMachineIcon({ className, size = 18 }: IconProps) {
  return <Server className={className} size={size} viewBox="-1.95 -1.95 27.9 27.9" strokeWidth={2.56} aria-hidden />;
}
/** Renames what it sits beside. */
export const EditIcon = mark(Pencil, 14);
export const DeleteIcon = mark(Trash2, 16);
/** The voice detector (Silero VAD): it hears when someone speaks. */
export const VoiceDetectionIcon = mark(Activity, 16);
export const ConnectorIcon = mark(Plug, 12);
export const ChevronIcon = mark(ChevronDown, 16);
/** Puts away what dropped from above: a phone's conversations panel. */
export const CloseUpIcon = mark(ChevronUp, 18);
/** More of a list above, or below, what it shows: a select's long list. */
export const MoreAboveIcon = mark(ChevronUp, 14);
export const MoreBelowIcon = mark(ChevronDown, 14);
/** The side panel, folding away (the chevron points into it) and coming back. */
export const SidebarCollapseIcon = drawn(HAND.panel + '<path d="M16.4 9.4 13.8 12l2.6 2.6"/>', "0 0 24 24", 18, false, STROKE);
export const SidebarExpandIcon = drawn(HAND.panel + '<path d="M13.8 9.4 16.4 12l-2.6 2.6"/>', "0 0 24 24", 18, false, STROKE);
export const MoreIcon = drawn(HAND.dots, "0 0 24 24", 18, false, STROKE);
export const MoreVerticalIcon = drawn('<path d="M12 6h.01M12 12h.01M12 18h.01" stroke-width="3.4"/>', "0 0 24 24", 18, false, STROKE);
export const CloseIcon = mark(X, 18);
export const CopyIcon = mark(Copy, 18);
export const RefreshIcon = mark(RefreshCw, 18);
export const SettingsIcon = drawn(HAND.cog, "0 0 24 24", 22, false, STROKE);

// ----- the call
export const MicrophoneIcon = drawn(HAND.mic, "0 0 24 24", 24, false, STROKE);
export const MicrophoneOffIcon = drawn(HAND.micOff, "0 0 24 24", 24, false, STROKE);
/** Back to the whole app, from the desktop app's call controls card. */
export const OpenAppIcon = drawn(HAND.external, "0 0 24 24", 16, false, STROKE);
/** A link that opens somewhere else, in a new tab. */
export const ExternalLinkIcon = drawn(HAND.external, "0 0 24 24", 14, false, STROKE);
/** Connecting something (a provider's key), and taking it back. */
export const LinkIcon = mark(Link, 16);
export const UnlinkIcon = mark(Unlink, 16);
/** Showing what a secret field holds, and hiding it again. */
export const EyeIcon = mark(Eye, 16);
export const EyeOffIcon = mark(EyeOff, 16);
/** Playing something to hear, and stopping it. */
export const PlayIcon = drawn(HAND.play, "0 0 24 24", 16, false, STROKE);
export const StopIcon = drawn(HAND.stop, "0 0 24 24", 14, false, STROKE);
/** Back a step. */
export const BackIcon = mark(ChevronLeft, 16);
/** Into a page of its own, at a row's end (a phone's Settings): turned for a right-to-left page where it is drawn. */
export const OpenPageIcon = mark(ChevronRight, 16);
/** Searching a list. */
export const SearchIcon = mark(Search, 16);
export const SpeakerIcon = drawn(HAND.speaker, "0 0 24 24", 20, false, STROKE);
/** An agent at work, wherever a state is shown as an icon: three dots (the operator's choice, 2026-11-05: not a cog, not an
 *  hourglass): the transcript's Working row, the floating card's state line (StateGlyph). The conversations' cards say it by
 *  their blinking dot. */
export const WorkingIcon = drawn(HAND.dots, "0 0 24 24", 16, false, STROKE);
/** Can't receive (reach holding: the agent is there and cannot take what is said): a tray with a slash through it, the slash
 *  cut out of the tray (decided 2026-11-05, replacing the pause). The live-activity design's `traySlash`: the tray's outline at
 *  stroke 2, the slash 2.2. */
export const CantReceiveIcon = struck('<path d="M3 13.5h4.3l1.3 2.5h4.8l1.3-2.5H21M5.6 5.5h12.8L21 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-5z"/>',
  "M3.5 2.5l17 17", 16, 2, 5, 2.2);
/** Transcribing: the voice mark's bars, the voice going in. */
export const VoiceBarsIcon = drawn(HAND.bars, "0 0 24 24", 14, false, STROKE);
/** Offline: a circle struck through. */
export const OfflineIcon = drawn(HAND.offline, "0 0 24 24", 16, false, STROKE);

/** What an agent is doing, or cannot do, as an icon (the decided state icons): the microphone while it
 *  listens, the voice mark's bars while it transcribes, a speaker while it speaks, three dots while it works, a struck microphone
 *  while the person is muted, a struck tray while it cannot receive, a struck circle while it is offline. Its colour is the
 *  state's, the only one it wears (ui.css `.state-glyph`: the `--sv-state-*` tokens): the words beside it are never tinted. */
export type StateGlyphKind = "listening" | "transcribing" | "speaking" | "working" | "muted" | "holding" | "offline";
export function StateGlyph({ kind, size, className }: { kind: StateGlyphKind; size?: number; className?: string }) {
  const classes = "state-glyph state-glyph-" + kind + (className ? " " + className : "");
  switch (kind) {
    case "listening": return <MicrophoneIcon className={classes} size={size ?? 16} />;
    case "transcribing": return <VoiceBarsIcon className={classes} size={size ?? 16} />;
    case "speaking": return <SpeakerIcon className={classes} size={size ?? 16} />;
    case "working": return <WorkingIcon className={classes} size={size ?? 16} />;
    case "muted": return <MicrophoneOffIcon className={classes} size={size ?? 16} />;
    case "holding": return <CantReceiveIcon className={classes} size={size ?? 16} />;
    case "offline": return <OfflineIcon className={classes} size={size ?? 16} />;
  }
}
export const CallIcon = drawn(HAND.phone, "0 0 24 24", 22, false, STROKE);
export const HangupIcon = drawn(HAND.hangup, "0 0 24 24", 22, false, STROKE);
export const SkipIcon = drawn(HAND.skip, "0 0 24 24", 22, false, STROKE);
export const DownloadsIcon = mark(Download, 18);
export const ListenAgainIcon = drawn(HAND.play, "0 0 24 24", 14, false, STROKE);
export const PauseIcon = drawn(HAND.pause, "0 0 24 24", 16, false, STROKE);
/** A try's recording, played and paused (TryTake). */
export const PlayRecordingIcon = drawn(HAND.play, "0 0 24 24", 16, false, STROKE);
export const PauseRecordingIcon = drawn(HAND.pause, "0 0 24 24", 16, false, STROKE);
export const KeyboardIcon = mark(Keyboard, 20);
/** What is said, shown on the stage as it is said: on, or turned off. */
export const CaptionsIcon = drawn(HAND.captions, "0 0 24 24", 22, false, STROKE);
export const CaptionsOffIcon = struck(HAND.captions, "M4 3.8l16.4 16.4", 22, STROKE, 5.4);
/** Sends what was written: the paper plane of the transcript's composer in the frozen design reference (reference/2026-11-04,
 *  src/creator.js: its `send` mark, `M4 12l16-8-6 16-2.5-6.5z`), filled, its corners softened by a round-joined hairline of the
 *  room's line. */
export function SendIcon({ className, size = 18 }: IconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>;
}

// ----- a message's delivery, drawn like the play mark beside it so both sit on the time's line at one size
export const SentIcon = mark(Check, 12);
export const ReadIcon = mark(CheckCheck, 12);
export const PendingIcon = mark(Clock3, 12);
export const UncertainIcon = drawn(HAND.alert, "0 0 24 24", 12, false, STROKE);

// ----- what answers, when a row names it
// One object each, in one stroke: what you say going in is the microphone, the voice coming out its waveform, a model a
// box you download — the same drawing wherever the meaning shows.
export const ModelsIcon = mark(Box, 16);
export const ListensIcon = drawn(HAND.mic, "0 0 24 24", 12, false, STROKE);
export const SpeaksIcon = mark(AudioWaveform, 12);

// ----- the settings, one mark per section
export const GeneralIcon = mark(SlidersHorizontal, 16);
export const VoicesIcon = mark(AudioWaveform, 16);
export const TranscriptionIcon = drawn(HAND.mic, "0 0 24 24", 16, false, STROKE);
/** When the person's turn ends: the smart end of turn's model. */
export const EndOfTurnIcon = mark(Timer, 16);
/** On into what comes next: the setup's last button. */
export const ArrowRightIcon = mark(ArrowRight, 18);
/** Leaving a page for where it was opened from (Settings back to the room). */
export const ArrowLeftIcon = mark(ArrowLeft, 20);
/** Something of Sidevoice's own has a newer version: the app, the page, a machine's service. Not a model's download. */
export const UpdateIcon = mark(RefreshCcwDot, 18);
/** The call's own behaviour: your turn, the sound while the agent works, the screen. */
export const CallSettingsIcon = drawn(HAND.phone, "0 0 24 24", 16, false, STROKE);
/** The desktop app's floating call card, over the other apps. */
export const FloatingCardIcon = mark(PictureInPicture2, 16);
/** The keys for the microphone: the desktop app's global one, and those the room answers while it is in front. */
export const ShortcutsIcon = mark(Keyboard, 16);
/** What this device lets Sidevoice use (Settings › Permissions). */
export const PermissionsIcon = mark(ShieldCheck, 16);
export const IntegrationsIcon = mark(KeyRound, 16);
export const AdvancedIcon = mark(Wrench, 16);
/** Developer options (Settings, in a nightly with developer mode on). */
export const DeveloperIcon = mark(Terminal, 16);

// ----- a state, said beside its words
export const CheckIcon = mark(Check, 18);
export const WarningIcon = drawn(HAND.alert, "0 0 24 24", 18, false, STROKE);
export const AddIcon = mark(Plus, 18);
export const InfoIcon = drawn(HAND.info, "0 0 24 24", 18, false, STROKE);
/** Something new under it (VARIANTS `new-mark` A): a filled sparkle, as a star is never a state anywhere in the room.
 *  The outline in the ground behind it is the stylesheet's. */
export function NewSparkleIcon({ className, size = 12 }: IconProps) {
  return <Sparkle className={className} size={size} strokeWidth={STROKE} fill="currentColor" aria-hidden />;
}

/* The transcript's own marks (features/conversation), drawn as the creature redesign's frozen reference draws them
 * (research creature-void-design-2026-11-01, reference/2026-11-04: creator.js ICON, micSvg, the transcript's markup;
 * T38, T42, T49, T57, T59): the transcript is built to it pixel for pixel, so these are its drawings, not the set's.
 * The rest of the room's marks follow that line (`HAND`, above): the state icons and those in view during a call are drawn here;
 * the others (settings sections, machines, the model list) are lucide's, at the room's stroke, until their own pass. */
type DrawnProps = IconProps & { stroke?: number };
function drawn(paths: string, viewBox: string, fallbackSize: number | [number, number], fill = false, fallbackStroke = 2) {
  return function Drawn({ className, size, stroke = fallbackStroke }: DrawnProps) {
    const [w, h] = typeof fallbackSize === "number" ? [size ?? fallbackSize, size ?? fallbackSize] : size ? [size, size * fallbackSize[1] / fallbackSize[0]] : fallbackSize;
    return <svg className={className} width={w} height={h} viewBox={viewBox} fill={fill ? "currentColor" : "none"} stroke={fill ? undefined : "currentColor"}
      strokeWidth={fill ? undefined : stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths }} />;
  };
}
/** A drawing with a slash through it, the slash cut out of whatever it crosses (a mask, so it stays legible on any ground): a
 *  caption box turned off, the tray that cannot receive. `stroke`: the drawing's line; `cut`: the width of the gap round the slash
 *  (its own line and a margin each side); `slashStroke`: the slash's line. */
function struck(paths: string, slash: string, fallbackSize: number, stroke = STROKE, cut = 5, slashStroke = stroke) {
  return function Struck({ className, size = fallbackSize }: IconProps) {
    const mask = "struck-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
    return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <mask id={mask}><rect width="24" height="24" fill="#fff" /><path d={slash} stroke="#000" strokeWidth={cut} /></mask>
      <g mask={`url(#${mask})`} dangerouslySetInnerHTML={{ __html: paths }} />
      <path d={slash} strokeWidth={slashStroke} />
    </svg>;
  };
}
/** The transcript, by its three lines (its head, T59: the stage's transcript button's, the empty transcript's). */
export const TranscriptLinesIcon = drawn('<path d="M4 6h16M4 12h16M4 18h10"/>', "0 0 24 24", 16, false, 2.2);
/** Puts the transcript away (its head's ×). */
export const TranscriptCloseIcon = drawn('<path d="M6 6l12 12M18 6L6 18"/>', "0 0 24 24", 15, false, 2.4);
/** Plays a reply again, inside its message (T42). */
export const ReplayIcon = drawn('<path d="M7 5v14l11-7z"/>', "0 0 24 24", 12, true);
/** A message the agent has read: the two ticks; one, delivered. */
export const ReadTicksIcon = drawn('<path d="M2 11l5 5L18 4M13 15l1 1L26 4"/>', "0 0 30 20", [15, 10], false, 3);
export const SentTickIcon = drawn('<path d="M2 11l5 5L18 4"/>', "0 0 30 20", [15, 10], false, 3);
/** A reply that never played (T49): a circle struck through. */
export const NotPlayedIcon = drawn('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', "0 0 24 24", 15, false, 2.2);
/** Opens and closes what is folded: the arrow the not-played mark turns into. */
export const UnfoldIcon = drawn('<path d="M9 5.5l6.5 6.5L9 18.5"/>', "0 0 24 24", 15, false, 2.4);
/** Back to the latest message (T38). */
export const ToLatestArrowIcon = drawn('<path d="M12 5v13M6 12l6 6 6-6"/>', "0 0 24 24", 16, false, 2.6);
/** The person's open turn: the microphone, and the × that takes the turn back. */
export const TurnMicIcon = drawn('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', "0 0 24 24", 13, false, 2.4);
export const TurnCancelIcon = drawn('<path d="M6 6l12 12M18 6L6 18"/>', "0 0 24 24", 11, false, 3);

/** The cartoon burst with its "!" that says a conversation needs the person (the state-colours demo's `BANG`): a yellow burst in a dark ink
 *  outline, a little tilted, on the corner of the creature's square. Its colours are its own, not the theme's: it reads on any card. */
export function AttentionBurstIcon({ className, size = 30 }: IconProps) {
  return <svg className={className} viewBox="0 0 30 30" width={size} height={size} aria-hidden="true">
    <path d="M15 1.5l3.4 5.2 6-1.7-1.2 6.1 5.3 3.4-5.3 3.4 1.2 6.1-6-1.7L15 27.5l-3.4-5.2-6 1.7 1.2-6.1-5.3-3.4 5.3-3.4-1.2-6.1 6 1.7z" fill="#ffcf4a" stroke="#2a1a40" strokeWidth="2" strokeLinejoin="round" />
    <path d="M13.4 8.6h3.2l-.7 8h-1.8z" fill="#2a1a40" stroke="#2a1a40" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="15" cy="20.4" r="1.9" fill="#2a1a40" />
  </svg>;
}

/* Drawn here, because they are somebody's mark and not a generic icon. */
export function AppleIcon({ className, size = 12 }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.7ZM14.1 5.9c.6-.8 1.1-1.9.9-3-.9.1-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3Z" /></svg>;
}

export function LinuxIcon({ className, size = 12 }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-2.5 0-4 2-4 4.5 0 1.5-.5 2.5-1.5 4S5 14.5 5 16.5c0 2.5 2 3.5 3.5 3.5S11 19 12 19s2 1 3.5 1S19 19 19 16.5c0-2-.5-3-1.5-5S16 9 16 7.5C16 5 14.5 3 12 3Z" /><path d="M10 8.5h.01M14 8.5h.01M11 11h2l-1 1.5-1-1.5Z" /></svg>;
}

export function WindowsIcon({ className, size = 12 }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d="M3 5.5 11 4.4v7.1H3V5.5Zm0 13 8 1.1v-7H3v5.9ZM12 4.2 21 3v8.5h-9V4.2Zm0 15.6 9 1.2v-8.5h-9v7.3Z" /></svg>;
}

/** Another product's mark as its brand kit draws it, unaltered: in the text's colour where the kit allows one colour,
 *  in its own where it does not (Claude's). Hidden from assistive tech: its name is always said beside it. */
/** `scale` evens out the marks whose kit drawing keeps its clear space inside it: drawn that much larger, the space
 *  spills out of the box, and the marks sit at one size beside each other. */
function logo(source: string, scale = 1) {
  const inset = ((scale - 1) / 2) * -100;
  const svg = source.replace("<svg ", `<svg width="${scale * 100}%" height="${scale * 100}%" style="margin:${inset}%" `);
  return function Logo({ className, size = 12 }: IconProps) {
    return <span className={className ? "ui-logo " + className : "ui-logo"} style={{ display: "inline-block", flex: "none", width: size, height: size, lineHeight: 0 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
  };
}

export const ClaudeIcon = logo(claudeLogo);
/** Codex has no mark of its own for integrations: it wears OpenAI's. */
export const CodexIcon = logo(codexLogo, 1.6);
export const CursorIcon = logo(cursorLogo);
export const OpenAILogo = logo(openAiLogo, 1.6);
export const ElevenLabsLogo = logo(elevenLabsLogo, 2);
/** Any coding agent we do not recognise: it reaches Sidevoice over the Model Context Protocol, whose mark it wears. */
export const McpLogo = logo(mcpLogo);

/** A provider's mark by its catalogue id; none for a provider without one here. */
export function ProviderLogo({ provider, size = 20 }: { provider: string; size?: number }) {
  if (provider === "openai") return <OpenAILogo size={size} />;
  if (provider === "elevenlabs") return <ElevenLabsLogo size={size} />;
  return null;
}

/** The brand mark (from the Sidevoice brand kit): four bars in the text colour, and the fourth, the
 *  other voice, always in mustard. */
export function SidevoiceMark({ className, size = 22 }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><rect x="1.5" y="9" width="3" height="6" rx="1.5" /><rect x="6" y="6" width="3" height="12" rx="1.5" /><rect x="10.5" y="1.5" width="3" height="21" rx="1.5" /><rect x="15" y="6" width="3" height="12" rx="1.5" style={{ fill: "var(--sv-voice)" }} /><rect x="19.5" y="9" width="3" height="6" rx="1.5" /></svg>;
}

/** The logo for what a machine said it runs, from the first word of its platform line; a machine we
 *  cannot place gets the plain machine. */
export function PlatformIcon({ platform, size = 12 }: { platform: string; size?: number }) {
  const name = platform.toLowerCase();
  if (name.startsWith("macos") || name.startsWith("darwin") || name.startsWith("ios")) return <AppleIcon size={size} />;
  if (name.startsWith("windows") || name.startsWith("win32")) return <WindowsIcon size={size} />;
  if (name.startsWith("linux")) return <LinuxIcon size={size} />;
  return <MachinesIcon size={size} />;
}

/** A harness as its own mark, never its name in words: the ones we recognise by theirs, any other by MCP's. The
 *  harness says who it is as it likes ("claude", "claude-code"); what follows the product's name does not matter. */
export function HarnessIcon({ harness, size = 12 }: { harness: string; size?: number }) {
  const id = harness.toLowerCase();
  if (id === "claude" || id.startsWith("claude-")) return <ClaudeIcon size={size} />;
  if (id === "codex" || id.startsWith("codex-")) return <CodexIcon size={size} />;
  if (id === "cursor" || id.startsWith("cursor-")) return <CursorIcon size={size} />;
  return <McpLogo size={size} />;
}
