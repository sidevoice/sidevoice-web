/* The room's keyboard shortcuts: the one table. The key handler (use-room-shortcuts.ts, and the runtime's hold-to-talk),
 * Settings > Shortcuts and every button's tooltip read it; no key is written anywhere else.
 *
 * Bindings follow what Meet, Zoom and Slack huddles teach (Ctrl/Cmd+D mutes) and keep clear of what browsers and
 * systems own (no Ctrl/Cmd+arrows: history and Spaces; no Alt chords; no Cmd+W/T/N/Q/M/H):
 *  - "mod" keys carry Cmd on a Mac and Ctrl elsewhere (either is accepted, each system's own is shown) and work wherever
 *    the page has focus, except while typing. Skip is Cmd/Ctrl+S: the handler cancels the browser's Save for it. */

export type ShortcutId = "mute" | "holdToTalk" | "skip";

export interface Shortcut {
  id: ShortcutId;
  /** `KeyboardEvent.code`: the physical key, so a layout that is not QWERTY still finds it. */
  code: string;
  /** What the key is shown as. */
  key: string;
  /** Cmd (Mac) or Ctrl (elsewhere). */
  mod?: boolean;
  shift?: boolean;
  /** Held, not pressed: the runtime owns it (it needs the release). */
  hold?: boolean;
  /** Its text in Settings: a message key. */
  label: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "mute", code: "KeyD", key: "D", mod: true, label: "settings.shortcuts.mute" },
  { id: "holdToTalk", code: "Space", key: "Space", hold: true, label: "settings.shortcuts.holdToTalk" },
  { id: "skip", code: "KeyS", key: "S", mod: true, label: "toolbar.skip" },
];

export function shortcut(id: ShortcutId): Shortcut {
  return SHORTCUTS.find((entry) => entry.id === id)!;
}

type KeyEventLike = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The pressed shortcut an event is, among those a handler answers (not the held ones). `typing`: the event is in a
 *  field or a menu. */
export function shortcutOf(event: KeyEventLike, context: { typing: boolean }): Shortcut | null {
  if (event.altKey || context.typing) return null;
  const mod = event.metaKey || event.ctrlKey;
  for (const entry of SHORTCUTS) {
    if (entry.hold || entry.code !== event.code || !!entry.mod !== mod || !!entry.shift !== event.shiftKey) continue;
    return entry;
  }
  return null;
}

/** The combination as it is written on this system: "⌘D", "⌘S", "Ctrl+S"; `space` is the word for Space. */
export function shortcutCombo(id: ShortcutId, mac: boolean, space = "Space"): string {
  const entry = shortcut(id);
  const key = entry.key === "Space" ? space : entry.key;
  if (mac) return (entry.shift ? "⇧" : "") + (entry.mod ? "⌘" : "") + key;
  return [entry.mod && "Ctrl", entry.shift && "Shift", key].filter(Boolean).join("+");
}

/** The same for `aria-keyshortcuts`: "Meta+D Control+D" (a mod key is either). */
export function ariaKeyShortcuts(id: ShortcutId): string {
  const entry = shortcut(id);
  const key = entry.key === "Space" ? "Space" : entry.key;
  if (!entry.mod) return key;
  return ["Meta", "Control"].map((mod) => [mod, entry.shift && "Shift", key].filter(Boolean).join("+")).join(" ");
}
