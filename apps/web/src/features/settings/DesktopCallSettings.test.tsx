import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopCallSettings, acceleratorOf } from "./DesktopCallSettings";
import { translator } from "../../i18n/translator";
import type { CallControlsBridge, MuteShortcut, MuteShortcutBridge } from "../../services/desktop-host";

const en = translator("en");
const es = translator("es");

afterEach(() => { delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; });

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host } });
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

function controlsBridge(alwaysShown = false, fail = false) {
  return {
    settings: vi.fn(async () => ({ alwaysShown })),
    setAlwaysShown: vi.fn(async (enabled: boolean) => {
      if (fail) throw new Error("nope");
      return { alwaysShown: enabled };
    }),
  } satisfies CallControlsBridge;
}

const change = () => screen.getByRole("button", { name: "Change" });

test("outside the app, or in an app with neither bridge, there is no Desktop app group", () => {
  const outside = render(<DesktopCallSettings t={en} />);
  expect(outside.container).toBeEmptyDOMElement();
  outside.unmount();
  inApp({ localHost: {} , muteShortcut: { get: () => null }, callControls: {} });
  const older = render(<DesktopCallSettings t={en} />);
  expect(older.container).toBeEmptyDOMElement();
});

test("only the mute shortcut row when the app offers only that", async () => {
  inApp({ muteShortcut: muteBridge().bridge });
  render(<DesktopCallSettings t={en} />);
  expect(screen.getByText("Desktop app")).toBeInTheDocument();
  expect(await screen.findByText("⇧⌘M")).toBeInTheDocument();
  expect(screen.getByText("Mute shortcut")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).toBeNull();
});

test("only the call controls row when the app offers only that", async () => {
  inApp({ callControls: controlsBridge(true) });
  render(<DesktopCallSettings t={en} />);
  expect(await screen.findByRole("switch", { name: "Always show the call controls" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("Mute shortcut")).toBeNull();
  expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
});

test("with no shortcut set it says Not set, and offers no Clear", async () => {
  const { bridge } = muteBridge(shortcut({ accelerator: null, label: null, state: "off" }));
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
  await waitFor(() => expect(bridge.get).toHaveBeenCalled());
  expect(await screen.findByText("Not set")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

test("Change records the next combination: Cmd+Shift+M sets it, a key alone is ignored", async () => {
  const { bridge } = muteBridge(shortcut({ accelerator: null, label: null, state: "off" }));
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
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
  expect(screen.getByText("Cmd+Shift+M")).toBeInTheDocument();
});

test("Escape stops recording without changing the shortcut", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
  await screen.findByText("⇧⌘M");
  fireEvent.click(change());
  fireEvent.keyDown(screen.getByRole("button", { name: "Recording — Esc to stop" }), { key: "Escape" });
  expect(change()).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("⇧⌘M")).toBeInTheDocument();
  expect(bridge.set).not.toHaveBeenCalled();
});

test("keys pressed while not recording change nothing", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
  await screen.findByText("⇧⌘M");
  fireEvent.keyDown(change(), { key: "k", metaKey: true });
  expect(bridge.set).not.toHaveBeenCalled();
});

test("Clear sets no shortcut", async () => {
  const { bridge } = muteBridge();
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
  await screen.findByText("⇧⌘M");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });
  expect(bridge.set).toHaveBeenCalledExactlyOnceWith(null);
  expect(screen.getByText("Not set")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

test("a refused shortcut says so and offers the alternatives, each of which sets it", async () => {
  const { bridge } = muteBridge(shortcut({ state: "refused", alternatives: ["Cmd+Alt+M", "Ctrl+Shift+M"] }));
  inApp({ muteShortcut: bridge });
  render(<DesktopCallSettings t={en} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Another app already uses this shortcut.");
  const group = screen.getByRole("group", { name: "Shortcuts you can use" });
  expect([...group.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Cmd+Alt+M", "Ctrl+Shift+M"]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ctrl+Shift+M" })); });
  expect(bridge.set).toHaveBeenCalledExactlyOnceWith("Ctrl+Shift+M");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a shortcut that clashes with VoiceOver carries a note", async () => {
  inApp({ muteShortcut: muteBridge(shortcut({ voiceOver: true })).bridge });
  render(<DesktopCallSettings t={en} />);
  expect(await screen.findByText(/also a VoiceOver command/)).toBeInTheDocument();
});

test("a combination the app can't register says so; any other failure says it couldn't", async () => {
  for (const [failure, copy] of [[{ key: "shortcut_invalid" }, "That combination can't be a shortcut."], [new Error("boom"), "Couldn't set the shortcut."]] as const) {
    const { bridge } = muteBridge(shortcut(), failure);
    inApp({ muteShortcut: bridge });
    const view = render(<DesktopCallSettings t={en} />);
    await screen.findByText("⇧⌘M");
    fireEvent.click(change());
    await act(async () => { fireEvent.keyDown(screen.getByRole("button", { name: "Recording — Esc to stop" }), { key: "F13", ctrlKey: true }); });
    expect(bridge.set).toHaveBeenCalledWith("Ctrl+F13");
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByText("⇧⌘M")).toBeInTheDocument();
    view.unmount();
  }
});

test("a change the app reports shows at once, and unmounting stops listening", async () => {
  const { bridge, emit } = muteBridge();
  inApp({ muteShortcut: bridge });
  const view = render(<DesktopCallSettings t={en} />);
  await screen.findByText("⇧⌘M");
  act(() => emit(shortcut({ accelerator: "Ctrl+Alt+K", label: "⌃⌥K", state: "refused", alternatives: [] })));
  expect(screen.getByText("⌃⌥K")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Another app already uses this shortcut.");
  expect(screen.queryByRole("group", { name: "Shortcuts you can use" })).toBeNull();
  view.unmount();
  expect(() => emit(shortcut())).not.toThrow();
});

test("the always-shown switch reads the app's setting, sets it, and reverts and says so when that fails", async () => {
  const ok = controlsBridge(false);
  inApp({ callControls: ok });
  const view = render(<DesktopCallSettings t={en} />);
  const toggle = await screen.findByRole("switch", { name: "Always show the call controls" });
  expect(ok.settings).toHaveBeenCalledOnce();
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText(/they show only while the Sidevoice window is minimised/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(toggle); });
  expect(ok.setAlwaysShown).toHaveBeenCalledExactlyOnceWith(true);
  expect(toggle).toHaveAttribute("aria-checked", "true");
  view.unmount();

  const failing = controlsBridge(true, true);
  inApp({ callControls: failing });
  render(<DesktopCallSettings t={en} />);
  const again = await screen.findByRole("switch", { name: "Always show the call controls" });
  expect(again).toHaveAttribute("aria-checked", "true");
  await act(async () => { fireEvent.click(again); });
  expect(failing.setAlwaysShown).toHaveBeenCalledExactlyOnceWith(false);
  expect(again).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't change it. Try again.");
  expect(screen.queryByText(/they show only while the Sidevoice window is minimised/)).toBeNull();
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
  inApp({ muteShortcut: muteBridge(shortcut({ accelerator: null, label: null, state: "off" })).bridge, callControls: controlsBridge() });
  render(<DesktopCallSettings t={es} />);
  expect(screen.getByText("Aplicación de escritorio")).toBeInTheDocument();
  expect(await screen.findByText("Sin atajo")).toBeInTheDocument();
  expect(await screen.findByRole("switch", { name: "Mostrar siempre los controles de llamada" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  expect(screen.getByRole("button", { name: "Grabando — Esc para parar" })).toBeInTheDocument();
  expect(es("settings.desktop.shortcutInvalid")).toBe("Esa combinación no puede ser un atajo. Prueba con una tecla modificadora y una letra.");
  expect(es("settings.desktop.shortcutRefused")).toBe("Otra aplicación ya usa este atajo. Elige uno de estos o graba otro.");
});
