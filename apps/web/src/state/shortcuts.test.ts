import { afterEach, expect, test, vi } from "vitest";
import { SHORTCUTS, SHORTCUTS_KEY, ariaKeyShortcuts, binding, holdPressed, isDefault, resetBinding, setBinding, shortcutCombo, shortcutOf, subscribeShortcuts } from "./shortcuts";

const press = (code: string, extra: Partial<Parameters<typeof shortcutOf>[0]> = {}) =>
  ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
const free = { typing: false };

afterEach(() => { localStorage.clear(); for (const entry of SHORTCUTS) resetBinding(entry.id); });

test("the table holds hold to talk, mute and skip, by default Space, Cmd/Ctrl+D and Cmd/Ctrl+S", () => {
  expect(SHORTCUTS.map((s) => s.id)).toEqual(["holdToTalk", "mute", "skip"]);
  expect(SHORTCUTS.map((s) => [s.default.code, !!s.default.mod])).toEqual([["Space", false], ["KeyD", true], ["KeyS", true]]);
});

test("a mod key answers to Cmd or Ctrl, only with its own modifiers, never while typing", () => {
  expect(shortcutOf(press("KeyD", { metaKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), free)?.id).toBe("mute");
  expect(shortcutOf(press("KeyS", { ctrlKey: true }), free)?.id).toBe("skip");
  expect(shortcutOf(press("KeyD", { ctrlKey: true, shiftKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyD", { ctrlKey: true, altKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), { typing: true })).toBeNull();
  expect(shortcutOf(press("KeyS"), free)).toBeNull();
});

test("the held key is the runtime's, not the handler's; holdPressed knows it", () => {
  expect(shortcutOf(press("Space"), free)).toBeNull();
  expect(holdPressed(press("Space"))).toBe(true);
  expect(holdPressed(press("Space", { ctrlKey: true }))).toBe(false);
});

test("combos are written with the host's modifier, and for aria-keyshortcuts", () => {
  expect(shortcutCombo("mute", "⌘")).toBe("⌘D");
  expect(shortcutCombo("mute", "Ctrl")).toBe("Ctrl+D");
  expect(shortcutCombo("holdToTalk", "Ctrl", "Espacio")).toBe("Espacio");
  expect(shortcutCombo("mute", "Strg")).toBe("Strg+D");
  expect(ariaKeyShortcuts("mute")).toBe("Meta+D Control+D");
  expect(ariaKeyShortcuts("holdToTalk")).toBe("Space");
});

test("a changed shortcut is the one handled, shown and kept; a cleared one does nothing and shows nothing", () => {
  const listener = vi.fn();
  const stop = subscribeShortcuts(listener);
  setBinding("mute", { code: "KeyM", key: "M", ctrl: true, alt: true });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), free)).toBeNull();
  expect(shortcutOf(press("KeyM", { ctrlKey: true, altKey: true }), free)?.id).toBe("mute");
  expect(shortcutCombo("mute", "⌘")).toBe("⌃⌥M");
  expect(shortcutCombo("mute", "Ctrl")).toBe("Ctrl+Alt+M");
  expect(ariaKeyShortcuts("mute")).toBe("Control+Alt+M");
  expect(isDefault("mute")).toBe(false);
  expect(JSON.parse(localStorage.getItem(SHORTCUTS_KEY)!).mute.code).toBe("KeyM");
  setBinding("skip", null);
  expect(binding("skip")).toBeNull();
  expect(shortcutCombo("skip", "Ctrl")).toBe("");
  expect(ariaKeyShortcuts("skip")).toBeUndefined();
  expect(shortcutOf(press("KeyS", { ctrlKey: true }), free)).toBeNull();
  resetBinding("mute");
  expect(isDefault("mute")).toBe(true);
  expect(shortcutOf(press("KeyD", { ctrlKey: true }), free)?.id).toBe("mute");
  stop();
  setBinding("mute", null);
  expect(listener).toHaveBeenCalledTimes(3);
});

test("another page's change reaches this one through the storage event; a damaged value is the defaults", () => {
  const listener = vi.fn();
  const stop = subscribeShortcuts(listener);
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ mute: { code: "KeyK", key: "K", mod: true }, skip: null }));
  window.dispatchEvent(new StorageEvent("storage", { key: SHORTCUTS_KEY }));
  expect(listener).toHaveBeenCalled();
  expect(binding("mute")?.code).toBe("KeyK");
  expect(binding("skip")).toBeNull();
  localStorage.setItem(SHORTCUTS_KEY, "{broken");
  window.dispatchEvent(new StorageEvent("storage", { key: SHORTCUTS_KEY }));
  expect(binding("mute")?.code).toBe("KeyD");
  stop();
});

test("a key of the room is warned about where AltGr or the browser or the system would take it", async () => {
  const { bindingClash } = await import("./shortcuts");
  expect(bindingClash({ code: "KeyM", key: "M", ctrl: true, alt: true }, false)).toBe("altgr");
  expect(bindingClash({ code: "KeyM", key: "M", mod: true, alt: true }, false)).toBe("altgr");
  expect(bindingClash({ code: "KeyM", key: "M", ctrl: true, alt: true }, true)).toBeNull();
  for (const code of ["KeyW", "KeyT", "KeyN", "KeyQ", "KeyR", "KeyL", "Tab"]) {
    expect(bindingClash({ code, key: code, mod: true }, false)).toBe("reserved");
    expect(bindingClash({ code, key: code, meta: true }, true)).toBe("reserved");
  }
  expect(bindingClash({ code: "Tab", key: "Tab", alt: true }, false)).toBe("reserved");
  expect(bindingClash({ code: "KeyD", key: "D", mod: true }, false)).toBeNull();
  expect(bindingClash({ code: "Space", key: "Space" }, false)).toBeNull();
  // A Mac's own keys, Cmd only and only there (Q and Tab are in the shared list).
  for (const code of ["KeyM", "KeyH", "Space", "Backquote"]) {
    expect(bindingClash({ code, key: code, mod: true }, true)).toBe("reserved");
    expect(bindingClash({ code, key: code, meta: true }, true)).toBe("reserved");
    expect(bindingClash({ code, key: code, mod: true }, false)).toBeNull();
    expect(bindingClash({ code, key: code, ctrl: true }, true)).toBeNull();
  }
  // Ctrl+Alt+Shift+M, the Windows and Linux default for the global mute, is not an AltGr warning.
  expect(bindingClash({ code: "KeyM", key: "M", ctrl: true, alt: true, shift: true }, false)).toBeNull();
});
