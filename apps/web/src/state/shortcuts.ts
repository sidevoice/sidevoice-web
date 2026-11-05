/* The room's keyboard shortcuts: the one table. The key handler (use-room-shortcuts.ts, and the runtime's hold-to-talk),
 * Settings > Shortcuts, every button's tooltip and every `aria-keyshortcuts` read it; no key is written anywhere else.
 *
 * Each shortcut has a default and the person may change or clear it (Settings > Shortcuts > In Sidevoice). What was
 * chosen is kept with the web's settings on this device (localStorage, `sidevoice.shortcuts`: only what differs from the
 * default; `null` is a shortcut cleared), and a change reaches every reader at once: this page's through `subscribe`,
 * another page's of the same origin (the desktop card) through the storage event. No import: the runtime loads this file
 * on its own.
 *
 * Defaults follow what Meet, Zoom and Slack huddles teach (Ctrl/Cmd+D mutes) and keep clear of what browsers and systems
 * own (no Ctrl/Cmd+arrows: history and Spaces; no Cmd+W/T/N/Q/M/H):
 *  - "mod" keys carry Cmd on a Mac and Ctrl elsewhere (either is accepted, each system's own is shown) and work wherever
 *    the page has focus, except while typing. Skip is Cmd/Ctrl+S: the handler cancels the browser's Save for it.
 *  - A combination the person records is literal: the modifiers it was pressed with, nothing implied. */

export type ShortcutId = "mute" | "holdToTalk" | "skip";

/** A key and its modifiers. */
export interface Binding {
  /** `KeyboardEvent.code`: the physical key, so a layout that is not QWERTY still finds it. */
  code: string;
  /** What the key is shown as. */
  key: string;
  /** Cmd (Mac) or Ctrl (elsewhere), either answers: the defaults'. Mutually exclusive with `meta` and `ctrl`. */
  mod?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface Shortcut extends Binding {
  id: ShortcutId;
}

export interface ShortcutDefinition {
  id: ShortcutId;
  /** Held, not pressed: the runtime owns it (it needs the release). */
  hold?: boolean;
  /** Its text in Settings: a message key. */
  label: string;
  default: Binding;
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: "holdToTalk", hold: true, label: "settings.shortcuts.holdToTalk", default: { code: "Space", key: "Space" } },
  { id: "mute", label: "settings.shortcuts.mute", default: { code: "KeyD", key: "D", mod: true } },
  { id: "skip", label: "toolbar.skip", default: { code: "KeyS", key: "S", mod: true } },
];

export const SHORTCUTS_KEY = "sidevoice.shortcuts";

export function definition(id: ShortcutId): ShortcutDefinition {
  return SHORTCUTS.find((entry) => entry.id === id)!;
}

type Stored = Partial<Record<ShortcutId, Binding | null>>;

let rawSeen: string | null | undefined;
let stored: Stored = {};
let table: Record<ShortcutId, Binding | null> = resolve({});

function resolve(overrides: Stored) {
  const result = {} as Record<ShortcutId, Binding | null>;
  for (const entry of SHORTCUTS) result[entry.id] = entry.id in overrides ? overrides[entry.id] ?? null : entry.default;
  return result;
}

function validBinding(value: unknown): value is Binding {
  const binding = value as Binding | null;
  return !!binding && typeof binding === "object" && typeof binding.code === "string" && !!binding.code && typeof binding.key === "string" && !!binding.key;
}

function readRaw(): string | null {
  try { return globalThis.localStorage?.getItem(SHORTCUTS_KEY) ?? null; } catch { return null; }
}

/** The table as it stands: every shortcut's binding, null for one cleared. The same object until something changes, so a
 *  subscriber can hold it as its snapshot. */
export function bindings(): Record<ShortcutId, Binding | null> {
  const raw = readRaw();
  if (raw !== rawSeen) {
    rawSeen = raw;
    stored = {};
    try {
      const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      for (const entry of SHORTCUTS) if (entry.id in parsed) stored[entry.id] = validBinding(parsed[entry.id]) ? parsed[entry.id] as Binding : parsed[entry.id] === null ? null : undefined;
      for (const entry of SHORTCUTS) if (stored[entry.id] === undefined) delete stored[entry.id];
    } catch { stored = {}; }
    table = resolve(stored);
  }
  return table;
}

export function binding(id: ShortcutId): Binding | null {
  return bindings()[id];
}

/** The shortcut `id` as it is now, or null when the person cleared it. */
export function shortcut(id: ShortcutId): Shortcut | null {
  const bound = binding(id);
  return bound ? { id, ...bound } : null;
}

const listeners = new Set<() => void>();

function write(next: Stored) {
  try {
    if (Object.keys(next).length) globalThis.localStorage?.setItem(SHORTCUTS_KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(SHORTCUTS_KEY);
  } catch { /* Kept for this page only: the table below holds it. */ }
  // What was chosen, whether or not the storage kept it: this page follows it either way.
  stored = next;
  table = resolve(next);
  rawSeen = readRaw();
  for (const listener of listeners) listener();
}

/** Binds `id` to `next`, or clears it with null. A binding the same as the default is the default. */
export function setBinding(id: ShortcutId, next: Binding | null) {
  bindings();
  const rest: Stored = { ...stored };
  if (next && sameBinding(next, definition(id).default)) delete rest[id];
  else rest[id] = next;
  write(rest);
}

export function resetBinding(id: ShortcutId) {
  bindings();
  const rest: Stored = { ...stored };
  delete rest[id];
  write(rest);
}

export function isDefault(id: ShortcutId): boolean {
  const bound = binding(id);
  return !!bound && sameBinding(bound, definition(id).default);
}

export function sameBinding(a: Binding | null, b: Binding | null): boolean {
  if (!a || !b) return a === b;
  return a.code === b.code && !!a.mod === !!b.mod && !!a.meta === !!b.meta && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift;
}

/** Calls `listener` after every change to the table, here or in another page of this device; returns how to stop. */
export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener);
  const fromAnotherPage = (event: StorageEvent) => { if (event.key === null || event.key === SHORTCUTS_KEY) { bindings(); listener(); } };
  globalThis.addEventListener?.("storage", fromAnotherPage);
  return () => { listeners.delete(listener); globalThis.removeEventListener?.("storage", fromAnotherPage); };
}

/* While a shortcut is being recorded (Settings), no key is an action: Space would hold the microphone open and Ctrl+D
 * would mute it, under the very field that is listening for them. */
let recording = 0;
export function recordingShortcut(on?: boolean): boolean {
  if (on === true) ++recording;
  else if (on === false) recording = Math.max(0, recording - 1);
  return recording > 0;
}

type KeyEventLike = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** Whether `event` is `bound`'s key with exactly its modifiers. */
export function matches(bound: Binding, event: KeyEventLike): boolean {
  if (bound.code !== event.code || !!bound.alt !== !!event.altKey || !!bound.shift !== !!event.shiftKey) return false;
  if (bound.mod) return !!(event.metaKey || event.ctrlKey);
  return !!bound.meta === !!event.metaKey && !!bound.ctrl === !!event.ctrlKey;
}

/** The pressed shortcut an event is, among those a handler answers (not the held one). `typing`: the event is in a
 *  field or a menu. */
export function shortcutOf(event: KeyEventLike, context: { typing: boolean }): Shortcut | null {
  if (context.typing || recordingShortcut()) return null;
  for (const entry of SHORTCUTS) {
    const bound = binding(entry.id);
    if (entry.hold || !bound || !matches(bound, event)) continue;
    return { id: entry.id, ...bound };
  }
  return null;
}

/** Whether `event` presses the held shortcut (hold to talk). */
export function holdPressed(event: KeyEventLike): boolean {
  const bound = binding("holdToTalk");
  return !!bound && !recordingShortcut() && matches(bound, event);
}

/** The key that releases the held shortcut: the code of the one now bound, null when it is cleared. */
export function holdCode(): string | null {
  return binding("holdToTalk")?.code ?? null;
}

/** Whether `modifier` (the host's label for the mod key) is a symbol: a Mac's ⌘. */
export function macModifier(modifier: string): boolean {
  return /^\p{S}$/u.test(modifier);
}

/** The combination as the host's modifier writes it: "⌘D", "Ctrl+S", "⌃⌥K". `modifier` is the host's label for the mod
 *  key, `space` the word for Space. A symbol (⌘) is written against its key; a word (Ctrl) is joined to it with a "+".
 *  Empty when `id` is cleared. */
export function shortcutCombo(id: ShortcutId, modifier: string, space = "Space"): string {
  const bound = binding(id);
  return bound ? bindingCombo(bound, modifier, space) : "";
}

export function bindingCombo(bound: Binding, modifier: string, space = "Space"): string {
  const mac = macModifier(modifier);
  const key = bound.key === "Space" ? space : bound.key;
  const parts = mac
    ? [bound.ctrl && "⌃", bound.alt && "⌥", bound.shift && "⇧", (bound.mod || bound.meta) && (bound.mod ? modifier : "⌘")]
    : [(bound.mod || bound.ctrl) && (bound.mod ? modifier : "Ctrl"), bound.alt && "Alt", bound.shift && "Shift", bound.meta && "Win"];
  const mods = parts.filter(Boolean) as string[];
  return mac ? mods.join("") + key : [...mods, key].join("+");
}

/** The same for `aria-keyshortcuts`: "Meta+D Control+D" (a mod key is either); undefined when `id` is cleared. */
export function ariaKeyShortcuts(id: ShortcutId): string | undefined {
  const bound = binding(id);
  if (!bound) return undefined;
  const key = bound.key === "Space" ? "Space" : bound.key;
  const others = [bound.alt && "Alt", bound.shift && "Shift"].filter(Boolean) as string[];
  const write = (...modifiers: (string | false | undefined)[]) => [...modifiers.filter(Boolean) as string[], ...others, key].join("+");
  if (bound.mod) return [write("Meta"), write("Control")].join(" ");
  return write(bound.ctrl && "Control", bound.meta && "Meta");
}

const NAMED_KEYS: Record<string, string> = {
  Space: "Space", Enter: "Enter", Backspace: "⌫", Delete: "Del", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`",
  PageUp: "PgUp", PageDown: "PgDn", Home: "Home", End: "End", Insert: "Ins",
};

/** How a physical key is written: its letter, digit or name. */
export function keyName(code: string, key = ""): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && code.length === 7) return "Num " + code.slice(6);
  if (NAMED_KEYS[code]) return NAMED_KEYS[code];
  if (/^F\d+$/.test(code)) return code;
  return key.length === 1 ? key.toUpperCase() : key || code;
}
