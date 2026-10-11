/* Every mark the room uses, named for what it means here and not for what it is drawn like: a screen is
 * "the machine", a plug is "the connector". Somewhere else is where they are drawn — lucide-react, the
 * standard set for React — and this file is the only place that decides which of its drawings each thing
 * in Sidevoice wears. Swapping the set is a change to this file and to nothing else.
 *
 * The exceptions are below: a product's own mark and the logos of other people's products are not
 * generic icons and are drawn here. */
import {
  Download, Check, CheckCheck, ChevronDown, ChevronUp, CircleAlert, Clock3, Copy, ExternalLink, Keyboard, KeyRound,
  MessagesSquare, Mic, MicOff, Monitor, MoreHorizontal, MoreVertical, Plus, Info, PanelLeftClose,
  PanelLeftOpen, Phone, PhoneOff, Play, Plug, RefreshCw, Settings, SkipForward, SlidersHorizontal, Volume2, Wrench, X,
  Box, AudioWaveform, ArrowUp, ArrowRight,
  Timer, ScrollText,
} from "lucide-react";
import type { ComponentType } from "react";
// Other products' own marks, from their brand kits (assets/logos/README.md: where each comes from and its rules).
import claudeLogo from "../../assets/logos/claude.svg?raw";
import codexLogo from "../../assets/logos/codex.svg?raw";
import cursorLogo from "../../assets/logos/cursor.svg?raw";
import elevenLabsLogo from "../../assets/logos/elevenlabs.svg?raw";
import openAiLogo from "../../assets/logos/openai.svg?raw";
import mcpLogo from "../../assets/logos/mcp.svg?raw";

type IconProps = { className?: string; size?: number };
type LucideLike = ComponentType<{ className?: string; size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** One drawing, wearing the room's stroke and hidden from anything that reads the page aloud. */
function mark(Drawing: LucideLike, fallbackSize: number) {
  return function Mark({ className, size = fallbackSize }: IconProps) {
    return <Drawing className={className} size={size} strokeWidth={1.8} aria-hidden />;
  };
}

// ----- the room
export const ConversationsIcon = mark(MessagesSquare, 16);
export const MachinesIcon = mark(Monitor, 16);
export const ConnectorIcon = mark(Plug, 12);
export const ChevronIcon = mark(ChevronDown, 16);
/** Puts away what dropped from above: a phone's conversations panel. */
export const CloseUpIcon = mark(ChevronUp, 18);
export const SidebarCollapseIcon = mark(PanelLeftClose, 18);
export const SidebarExpandIcon = mark(PanelLeftOpen, 18);
export const MoreIcon = mark(MoreHorizontal, 18);
export const MoreVerticalIcon = mark(MoreVertical, 18);
export const CloseIcon = mark(X, 18);
export const CopyIcon = mark(Copy, 18);
export const RefreshIcon = mark(RefreshCw, 18);
export const SettingsIcon = mark(Settings, 22);

// ----- the call
export const MicrophoneIcon = mark(Mic, 24);
export const MicrophoneOffIcon = mark(MicOff, 24);
/** Back to the whole app, from the desktop app's call controls card. */
export const OpenAppIcon = mark(ExternalLink, 16);
/** A link that opens somewhere else, in a new tab. */
export const ExternalLinkIcon = mark(ExternalLink, 14);
export const SpeakerIcon = mark(Volume2, 20);
export const CallIcon = mark(Phone, 22);
export const HangupIcon = mark(PhoneOff, 22);
export const SkipIcon = mark(SkipForward, 22);
export const DownloadsIcon = mark(Download, 18);
export const ListenAgainIcon = mark(Play, 14);
export const KeyboardIcon = mark(Keyboard, 20);
/** The record of what was said: unlike the conversations' bubbles, a scroll of text. */
export const TranscriptIcon = mark(ScrollText, 22);
/** Sends what was written. */
export const SendIcon = mark(ArrowUp, 18);

// ----- a message's delivery, drawn like the play mark beside it so both sit on the time's line at one size
export const SentIcon = mark(Check, 12);
export const ReadIcon = mark(CheckCheck, 12);
export const PendingIcon = mark(Clock3, 12);
export const UncertainIcon = mark(CircleAlert, 12);

// ----- what answers, when a row names it
// One object each, in one stroke: what you say going in is the microphone, the voice coming out its waveform, a model a
// box you download — the same drawing wherever the meaning shows.
export const ModelsIcon = mark(Box, 16);
export const ListensIcon = mark(Mic, 12);
export const SpeaksIcon = mark(AudioWaveform, 12);

// ----- the settings, one mark per section
export const GeneralIcon = mark(SlidersHorizontal, 16);
export const VoicesIcon = mark(AudioWaveform, 16);
export const TranscriptionIcon = mark(Mic, 16);
/** When the person's turn ends: the smart end of turn's model. */
export const EndOfTurnIcon = mark(Timer, 16);
/** On into what comes next: the setup's last button. */
export const ArrowRightIcon = mark(ArrowRight, 18);
/** The call's own behaviour: your turn, the sound while the agent works, the screen. */
export const CallSettingsIcon = mark(Phone, 16);
export const IntegrationsIcon = mark(KeyRound, 16);
export const AdvancedIcon = mark(Wrench, 16);

// ----- a state, said beside its words
export const CheckIcon = mark(Check, 18);
export const WarningIcon = mark(CircleAlert, 18);
export const AddIcon = mark(Plus, 18);
export const InfoIcon = mark(Info, 18);

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
