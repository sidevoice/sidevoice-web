/* A global shortcut's accelerator, the string the desktop app registers and reports (docs/GLOBAL_SHORTCUTS.md §7 of
 * sidevoice-desktop): `Ctrl+Alt+M`, `Cmd+Shift+Space`, `F9`; and a single key written as one too, with the way it is
 * pressed as a suffix: `Fn:hold`, `RightAlt:tap`, `RightCommand:double`. This file reads and writes them, and says how
 * each reads on a system (⌃⌥M on a Mac, Ctrl+Alt+M elsewhere). No import: it is pure. */

export type Trigger = "hold" | "tap" | "double";
export type Modifier = "ctrl" | "alt" | "shift" | "meta";

export interface Accelerator {
  modifiers: Modifier[];
  /** The key as the accelerator names it (`M`, `Space`, `F9`, `Fn`, `RightAlt`). */
  key: string;
  /** A key pressed on its own (`Fn`, `RightAlt`, `F13:hold`), which the system gives only to a listener that may read every key. */
  single: boolean;
  trigger: Trigger | null;
  /** The side of a modifier pressed alone. */
  side: "left" | "right" | null;
  /** The modifier a lone key is (`RightAlt` is `alt`), or null. */
  lone: Modifier | null;
}

const MODIFIER_NAMES: Record<string, Modifier> = {
  cmd: "meta", command: "meta", meta: "meta", super: "meta", win: "meta", commandorcontrol: "ctrl", cmdorctrl: "ctrl",
  ctrl: "ctrl", control: "ctrl", alt: "alt", option: "alt", shift: "shift",
};
const LONE_KEYS: Record<string, Modifier> = { Alt: "alt", Command: "meta", Control: "ctrl", Shift: "shift" };
const ORDER: Modifier[] = ["ctrl", "alt", "shift", "meta"];
const TRIGGERS: readonly string[] = ["hold", "tap", "double"];

export function parseAccelerator(accelerator: string): Accelerator {
  const colon = accelerator.lastIndexOf(":");
  const suffix = colon > 0 ? accelerator.slice(colon + 1) : "";
  const trigger = TRIGGERS.includes(suffix) ? suffix as Trigger : null;
  const body = trigger ? accelerator.slice(0, colon) : accelerator;
  const parts = body.split("+");
  let key = parts.pop() || "+";
  if (key === "" && parts.length) key = "+";
  const modifiers = new Set<Modifier>();
  for (const part of parts) { const found = MODIFIER_NAMES[part.toLowerCase()]; if (found) modifiers.add(found); }
  key = physicalKey(key, modifiers.has("shift"));
  const side = /^(Left|Right)/.exec(key)?.[1]?.toLowerCase() as "left" | "right" | undefined;
  const bare = key.replace(/^(Left|Right)/, "");
  const lone = side && LONE_KEYS[bare] ? LONE_KEYS[bare] : null;
  const single = !modifiers.size && (trigger !== null || lone !== null || key === "Fn");
  return { modifiers: ORDER.filter((modifier) => modifiers.has(modifier)), key, single, trigger, side: lone ? side! : null, lone };
}

export const isSingle = (accelerator: string | null) => !!accelerator && parseAccelerator(accelerator).single;
export const isFnKey = (accelerator: string | null) => !!accelerator && parseAccelerator(accelerator).key === "Fn";

/** The same accelerator, however it was written: modifiers in one order, the key in one case. */
export function canonical(accelerator: string): string {
  const parsed = parseAccelerator(accelerator);
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  return [...parsed.modifiers, key].join("+") + (parsed.trigger ? ":" + parsed.trigger : "");
}

export function sameAccelerator(a: string | null, b: string | null): boolean {
  return a === null || b === null ? a === b : canonical(a) === canonical(b);
}

/** The accelerator of keys pressed together: modifiers in the desktop's order, then the key. */
export function composeAccelerator(modifiers: Partial<Record<Modifier, boolean>>, key: string): string {
  const names: Record<Modifier, string> = { meta: "Cmd", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
  return [...(["meta", "ctrl", "alt", "shift"] as Modifier[]).filter((modifier) => modifiers[modifier]).map((modifier) => names[modifier]), key].join("+");
}

/** The accelerator of a key pressed alone (`RightAlt:tap`). */
export function singleAccelerator(key: string, trigger: Trigger): string {
  return key + ":" + trigger;
}

/** What `KeyboardEvent.code` of a modifier pressed alone is called in an accelerator. */
export const LONE_CODES: Record<string, string> = {
  AltRight: "RightAlt", AltLeft: "LeftAlt", MetaRight: "RightCommand", MetaLeft: "LeftCommand", OSRight: "RightCommand", OSLeft: "LeftCommand",
  ControlRight: "RightControl", ControlLeft: "LeftControl", ShiftRight: "RightShift", ShiftLeft: "LeftShift",
};

const ARROWS: Record<string, string> = { ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Enter: "Enter" };

/** The keys named by the physical key and never by the character they type: the main row's punctuation (what a Spanish
 *  layout types on BracketRight is not `+`) and the keypad. These are the names `global-hotkey` knows them by. */
const PUNCTUATION = ["Minus", "Equal", "Comma", "Period", "Slash", "Backslash", "Semicolon", "Quote", "BracketLeft", "BracketRight", "Backquote", "IntlBackslash"];
const KEYPAD = ["Add", "Subtract", "Multiply", "Divide", "Decimal", "Equal", "Enter", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((name) => "Numpad" + name);
const PHYSICAL = [...PUNCTUATION, ...KEYPAD];
const PHYSICAL_BY_LOWER = new Map(PHYSICAL.map((name) => [name.toLowerCase(), name]));

/** What each of them is written on the keycap: `-`, `;`, `Num +`. `IntlBackslash` is the ISO `<>` key beside the left Shift. */
const KEYCAPS: Record<string, string> = {
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`", IntlBackslash: "<",
  NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadDecimal: "Num .", NumpadEqual: "Num =", NumpadEnter: "Num Enter",
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => ["Numpad" + digit, "Num " + digit])),
};

/** The character an accelerator saved before keys were named by their physical key wrote, and the key it is. */
const LEGACY: Record<string, string> = { "-": "Minus", "=": "Equal", ",": "Comma", ".": "Period", "/": "Slash", "\\": "Backslash", ";": "Semicolon", "'": "Quote", "[": "BracketLeft", "]": "BracketRight", "`": "Backquote" };
/** The same, for the character Shift makes of a key (US layout, as the desktop reads them). */
const LEGACY_SHIFTED: Record<string, string> = {
  _: "Minus", "+": "Equal", "<": "Comma", ">": "Period", "?": "Slash", "|": "Backslash", ":": "Semicolon", '"': "Quote", "{": "BracketLeft", "}": "BracketRight", "~": "Backquote",
  "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
};

/** A key written in any form this app has used, as it is written now: a physical key by its name, never by its character.
 *  An old `+` or `*` with no Shift was the keypad's; with Shift it was `=` or `8`. */
function physicalKey(key: string, shift: boolean): string {
  if (key.length === 1) {
    if (shift && LEGACY_SHIFTED[key]) return LEGACY_SHIFTED[key];
    if (LEGACY[key]) return LEGACY[key];
    if (key === "+") return "NumpadAdd";
    if (key === "*") return "NumpadMultiply";
    return key;
  }
  if (key.toLowerCase() === "return") return "Enter";
  return PHYSICAL_BY_LOWER.get(key.toLowerCase()) ?? key;
}

/** A physical key as an accelerator names it: by the key, not by the character it types. */
export function acceleratorKey(code: string, key: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (/^F\d+$/.test(code)) return code;
  if (ARROWS[code]) return ARROWS[code];
  if (PHYSICAL.includes(code)) return code;
  if (code === "Space") return "Space";
  // A key with no name here: a letter or digit by itself, else its own name, which the host may refuse. Never a bare
  // `+` or `:`, which the accelerator's own separators make unreadable.
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return key.toUpperCase();
  return code || key;
}

/** What the keyboard layout types on each physical key, where the browser tells (`navigator.keyboard.getLayoutMap()`, Chromium
 *  only): a Spanish layout types `+` on BracketRight. Empty until it answers, and everywhere else; the US glyph shows then. */
let layoutGlyphs: ReadonlyMap<string, string> | null = null;

/** Records the layout's glyphs from a layout map (a `KeyboardLayoutMap`: physical key name to the character it types). */
export function setLayoutMap(map: { get(code: string): string | undefined } | null) {
  layoutGlyphs = map ? new Map(PUNCTUATION.flatMap((name) => { const glyph = map.get(name); return glyph && [...glyph].length === 1 ? [[name, glyph] as [string, string]] : []; })) : null;
}

/** How the key of an accelerator reads on a keycap: `M`, `-`, `Num +`; a punctuation key as the layout writes it when the
 *  browser says (`+` for a Spanish BracketRight), else as a US keyboard does. */
export function keycap(key: string): string {
  return layoutGlyphs?.get(key) ?? KEYCAPS[key] ?? key;
}

/** F1 to F24, the F-keys the app registers (a Mac has F1 to F20; the others it never sends). */
export const isFunctionKey = (key: string) => /^F([1-9]|1\d|2[0-4])$/.test(key);

/** Whether a combination may be a global shortcut: a modifier, or an F-key. A key on its own would be taken from every app. */
export function globalAllowed(accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  return parsed.single || parsed.modifiers.length > 0 || isFunctionKey(parsed.key);
}

export interface Words {
  /** Whether this is a Mac's: modifiers are symbols and sit in front of the key. */
  mac: boolean;
  space: string;
  /** "Right ⌥" from the side and the modifier's name. */
  side(side: "left" | "right", name: string): string;
}

const SYMBOLS: Record<Modifier, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const NAMES: Record<Modifier, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };

/** How the accelerator reads on this system: `⌃⌥M` on a Mac, `Ctrl+Alt+M` elsewhere; a single key as its name. `how` is
 *  the trigger of a single key. */
export function readAccelerator(accelerator: string, words: Words): { combo: string; trigger: Trigger | null; single: boolean } {
  const parsed = parseAccelerator(accelerator);
  if (parsed.single) {
    const name = parsed.lone ? words.side(parsed.side!, words.mac ? SYMBOLS[parsed.lone] : NAMES[parsed.lone]) : parsed.key;
    return { combo: name, trigger: parsed.trigger, single: true };
  }
  const key = parsed.key === "Space" ? words.space : keycap(parsed.key);
  const mods = parsed.modifiers.map((modifier) => words.mac ? SYMBOLS[modifier] : NAMES[modifier]);
  return { combo: words.mac ? mods.join("") + key : [...mods, key].join("+"), trigger: parsed.trigger, single: false };
}
