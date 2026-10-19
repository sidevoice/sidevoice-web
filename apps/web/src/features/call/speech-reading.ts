import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { readingMoves, readingPosition, readOn, type Reading } from "./speech-chunks";

/* Where the voice is in a reply, and what the person's spoken turn sent, on the clocks the stage's bubbles (CallStage)
 * read them by. */

/** How far into `reply` the voice is (speech-chunks.ts `readOn`): the part sounding now, its words moving on at a
 *  speaking pace within it, or that pace from the start while the voice gives no cue yet. A reply that has finished,
 *  or left the list, is read from the start if it sounds again (listening again). */
export function useSpokenTo(reply: ChatMessage | null, sounding: boolean, messages: ChatMessage[]): number | null {
  const reading = useRef<Reading | null>(null);
  const kept = reading.current && messages.some((message) => message.segment === reading.current!.segment && message.playback !== "complete") ? reading.current : null;
  reading.current = readOn(kept, reply?.segment ?? null, sounding, reply?.karaoke ?? null, Date.now());
  const ticking = !!reply && !!reading.current && readingMoves(reading.current);
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [ticking]);
  return reply && reading.current?.segment === reply.segment ? readingPosition(reading.current) : null;
}

/** How long what was sent takes to leave (call-view.css). */
export const SENT_LEAVING_MS = 500;

export interface SentTurn { text: string; key: string }

/** The person's spoken turns just sent, oldest first, each until `done(key)`: what shows one owns its own clock
 *  (SentBubble), so a turn sent after it never cuts or restarts it. Only a turn spoken here is shown as sent, never a
 *  message typed. */
export function useSentTurns(conversation: ConversationView): { turns: SentTurn[]; done: (key: string) => void } {
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const lastUser = [...conversation.messages].reverse().find((message) => message.role === "user") ?? null;
  const lastKey = lastUser ? lastUser.segment ?? String(lastUser.time) : null;
  const [turns, setTurns] = useState<SentTurn[]>([]);
  const spoke = useRef(false);
  const seen = useRef(lastKey);
  if (pending) spoke.current = true;
  useEffect(() => {
    if (lastKey === seen.current) return;
    seen.current = lastKey;
    if (!spoke.current || !lastUser?.text.trim()) return;
    spoke.current = false;
    setTurns((now) => [...now, { text: lastUser.text, key: lastKey! }]);
  }, [lastKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useCallback((key: string) => setTurns((now) => now.filter((turn) => turn.key !== key)), []);
  return { turns, done };
}

/** A reply on the stage: its text, how far the voice is into it, and whether it is leaving. */
export interface AgentTurn { key: string; text: string; spoken: number; leaving: boolean }
/** How long a reply stays once its last words are said, before it leaves. */
export const AGENT_LINGER_MS = 3000;

/** The replies the stage shows: the one sounding (`reply`, `spokenTo` into it); the one just finished, whole, for
 *  AGENT_LINGER_MS; and any leaving, for SENT_LEAVING_MS. A new reply sends the one before away at once. */
export function useAgentTurns(reply: ChatMessage | null, spokenTo: number | null): AgentTurn[] {
  const current = reply && spokenTo !== null ? { key: reply.segment ?? String(reply.time), text: reply.text, spoken: spokenTo } : null;
  const last = useRef<{ key: string; text: string } | null>(null);
  const [linger, setLinger] = useState<{ key: string; text: string } | null>(null);
  const [leaving, setLeaving] = useState<{ key: string; text: string }[]>([]);
  // Each reply leaving, by its key, until it has: its clock, stopped if it sounds again or the stage goes.
  const clocks = useRef(new Map<string, number>());
  const away = useCallback((turn: { key: string; text: string }) => {
    if (clocks.current.has(turn.key)) return;
    setLeaving((now) => [...now.filter((item) => item.key !== turn.key), turn]);
    clocks.current.set(turn.key, window.setTimeout(() => {
      clocks.current.delete(turn.key);
      setLeaving((now) => now.filter((item) => item.key !== turn.key));
    }, SENT_LEAVING_MS));
  }, []);
  const back = useCallback((key: string) => {
    const clock = clocks.current.get(key);
    if (clock === undefined) return;
    window.clearTimeout(clock);
    clocks.current.delete(key);
    setLeaving((now) => now.filter((item) => item.key !== key));
  }, []);
  useEffect(() => () => {
    for (const clock of clocks.current.values()) window.clearTimeout(clock);
    clocks.current.clear();
  }, []);
  const key = current?.key ?? null;
  useEffect(() => {
    const before = last.current;
    if (before && before.key !== key) {
      // A new reply over it: away at once. Its end: it stays a moment, whole.
      if (key) away(before); else setLinger(before);
    }
    if (key) {
      // Sounding (again, after a pause or heard again): the one sounding, at once; one lingering before it goes.
      back(key);
      if (linger && linger.key !== key) away(linger);
      setLinger(null);
    }
    last.current = current ? { key: current.key, text: current.text } : null;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // The same reply, grown: what it leaves with is all of it. A new one is the effect's to take over.
  if (current && last.current?.key === current.key) last.current = { key: current.key, text: current.text };
  useEffect(() => {
    if (!linger) return;
    const next = window.setTimeout(() => { away(linger); setLinger(null); }, AGENT_LINGER_MS);
    return () => window.clearTimeout(next);
  }, [linger, away]);
  // The one sounding is shown as it sounds, over the same reply lingering or leaving until the effect lets them go.
  const turns: AgentTurn[] = leaving.filter((turn) => turn.key !== key).map((turn) => ({ ...turn, spoken: turn.text.length, leaving: true }));
  if (linger && linger.key !== key && !leaving.some((turn) => turn.key === linger.key)) turns.push({ ...linger, spoken: linger.text.length, leaving: false });
  // Its last words just said, before the effect has it linger: the same balloon stays, whole, never gone for a frame
  // and popping in again.
  else if (!current && last.current && !linger && !leaving.some((turn) => turn.key === last.current!.key)) turns.push({ ...last.current, spoken: last.current.text.length, leaving: false });
  if (current) turns.push({ ...current, leaving: false });
  return turns;
}
