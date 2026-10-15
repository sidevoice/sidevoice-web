import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { KEYBOARD_QUERY, ShortcutsSettings, acceleratorOf, useShortcutsSection } from "./ShortcutsSettings";
import { translator } from "../../i18n/translator";
import type { MuteShortcut, MuteShortcutBridge } from "../../services/desktop-host";

/* Shortcuts, by where they work: the desktop app's global mute shortcut, set by pressing it; the keys the room answers
 * while it is in front, listed read only; the section only where one of them can be pressed. */

const en = translator("en");
const es = translator("es");

afterEach(() => {
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  vi.restoreAllMocks();
});

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host } });
}

/** A device with a mouse or a trackpad (a keyboard all but certain), or a phone's touch alone. */
function keyboard(likely: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: likely && media === KEYBOARD_QUERY, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}

const shortcut = (changes: Partial<MuteShortcut> = {}): MuteShortcut => ({
  accelerator: "Cmd+Shift+M", label: "⇧⌘M", state: "on", alternatives: [], voiceOver: false, ...changes,
});

/** A mute shortcut bridge holding `initial`; `set` answers with the accelerator set, or rejects with `failure`. */
function muteBridge(initial = shortcut(), failure?: unknown) {
  let listener: ((value: MuteShortcut) => void) | undefined;
  const bridge = {
    get: vi.fn(async () => initial),
    set: vi.fn(async (accelerator: string | null) => {
      if (failure !== undefined) throw failure;
      return shortcut({ accelerator, label: accelerator, state: accelerator ? "on" : "off" });
    }),
    subscribe: vi.fn((next: (value: MuteShortcut) => void) => { listener = next; return () => { listener = undefined; }; }),
  } satisfies MuteShortcutBridge;
  return { bridge, emit: (value: MuteShortcut) => listener?.(value) };
}

const change = () => screen.getByRole("button", { name: "Change" });
const groups = () => [...document.querySelectorAll(".ui-group-title")].map((title) => title.textContent);
/** The room's keys as listed (the last group): each row's label and its key caps, read as the combination by their label. */
const pageKeys = () => [...[...document.querySelectorAll(".ui-group")].at(-1)!.querySelectorAll(".ui-row")].filter((row) => row.querySelector(".shortcut-keys"))
  .map((row) => [row.querySelector(".ui-row-label")!.textContent, row.querySelector(".shortcut-keys")!.getAttribute("aria-label")]);

test("Shortcuts shows in the desktop app where it offers the mute shortcut, or wherever a keyboard is likely; never on a phone", () => {
  keyboard(false);
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(false);
  // A bridge without the mute shortcut (an app before it) is no reason.
  inApp({ muteShortcut: { get: () => null } });
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(false);
  inApp({ muteShortcut: muteBridge().bridge });
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(true);
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  keyboard(true);
  expect(renderHook(() => useShortcutsSection()).result.current).toBe(true);
});

test("outside the app: only the keys the room answers while it is in front, read only; Ctrl+D off a Mac", () => {
  render(<ShortcutsSettings t={en} />);
  expect(screen.getByRole("heading", { name: "Shortcuts" })).toBeInTheDocument();
  expect(screen.getByText("Keys for the call: the microphone, skipping, taking back what you said, the call itself and its panels.")).toBeInTheDocument();
  expect(groups()).toEqual(["While Sidevoice is in front"]);
  expect(pageKeys()).toEqual([["Mute or unmute the microphone","Ctrl+D"], ["Talk while muted","Space"], ["Skip what is playing","S"], ["Cancel what you said","Ctrl+Z"], ["Join or leave the call","Ctrl+Shift+E"], ["Show or hide the transcript","T"], ["Show or hide the conversations","C"]]);
  expect(screen.getByText("Hold the key down during a call; let go and the microphone mutes again.")).toBeInTheDocument();
  // Nothing to set: no control at all.
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText("Mute shortcut")).toBeNull();
});

test("on a Mac the mute key reads ⌘D", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15");
  render(<ShortcutsSettings t={en} />);
  expect(pageKeys()).toEqual([["Mute or unmute the microphone","⌘D"], ["Talk while muted","Space"], ["Skip what is playing","S"], ["Cancel what you said","⌘Z"], ["Join or leave the call","⇧⌘E"], ["Show or hide the transcript","T"], ["Show or hide the conversations","C"]]);
});

test("in the app: its global mute shortcut first, anywhere on this computer; then the room's keys", async () => {
  inApp({ muteShortcut: muteBridge().bridge });
  render(<ShortcutsSettings t={en} />);
  expect(groups()).toEqual(["Anywhere on this computer", "While Sidevoice is in front"]);
  const global = document.querySelectorAll(".ui-group")[0] as HTMLElement;
  expect(await within(global).findByLabelText("⇧⌘M")).toBeInTheDocument();
  expect(within(global).getByText("Mute shortcut")).toBeInTheDocument();
  expect(within(global).getByText("Mutes or unmutes the microphone from anywhere, even with Sidevoice in the background.")).toBeInTheDocument();
  expect(pageKeys()).toEqual([["Mute or unmute the microphone","Ctrl+D"], ["Talk while muted","Space"], ["Skip what is playing","S"], ["Cancel what you said","Ctrl+Z"], ["Join or leave the call","Ctrl+Shift+E"], ["Show or hide the transcript","T"], ["Show or hide the conversations","C"]]);
  // Only the call controls' setting stays in Call: no switch here.
  expect(screen.queryByRole("switch")).toBeNull();
});

test("an app without the mute shortcut (before it, or a broken bridge) lists only the room's keys", () => {
  inApp({ muteShortcut: { get: () => null }, callControls: {} });
  render(<ShortcutsSettings t={en} />);
  expect(groups()).toEqual(["While Sidevoice is in front"]);
});

test("with no shortcut set it says Not set, and offers no Clear", async () => {
  const { bridge } = muteBridge(shortcut({ accelerator: null, label: null, state: "off" }));
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  await waitFor(() => expect(bridge.get).toHaveBeenCalled());
  expect(await screen.findByText("Not set")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

test("Change records the next combination: Cmd+Shift+M sets it, a key alone is ignored", async () => {
  const { bridge } = muteBridge(shortcut({ accelerator: null, label: null, state: "off" }));
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByText("Not set");
  fireEvent.click(change());
  const recording = screen.getByRole("button", { name: "Recording — Esc to stop" });
  expect(recording).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Press the keys…")).toBeInTheDocument();
  fireEvent.keyDown(recording, { key: "m" });
  fireEvent.keyDown(recording, { key: "Shift", shiftKey: true });
  expect(bridge.set).not.toHaveBeenCalled();
  expect(recording).toHaveAttribute("aria-pressed", "true");
  await act(async () => { fireEvent.keyDown(recording, { key: "m", metaKey: true, shiftKey: true }); });
  expect(bridge.set).toHaveBeenCalledExactlyOnceWith("Cmd+Shift+M");
  expect(screen.getByRole("button", { name: "Change" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("Cmd+Shift+M")).toBeInTheDocument();
});

test("Escape stops recording without changing the shortcut", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByLabelText("⇧⌘M");
  fireEvent.click(change());
  fireEvent.keyDown(screen.getByRole("button", { name: "Recording — Esc to stop" }), { key: "Escape" });
  expect(change()).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("⇧⌘M")).toBeInTheDocument();
  expect(bridge.set).not.toHaveBeenCalled();
});

test("keys pressed while not recording change nothing", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByLabelText("⇧⌘M");
  fireEvent.keyDown(change(), { key: "k", metaKey: true });
  expect(bridge.set).not.toHaveBeenCalled();
});

test("Clear sets no shortcut", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  await screen.findByLabelText("⇧⌘M");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });
  expect(bridge.set).toHaveBeenCalledExactlyOnceWith(null);
  expect(screen.getByText("Not set")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

test("a refused shortcut says so and offers the alternatives, each of which sets it", async () => {
  const { bridge } = muteBridge(shortcut({ state: "refused", alternatives: ["Cmd+Alt+M", "Ctrl+Shift+M"] }));
  inApp({ muteShortcut: bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Another app already uses this shortcut.");
  const group = screen.getByRole("group", { name: "Shortcuts you can use" });
  expect([...group.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Cmd+Alt+M", "Ctrl+Shift+M"]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ctrl+Shift+M" })); });
  expect(bridge.set).toHaveBeenCalledExactlyOnceWith("Ctrl+Shift+M");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a shortcut that clashes with VoiceOver carries a note", async () => {
  inApp({ muteShortcut: muteBridge(shortcut({ voiceOver: true })).bridge });
  render(<ShortcutsSettings t={en} />);
  expect(await screen.findByText(/also a VoiceOver command/)).toBeInTheDocument();
});

test("a combination the app can't register says so; any other failure says it couldn't", async () => {
  for (const [failure, copy] of [[{ key: "shortcut_invalid" }, "That combination can't be a shortcut."], [new Error("boom"), "Couldn't set the shortcut."]] as const) {
    const { bridge } = muteBridge(shortcut(), failure);
    inApp({ muteShortcut: bridge });
    const view = render(<ShortcutsSettings t={en} />);
    await screen.findByLabelText("⇧⌘M");
    fireEvent.click(change());
    await act(async () => { fireEvent.keyDown(screen.getByRole("button", { name: "Recording — Esc to stop" }), { key: "F13", ctrlKey: true }); });
    expect(bridge.set).toHaveBeenCalledWith("Ctrl+F13");
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByLabelText("⇧⌘M")).toBeInTheDocument();
    view.unmount();
  }
});

test("a change the app reports shows at once, and unmounting stops listening", async () => {
  const { bridge, emit } = muteBridge();
  inApp({ muteShortcut: bridge });
  const view = render(<ShortcutsSettings t={en} />);
  await screen.findByLabelText("⇧⌘M");
  act(() => emit(shortcut({ accelerator: "Ctrl+Alt+K", label: "⌃⌥K", state: "refused", alternatives: [] })));
  expect(screen.getByLabelText("⌃⌥K")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Another app already uses this shortcut.");
  expect(screen.queryByRole("group", { name: "Shortcuts you can use" })).toBeNull();
  view.unmount();
  expect(() => emit(shortcut())).not.toThrow();
});

test("acceleratorOf: modifiers in order and the key, or nothing without a modifier", () => {
  const press = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) =>
    acceleratorOf({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  expect(press("m", { metaKey: true, shiftKey: true })).toBe("Cmd+Shift+M");
  expect(press("k", { shiftKey: true, altKey: true, ctrlKey: true, metaKey: true })).toBe("Cmd+Ctrl+Alt+Shift+K");
  expect(press(" ", { ctrlKey: true })).toBe("Ctrl+Space");
  expect(press("F5", { altKey: true })).toBe("Alt+F5");
  expect(press("m")).toBeNull();
  expect(press("F5")).toBeNull();
  for (const key of ["Meta", "Control", "Alt", "Shift", "Escape", "Tab"]) expect(press(key, { metaKey: true, shiftKey: true })).toBeNull();
});

test("in Spanish", async () => {
  inApp({ muteShortcut: muteBridge(shortcut({ accelerator: null, label: null, state: "off" })).bridge });
  render(<ShortcutsSettings t={es} />);
  expect(screen.getByRole("heading", { name: "Atajos" })).toBeInTheDocument();
  expect(groups()).toEqual(["En cualquier parte del ordenador", "Con Sidevoice en primer plano"]);
  expect(pageKeys()).toEqual([["Silenciar o activar el micrófono","Ctrl+D"], ["Hablar estando silenciado","Espacio"], ["Saltar lo que está sonando","S"], ["Cancelar lo que has dicho","Ctrl+Z"], ["Entrar en la llamada o salir de ella","Ctrl+Shift+E"], ["Mostrar u ocultar la transcripción","T"], ["Mostrar u ocultar las conversaciones","C"]]);
  expect(await screen.findByText("Sin atajo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  expect(screen.getByRole("button", { name: "Grabando — Esc para parar" })).toBeInTheDocument();
  expect(es("settings.desktop.shortcutInvalid")).toBe("Esa combinación no puede ser un atajo. Prueba con una tecla modificadora y una letra.");
  expect(es("settings.desktop.shortcutRefused")).toBe("Otra aplicación ya usa este atajo. Elige uno de estos o graba otro.");
});
