/* The room inside the floating card (sidevoice-web#229): the card draws the call with the room's own components — the
 * stage, the avatars, the balloons, the call bar, the conversation rows — on a room store of its own, patched with the
 * facts the room relays for it (CallCardView.facts, through its host). What those components ask the room to do
 * (`window.sidevoiceActions`) is carried to the room as the card's commands; the microphone's level and the voice's
 * output level are fed where the components read them. Nothing here works out anything about the call. */
import { createRoomStore, type RoomStore } from "../state/room-store";
import { playbackLevel } from "../state/playback-level";
import type { SessionFacts } from "../state/room-session-state.js";
import type { CallCommand, CallControlsState } from "./host";

export interface CardRoom {
  store: RoomStore;
  /** What the host said now: the facts into the store, the levels where they are read. */
  apply(state: CallControlsState): void;
}

/** `run`: how a command goes to the room (the card's click guard in front of the host's). */
export function createCardRoom(run: (command: CallCommand) => void): CardRoom {
  const store = createRoomStore();
  let level = 0;
  let lastFacts: unknown = null;
  let lastPlayback: unknown = null;

  // The room's actions the components call, as the card's commands; the rest is the room's alone, and does nothing here.
  const actions: Record<string, (...args: never[]) => unknown> = {
    toggleMic: () => run({ command: "toggle-mute" }),
    toggleCall: async () => run({ command: "hang-up" }),
    skipReply: () => run({ command: "skip-reply" }),
    cancelInput: async () => run({ command: "cancel-input" }),
    selectParticipant: (threadId: string) => run({ command: "select-participant", threadId }),
    setAudioDevices: async (choice: { input?: string | null; output?: string | null }) => {
      if (typeof choice.input === "string") run({ command: "select-audio-device", kind: "input", id: choice.input });
      if (typeof choice.output === "string") run({ command: "select-audio-device", kind: "output", id: choice.output });
    },
  };
  window.sidevoiceActions = new Proxy(actions, {
    get: (target, name) => (typeof name === "string" && name in target ? target[name] : undefined),
  }) as unknown as typeof window.sidevoiceActions;
  // The person's voice's bars (VoiceWaveform) read the microphone's level here, as in the room.
  (window as unknown as { sidevoiceAudio?: unknown }).sidevoiceAudio = { level: () => level / 100, readWaveform: () => null };

  return {
    store,
    apply(state) {
      const facts = state.call.facts;
      if (facts && facts !== lastFacts) {
        lastFacts = facts;
        store.patch(facts as unknown as Partial<SessionFacts>);
      }
      level = state.level;
      // The room's runtime writes the level on its microphone's pill (call-view.css .mic-wave reads --mic-level).
      const fill = () => document.getElementById("mic-control")?.style.setProperty("--mic-level", String(Math.round(level) / 100));
      fill();
      // A bar drawn by this very state (the card appearing, the controls coming near the pointer) gets it too.
      requestAnimationFrame(fill);
      if (state.playback && state.playback !== lastPlayback) {
        lastPlayback = state.playback;
        playbackLevel.publish(state.playback.level, state.playback.threadId);
      }
    },
  };
}
