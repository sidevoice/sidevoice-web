import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { TOGGLE_CONVERSATIONS, useRoomShortcuts } from "./use-room-shortcuts";
import { createCallLayoutStore } from "./call-layout";

const actions = { toggleMic: vi.fn(), skipReply: vi.fn(), cancelInput: vi.fn(), toggleCall: vi.fn() };
const layout = createCallLayoutStore(null);
function Room() { useRoomShortcuts(layout); return <><button id="b">b</button><input id="field" /><dialog open><button id="in-dialog">d</button></dialog></>; }

afterEach(() => { vi.clearAllMocks(); layout.setState({ transcriptOpen: false }); });

function setup() {
  (window as unknown as { sidevoiceActions: unknown }).sidevoiceActions = actions;
  return render(<Room />);
}

test("each key does its action; the letters wait for the text box and the dialogs, the repeat does nothing", () => {
  setup();
  const conversations = vi.fn();
  window.addEventListener(TOGGLE_CONVERSATIONS, conversations);
  fireEvent.keyDown(document.body, { code: "KeyD", ctrlKey: true });
  fireEvent.keyDown(document.body, { code: "KeyD", ctrlKey: true, repeat: true });
  expect(actions.toggleMic).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { code: "KeyS" });
  expect(actions.skipReply).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { code: "KeyZ", metaKey: true });
  expect(actions.cancelInput).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { code: "KeyE", metaKey: true, shiftKey: true });
  expect(actions.toggleCall).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { code: "KeyT" });
  expect(layout.getState().transcriptOpen).toBe(true);
  fireEvent.keyDown(document.body, { code: "KeyC" });
  expect(conversations).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(document.getElementById("field")!, { code: "KeyS" });
  fireEvent.keyDown(document.getElementById("in-dialog")!, { code: "KeyS" });
  fireEvent.keyDown(document.getElementById("field")!, { code: "KeyD", ctrlKey: true });
  expect(actions.skipReply).toHaveBeenCalledTimes(1);
  expect(actions.toggleMic).toHaveBeenCalledTimes(1);
  window.removeEventListener(TOGGLE_CONVERSATIONS, conversations);
});
