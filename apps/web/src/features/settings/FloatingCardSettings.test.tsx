import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloatingCardSettings } from "./FloatingCardSettings";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { translator } from "../../i18n/translator";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; localStorage.clear(); });

function inApp(callControls: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { callControls } } });
}
const base = () => ({
  settings: vi.fn(async () => ({ alwaysShown: false })),
  setAlwaysShown: vi.fn(async (alwaysShown: boolean) => ({ alwaysShown })),
});

test("a starting size drops the custom size, then every change previews the card", async () => {
  const bridge = { ...base(), clearSize: vi.fn(async () => undefined), preview: vi.fn() };
  inApp(bridge);
  render(<RoomProvider store={createRoomStore()}><FloatingCardSettings t={translator("en")} /></RoomProvider>);
  fireEvent.click(screen.getByRole("radio", { name: "Large" }));
  await waitFor(() => expect(bridge.preview).toHaveBeenCalledTimes(1));
  expect(bridge.clearSize).toHaveBeenCalledTimes(1);
  fireEvent.click(await screen.findByRole("switch"));
  await waitFor(() => expect(bridge.preview).toHaveBeenCalledTimes(2));
});

test("an app without clearSize or preview still takes a starting size", async () => {
  inApp(base());
  render(<RoomProvider store={createRoomStore()}><FloatingCardSettings t={translator("en")} /></RoomProvider>);
  fireEvent.click(screen.getByRole("radio", { name: "Small" }));
  expect(JSON.parse(localStorage.getItem("sidevoice.floatingCard")!).size).toBe("s");
});

test("the first row turns the card off: the rest stays in view, disabled, and nothing previews", async () => {
  const bridge = { ...base(), settings: vi.fn(async () => ({ alwaysShown: false, enabled: true })), setEnabled: vi.fn(async (enabled: boolean) => ({ enabled })),
    setCorner: vi.fn(), resetPlace: vi.fn(), preview: vi.fn() };
  inApp(bridge);
  render(<RoomProvider store={createRoomStore()}><FloatingCardSettings t={translator("en")} /></RoomProvider>);
  const master = await screen.findByRole("switch", { name: "Show the floating card" });
  expect(master).toBeChecked();
  expect(screen.getByRole("radio", { name: /Card/ })).toBeEnabled();
  fireEvent.click(master);
  await waitFor(() => expect(bridge.setEnabled).toHaveBeenCalledWith(false));
  await waitFor(() => expect(screen.getByRole("radio", { name: /Picture in picture/ })).toBeDisabled());
  expect(screen.getByRole("radio", { name: "Large" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Top left" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Always show the call controls" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset size and position" })).toBeDisabled();
  expect(screen.getByText(/No card during calls/)).toBeInTheDocument();
  expect(bridge.preview).not.toHaveBeenCalled();
});
