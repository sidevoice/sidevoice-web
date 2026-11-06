import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useRoomShortcuts } from "./use-room-shortcuts";

const actions = { toggleMic: vi.fn(), skipReply: vi.fn(), cancelInput: vi.fn(), toggleCall: vi.fn() };
function Room() { useRoomShortcuts(); return <><button id="b">b</button><input id="field" /></>; }

afterEach(() => { vi.clearAllMocks(); });

function setup() {
  (window as unknown as { sidevoiceActions: unknown }).sidevoiceActions = actions;
  return render(<Room />);
}

// fireEvent returns false when a listener called preventDefault.
test("mute and skip do their action, the repeat does nothing, and the removed keys do nothing", () => {
  setup();
  fireEvent.keyDown(document.body, { code: "KeyD", ctrlKey: true });
  fireEvent.keyDown(document.body, { code: "KeyD", metaKey: true, repeat: true });
  expect(actions.toggleMic).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { code: "KeyS", metaKey: true });
  fireEvent.keyDown(document.body, { code: "KeyS", ctrlKey: true, repeat: true });
  expect(actions.skipReply).toHaveBeenCalledTimes(1);

  expect(fireEvent.keyDown(document.body, { code: "KeyS" })).toBe(true);
  expect(fireEvent.keyDown(document.body, { code: "KeyZ", metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(document.body, { code: "KeyE", metaKey: true, shiftKey: true })).toBe(true);
  fireEvent.keyDown(document.body, { code: "KeyT" });
  fireEvent.keyDown(document.body, { code: "KeyC" });
  expect(actions.skipReply).toHaveBeenCalledTimes(1);
  expect(actions.cancelInput).not.toHaveBeenCalled();
  expect(actions.toggleCall).not.toHaveBeenCalled();
});

test("Skip's key never opens the browser's Save, in a text box too; the text box still holds back the action", () => {
  setup();
  expect(fireEvent.keyDown(document.body, { code: "KeyS", ctrlKey: true })).toBe(false);
  expect(fireEvent.keyDown(document.body, { code: "KeyS", metaKey: true })).toBe(false);
  expect(actions.skipReply).toHaveBeenCalledTimes(2);
  expect(fireEvent.keyDown(document.getElementById("field")!, { code: "KeyS", ctrlKey: true })).toBe(false);
  expect(fireEvent.keyDown(document.getElementById("field")!, { code: "KeyD", ctrlKey: true })).toBe(true);
  expect(actions.skipReply).toHaveBeenCalledTimes(2);
  expect(actions.toggleMic).not.toHaveBeenCalled();
});

test("the handler follows the shortcuts table at once: a changed key acts, the old one does not, a cleared one does nothing", async () => {
  const { setBinding, resetBinding } = await import("./shortcuts");
  setup();
  setBinding("mute", { code: "KeyM", key: "M", ctrl: true, alt: true });
  fireEvent.keyDown(document.body, { code: "KeyD", ctrlKey: true });
  expect(actions.toggleMic).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { code: "KeyM", ctrlKey: true, altKey: true });
  expect(actions.toggleMic).toHaveBeenCalledTimes(1);
  setBinding("skip", null);
  fireEvent.keyDown(document.body, { code: "KeyS", ctrlKey: true });
  expect(actions.skipReply).not.toHaveBeenCalled();
  resetBinding("mute"); resetBinding("skip");
});

test("Say one thing has no key until a person chooses one; then its key does the same page action as the global key", async () => {
  const { setBinding, resetBinding } = await import("./shortcuts");
  const oneTurn = vi.fn();
  (window as unknown as { sidevoiceActions: unknown }).sidevoiceActions = { ...actions, oneTurn };
  render(<Room />);
  fireEvent.keyDown(document.body, { code: "KeyJ", ctrlKey: true, shiftKey: true });
  expect(oneTurn).not.toHaveBeenCalled();
  setBinding("oneTurn", { code: "KeyJ", key: "J", mod: true, shift: true });
  fireEvent.keyDown(document.body, { code: "KeyJ", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(document.body, { code: "KeyJ", ctrlKey: true, shiftKey: true, repeat: true });
  expect(oneTurn).toHaveBeenCalledTimes(1);
  resetBinding("oneTurn");
});
