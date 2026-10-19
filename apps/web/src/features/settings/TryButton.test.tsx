import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TryButton, useVoiceTry, type Task, type VoiceTry } from "./ModelSetup";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { translator } from "../../i18n/translator";
import type { SidevoiceActions, TrialProgress } from "../../state/room-types";

/* The try's own button, in the first-run setup and in Settings: the same button, the same states. It says Stop from the
 * moment it is pressed for as long as the try runs (getting ready, listening or sounding, transcribing), and Stop stops
 * the try — a transcription's take ends with what was said, anything else is cancelled. */

type Running = { told: TrialProgress; finish(result: unknown): void; fail(error: unknown): void };
let running: Running;
let actions: { tryVoiceSettings: ReturnType<typeof vi.fn>; cancelVoiceTry: ReturnType<typeof vi.fn>; finishVoiceTry: ReturnType<typeof vi.fn> };

beforeEach(() => {
  running = { told: {}, finish: () => {}, fail: () => {} };
  actions = {
    tryVoiceSettings: vi.fn((_task: string, options: TrialProgress) => {
      running.told = options;
      return new Promise((resolve, reject) => { running.finish = resolve; running.fail = reject; });
    }),
    cancelVoiceTry: vi.fn(),
    finishVoiceTry: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { cleanup(); delete window.sidevoiceActions; });

/** The button on a real try (`useVoiceTry`), as either of its two homes draws it. `again`: tried before this visit. */
function Try({ task, again = false, reason = "", onTried }: { task: Task; again?: boolean; reason?: string; onTried?: (task: Task) => void }) {
  const handle = useVoiceTry(task, { keep: false, onTried });
  const start = () => void handle.run(task === "stt" ? {} : { text: "Hello there.", language: "en" });
  const tryHandle: VoiceTry = { ...handle, start };
  return <>
    <TryButton task={task} handle={tryHandle} id="try" again={again} reason={reason} reasonId="why" t={translator()} />
    <output id="phase">{handle.trial.phase}</output>
    <output id="state">{handle.trial.live ? (handle.trial.transcribing ? "transcribing" : "live") : "starting"}</output>
    {handle.trial.phase === "failed" && handle.trial.error && <p role="alert">{handle.trial.error.text}</p>}
  </>;
}

function renderTry(props: Parameters<typeof Try>[0]) {
  const store = createRoomStore();
  store.patch({ voiceSettings: defaultVoiceSettings() });
  installRoomBridge(store);
  render(<RoomStoreContext.Provider value={store}><Try {...props} /></RoomStoreContext.Provider>);
  return {
    button: () => document.getElementById("try") as HTMLButtonElement,
    phase: () => document.getElementById("phase")!.textContent,
    press: async () => { await act(async () => { fireEvent.click(document.getElementById("try")!); }); },
  };
}

test("transcription: Try it, Stop at once while it gets ready, still Stop listening and while transcribing, Speak again after", async () => {
  const { button, phase, press } = renderTry({ task: "stt" });
  expect(button()).toHaveTextContent(/^Try it: speak$/);
  await press();
  // Getting ready: no spinner in the button, no wait — Stop, which can be pressed.
  expect(phase()).toBe("running");
  expect(document.getElementById("state")).toHaveTextContent("starting");
  expect(button()).toHaveTextContent(/^Stop$/);
  expect(button()).not.toHaveAttribute("aria-busy");
  expect(button()).not.toHaveAttribute("aria-disabled");
  expect(button().querySelector(".ui-spinner")).toBeNull();
  act(() => running.told.onListening!());
  expect(document.getElementById("state")).toHaveTextContent("live");
  expect(button()).toHaveTextContent(/^Stop$/);
  act(() => running.told.onTranscribing!(true));
  expect(button()).toHaveTextContent(/^Stop$/);
  await act(async () => { running.finish({ text: "hola", timings: { ready_ms: 300, recognition_ms: 400 } }); });
  expect(phase()).toBe("done");
  expect(button()).toHaveTextContent(/^Speak again$/);
  // Again starts the next try, and is Stop in turn.
  await press();
  expect(actions.tryVoiceSettings).toHaveBeenCalledTimes(2);
  expect(button()).toHaveTextContent(/^Stop$/);
});

test("voice: Try it, Stop at once while it gets ready, still Stop while the sentence plays, Play again after", async () => {
  const { button, phase, press } = renderTry({ task: "tts" });
  expect(button()).toHaveTextContent(/^Try it: listen$/);
  await press();
  expect(button()).toHaveTextContent(/^Stop$/);
  expect(button()).not.toHaveAttribute("aria-busy");
  act(() => running.told.onProgress!({ from: 0, to: 0 }));
  expect(document.getElementById("state")).toHaveTextContent("live");
  expect(button()).toHaveTextContent(/^Stop$/);
  await act(async () => { running.finish({ timings: { ready_ms: 300, first_sound_ms: 300 } }); });
  expect(phase()).toBe("done");
  expect(button()).toHaveTextContent(/^Play again$/);
});

test("tried already, the button says again until it runs, and Stop while it does", async () => {
  const { button, press } = renderTry({ task: "stt", again: true });
  expect(button()).toHaveTextContent(/^Speak again$/);
  await press();
  expect(button()).toHaveTextContent(/^Stop$/);
});

test("a try's failure leaves again to try with, which is Stop once pressed", async () => {
  const { button, phase, press } = renderTry({ task: "stt" });
  await press();
  await act(async () => { running.fail(Object.assign(new Error("trial-silence"), { code: "trial-silence" })); });
  expect(phase()).toBe("failed");
  expect(button()).toHaveTextContent(/^Speak again$/);
  expect(button()).not.toHaveAttribute("aria-disabled");
  await press();
  expect(button()).toHaveTextContent(/^Stop$/);
});

test("a try that cannot run says why and waits: pressed, it starts nothing", async () => {
  const { button, press } = renderTry({ task: "stt", reason: "Its model isn't ready yet." });
  expect(button()).toHaveAttribute("aria-disabled", "true");
  expect(button()).toHaveAttribute("aria-describedby", "why");
  await press();
  expect(actions.tryVoiceSettings).not.toHaveBeenCalled();
});

test("Stop while a transcription gets ready ends the try (its take, once it listens), and nothing is shown of it: no error, not tried", async () => {
  const onTried = vi.fn();
  const { button, phase, press } = renderTry({ task: "stt", onTried });
  await press();
  expect(document.getElementById("state")).toHaveTextContent("starting");
  await press();
  // The page is asked to stop it, as a transcription's: ending its take (a cancel while there is none yet).
  expect(actions.finishVoiceTry).toHaveBeenCalledTimes(1);
  expect(actions.cancelVoiceTry).not.toHaveBeenCalled();
  await act(async () => { running.fail(Object.assign(new Error("trial-cancelled"), { code: "trial-cancelled" })); });
  expect(phase()).toBe("idle");
  expect(document.querySelector("[role=alert]")).toBeNull();
  expect(onTried).not.toHaveBeenCalled();
  expect(button()).toHaveTextContent(/^Try it: speak$/);
});

test("Stop while listening ends the take with what was said, and it is transcribed and counted as tried", async () => {
  const onTried = vi.fn();
  const { phase, press } = renderTry({ task: "stt", onTried });
  await press();
  act(() => running.told.onListening!());
  await press();
  expect(actions.finishVoiceTry).toHaveBeenCalledTimes(1);
  expect(actions.cancelVoiceTry).not.toHaveBeenCalled();
  act(() => running.told.onTranscribing!(true));
  await act(async () => { running.finish({ text: "hola", timings: { ready_ms: 300, recognition_ms: 400 } }); });
  expect(phase()).toBe("done");
  expect(onTried).toHaveBeenCalledWith("stt");
});

test("Stop once the take has ended cancels what is being transcribed, and the try goes back to idle, its take with it", async () => {
  const { button, phase, press } = renderTry({ task: "stt" });
  await press();
  act(() => running.told.onListening!());
  await press();
  act(() => running.told.onTranscribing!(true));
  expect(document.getElementById("state")).toHaveTextContent("transcribing");
  expect(button()).toHaveTextContent(/^Stop$/);
  await press();
  // Its take has ended already: there is none left to end, so this one is a cancel.
  expect(actions.finishVoiceTry).toHaveBeenCalledTimes(1);
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(1);
  await act(async () => { running.fail(Object.assign(new Error("trial-cancelled"), { code: "trial-cancelled" })); });
  expect(phase()).toBe("idle");
  expect(button()).toHaveTextContent(/^Try it: speak$/);
});

test("Stop on a voice try cancels it, while it gets ready and while it plays, and it is not tried", async () => {
  const onTried = vi.fn();
  const { button, phase, press } = renderTry({ task: "tts", onTried });
  await press();
  await press();
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(1);
  await act(async () => { running.fail(Object.assign(new Error("trial-cancelled"), { code: "trial-cancelled" })); });
  expect(phase()).toBe("idle");
  expect(button()).toHaveTextContent(/^Try it: listen$/);
  await press();
  act(() => running.told.onProgress!({ from: 0, to: 5 }));
  await press();
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(2);
  expect(actions.finishVoiceTry).not.toHaveBeenCalled();
  await act(async () => { running.fail(Object.assign(new Error("trial-cancelled"), { code: "trial-cancelled" })); });
  expect(phase()).toBe("idle");
  expect(document.querySelector("[role=alert]")).toBeNull();
  expect(onTried).not.toHaveBeenCalled();
});
