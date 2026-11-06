import { expect, test } from "vitest";
import { acceleratorKey, canonical, composeAccelerator, keycap, parseAccelerator, readAccelerator, sameAccelerator, setLayoutMap, type Words } from "./accelerators";

/* A key is named by the physical key, not by the character it types: a keypad `+` is `NumpadAdd` and never a bare `+`
 * (the accelerator's own separator), whatever the layout. */

const OPERATORS = [
  { code: "NumpadAdd", key: "+", name: "NumpadAdd", cap: "Num +" },
  { code: "NumpadSubtract", key: "-", name: "NumpadSubtract", cap: "Num -" },
  { code: "NumpadMultiply", key: "*", name: "NumpadMultiply", cap: "Num *" },
  { code: "NumpadDivide", key: "/", name: "NumpadDivide", cap: "Num /" },
];
const mac: Words = { mac: true, space: "Space", side: (side, name) => `${side} ${name}` };
const windows: Words = { mac: false, space: "Space", side: (side, name) => `${side} ${name}` };
const recorded = (code: string, key: string) => composeAccelerator({ meta: true, alt: true }, acceleratorKey(code, key));

test("the four keypad operators with Cmd+Alt are four accelerators, each reading back as its key", () => {
  const accelerators = OPERATORS.map(({ code, key }) => recorded(code, key));
  expect(accelerators).toEqual(OPERATORS.map(({ name }) => `Cmd+Alt+${name}`));
  expect(new Set(accelerators.map(canonical)).size).toBe(4);
  for (const [i, { name, cap }] of OPERATORS.entries()) {
    const parsed = parseAccelerator(accelerators[i]);
    expect(parsed).toMatchObject({ key: name, modifiers: ["alt", "meta"], single: false });
    expect(readAccelerator(accelerators[i], mac).combo).toBe(`⌥⌘${cap}`);
    expect(readAccelerator(accelerators[i], windows).combo).toBe(`Alt+Win+${cap}`);
    for (const other of accelerators) expect(sameAccelerator(accelerators[i], other)).toBe(other === accelerators[i]);
  }
});

test("a keypad key and the main-row key with the same character are two keys", () => {
  expect(recorded("NumpadSubtract", "-")).not.toBe(recorded("Minus", "-"));
  expect(recorded("Minus", "-")).toBe("Cmd+Alt+Minus");
  expect(recorded("Slash", "/")).toBe("Cmd+Alt+Slash");
  expect(acceleratorKey("Numpad7", "7")).toBe("Numpad7");
  expect(acceleratorKey("NumpadEnter", "Enter")).toBe("NumpadEnter");
  expect(acceleratorKey("Digit7", "7")).toBe("7");
});

test("main-row punctuation is named by the physical key on any layout", () => {
  // Spanish layout: `+` sits on BracketRight; the key is BracketRight whatever it types.
  expect(acceleratorKey("BracketRight", "+")).toBe("BracketRight");
  expect(acceleratorKey("Equal", "¡")).toBe("Equal");
  expect(acceleratorKey("Semicolon", "ñ")).toBe("Semicolon");
  expect(readAccelerator("Ctrl+Alt+BracketRight", windows).combo).toBe("Ctrl+Alt+]");
  // Never a bare `+` or `:` for a key the table does not know.
  expect(acceleratorKey("IntlBackslash", "+")).toBe("IntlBackslash");
  expect(acceleratorKey("IntlBackslash", ":")).toBe("IntlBackslash");
});

test("accelerators saved before keep working: the old forms read as the same keys", () => {
  for (const [old, now] of [
    ["Cmd+Alt+-", "Cmd+Alt+Minus"], ["Cmd+Alt+/", "Cmd+Alt+Slash"], ["Ctrl+;", "Ctrl+Semicolon"], ["Ctrl+Alt+[", "Ctrl+Alt+BracketLeft"],
    ["Cmd+Alt++", "Cmd+Alt+NumpadAdd"], ["Cmd+Alt+*", "Cmd+Alt+NumpadMultiply"],
    ["Cmd+Shift++", "Cmd+Shift+Equal"], ["Ctrl+Shift+?", "Ctrl+Shift+Slash"], ["Ctrl+Shift+*", "Ctrl+Shift+8"],
    ["Ctrl+Alt+Return", "Ctrl+Alt+Enter"], ["cmd+alt+numpadadd", "Cmd+Alt+NumpadAdd"],
  ]) {
    expect(sameAccelerator(old, now), old).toBe(true);
    expect(parseAccelerator(old).key, old).toBe(parseAccelerator(now).key);
  }
  expect(sameAccelerator("Cmd+Alt+-", "Cmd+Alt+NumpadSubtract")).toBe(false);
});

test("the ISO key (the extra <> key beside the left Shift) is a physical key on its own, in any case, and reads as its glyph", () => {
  expect(acceleratorKey("IntlBackslash", "<")).toBe("IntlBackslash");
  expect(recorded("IntlBackslash", "<")).toBe("Cmd+Alt+IntlBackslash");
  expect(parseAccelerator("cmd+alt+intlbackslash").key).toBe("IntlBackslash");
  expect(sameAccelerator("Cmd+Alt+intlbackslash", "Cmd+Alt+IntlBackslash")).toBe(true);
  expect(sameAccelerator("Cmd+Alt+IntlBackslash", "Cmd+Alt+Comma")).toBe(false);
  expect(readAccelerator("Ctrl+IntlBackslash", windows).combo).toBe("Ctrl+<");
});

test("a keycap shows what the layout types on the key where the browser says, and the US glyph where it does not", () => {
  const spanish = new Map([["BracketRight", "+"], ["Semicolon", "ñ"], ["IntlBackslash", "<"], ["Minus", "'"], ["KeyA", "a"], ["Quote", ""]]);
  try {
    setLayoutMap(spanish);
    expect(readAccelerator("Ctrl+Alt+BracketRight", windows).combo).toBe("Ctrl+Alt++");
    expect(readAccelerator("Ctrl+Semicolon", windows).combo).toBe("Ctrl+ñ");
    expect(readAccelerator("Ctrl+Minus", windows).combo).toBe("Ctrl+'");
    // Not in the map, or empty: the US glyph. The keypad is never the layout's.
    expect(readAccelerator("Ctrl+Quote", windows).combo).toBe("Ctrl+'");
    expect(readAccelerator("Ctrl+BracketLeft", windows).combo).toBe("Ctrl+[");
    expect(readAccelerator("Ctrl+NumpadAdd", windows).combo).toBe("Ctrl+Num +");
    expect(keycap("KeyA")).toBe("KeyA");
  } finally {
    setLayoutMap(null);
  }
  expect(readAccelerator("Ctrl+Alt+BracketRight", windows).combo).toBe("Ctrl+Alt+]");
});
