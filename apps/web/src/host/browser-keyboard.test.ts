import { expect, test, vi } from "vitest";
import { followKeyboardLayout } from "./browser-keyboard";

test("the layout map is handed over now and on every layout change, until stopped; a browser without one hands nothing", async () => {
  const maps = [new Map([["BracketRight", "+"]]), new Map([["BracketRight", "]"]])];
  let change: (() => void) | undefined;
  const keyboard = {
    getLayoutMap: vi.fn(async () => maps.shift()!),
    addEventListener: vi.fn((_type: string, listener: () => void) => { change = listener; }),
    removeEventListener: vi.fn(() => { change = undefined; }),
  };
  const heard: string[] = [];
  const stop = followKeyboardLayout((map) => heard.push(map.get("BracketRight")!), keyboard);
  await vi.waitFor(() => expect(heard).toEqual(["+"]));
  change!();
  await vi.waitFor(() => expect(heard).toEqual(["+", "]"]));
  stop();
  expect(keyboard.removeEventListener).toHaveBeenCalled();

  const none = vi.fn();
  followKeyboardLayout(none, {})();
  followKeyboardLayout(none, undefined)();
  expect(none).not.toHaveBeenCalled();
});
