import { useContext, useSyncExternalStore } from "react";
import { RoomStoreContext, type RoomStore, type RoomViewState } from "../../state/room-store";
import { avatarFor } from "../avatar/avatar-spec";
import { createAvatarStates, stillAvatar, type AvatarInputs, type AvatarState, type MouthLevel } from "../avatar/avatar-state";
import { hasUnread } from "./conversation-state";
import { agentMood, moodFacts } from "./stage-view";

/* A conversation's agent is one creature in one state, however many places draw it — the stage, its row in the sidebar
 * or the rail, the header — and the thumbnails are that creature at a smaller size (operator, 2026-10-19, #166). Its
 * state is worked out here, once per conversation, from the room's store and the stage's balloon, and moved on one clock
 * (avatar-state.ts): its mood, the tool in its hand, its startle, its mouth, its offline
 * sleep (the stage's wanted poster). Every copy renders that state; none works out anything of its own. */

/** What every conversation's agent is given, from the room's store: its mood (agentMood, the same projection for all of
 *  them), held still while the stage's balloon is up over it (`held`), its unread mark, what last happened with it. */
function agentInputs(state: RoomViewState, held: string | null): Map<string, AvatarInputs> {
  const facts = moodFacts(state);
  const viewed = facts.viewed;
  const all = new Map<string, AvatarInputs>();
  const threads = state.participants.map((row) => row.threadId);
  if (viewed && !threads.includes(viewed)) threads.push(viewed);
  for (const thread of threads) {
    const row = state.participants.find((participant) => participant.threadId === thread);
    const still = thread === held;
    const base = agentMood(facts, thread);
    // Under its balloon it holds still (operator, 2026-10-15): work that starts meanwhile waits for it to go.
    const mood = still && base === "working" ? "speaking" : base;
    const onStage = thread === viewed;
    const unread = onStage && facts.preview ? !!facts.preview.unread : !!row && hasUnread(row, viewed);
    all.set(thread, { spec: avatarFor(thread), mood, still, unread, voice: thread });
  }
  return all;
}

interface ConversationAvatars {
  subscribe(listener: () => void): () => void;
  get(threadId: string | null): AvatarState;
  /** How far its mouth is open, for every copy (the same function each time). */
  mouth(threadId: string): MouthLevel;
  /** The stage's balloon is up over `threadId`'s agent, or has gone. */
  hold(threadId: string, still: boolean): void;
}

const NOBODY = stillAvatar("idle");
const perStore = new WeakMap<RoomStore, ConversationAvatars>();

/** The conversations' agents of `store`: followed from the first copy drawn to the last one gone. */
function conversationAvatars(store: RoomStore): ConversationAvatars {
  const known = perStore.get(store);
  if (known) return known;
  const states = createAvatarStates();
  let held: string | null = null;
  let copies = 0;
  let unfollow: (() => void) | null = null;
  const sync = () => states.sync(agentInputs(store.getState(), held));
  // Followed as soon as a copy asks, so the first frame already shows the state (and the pick in hand).
  const follow = () => {
    if (unfollow) return;
    unfollow = store.subscribe(sync);
    sync();
  };
  const avatars: ConversationAvatars = {
    subscribe(listener) {
      follow();
      copies += 1;
      const stop = states.subscribe(listener);
      return () => {
        stop();
        if ((copies -= 1) > 0) return;
        unfollow?.();
        unfollow = null;
        states.clear();
      };
    },
    get(threadId) {
      follow();
      return (threadId && states.get(threadId)) || NOBODY;
    },
    mouth: (threadId) => states.mouth(threadId),
    hold(threadId, still) {
      const next = still ? threadId : held === threadId ? null : held;
      if (next === held) return;
      held = next;
      if (unfollow) sync();
    },
  };
  perStore.set(store, avatars);
  return avatars;
}

export function useConversationAvatars(): ConversationAvatars {
  const store = useContext(RoomStoreContext);
  if (!store) throw new Error("useConversationAvatars must be used inside RoomProvider");
  return conversationAvatars(store);
}

/** The state of `threadId`'s agent: the same object for the stage and every thumbnail of it. */
export function useConversationAvatar(threadId: string | null): AvatarState {
  const avatars = useConversationAvatars();
  return useSyncExternalStore(avatars.subscribe, () => avatars.get(threadId), () => avatars.get(threadId));
}
