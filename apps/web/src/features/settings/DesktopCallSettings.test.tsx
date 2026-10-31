import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DesktopCallSettings } from "./DesktopCallSettings";
import { translator } from "../../i18n/translator";
import type { CallControlsBridge } from "../../host";

const en = translator("en");
const es = translator("es");

afterEach(() => { delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; });

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host } });
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

test("outside the app, or in an app without the call controls' setting, Call has no Desktop app group", () => {
  const outside = render(<DesktopCallSettings t={en} />);
  expect(outside.container).toBeEmptyDOMElement();
  outside.unmount();
  inApp({ localHost: {}, callControls: {} });
  const older = render(<DesktopCallSettings t={en} />);
  expect(older.container).toBeEmptyDOMElement();
});

test("the mute shortcut is not in Call any more: an app offering only that has no Desktop app group here (it is in Shortcuts)", () => {
  inApp({ muteShortcut: { get: vi.fn(), set: vi.fn() } });
  const view = render(<DesktopCallSettings t={en} />);
  expect(view.container).toBeEmptyDOMElement();
});

test("the call controls row, with no group of its own and no shortcut beside it", async () => {
  inApp({ callControls: controlsBridge(true), muteShortcut: { get: vi.fn(), set: vi.fn() } });
  render(<DesktopCallSettings t={en} />);
  expect(screen.queryByText("Desktop app")).toBeNull();
  expect(await screen.findByRole("switch", { name: "Always show the call controls" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("Mute shortcut")).toBeNull();
  expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
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

test("in Spanish", async () => {
  inApp({ callControls: controlsBridge() });
  render(<DesktopCallSettings t={es} />);
  expect(await screen.findByRole("switch", { name: "Mostrar siempre los controles de llamada" })).toBeInTheDocument();
});
