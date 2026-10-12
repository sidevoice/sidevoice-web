import { selectedThread, type SessionFacts } from "../../state/room-session-state.js";
import type { ParticipantView } from "../../state/room-types";
import type { ConversationMessageKey } from "./messages/en";

/* What the box says while it is empty, with the voice switch (call model B, briefs/CALL-MODEL-B-SPEC.md §2.11): it
 * writes whenever the active conversation can receive and the session is on it, voice or not; otherwise it says why
 * not. Derived from the facts and the rows, nothing else. */
export function composerPlaceholder(facts: SessionFacts, rows: ParticipantView[]): { key: ConversationMessageKey; title: string } {
  const active = facts.viewedThread || selectedThread(facts);
  if (!active) return { key: "composer.noConversation", title: "" };
  const titleOf = (key: string | null) => rows.find((row) => row.threadId === key)?.title ?? "";
  if (facts.movingTo) return { key: "composer.switching", title: titleOf(facts.movingTo) };
  const row = rows.find((candidate) => candidate.threadId === active);
  // It receives while it listens, on a machine this device reaches (the room's row says both).
  if (!row || !row.available || row.reach !== "listening") return { key: "composer.cantReceive", title: titleOf(active) };
  return { key: "transcript.placeholder", title: titleOf(active) };
}
