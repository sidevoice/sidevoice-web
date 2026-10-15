import { expect, test } from "vitest";
import { SHORTCUTS, ariaKeyShortcuts, shortcutCombo, shortcutOf } from "./shortcuts";

const press = (code: string, extra: Partial<Parameters<typeof shortcutOf>[0]> = {}) =>
  ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
const free = { typing: false };

test("the table holds mute, hold to talk and skip, and no two share a key and modifiers", () => {
  expect(SHORTCUTS.map((s) => s.id)).toEqual(["mute", "holdToTalk", "skip"]);
  const seen = SHORTCUTS.map((s) => [s.code, !!s.mod, !!s.shift].join());
  expect(new Set(seen).size).toBe(seen.length);
});

test("a mod key answers to Cmd or Ctrl, only with its own shift, never with Alt, never while typing", () => {
  expect(shortcutOf(press("KeyD", { metaKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyS", { metaKey: true }), free)?.id).toBe("skip");
  expect(shortcutOf(press("KeyS", { ctrlKey: true }), free)?.id).toBe("skip");
  expect(shortcutOf(press("KeyD", { ctrlKey: true, shiftKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyD", { ctrlKey: true, altKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), { typing: true })).toBeNull();
});

test("the removed keys answer nothing, and a bare S is not Skip", () => {
  expect(shortcutOf(press("KeyS"), free)).toBeNull();
  for (const code of ["KeyT", "KeyC"]) expect(shortcutOf(press(code), free)).toBeNull();
  expect(shortcutOf(press("KeyZ", { metaKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyE", { ctrlKey: true, shiftKey: true }), free)).toBeNull();
});

test("the held key is the runtime's, not the handler's", () => {
  expect(shortcutOf(press("Space"), free)).toBeNull();
});

test("combos are written as each system writes them, and for aria-keyshortcuts", () => {
  expect(shortcutCombo("mute", true)).toBe("⌘D");
  expect(shortcutCombo("mute", false)).toBe("Ctrl+D");
  expect(shortcutCombo("skip", true)).toBe("⌘S");
  expect(shortcutCombo("skip", false)).toBe("Ctrl+S");
  expect(shortcutCombo("holdToTalk", false, "Espacio")).toBe("Espacio");
  expect(ariaKeyShortcuts("mute")).toBe("Meta+D Control+D");
  expect(ariaKeyShortcuts("skip")).toBe("Meta+S Control+S");
});
