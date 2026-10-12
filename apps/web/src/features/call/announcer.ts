import type { RoomStore, RoomViewState } from "../../state/room-store";
import type { CallTranslate } from "./call-i18n";
import { voiceNote, voiceNoteText } from "./voice-view";

/* What call model B says out loud through its one polite region (briefs/CALL-MODEL-B-SPEC.md §4), and nothing else:
 * a conversation other than the active one now waiting for you — gathered over a few seconds, held while the person
 * speaks or a reply plays and said in the next gap, once per mark —, the voice turning itself off (the reasons whose
 * note is a status: an alert says itself), the idle warning, the agents muted by a lost speaker, and a "Hear it" with
 * no answer. The person's own presses are read by their controls; the badge, working, selection, unread counts and
 * the active conversation's marks are not announced. */

/** How long new "waiting for you" marks are gathered into one announcement. */
export const WAITING_COALESCE_MS = 5000;

export interface AnnouncerTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

/** Follows `store`, handing `say` each announcement's words; returns what stops it. */
export function watchAnnouncements(store: RoomStore, say: (text: string) => void, t: CallTranslate,
  timers: AnnouncerTimers = { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (timer) => globalThis.clearTimeout(timer as number) }) {
  const announced = new Set<string>();
  const waiting = new Map<string, string>();
  let gathering: unknown = null;
  let held = false;

  const busy = (state: RoomViewState) => !!(state.facts.userLive || state.facts.botLive);
  const sayWaiting = () => {
    gathering = null;
    if (busy(store.getState())) { held = true; return; }
    held = false;
    if (!waiting.size) return;
    const titles = [...waiting.values()];
    waiting.clear();
    say(titles.length === 1 ? t("announce.waiting.one", { title: titles[0] }) : t("announce.waiting.other", { n: titles.length }));
  };

  const stop = store.subscribe((state, previous) => {
    const now = state.facts, before = previous.facts;
    // A conversation other than the active one becomes "waiting for you": once per mark (its oldest unheard reply).
    const active = state.session.viewed;
    for (const row of state.participants) {
      if (row.mark !== "waiting-for-you" || row.threadId === active) continue;
      if (previous.participants.find((old) => old.threadId === row.threadId)?.mark === "waiting-for-you") continue;
      const mark = row.threadId + " " + (row.unheard?.since ?? "");
      if (announced.has(mark)) continue;
      announced.add(mark);
      waiting.set(row.threadId, row.title);
      gathering ??= timers.setTimeout(sayWaiting, WAITING_COALESCE_MS);
    }
    if (held && !busy(state)) sayWaiting();

    const note = voiceNote(now);
    if (note && note.kind !== "idle-warning" && note.role === "status" && now.voiceOffReason !== before.voiceOffReason) say(voiceNoteText(note.kind, now.voiceOffDetail, t));
    if (now.voiceIdleWarning && !before.voiceIdleWarning) say(t("voice.idle.warning"));
    if (now.agentsMuted && now.agentsMutedBy === "output-lost" && before.agentsMutedBy !== "output-lost") say(t("agents.outputLost"));
    if (now.hearing?.state === "no-answer" && before.hearing?.state !== "no-answer") {
      say(t("hear.noAnswer", { title: state.participants.find((row) => row.threadId === now.hearing?.thread)?.title ?? "" }));
    }
  });
  return () => { stop(); if (gathering) timers.clearTimeout(gathering); };
}
