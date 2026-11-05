import type { ChatMessage, ConversationView } from "../../state/room-types";
import type { Translate } from "../../i18n/translator";
import { uiLocale } from "../../i18n/locale";
import { GROUP_WINDOW_MS, groupMessages, type MessageGroupView } from "./group-messages";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today and yesterday by name, any other day by its date — with its year only when it is not this one. */
export function dayLabel(time: number, t: Translate, now = Date.now()) {
  const day = new Date(time).toDateString();
  if (day === new Date(now).toDateString()) return t("messages.today");
  if (day === new Date(now - DAY_MS).toDateString()) return t("messages.yesterday");
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString(uiLocale(), { weekday: "long", day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
}

/** What is still happening, at the foot of its side's run: the person's open turn (a pill until it is sent, or what they
 *  are saying when it is written out), and the conversation working on it. */
export type LiveRow =
  | { kind: "turn"; phase: "listening" | "transcribing"; cancellable: boolean }
  | { kind: "draft"; text: string; cancellable: boolean }
  | { kind: "working" };

/** A run of one side's messages, and what is still happening on that side at its foot. */
export interface RunView extends MessageGroupView {
  thread: string | null;
  live: LiveRow[];
}

/** The transcript's blocks, top to bottom: a day's name where a day starts, and its runs. `sig` is what a run draws, in
 *  a word: a block whose `sig` did not change is not drawn again (T40: no flicker, hovers hold, faces never blank). */
export type TranscriptBlock = { kind: "day"; key: string; label: string } | { kind: "run"; key: string; run: RunView; sig: string };

const messageSig = (m: ChatMessage) => [m.segment, m.role, m.name, m.thread, m.time, m.text, m.draft, m.cancellable, m.interrupted, m.globally_heard,
  m.replayable, m.delivery, m.hearing, m.heard_chars, m.playback, m.karaoke ? `${m.karaoke.from}-${m.karaoke.to}` : "", m.audioNote, m.deliveryNote].join("\u0001");
const runSig = (run: RunView, language: string) => [language, run.role, run.name, run.thread ?? "", ...run.messages.map(messageSig), JSON.stringify(run.live)].join("\u0002");

/** Whether something happening now joins the foot of `run` (its side's): as a message said now would (groupMessages). */
function joinsNow(run: RunView, now: number) {
  if (run.live.length) return true;
  const last = run.messages.at(-1);
  return !!last && !last.draft && new Date(last.time).toDateString() === new Date(now).toDateString() && now - last.time >= 0 && now - last.time <= GROUP_WINDOW_MS;
}

/** The conversation as the transcript draws it: its runs (groupMessages), each day's first headed by the day; then what
 *  is happening now, at the foot of its side's last run when it would join it, else in a run of its own. */
export function transcriptBlocks(conversation: ConversationView, messages: ChatMessage[], t: Translate, language: string, now = Date.now()): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  const runs: RunView[] = [];
  let lastDay: string | null = null;
  for (const group of groupMessages(messages)) {
    // A run never spans two days (groupMessages), so a day's first run is where its name goes.
    const day = new Date(group.messages[0].time).toDateString();
    if (day !== lastDay) blocks.push({ kind: "day", key: "day-" + day, label: dayLabel(group.messages[0].time, t, now) });
    lastDay = day;
    const run: RunView = { ...group, thread: group.messages[0]?.thread ?? null, live: [] };
    runs.push(run);
    blocks.push({ kind: "run", key: run.id, run, sig: "" });
  }
  const live: [ChatMessage["role"], LiveRow][] = [];
  if (conversation.pendingText) live.push(["user", { kind: "draft", text: conversation.pendingText, cancellable: conversation.pendingCancellable }]);
  else if (conversation.pendingPhase) live.push(["user", { kind: "turn", phase: conversation.pendingPhase === "transcribing" ? "transcribing" : "listening", cancellable: conversation.pendingCancellable }]);
  if (conversation.working) live.push(["assistant", { kind: "working" }]);
  for (const [role, row] of live) {
    const last = runs.at(-1);
    if (last && last.role === role && joinsNow(last, now)) { last.live.push(row); continue; }
    const today = new Date(now).toDateString();
    if (lastDay !== today) blocks.push({ kind: "day", key: "day-" + today, label: dayLabel(now, t, now) });
    lastDay = today;
    // The working row wears the face of the agent who last spoke here, like any run's foot.
    const agent = role === "assistant" ? [...messages].reverse().find((message) => message.role === "assistant") : undefined;
    const run: RunView = { id: "live-" + role, role, name: agent?.name ?? "", messages: [], thread: agent?.thread ?? messages.at(-1)?.thread ?? conversation.thread ?? null, live: [row] };
    runs.push(run);
    blocks.push({ kind: "run", key: run.id, run, sig: "" });
  }
  for (const block of blocks) if (block.kind === "run") block.sig = runSig(block.run, language);
  return blocks;
}
