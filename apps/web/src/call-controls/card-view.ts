/* The floating card's options (VARIANTS `floating-card`, briefs/FLOATING-CARD-SPEC.md): what they show, from the host's
 * state alone, in one pure place — when the card shows, its state and its overlays, its controls' names and states, and
 * the strip's order. The options (FloatingCard.tsx) only lay it out. No clock, no DOM. */
import type { AvatarMood } from "../features/avatar/avatar-spec";
import { canHear, conversationState, smallAvatarMood, voiceSwitchAvatarMood, voiceSwitchState } from "../features/call/conversation-state";
import { IDLE_MINUTES } from "../features/call/voice-view";
import type { ParticipantView } from "../state/room-types";
import type { CallSnapshot } from "./host";
import type { Translate } from "./i18n";
import type { MessageKey } from "./messages/en";

/** The variant's values: today's card (the default until the operator chooses: the desktop app has no panel, so it
 *  ships it), then the spec's options 1–4. */
export const FLOATING_CARD = ["today", "pip", "caption", "strip", "pill"] as const;
export type FloatingCard = (typeof FLOATING_CARD)[number];

/** Call model B, the voice switch, as the snapshot says it (FC2): never guessed from what the snapshot carries. */
export const isVoiceSwitch = (call: Pick<CallSnapshot, "callModel">) => call.callModel === "voice-switch";

/** When the card shows (§2.1): the first setup finished with its wizard closed (FC1), and the call (A) or the voice
 *  (B: once it is on, not while it turns on) on. Whether the room's window is in front is its host's to say. */
export function gateOpen(call: CallSnapshot): boolean {
  return !!call.setupDone && (isVoiceSwitch(call) ? !!call.voiceOn : !!call.joined);
}

/** O6's words: why the call (A) or the voice (B) went off by itself; null when the person turned it off. B's
 *  `micUnavailable` only happens while voice turns on, when there is no card. */
export function exitText(call: CallSnapshot, t: Translate): string | null {
  if (isVoiceSwitch(call)) {
    const reason = call.voiceOffReason;
    if (!reason || reason === "micUnavailable") return null;
    return t(`card.ended.voice.${reason}` as MessageKey, { minutes: IDLE_MINUTES, detail: call.voiceOffDetail });
  }
  const ended = call.ended;
  if (!ended) return null;
  return t(`card.ended.call.${ended.reason}` as MessageKey, { minutes: IDLE_MINUTES, title: ended.detail, detail: ended.detail });
}

/** The card's states (§2.2), in priority order: the first that applies. */
export type CardStateId = "S0" | "S3" | "S1" | "S2" | "S4" | "S5" | "S6" | "S8" | "S7" | "S9";

export interface CardView {
  state: CardStateId;
  /** The conversation the card names (A: the call's; B: the active one), when listed. */
  row: ParticipantView | null;
  /** What its avatar acts out (FC4); null with no conversation (S0: the brand mark instead). */
  mood: AvatarMood | null;
  /** The state's words alone ("Speaking"); for S0 and S3 the whole line. */
  stateWords: string;
  /** The line the card says: "{title} · {state}", or S0's and S3's whole line. */
  line: string;
  /** S0 and S3 say a whole line, with no title before it. */
  whole: boolean;
  /** S8: the active conversation's mark. */
  mark: ParticipantView["mark"];
}

export function cardView(call: CallSnapshot, t: Translate): CardView {
  const row = call.conversation ? call.participants.find((candidate) => candidate.threadId === call.conversation) ?? null : null;
  const title = call.title || row?.title || "";
  const whole = (state: CardStateId, words: string, mood: AvatarMood | null): CardView =>
    ({ state, row, mood, stateWords: words, line: words, whole: true, mark: null });
  const titled = (state: CardStateId, key: MessageKey, mark: ParticipantView["mark"] = null): CardView => {
    const words = t(key);
    return { state, row, mood: call.mood, stateWords: words, line: t("card.titleState", { title, state: words }), whole: false, mark };
  };
  if (isVoiceSwitch(call) && !call.conversation) return whole("S0", t("card.state.noConversation"), null);
  if (call.busyReason === "reconnecting") return whole("S3", t("card.reconnecting"), call.mood);
  if (call.busyReason === "switching") return whole("S3", t("card.state.switching", { title: call.switchingTo || title }), call.mood);
  if (row?.reach === "offline" || call.mood === "offline") return titled("S1", "card.state.offline");
  if (row?.reach === "holding") return titled("S2", "card.state.cantReceive");
  if (call.mood === "speaking") return titled("S4", "card.state.speaking");
  if (call.turn === "transcribing") return titled("S6", "card.state.listening");
  if (call.turn === "listening" || call.mood === "listening") return titled("S5", "card.state.listening");
  // The mark is hidden by the room while the person's turn is open or the agent speaks (D9): those came first.
  if (isVoiceSwitch(call) && row?.mark) return titled("S8", row.mark === "waiting-for-you" ? "card.state.waitingForYou" : "card.state.wantsToTalk", row.mark);
  if (call.mood === "working") return titled("S7", "card.state.working");
  return titled("S9", "card.state.ready");
}

/** O4: other conversations that want the person — B, those with a mark (an amber hand and their count); else what is
 *  unread elsewhere (a dot). Its words go into the conversation button's description. */
export interface Elsewhere { kind: "hand" | "dot"; count: number; text: string }
export function elsewhere(call: CallSnapshot, t: Translate): Elsewhere | null {
  const others = call.participants.filter((row) => row.threadId !== call.conversation);
  const marked = isVoiceSwitch(call) ? others.filter((row) => row.mark && row.available).length : 0;
  if (marked) return { kind: "hand", count: marked, text: t(marked === 1 ? "card.elsewhere.one" : "card.elsewhere.other", { n: marked }) };
  const unread = others.reduce((n, row) => n + (row.unread || 0), 0);
  return unread ? { kind: "dot", count: unread, text: t("card.unread", { n: unread }) } : null;
}

/** The microphone (§2.3): A flips its name as A's bar does, and is disabled as today; B keeps one name, and when it
 *  cannot be used it stays focusable, aria-disabled, saying why (FC10). Pressed while muted, in both. */
export interface MicControl { name: string; title: string; pressed: boolean; disabled: boolean; reason: string | null }
export function micControl(call: CallSnapshot, shortcut: string, t: Translate): MicControl {
  const pressed = !call.micEnabled;
  const name = isVoiceSwitch(call) ? t("card.muteMic") : pressed ? t("card.unmute") : t("card.mute");
  const reason = !isVoiceSwitch(call) || !call.micReason ? null
    : call.micReason === "noConversation" ? t("card.mic.noConversation")
      : call.micReason === "cantHear" ? t("card.mic.cantHear", { title: call.title })
        : t("card.mic.connecting", { title: call.switchingTo || call.title });
  const title = reason ?? (shortcut ? t("card.shortcut", { action: name, shortcut }) : name);
  return { name, title, pressed, disabled: !isVoiceSwitch(call) && call.micDisabled, reason };
}

/** "Hear it" on the card (B, FC9): for the active conversation only, while it has a mark and can hear; while it asks,
 *  busy; with no answer in time, a notice that it did not answer by voice. */
export interface HearItView { state: "mark" | "asking" | "no-answer"; visible: string; name: string }
export function hearIt(call: CallSnapshot, row: ParticipantView | null, t: Translate): HearItView | null {
  if (!isVoiceSwitch(call) || !row) return null;
  if (row.hearing === "no-answer") return { state: "no-answer", visible: t("card.hearNoAnswer"), name: t("card.hearNoAnswer") };
  if (row.hearing === "asking") return { state: "asking", visible: t("card.hearAsking"), name: t("card.hearAskingNamed", { title: row.title }) };
  if (!row.mark || !canHear(row)) return null;
  return { state: "mark", visible: t("card.hearIt"), name: call.agentsMuted ? t("card.hearItUnmute") : t("card.hearIt") };
}

/** O5's sentence and its Keep, in the call model's words (FC6). */
export function idleWarning(call: CallSnapshot, t: Translate): { text: string; keep: string } | null {
  if (!call.idleWarning) return null;
  return isVoiceSwitch(call) ? { text: t("card.idle.warningVoice"), keep: t("card.idle.keepVoice") }
    : { text: t("card.idle.warningCall"), keep: t("card.idle.keepCall") };
}

/** A conversation of the strip (option 3) or the picker, as the card says it: its small avatar's mood, its dot's
 *  state, and "{title} · {state}" — the room's own derivation over the snapshot's rows (conversation-state.ts). */
export interface RowView { mood: AvatarMood; dot: string; name: string; marked: boolean; disabled: boolean; reason: string | null }
export function rowView(call: CallSnapshot, row: ParticipantView, t: Translate): RowView {
  const voice = isVoiceSwitch(call);
  const dot = voice ? voiceSwitchState(row) : conversationState(row, call.joined);
  const key: MessageKey = dot === "idle" ? (row.reach === "holding" && row.available ? "card.state.cantReceive" : "card.state.offline")
    : dot === "waiting-for-you" ? "card.state.waitingForYou" : dot === "wants-to-talk" ? "card.state.wantsToTalk"
      : dot === "speaking" ? "card.state.speaking" : dot === "working" ? "card.state.working" : "card.state.ready";
  // A: the call can only go to one that hears; B: every row, except while switching (D5).
  const blocked = voice ? row.switching : !canHear(row);
  return {
    mood: voice ? voiceSwitchAvatarMood(row) : smallAvatarMood(row), dot, name: t("card.titleState", { title: row.title, state: t(key) }),
    marked: dot === "waiting-for-you" || dot === "wants-to-talk", disabled: blocked,
    reason: !voice && blocked ? t("card.mic.cantHear", { title: row.title }) : null,
  };
}

/** The strip's order (option 3): B — waiting for you, wants to talk, working, the rest, more unread first in each, then
 *  the room's order; A — unread, working, the rest. `kept`: the order shown while the pointer is over the card, which
 *  holds (new rows after it, gone ones out), so nothing moves under a click. */
export function stripOrder(call: CallSnapshot, kept: string[] | null = null): ParticipantView[] {
  const others = call.participants.filter((row) => row.threadId !== call.conversation);
  if (kept) {
    const byId = new Map(others.map((row) => [row.threadId, row]));
    return [...kept.filter((id) => byId.has(id)).map((id) => byId.get(id)!), ...others.filter((row) => !kept.includes(row.threadId))];
  }
  const voice = isVoiceSwitch(call);
  const rank = (row: ParticipantView) => voice
    ? row.mark === "waiting-for-you" ? 0 : row.mark === "wants-to-talk" ? 1 : row.agentWorking ? 2 : 3
    : row.unread ? 0 : row.working ? 1 : 2;
  return others.map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || (voice ? (b.row.unread || 0) - (a.row.unread || 0) : 0) || a.index - b.index)
    .map(({ row }) => row);
}
