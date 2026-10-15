import { expect, test } from "vitest";
import { SHORTCUTS, ariaKeyShortcuts, shortcutCombo, shortcutOf } from "./shortcuts";

const press = (code: string, extra: Partial<Parameters<typeof shortcutOf>[0]> = {}) =>
  ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
const free = { typing: false, dialog: false };

test("no two shortcuts share a key and modifiers", () => {
  const seen = SHORTCUTS.map((s) => [s.code, !!s.mod, !!s.shift].join());
  expect(new Set(seen).size).toBe(seen.length);
});

test("a mod key answers to Cmd or Ctrl, only with its own shift, never with Alt, never while typing", () => {
  expect(shortcutOf(press("KeyD", { metaKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyD", { ctrlKey: true, shiftKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyE", { ctrlKey: true, shiftKey: true }), free)?.id).toBe("call");
  expect(shortcutOf(press("KeyD", { ctrlKey: true, altKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), { typing: true, dialog: false })).toBeNull();
});

test("a single letter fires alone, and not while typing, in a dialog or with a modifier", () => {
  expect(shortcutOf(press("KeyS"), free)?.id).toBe("skip");
  expect(shortcutOf(press("KeyS"), { typing: true, dialog: false })).toBeNull();
  expect(shortcutOf(press("KeyS"), { typing: false, dialog: true })).toBeNull();
  expect(shortcutOf(press("KeyS", { ctrlKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyT", { shiftKey: true }), free)).toBeNull();
});

test("the held key is the runtime's, not the handler's", () => {
  expect(shortcutOf(press("Space"), free)).toBeNull();
});

test("combos are written as each system writes them, and for aria-keyshortcuts", () => {
  expect(shortcutCombo("mute", true)).toBe("⌘D");
  expect(shortcutCombo("mute", false)).toBe("Ctrl+D");
  expect(shortcutCombo("call", true)).toBe("⇧⌘E");
  expect(shortcutCombo("call", false)).toBe("Ctrl+Shift+E");
  expect(shortcutCombo("holdToTalk", false, "Espacio")).toBe("Espacio");
  expect(ariaKeyShortcuts("mute")).toBe("Meta+D Control+D");
  expect(ariaKeyShortcuts("skip")).toBe("S");
});
