import { expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { TranscriptPanel } from "./TranscriptPanel";
import { CallToolbar } from "../call/CallToolbar";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

vi.mock("../../services/room-session-controller.js", () => ({}));

test("the call bar carries the lights at its left edge and the models at its right; the transcript header only the title", () => {
  const store = createRoomStore();
  render(<RoomProvider store={store}><TranscriptPanel /><CallToolbar /></RoomProvider>);
  expect(document.getElementById("live")).toBeNull();
  expect(document.querySelector(".transcript-head .status-column")).toBeNull();
  const bar = document.querySelector("footer.call-bar")!;
  expect(bar.firstElementChild!.id).toBe("capability-column");
  // On a phone the models wait behind the button in this slot; on a laptop the slot is just the list.
  expect(bar.lastElementChild!.className).toBe("call-bar-end");
  expect(bar.lastElementChild!.firstElementChild!.className).toBe("engine-slot");
  expect(bar.lastElementChild!.querySelector("#engine-column")).not.toBeNull();
  expect(bar.lastElementChild!.lastElementChild!.id).toBe("transcript-toggle");
  act(() => {
    // The room went away: the voice goes on, and its light says what it says is sent when the room is back.
    store.patch({ ws: null, reconnecting: true, screenLock: { state: "on", note: "" },
      voiceState: { listening: "listening", recognising: 0, playback: "idle" },
      roomBinding: { thread_id: "t-1", binding_id: "b-1", title: "Sidevoice" },
      people: [{ thread_id: "t-1", title: "Sidevoice", available: true, engine: { model: "claude-opus-5", effort: "high" } }] });
  });
  const lights = document.getElementById("capability-column")!;
  expect(lights.textContent).toMatch(/Voz/);
  expect(lights.textContent).toMatch(/Pantalla/);
  // A light says the name of the thing and its colour says the rest: the sentence beside it repeated
  // what the dot had already said. It is still there for whoever asks the row what it means.
  expect(lights.textContent).not.toMatch(/Escuchando|Se mantiene encendida/);
  expect(lights.querySelector('.status-line[title*="Sin la sala"]')).not.toBeNull();
  expect(lights.querySelector('.status-line[data-state="warn"] .engine-dot')).not.toBeNull();
  const models = document.getElementById("engine-column")!;
  expect(models.textContent).toMatch(/Opus 5 · esfuerzo high/);
  expect(models.querySelector(".engine-dot")).toBeNull();
  expect(models.textContent).not.toMatch(/smart-turn/);
});
