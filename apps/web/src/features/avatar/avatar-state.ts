import { useId, useLayoutEffect, useSyncExternalStore } from "react";
import { playbackLevel, type PlaybackLevelSample } from "../../state/playback-level";
import { avatarKey, type AvatarMood, type AvatarSpec } from "./avatar-spec";
import { avatarRepertoire } from "./bicho-draw";
import { ENTER_MS, enterFrom } from "./engine/styles/bichos";
import { smoothPlaybackLevel } from "./playback-mouth";
import { rotationAt } from "./rotation";

/* An avatar's state is one thing, however many places draw it: what it acts out (its mood), what it has in hand (a
 * working style, an idle step), the entrance it is making, its unread mark, how far its mouth is open, and the moment
 * what it shows last changed. A figure drawn in several places — a conversation's agent on the stage, in the sidebar, in
 * the header — is one entry here, and every copy renders that entry at its own size: no copy works out anything of its
 * own, and the timers that move the figure (its rest before a pastime, its entrance, its steps, its mouth) run once, on
 * one clock (operator, 2026-10-19, #166). CharacterAvatar only draws a state.
 *
 * What it shows is a pure function of (its id, `restStart`, now) — the rest before a pastime and every step after it
 * (rotation.ts) —, so the main window and the floating card, separate pages, show the same step with nothing relayed
 * but `restStart`, which the room stamps once (web#334).
 *
 * Only a figure drawn moving takes up pastimes (`pastimes`: on the stage or the card, with the GPU on, lib/motion.ts);
 * the others rest quiet. Every copy that does not move (a thumbnail, any copy without the GPU or under reduced motion)
 * shows the same state as a still drawing (styles/call.css), at rest: quiet while a moving copy plays a pastime, never a
 * pastime frozen mid-way (operator, 2026-10-20; CharacterAvatar). */

export type EngineMood = "idle" | "speaking" | "listening" | "working";
/** The engine's mood for an app state. Offline sleeps (the engine's idle with no step: the old sleep); present (the
 *  person in a call, a transcript's speaker) is idle and quiet, awake with nothing in hand. */
export const ENGINE_MOOD: Record<AvatarMood, EngineMood> = {
  offline: "idle", speaking: "speaking", listening: "listening", working: "working", idle: "idle", present: "idle",
};

/** How long it rests, quiet, after anything happened (it spoke, listened, held still under its balloon) before a pastime
 *  starts (operator, 2026-10-15): it never seems to busy itself the moment you are done with it. */
export const BORED_AFTER_MS = 10_000;

/** What decides a figure's state, given by whoever owns the figure (for a conversation's agent, conversation-avatars.ts). */
export interface AvatarInputs {
  spec: AvatarSpec;
  mood: AvatarMood;
  /** Held still (on the stage: while its balloon is up): no idle pastime and no work in hand; quiet instead. */
  still?: boolean;
  /** What last happened with it: a change restarts its rest before a pastime (BORED_AFTER_MS). */
  interaction?: string;
  /** When that last happened, wall-clock (Date.now()), stamped once by the room: every window counts its rest, its
   *  pastimes and its tools from this moment. Without it the figure counts from the moment it was first given. */
  restStart?: number;
  /** It is drawn moving (web#278): resting, it takes up pastimes; without it, it rests quiet however long. */
  pastimes?: boolean;
  /** It has said something this browser has not seen yet. */
  unread?: boolean;
  /** The conversation whose voice its mouth follows while it speaks (the output channel, state/playback-level.ts). */
  voice?: string | null;
}

/** What every copy of a figure shows: the root's attributes (CharacterAvatar). */
export interface AvatarState {
  mood: AvatarMood;
  /** The working style in hand (data-work). */
  work?: string;
  /** The idle step (data-idle): quiet, or a pastime; none while it sleeps or is busy. */
  idle?: string;
  /** For ENTER_MS after it starts listening, the mood it left (data-enter: the engine's startle), with what it had in
   *  hand still on so it can drop away. */
  enter?: "idle" | "working";
  unread?: boolean;
  /** When what it shows last changed, wall-clock (Date.now()): every copy runs its CSS animations from this moment (on
   *  its own document's timeline: `toTimeline`), so a copy drawn later, or in another window, moves in step with the rest. */
  since?: number;
}

/** A mouth level any number of copies paint from: `paint` gets every level, and 0 when it stops. */
export type MouthLevel = (paint: (level: number) => void) => () => void;

const stills = new Map<string, AvatarState>();
/** A figure with no clock: as it stands in `mood`, nothing in hand, quiet when it rests (the person, the poster's
 *  portrait). The same object for the same mood, as a store's snapshot must be. */
export function stillAvatar(mood: AvatarMood, unread = false): AvatarState {
  const id = mood + (unread ? "!" : "");
  let state = stills.get(id);
  if (!state) stills.set(id, (state = { mood, idle: mood === "idle" || mood === "present" ? "quiet" : undefined, unread: unread || undefined }));
  return state;
}

/** Now, on the clock CSS animations run on (the document's timeline), or the page's own where there is none. */
function timeline(): number {
  const now = typeof document === "undefined" ? null : document.timeline?.currentTime;
  return typeof now === "number" ? now : performance.now();
}

/** A wall-clock moment (`AvatarState.since`) on this document's timeline, where CSS animations start. */
export const toTimeline = (wall: number, timelineNow = timeline(), wallNow = Date.now()) => timelineNow - (wallNow - wall);

type Kind = "work" | "idle";
interface Entry {
  inputs: AvatarInputs;
  spec: string;
  pools: { work: readonly string[]; idle: readonly string[] };
  acts: EngineMood;
  resting: boolean;
  /** Where its rest began when none was given (restStart). */
  born: number;
  /** The next moment what it shows can change (a pastime starts, a step ends). */
  stepTimer?: ReturnType<typeof setTimeout>;
  enter: "idle" | "working" | null;
  enterTimer?: ReturnType<typeof setTimeout>;
  last: Partial<Record<Kind, string>>;
  state: AvatarState;
  mouth: { shown: number; stale?: ReturnType<typeof setTimeout>; stop?: () => void };
}

export interface AvatarStates {
  /** Every figure's inputs now. A figure missing from `all` is dropped: its timers stop and its steps let go. */
  sync(all: ReadonlyMap<string, AvatarInputs>): void;
  /** One figure's inputs, the others left as they are. */
  set(id: string, inputs: AvatarInputs): void;
  drop(id: string): void;
  /** Drops every figure. */
  clear(): void;
  get(id: string): AvatarState | undefined;
  /** The level `id`'s mouth is open, for every copy of it (the same function each time). */
  mouth(id: string): MouthLevel;
  subscribe(listener: () => void): () => void;
}

const sameInputs = (a: AvatarInputs, b: AvatarInputs) => a.mood === b.mood && a.restStart === b.restStart && !!a.still === !!b.still && a.interaction === b.interaction
  && !!a.pastimes === !!b.pastimes && !!a.unread === !!b.unread && (a.voice ?? null) === (b.voice ?? null) && avatarKey(a.spec) === avatarKey(b.spec);
const sameState = (a: Omit<AvatarState, "since">, b: AvatarState) => a.mood === b.mood && a.work === b.work && a.idle === b.idle
  && a.enter === b.enter && !!a.unread === !!b.unread;

/** A set of figures, each in one state, on one clock. */
export function createAvatarStates(): AvatarStates {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const painters = new Map<string, Set<(level: number) => void>>();
  const mouths = new Map<string, MouthLevel>();

  const notify = () => { for (const listener of listeners) listener(); };

  /** Works out what it shows at the current time (wall-clock) and when that can next change; whether it changed. Run
   *  again from the current time whenever its timer fires, however late (a hidden window's timers are throttled): it
   *  heals itself. */
  function settle(id: string, entry: Entry, ended = false): boolean {
    const { mood, still, unread } = entry.inputs;
    const now = Date.now();
    const origin = entry.inputs.restStart ?? entry.born;
    const t = Math.max(0, now - origin);
    const bored = entry.resting && t >= BORED_AFTER_MS;
    let nextAt = entry.resting && !bored ? origin + BORED_AFTER_MS : Infinity;
    let begun = -Infinity;
    const pick = (kind: Kind, pool: readonly string[], from: number) => {
      const step = rotationAt(kind, `${id}\u0000${origin}`, pool, t - from);
      nextAt = Math.min(nextAt, origin + from + step.end);
      begun = Math.max(begun, origin + from + step.start);
      return step.value;
    };
    const working = entry.acts === "working" && !still && entry.pools.work.length > 0 ? pick("work", entry.pools.work, 0) : undefined;
    const resting = bored && entry.pools.idle.length > 0 ? pick("idle", entry.pools.idle, BORED_AFTER_MS) : undefined;
    clearTimeout(entry.stepTimer);
    entry.stepTimer = nextAt === Infinity ? undefined : setTimeout(() => {
      entry.stepTimer = undefined;
      if (settle(id, entry)) notify();
    }, Math.max(0, nextAt - now));
    if (working) entry.last.work = working;
    if (resting) entry.last.idle = resting;
    const next = {
      mood,
      // During the entrance, what it had in hand stays on so it can drop away.
      work: working ?? (entry.enter === "working" ? entry.last.work : undefined),
      // Resting before it is bored (or held still) is quiet: awake, nothing in hand. Offline sleeps: no step.
      idle: mood === "present" || (mood === "idle" && !bored) ? "quiet" : resting ?? (entry.enter === "idle" ? entry.last.idle : undefined),
      enter: entry.enter ?? undefined,
      unread: unread || undefined,
    };
    // A fresh entry has no moment yet: its first state is stamped whatever it is. The moment is the one every window
    // computes alike: when the step it shows began, or else when its rest did (the entrance ending is local).
    const changed = entry.state.since === undefined || !sameState(next, entry.state);
    if (changed) entry.state = { ...next, since: begun > -Infinity ? begun : ended ? now : origin };
    followMouth(id, entry);
    return changed;
  }

  function restartEnter(id: string, entry: Entry) {
    clearTimeout(entry.enterTimer);
    entry.enterTimer = undefined;
    if (!entry.enter) return;
    entry.enterTimer = setTimeout(() => {
      entry.enterTimer = undefined;
      entry.enter = null;
      if (settle(id, entry, true)) notify();
    }, ENTER_MS);
  }

  /** Its mouth follows its voice while it speaks and a copy shows it; shut otherwise. */
  function followMouth(id: string, entry: Entry) {
    const on = entry.state.mood === "speaking" && !!entry.inputs.voice && !!painters.get(id)?.size;
    const voice = entry.inputs.voice;
    if (on === !!entry.mouth.stop) return;
    if (!on) { stopMouth(id, entry); return; }
    const read = (sample: PlaybackLevelSample) => paintMouth(id, entry, sample.threadId === voice ? sample.level : 0, sample.receivedAt);
    read(playbackLevel.current());
    entry.mouth.stop = playbackLevel.subscribe(read);
  }

  function paintMouth(id: string, entry: Entry, level: number, receivedAt = Date.now()) {
    const { mouth } = entry;
    // A level that stopped coming (no sample for 300 ms) is silence: what the channel kept is not said again.
    if (level > 0 && Date.now() - receivedAt >= 300) level = 0;
    mouth.shown = smoothPlaybackLevel(mouth.shown, level);
    for (const paint of painters.get(id) ?? []) paint(mouth.shown);
    clearTimeout(mouth.stale);
    if (mouth.shown > 0) mouth.stale = setTimeout(() => paintMouth(id, entry, 0), Math.max(0, receivedAt + 300 - Date.now()));
  }

  function stopMouth(id: string, entry: Entry) {
    const { mouth } = entry;
    mouth.stop?.();
    mouth.stop = undefined;
    clearTimeout(mouth.stale);
    if (mouth.shown === 0) return;
    mouth.shown = 0;
    for (const paint of painters.get(id) ?? []) paint(0);
  }

  function put(id: string, inputs: AvatarInputs): boolean {
    let entry = entries.get(id);
    if (entry && sameInputs(entry.inputs, inputs)) return false;
    const spec = avatarKey(inputs.spec);
    if (!entry || entry.spec !== spec) {
      if (entry) release(id, entry);
      const { works, idles } = avatarRepertoire(inputs.spec);
      // A first mood makes no entrance.
      entry = { inputs, spec, pools: { work: works, idle: idles }, acts: ENGINE_MOOD[inputs.mood], resting: false, born: Date.now(), enter: null,
        last: {}, state: stillAvatar(inputs.mood), mouth: { shown: 0 } };
      entries.set(id, entry);
    }
    const before = entry.inputs;
    entry.inputs = inputs;
    const acts = ENGINE_MOOD[inputs.mood];
    if (acts !== entry.acts) {
      entry.enter = enterFrom(entry.acts, acts);
      entry.acts = acts;
      restartEnter(id, entry);
    }
    // Idle steps while idle and drawn moving: offline sleeps instead, and held still it stays quiet until its balloon goes.
    const resting = inputs.mood === "idle" && !inputs.still && !!inputs.pastimes;
    entry.resting = resting;
    if (inputs.voice !== before.voice && entry.mouth.stop) stopMouth(id, entry);
    return settle(id, entry);
  }

  function release(id: string, entry: Entry) {
    clearTimeout(entry.stepTimer);
    clearTimeout(entry.enterTimer);
    stopMouth(id, entry);
  }

  function remove(id: string): boolean {
    const entry = entries.get(id);
    if (!entry) return false;
    release(id, entry);
    entries.delete(id);
    return true;
  }

  return {
    sync(all) {
      let changed = false;
      for (const id of [...entries.keys()]) if (!all.has(id)) changed = remove(id) || changed;
      for (const [id, inputs] of all) changed = put(id, inputs) || changed;
      if (changed) notify();
    },
    set(id, inputs) {
      const changed = put(id, inputs);
      if (changed) notify();
    },
    drop(id) {
      const changed = remove(id);
      if (changed) notify();
    },
    clear() {
      for (const id of [...entries.keys()]) remove(id);
    },
    get: (id) => entries.get(id)?.state,
    mouth(id) {
      let level = mouths.get(id);
      if (!level) mouths.set(id, (level = (paint) => {
        let set = painters.get(id);
        if (!set) painters.set(id, (set = new Set()));
        set.add(paint);
        const entry = entries.get(id);
        paint(entry?.mouth.shown ?? 0);
        if (entry) followMouth(id, entry);
        return () => {
          set.delete(paint);
          if (!set.size) painters.delete(id);
          paint(0);
          const now = entries.get(id);
          if (now) followMouth(id, now);
        };
      }));
      return level;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const figures = createAvatarStates();
/** A figure drawn in one place with nothing behind it to share it (the design system's pictures): its own entry, on the
 *  same clock as every other. */
export function useAvatarState(spec: AvatarSpec, mood: AvatarMood): AvatarState {
  const id = useId();
  const key = avatarKey(spec);
  useLayoutEffect(() => { figures.set(id, { spec, mood }); }, [id, key, mood]);
  useLayoutEffect(() => () => figures.drop(id), [id]);
  return useSyncExternalStore(figures.subscribe, () => figures.get(id) ?? stillAvatar(mood), () => stillAvatar(mood));
}
