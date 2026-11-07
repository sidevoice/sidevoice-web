import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { KEYBOARD_QUERY, ShortcutsSettings, bindingOf, defaultGlobalMute, useShortcutsSection } from "./ShortcutsSettings";
import { translator } from "../../i18n/translator";
import { SHORTCUTS, binding, isDefault, resetBinding } from "../../state/shortcuts";
import { host } from "../../host";
import type { GlobalShortcut, HeadsetStatus, RecordHint, ShortcutAction, ShortcutsBridge, ShortcutsStatus } from "../../host";

/* Shortcuts, by where they work: the desktop app's global shortcuts and the headset's buttons, where it offers them; the
 * keys the room answers while it is in front, wherever there is a keyboard. All set in the one field. */

const en = translator("en");
const es = translator("es");

afterEach(() => {
  cleanup();
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  vi.restoreAllMocks();
  for (const entry of SHORTCUTS) resetBinding(entry.id);
});

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host } });
}
function mac() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15");
}
function keyboard(likely: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: likely && media === KEYBOARD_QUERY, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}

const global = (changes: Partial<GlobalShortcut> = {}): GlobalShortcut => ({ accelerator: null, label: null, state: "off", alternatives: [], voiceOver: false, ...changes });
function status(shortcuts: Partial<Record<ShortcutAction, GlobalShortcut>> = {}, extra: Partial<ShortcutsStatus> = {}): ShortcutsStatus {
  return { shortcuts: { mute: global({ accelerator: "Ctrl+Alt+Shift+M", label: "Ctrl+Alt+Shift+M", state: "on" }), holdToTalk: global(), oneTurn: global(), ...shortcuts }, permission: null, headset: null, ...extra };
}
function bridge(initial: ShortcutsStatus, extra: Partial<ShortcutsBridge> = {}) {
  let listener: ((value: ShortcutsStatus) => void) | undefined;
  const value: ShortcutsBridge = {
    get: vi.fn(async () => initial),
    set: vi.fn(async (_action: ShortcutAction, accelerator: string | null) => global({ accelerator, label: accelerator, state: accelerator ? "on" : "off" })),
    subscribe: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
    ...extra,
  };
  return { bridge: value, emit: (next: ShortcutsStatus) => listener?.(next) };
}
const fieldOf = (name: string) => screen.getByRole("button", { name: new RegExp("^" + name + ":") });
const groups = () => [...document.querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const press = (init: KeyboardEventInit & { code: string }) => fireEvent.keyDown(window, { key: init.code.startsWith("Key") ? init.code.slice(3).toLowerCase() : init.code, ...init });

test("the section shows in the desktop app and where a keyboard is likely, never on a phone", () => {
  keyboard(false);
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(false);
  keyboard(true);
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(true);
  keyboard(false);
  inApp({ shortcuts: bridge(status()).bridge });
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(true);
});

test("outside the app: only In Sidevoice, four rows (Say one thing has no key), nothing to restore", () => {
  render(<ShortcutsSettings t={en} />);
  expect(groups()).toEqual(["In Sidevoice"]);
  expect(fieldOf("Hold to talk")).toHaveAccessibleName("Hold to talk: Space");
  expect(fieldOf("Mute or unmute")).toHaveAccessibleName("Mute or unmute: Ctrl+D");
  expect(fieldOf("Skip what is playing")).toHaveAccessibleName("Skip what is playing: Ctrl+S");
  expect(fieldOf("Say one thing")).toHaveAccessibleName("Say one thing: Record shortcut");
  expect([...document.querySelectorAll(".ui-row")].map((row) => row.querySelector(".ui-row-label, .ui-row-title")?.textContent).filter(Boolean).slice(0, 4)).toEqual(["Hold to talk", "Mute or unmute", "Say one thing", "Skip what is playing"]);
  expect(screen.queryByRole("button", { name: /^Restore default/ })).toBeNull();
});

test("Say one thing in the app: recorded, kept as itself, answered by the room, cleared with the ×, and it never has a ↺", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Say one thing"));
  press({ code: "KeyJ", ctrlKey: true, shiftKey: true });
  expect(binding("oneTurn")).toEqual({ code: "KeyJ", key: "J", shift: true, mod: true });
  expect(fieldOf("Say one thing")).toHaveAccessibleName("Say one thing: Ctrl+Shift+J");
  expect(screen.queryByRole("button", { name: /^Restore default/ })).toBeNull();
  fireEvent.click(within(fieldOf("Say one thing").closest(".ui-row")!).getByRole("button", { name: "Clear" }));
  expect(binding("oneTurn")).toBeNull();
});

test("an in-app key is recorded in the field, kept in the table, and ↺ restores the default", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Mute or unmute"));
  expect(screen.getByText("Press keys…")).toBeInTheDocument();
  press({ code: "KeyK", ctrlKey: true, shiftKey: true });
  expect(binding("mute")).toEqual({ code: "KeyK", key: "K", shift: true, mod: true });
  expect(fieldOf("Mute or unmute")).toHaveAccessibleName("Mute or unmute: Ctrl+Shift+K");
  fireEvent.click(screen.getByRole("button", { name: "Restore default: Ctrl+D" }));
  expect(binding("mute")).toMatchObject({ code: "KeyD", mod: true });
  expect(screen.queryByRole("button", { name: /^Restore default/ })).toBeNull();
});

test("recording the default's own keys is a choice: kept as itself, so ↺ shows until it is restored", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Mute or unmute"));
  press({ code: "KeyD", ctrlKey: true });
  expect(isDefault("mute")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Restore default: Ctrl+D" }));
  expect(isDefault("mute")).toBe(true);
});

test("an in-app key may be a lone key, Esc cancels, the × clears, and recording blocks the room's own keys", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Skip what is playing"));
  press({ code: "Escape" });
  expect(binding("skip")).toMatchObject({ code: "KeyS" });
  fireEvent.click(fieldOf("Skip what is playing"));
  press({ code: "KeyJ" });
  expect(binding("skip")).toEqual({ code: "KeyJ", key: "J" });
  fireEvent.click(within(fieldOf("Skip what is playing").closest(".ui-row")!).getByRole("button", { name: "Clear" }));
  expect(binding("skip")).toBeNull();
  expect(fieldOf("Skip what is playing")).toHaveAccessibleName("Skip what is playing: Record shortcut");
});

test("the same combination on two in-app actions is an amber warning naming the other", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Skip what is playing"));
  press({ code: "KeyD", ctrlKey: true });
    expect(screen.getByText("Already used by Mute or unmute.")).toBeInTheDocument();
});

test("bindingOf: the system's main modifier is the shortcut's mod, any other is literal", () => {
  const key = { code: "KeyK", key: "k", alt: false, shift: false };
  expect(bindingOf({ ...key, meta: true, ctrl: false }, true)).toEqual({ code: "KeyK", key: "K", mod: true });
  expect(bindingOf({ ...key, meta: false, ctrl: true }, true)).toEqual({ code: "KeyK", key: "K", ctrl: true });
  expect(bindingOf({ ...key, meta: false, ctrl: true }, false)).toEqual({ code: "KeyK", key: "K", mod: true });
  expect(bindingOf({ ...key, meta: true, ctrl: false, alt: true }, false)).toEqual({ code: "KeyK", key: "K", alt: true, meta: true });
});

test("in the app: global shortcuts first, with the tip, then In Sidevoice; Windows defaults to Ctrl+Alt+Shift+M", async () => {
  inApp({ shortcuts: bridge(status()).bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: "Mute or unmute: Ctrl+Alt+Shift+M" });
  expect(groups()).toEqual(["Anywhere on your computer", "In Sidevoice"]);
  expect(document.querySelector(".shortcut-tip-note")).toHaveTextContent("A combination like CtrlAltM, or a single key like F9: tap it once or twice.");
  expect(document.querySelector(".shortcut-tip-note b")).toHaveTextContent("tap it once or twice");
  expect(screen.getAllByRole("button", { name: /^Hold to talk:/ })).toHaveLength(2);
  expect(defaultGlobalMute(true)).toBe("Ctrl+Alt+M");
  expect(defaultGlobalMute(false)).toBe("Ctrl+Alt+Shift+M");
});

test("a global combination is recorded and set; one without a modifier is refused under the field and recording goes on", async () => {
  const { bridge: b } = bridge(status());
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt/ });
  const field = () => screen.getAllByRole("button", { name: /^Say one thing:/ })[0];
  fireEvent.click(field());
  expect(screen.getAllByText("Press keys, or tap one").length).toBe(1);
  press({ code: "KeyK" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Add Ctrl, Alt or Shift (or use an F-key): K on its own would be taken from every app.");
  expect(b.set).not.toHaveBeenCalled();
  expect(field()).toHaveAttribute("aria-pressed", "true");
  await act(async () => { press({ code: "KeyK", ctrlKey: true, altKey: true }); });
  expect(b.set).toHaveBeenCalledExactlyOnceWith("oneTurn", "Ctrl+Alt+K");
  expect(field()).toHaveAttribute("aria-pressed", "false");
});

test("an F-key alone is allowed globally", async () => {
  const { bridge: b } = bridge(status());
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt/ });
  fireEvent.click(screen.getAllByRole("button", { name: /^Hold to talk:/ })[0]);
  await act(async () => { press({ code: "F9", key: "F9" }); });
  expect(b.set).toHaveBeenCalledWith("holdToTalk", "F9");
});

test("where the page records, a modifier on its own is ignored: recording goes on and an amber note says why", async () => {
  const { bridge: b } = bridge(status());
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt/ });
  const field = screen.getAllByRole("button", { name: /^Hold to talk:/ })[0];
  fireEvent.click(field);
  fireEvent.keyDown(window, { key: "Alt", code: "AltRight" });
  await act(async () => { fireEvent.keyUp(window, { key: "Alt", code: "AltRight" }); });
  expect(b.set).not.toHaveBeenCalled();
  expect(field).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/A key on its own like Right Shift can't be a shortcut on this computer/)).toBeInTheDocument();
  // A chord that starts with a modifier is not a lone press: no new note, and the combination is taken.
  await act(async () => { press({ code: "KeyK", ctrlKey: true, altKey: true }); });
  expect(b.set).toHaveBeenCalledWith("holdToTalk", "Ctrl+Alt+K");
  expect(screen.queryByText(/A key on its own/)).toBeNull();
});

test("where the host records natively (Fn included) the field records through it, and null is Esc", async () => {
  const record = vi.fn<(action: ShortcutAction, onHint?: (hint: RecordHint) => void) => Promise<string | null>>().mockResolvedValueOnce("Fn:hold").mockResolvedValueOnce(null);
  const { bridge: b } = bridge(status(), { record });
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt/ });
  const field = () => screen.getAllByRole("button", { name: /^Hold to talk:/ })[0];
  await act(async () => { fireEvent.click(field()); });
  expect(record).toHaveBeenCalledWith("holdToTalk", expect.any(Function));
  expect(b.set).toHaveBeenCalledWith("holdToTalk", "Fn:hold");
  expect(field()).toHaveAccessibleName("Hold to talk: Fn (hold)");
  await act(async () => { fireEvent.click(field()); });
  expect(b.set).toHaveBeenCalledTimes(1);
});

test("global mute (an older host, which reports no default): ↺ sets the system's default and the × clears it", async () => {
  const { bridge: b } = bridge(status({ mute: global({ accelerator: "Ctrl+Alt+K", label: "Ctrl+Alt+K", state: "on" }) }));
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: "Mute or unmute: Ctrl+Alt+K" });
  const row = screen.getAllByRole("button", { name: /^Mute or unmute:/ })[0].closest(".ui-row") as HTMLElement;
  await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Restore default: Ctrl+Alt+Shift+M" })); });
  expect(b.set).toHaveBeenCalledWith("mute", "Ctrl+Alt+Shift+M");
  await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Clear" })); });
  expect(b.set).toHaveBeenLastCalledWith("mute", null);
});

test("a clash the host reports is an amber warning with its alternative, one click to use it", async () => {
  const { bridge: b } = bridge(status({ mute: global({ accelerator: "Ctrl+Shift+M", label: "Ctrl+Shift+M", state: "refused", conflictWith: "Microsoft Teams", alternatives: ["Ctrl+Alt+Shift+M"] }) }));
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByText("Ctrl+Shift+M is taken: Microsoft Teams.")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use Ctrl+Alt+Shift+M" })); });
  expect(b.set).toHaveBeenCalledWith("mute", "Ctrl+Alt+Shift+M");
});

test("two of our actions on one combination, and Ctrl+Alt+letter off a Mac, are warned", async () => {
  inApp({ shortcuts: bridge(status({
    mute: global({ accelerator: "Ctrl+Alt+K", label: "Ctrl+Alt+K", state: "on" }),
    oneTurn: global({ accelerator: "Ctrl+Alt+K", label: "Ctrl+Alt+K", state: "on" }),
    holdToTalk: global({ accelerator: "Ctrl+Alt+J", label: "Ctrl+Alt+J", state: "on" }),
  })).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findAllByText(/Already used by/)).toHaveLength(2);
  expect(screen.getAllByText("Ctrl+Alt+J is AltGr+J on many keyboards and may type a character instead.")).toHaveLength(1);
});

test("on a Mac a single key asks for Input Monitoring once, and only Allow asks the host; Fn adds the Globe note", async () => {
  mac();
  const request = vi.fn(async () => status({ holdToTalk: global({ accelerator: "Fn:hold", state: "on" }) }, { permission: { kind: "inputMonitoring", state: "granted" } }));
  const { bridge: b } = bridge(status({ holdToTalk: global({ accelerator: "Fn:hold", state: "needsPermission" }) }, { permission: { kind: "inputMonitoring", state: "notAsked" } }), { request });
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  const warning = await screen.findByText(/uses a single key: macOS needs Input Monitoring/);
  expect(warning).toHaveTextContent("“Hold to talk” uses a single key: macOS needs Input Monitoring to hear it from other apps. Set the Globe key to “Do nothing” in Keyboard settings.");
  expect(request).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow" })); });
  expect(request).toHaveBeenCalledWith("inputMonitoring");
  expect(screen.queryByText(/uses a single key/)).toBeNull();
});

test("keypad operators with Cmd+Alt are different shortcuts: recorded as their keys, shown as keypad keys, and not reported as duplicates", async () => {
  mac();
  const { bridge: b } = bridge(status({
    mute: global({ accelerator: "Cmd+Alt+NumpadAdd", label: "⌘⌥Num +", state: "on" }),
    holdToTalk: global({ accelerator: "Cmd+Alt+NumpadSubtract", label: "⌘⌥Num -", state: "on" }),
    oneTurn: global({ accelerator: "Cmd+Alt+NumpadMultiply", label: "⌘⌥Num *", state: "on" }),
  }));
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: "Mute or unmute: ⌘⌥Num +" });
  expect(screen.getByRole("button", { name: "Hold to talk: ⌘⌥Num -" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Say one thing: ⌘⌥Num *" })).toBeTruthy();
  expect(document.querySelector(".shortcut-note")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Say one thing: ⌘⌥Num *" }));
  await act(async () => { press({ code: "NumpadDivide", key: "/", metaKey: true, altKey: true }); });
  expect(b.set).toHaveBeenCalledExactlyOnceWith("oneTurn", "Cmd+Alt+NumpadDivide");
});

test("headset buttons only where the host reports a headset; double press only where it can send it", async () => {
  const setHeadset = vi.fn(async () => status());
  inApp({ shortcuts: bridge(status({}, { headset: { press: "mute", doublePress: null, outsideCall: "leave" } }), { setHeadset }).bridge });
  const view = render(<ShortcutsSettings t={en} />);
  await screen.findByText("Headset buttons");
  expect(screen.getByRole("combobox", { name: "Single press" })).toHaveTextContent("Mute or unmute");
  expect(screen.queryByRole("combobox", { name: "Double press" })).toBeNull();
  view.unmount();
  inApp({ shortcuts: bridge(status({}, { headset: { press: "oneTurn", doublePress: "skip", outsideCall: "leave" } }), { setHeadset }).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Double press" })).toHaveTextContent("Skip what is playing");
  fireEvent.click(screen.getByRole("combobox", { name: "Single press" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Mute or unmute", "Say one thing", "Skip what is playing", "Nothing"]);
  expect(groups()).toContain("Headset buttons");
});

/* A phone: the host (the mobile app) reports the headset alone. The page checks no platform; it renders what is reported. */
const phone = (headset: NonNullable<ShortcutsStatus["headset"]>): ShortcutsStatus => ({ shortcuts: {}, permission: null, headset, inApp: false });

test("a host that reports only the headset shows only the headset rows, even where a keyboard is likely", async () => {
  keyboard(true);
  const setHeadset = vi.fn(async () => phone({ press: "mute", doublePress: "oneTurn", outsideCall: "leave" }));
  inApp({ shortcuts: bridge(phone({ press: "mute", doublePress: "none", outsideCall: "leave" }), { setHeadset }).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Single press" })).toHaveTextContent("Mute or unmute");
  expect(screen.getByRole("combobox", { name: "Double press" })).toHaveTextContent("Nothing");
  expect(groups()).toEqual(["Headset buttons"]);
  expect(screen.getByText(en("settings.shortcuts.descriptionHeadset"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^(Hold to talk|Mute or unmute|Say one thing|Skip what is playing):/ })).toBeNull();
  expect(document.querySelector(".shortcut-tip-note")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "Double press" }));
  await act(async () => { fireEvent.click(screen.getByRole("option", { name: "Say one thing" })); });
  expect(setHeadset).toHaveBeenCalledExactlyOnceWith({ doublePress: "oneTurn" });
});

test("the keys of the page's own wait for the host to say, and show unless it says it has none", async () => {
  keyboard(true);
  inApp({ shortcuts: bridge(status()).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(groups()).toEqual([]);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt\+Shift/ });
  expect(groups()).toEqual(["Anywhere on your computer", "In Sidevoice"]);
});

test("a global shortcut the host does not report is not offered, and the others are", async () => {
  const mute = global({ accelerator: "Ctrl+Alt+Shift+M", label: "Ctrl+Alt+Shift+M", state: "on" });
  inApp({ shortcuts: bridge({ shortcuts: { mute }, permission: null, headset: null }).bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt\+Shift/ });
  expect(groups()).toEqual(["Anywhere on your computer", "In Sidevoice"]);
  expect(within(document.querySelector(".ui-group")!).queryByRole("button", { name: /^(Hold to talk|Say one thing):/ })).toBeNull();
});

test("while the system's call holds the headset the rows stay, read-only, and say the system mutes", async () => {
  const setHeadset = vi.fn(async () => status());
  inApp({ shortcuts: bridge(phone({ press: "skip", doublePress: "oneTurn", outsideCall: "leave", managedBySystem: true }), { setHeadset }).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Single press" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Double press" })).toBeDisabled();
  expect(screen.getByText(en("settings.shortcuts.headsetSystem"))).toBeTruthy();
  expect(setHeadset).not.toHaveBeenCalled();
});

test("a host that says another choice adds a playback card says so in the headset group, and not while the system holds it", async () => {
  inApp({ shortcuts: bridge(phone({ press: "mute", doublePress: "none", outsideCall: "leave", nonDefaultAddsCard: true })).bridge });
  const view = render(<ShortcutsSettings t={en} />);
  expect(await screen.findByText(en("settings.shortcuts.headsetCard"))).toBeTruthy();
  view.unmount();
  inApp({ shortcuts: bridge(phone({ press: "mute", doublePress: "none", outsideCall: "leave", nonDefaultAddsCard: true, managedBySystem: true })).bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByText(en("settings.shortcuts.headsetSystem"));
  expect(screen.queryByText(en("settings.shortcuts.headsetCard"))).toBeNull();
});

test("an app with only the older mute shortcut shows its mute row alone", async () => {
  inApp({ muteShortcut: {
    get: async () => global({ accelerator: "Ctrl+Alt+M", label: "⌃⌥M", state: "on" }),
    set: vi.fn(async (accelerator: string | null) => global({ accelerator, label: accelerator, state: "on" })),
  } });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: "Mute or unmute: ⌃⌥M" });
  // Only the in-app rows are left of the other two.
  expect(screen.getAllByRole("button", { name: /^(Hold to talk|Say one thing):/ })).toHaveLength(2);
  expect(groups()).toEqual(["Anywhere on your computer", "In Sidevoice"]);
});

test("a change the host reports shows at once", async () => {
  const { bridge: b, emit } = bridge(status());
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt\+Shift/ });
  act(() => emit(status({ mute: global({ accelerator: "F9", label: "F9", state: "on" }) })));
  expect(screen.getByRole("button", { name: "Mute or unmute: F9" })).toBeInTheDocument();
});

test("in Spanish", async () => {
  render(<ShortcutsSettings t={es} />);
  expect(screen.getByRole("heading", { name: "Atajos" })).toBeInTheDocument();
  expect(groups()).toEqual(["En Sidevoice"]);
  expect(screen.getByRole("button", { name: "Mantener para hablar: Espacio" })).toBeInTheDocument();
  expect(es("settings.shortcuts.recording")).toBe("Pulsa teclas, o toca una");
});

test("an in-app key that AltGr or the browser would take is warned about, and kept all the same", () => {
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(fieldOf("Mute or unmute"));
  press({ code: "KeyM", ctrlKey: true, altKey: true });
  expect(binding("mute")).toMatchObject({ code: "KeyM", alt: true });
  expect(screen.getByText(/is AltGr\+M on many keyboards/)).toBeInTheDocument();
  fireEvent.click(fieldOf("Mute or unmute"));
  press({ code: "KeyW", ctrlKey: true });
  expect(binding("mute")).toMatchObject({ code: "KeyW", mod: true });
  expect(screen.getByText(/is a browser or system shortcut/)).toBeInTheDocument();
  expect(screen.queryByText(/AltGr/)).toBeNull();
});

test("a host event that arrives while get is in flight is not overwritten by the older snapshot", async () => {
  keyboard(true);
  const initial = status();
  let resolveGet: (value: ShortcutsStatus) => void = () => {};
  const { bridge: host, emit } = bridge(initial, { get: vi.fn(() => new Promise<ShortcutsStatus>((resolve) => { resolveGet = resolve; })) });
  inApp({ shortcuts: host });
  render(<ShortcutsSettings t={en} />);
  act(() => emit(status({ mute: global({ accelerator: "Ctrl+Alt+Shift+K", label: "Ctrl+Alt+Shift+K", state: "on" }) })));
  await act(async () => { resolveGet(initial); });
  expect(await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt\+Shift\+K/ })).toBeInTheDocument();
});

test("a key this system cannot register is refused under the field with its own reason, and nothing is bound in its place", async () => {
  const { bridge: b } = bridge(status(), {
    set: vi.fn(async () => { throw { key: "shortcut_unsupported", message: "This system cannot register that key" }; }),
  });
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: /^Mute or unmute: Ctrl\+Alt/ });
  fireEvent.click(screen.getAllByRole("button", { name: /^Say one thing:/ })[0]);
  await act(async () => { press({ code: "IntlBackslash", key: "<", ctrlKey: true }); });
  expect(b.set).toHaveBeenCalledExactlyOnceWith("oneTurn", "Ctrl+IntlBackslash");
  expect(await screen.findByRole("alert")).toHaveTextContent("That key can't be a global shortcut on this computer. Try another one.");
});

test("a key the host registers by the layout (Linux punctuation) is an amber warning, not a block", async () => {
  inApp({ shortcuts: bridge(status({ holdToTalk: global({ accelerator: "Ctrl+Alt+BracketRight", label: "Ctrl+Alt+BracketRight", state: "on", layoutBound: true }) })).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByText(/follows the keyboard layout on Linux/)).toBeInTheDocument();
});

test("a host that reports defaults: ↺ only off the default, says the keys, and asks the host to restore", async () => {
  mac();
  const restore = vi.fn(async () => global({ accelerator: "Ctrl+Alt+M", label: "⌃⌥M", state: "on", isDefault: true, default: "Ctrl+Alt+M" }));
  const { bridge: b } = bridge(status({
    mute: global({ accelerator: "Ctrl+Alt+K", label: "⌃⌥K", state: "on", isDefault: false, default: "Ctrl+Alt+M" }),
    holdToTalk: global({ accelerator: "F10", label: "F10", state: "on", isDefault: false, default: null }),
    oneTurn: global({ accelerator: "F11", label: "F11", state: "on", isDefault: false, default: null }),
  }), { restore });
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  const row = (await screen.findAllByRole("button", { name: /^Mute or unmute:/ }))[0].closest(".ui-row") as HTMLElement;
  // The ↺ is named for the default the host reports, with this system's keys; an action with no default has none.
  expect(screen.getAllByRole("button", { name: /^Restore default/ })).toHaveLength(1);
  await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Restore default: ⌃⌥M" })); });
  expect(restore).toHaveBeenCalledWith("mute");
  expect(b.set).not.toHaveBeenCalled();
});

test("a host that reports a key as chosen even when it equals the default shows the ↺; one on its default does not", async () => {
  const { bridge: b } = bridge(status({
    mute: global({ accelerator: "Ctrl+Alt+Shift+M", label: "Ctrl+Alt+Shift+M", state: "on", isDefault: false, default: "Ctrl+Alt+Shift+M" }),
  }));
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("button", { name: "Restore default: Ctrl+Alt+Shift+M" })).toBeInTheDocument();
  cleanup();
  inApp({ shortcuts: bridge(status({ mute: global({ accelerator: "Ctrl+Alt+Shift+M", label: "Ctrl+Alt+Shift+M", state: "on", isDefault: true, default: "Ctrl+Alt+Shift+M" }) })).bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByRole("button", { name: "Mute or unmute: Ctrl+Alt+Shift+M" });
  expect(screen.queryByRole("button", { name: /^Restore default/ })).toBeNull();
});

test("a refusal the host says is another action's names it; one the system or another app holds says another app", async () => {
  inApp({ shortcuts: bridge(status({
    oneTurn: global({ accelerator: "F9", label: "F9", state: "refused", refusal: { reason: "duplicate", action: "mute" } }),
    mute: global({ accelerator: "Ctrl+Alt+Shift+M", label: "Ctrl+Alt+Shift+M", state: "on" }),
    holdToTalk: global({ accelerator: "Ctrl+Shift+M", label: "Ctrl+Shift+M", state: "refused", refusal: { reason: "taken" } }),
  })).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByText("Already used by Mute or unmute.")).toBeInTheDocument();
  expect(screen.getByText("Ctrl+Shift+M is already used by another app.")).toBeInTheDocument();
});

test("recording through the host: a rejection is shown, the timeout as such; the Mac says about the Globe key and the left modifier while it records", async () => {
  mac();
  let hint: ((hint: RecordHint) => void) | undefined;
  const record = vi.fn<(action: ShortcutAction, onHint?: (hint: RecordHint) => void) => Promise<string | null>>()
    .mockImplementationOnce((_action, onHint) => { hint = onHint; return new Promise(() => {}); })
    .mockRejectedValueOnce({ key: "record_timeout" })
    .mockRejectedValueOnce(new Error("boom"));
  const { bridge: b } = bridge(status(), { record });
  inApp({ shortcuts: b });
  render(<ShortcutsSettings t={en} />);
  await screen.findAllByRole("button", { name: /^Mute or unmute:/ });
  const field = () => screen.getAllByRole("button", { name: /^Hold to talk:/ })[0];
  await act(async () => { fireEvent.click(field()); });
  expect(screen.getByText(/Set the Globe key to “Do nothing” in Keyboard settings first/)).toBeInTheDocument();
  act(() => hint!("leftModifier"));
  expect(screen.getByText("Only the right-hand ⌘ ⌥ ⌃ ⇧ work as a key on their own.")).toBeInTheDocument();
  cleanup();
  render(<ShortcutsSettings t={en} />);
  await screen.findAllByRole("button", { name: /^Mute or unmute:/ });
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Mute or unmute:/ })[0]); });
  expect(screen.getByText("No key was pressed. Try again.")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Say one thing:/ })[0]); });
  expect(screen.getByText("Couldn't record the key. Try again.")).toBeInTheDocument();
});

test("a phone's bridge ({ get, subscribe, setHeadset }, no set) still gives a shortcuts host, and the section shows the headset group alone", async () => {
  keyboard(false);
  const setHeadset = vi.fn(async () => phone({ press: "mute", doublePress: "none", outsideCall: "leave" }));
  const mobile = { get: vi.fn(async () => phone({ press: "mute", doublePress: "none", outsideCall: "leave" })), subscribe: vi.fn(() => () => {}), setHeadset };
  inApp({ shortcuts: mobile });
  expect(host().shortcuts).not.toBeNull();
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(true);
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Single press" })).toHaveTextContent("Mute or unmute");
  expect(groups()).toEqual(["Headset buttons"]);
});

/* Granular headset capabilities (desktop#464): the host says what each press can do (`headset.actions`), and the page draws only
 * that. An iPhone without CallKit: no double press reaches the app, and the single press is the system's mute alone. */
const EVERY = ["mute", "oneTurn", "skip", "none"] as const;

test("an iPhone that reports the single press as the system's mute alone shows it as a line, and no double press row", async () => {
  keyboard(false);
  const setHeadset = vi.fn(async () => phone({ press: "mute", doublePress: null, outsideCall: "leave", actions: { press: ["mute"] } }));
  inApp({ shortcuts: { get: vi.fn(async () => phone({ press: "mute", doublePress: null, outsideCall: "leave", actions: { press: ["mute"] } })), subscribe: vi.fn(() => () => {}), setHeadset } });
  render(<ShortcutsSettings t={en} />);
  const line = await screen.findByText("Mute or unmute");
  expect(line).toHaveClass("shortcut-fixed");
  expect(screen.getByText("Single press")).toBeTruthy();
  expect(screen.getByText(en("settings.shortcuts.headsetFixed"))).toBeTruthy();
  expect(screen.queryAllByRole("combobox")).toEqual([]);
  expect(screen.queryByText("Double press")).toBeNull();
  expect(groups()).toEqual(["Headset buttons"]);
  expect(setHeadset).not.toHaveBeenCalled();
});

test("an Android phone that reports every action keeps both rows, each with every choice", async () => {
  keyboard(false);
  const reported = phone({ press: "mute", doublePress: "none", outsideCall: "leave", actions: { press: [...EVERY], doublePress: [...EVERY] } });
  const setHeadset = vi.fn(async () => ({ ...reported, headset: { ...reported.headset!, doublePress: "oneTurn" as const } }));
  inApp({ shortcuts: { get: vi.fn(async () => reported), subscribe: vi.fn(() => () => {}), setHeadset } });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Single press" })).toHaveTextContent("Mute or unmute");
  expect(screen.getByRole("combobox", { name: "Double press" })).toHaveTextContent("Nothing");
  fireEvent.click(screen.getByRole("combobox", { name: "Double press" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Mute or unmute", "Say one thing", "Skip what is playing", "Nothing"]);
  await act(async () => { fireEvent.click(screen.getByRole("option", { name: "Say one thing" })); });
  expect(setHeadset).toHaveBeenCalledExactlyOnceWith({ doublePress: "oneTurn" });
  expect(screen.getByRole("combobox", { name: "Double press" })).toHaveTextContent("Say one thing");
  expect(document.querySelector(".shortcut-fixed")).toBeNull();
});

test("a press offers only the actions the host reports for it, in the usual order", async () => {
  keyboard(false);
  inApp({ shortcuts: bridge(phone({ press: "oneTurn", doublePress: "none", outsideCall: "leave", actions: { press: ["oneTurn", "mute"], doublePress: ["none"] } }), { setHeadset: vi.fn() }).bridge });
  render(<ShortcutsSettings t={en} />);
  fireEvent.click(await screen.findByRole("combobox", { name: "Single press" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Mute or unmute", "Say one thing"]);
  // One action: a line, not a select.
  expect(screen.queryByRole("combobox", { name: "Double press" })).toBeNull();
  expect(document.querySelector(".shortcut-fixed[data-press=doublePress]")).toHaveTextContent("Nothing");
});

test("the desktop app's headset, which reports no actions, is drawn as before: two selects with every choice", async () => {
  inApp({ shortcuts: bridge(status({}, { headset: { press: "mute", doublePress: "skip", outsideCall: "leave" } }), { setHeadset: vi.fn() }).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("combobox", { name: "Double press" })).toHaveTextContent("Skip what is playing");
  fireEvent.click(screen.getByRole("combobox", { name: "Single press" }));
  expect(screen.getAllByRole("option")).toHaveLength(4);
  expect(document.querySelector(".shortcut-fixed")).toBeNull();
});

/* desktop#464: the double press set, another setting changed, and it read Nothing. Settings is one form; a reset of it (or the
 * hidden select Radix keeps there) put back the value the row was drawn with. Only the person's pick reaches the host. */
test("in Settings' form, the headset's choice is written only when the person picks it, never back by the form", async () => {
  keyboard(false);
  let kept: HeadsetStatus = { press: "mute", doublePress: "none", outsideCall: "leave" };
  const setHeadset = vi.fn(async (change: Partial<HeadsetStatus>) => { kept = { ...kept, ...change }; return phone(kept); });
  inApp({ shortcuts: { get: vi.fn(async () => phone(kept)), subscribe: vi.fn(() => () => {}), setHeadset } });
  render(<form id="language-form"><ShortcutsSettings t={en} /></form>);
  fireEvent.click(await screen.findByRole("combobox", { name: "Double press" }));
  await act(async () => { fireEvent.click(screen.getByRole("option", { name: "Say one thing" })); });
  await act(async () => { (document.getElementById("language-form") as HTMLFormElement).reset(); });
  expect(setHeadset.mock.calls).toEqual([[{ doublePress: "oneTurn" }]]);
  expect(kept.doublePress).toBe("oneTurn");
  expect(screen.getByRole("combobox", { name: "Double press" })).toHaveTextContent("Say one thing");
});

/* N6 (follow-up of web#532): a host that can read global shortcuts but not set them has no editable global rows. */
test("a get-only host that reports a global shortcut gets no global rows: nothing there could set it", async () => {
  keyboard(true);
  const getOnly = { get: vi.fn(async () => status({}, { headset: { press: "mute", doublePress: "none", outsideCall: "leave" } })), subscribe: vi.fn(() => () => {}) };
  inApp({ shortcuts: getOnly });
  render(<ShortcutsSettings t={en} />);
  await screen.findByText("Headset buttons");
  expect(groups()).toEqual(["Headset buttons", "In Sidevoice"]);
  expect(screen.queryByText("Anywhere on your computer")).toBeNull();
  expect(document.querySelector(".shortcut-tip-note")).toBeNull();
  // The in-app keys are the page's own and still record; the host's mute shortcut has no field.
  expect(screen.getAllByRole("button", { name: /^Mute or unmute:/ })).toHaveLength(1);
});
