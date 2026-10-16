import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DangerZone, ResetReportNotice } from "./DangerZone";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { setUiLanguage } from "../../i18n/translator";

afterEach(() => { cleanup(); Reflect.deleteProperty(window, "__sidevoiceDesktop"); });

function bridge(result: unknown = null, { uninstall = false } = {}) {
  const data = {
    pairings: { read: vi.fn(async () => ({ pairings: [] })), write: vi.fn(async () => {}) },
    deleteAll: vi.fn(async () => ({ state: "needs-restart", service: "removed", agents: {}, failed: [], pending: ["app-data"] })),
    resetReport: vi.fn(async () => result),
    ...(uninstall ? { uninstall: vi.fn(async () => ({ state: "needs-quit", service: "removed", agents: {}, failed: [], pending: ["app-data", "app"] })) } : {}),
  };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { data } } });
  return data as typeof data & { uninstall: ReturnType<typeof vi.fn> };
}

function show() { return render(<RoomProvider runtime={false}><DangerZone /></RoomProvider>); }

test("the Danger zone is absent in a browser", () => {
  const { container } = show();
  expect(container).toBeEmptyDOMElement();
});

test("the Danger zone shows only Delete where the app has no uninstall", () => {
  bridge();
  show();
  expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete all Sidevoice data" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Uninstall Sidevoice" })).not.toBeInTheDocument();
});

test("the Danger zone shows Uninstall where the app offers it", () => {
  bridge(null, { uninstall: true });
  show();
  expect(screen.getByRole("button", { name: "Delete all Sidevoice data" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Uninstall Sidevoice" })).toBeInTheDocument();
});

test("Delete's confirmation is one sentence, its limits folded under a disclosure", () => {
  bridge(null, { uninstall: true });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent(/restarts at setup; the app itself stays/);
  const disclosure = screen.getByRole("button", { name: "What isn’t deleted?" });
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText(/Other machines and devices \(revoke this device there\)/)).not.toBeVisible();
  fireEvent.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/Other machines and devices \(revoke this device there\)/)).toBeVisible();
});

test("Uninstall's confirmation says the app quits and moves itself to the Trash; Cancel calls nothing", () => {
  const data = bridge(null, { uninstall: true });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Uninstall Sidevoice" }));
  expect(screen.getByRole("dialog", { name: "Uninstall Sidevoice?" })).toHaveTextContent(/quits and moves itself to the Trash/);
  expect(screen.getByRole("button", { name: "What isn’t deleted?" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(data.uninstall).not.toHaveBeenCalled();
  expect(data.deleteAll).not.toHaveBeenCalled();
});

test("confirmed uninstall calls native once and says the app is quitting", async () => {
  const data = bridge(null, { uninstall: true });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Uninstall Sidevoice" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Uninstall Sidevoice" }).at(-1)!);
  await waitFor(() => expect(data.uninstall).toHaveBeenCalledOnce());
  expect(data.deleteAll).not.toHaveBeenCalled();
  expect(await screen.findByText(/quitting to finish uninstalling/)).toBeInTheDocument();
});

test("a copy that cannot move itself to the Trash says so and that nothing was deleted", async () => {
  const data = bridge(null, { uninstall: true });
  data.uninstall.mockRejectedValueOnce({ key: "reset.app-unremovable" });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Uninstall Sidevoice" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Uninstall Sidevoice" }).at(-1)!);
  expect(await screen.findByRole("alert")).toHaveTextContent(/Move it to Applications.*Nothing was deleted/);
});

test("an active call disables both actions", () => {
  bridge(null, { uninstall: true });
  const store = createRoomStore();
  act(() => store.patch({ reconnecting: true }));
  render(<RoomProvider store={store} runtime={false}><DangerZone /></RoomProvider>);
  expect(screen.getByRole("button", { name: "Delete all Sidevoice data" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Uninstall Sidevoice" })).toBeDisabled();
});

test("Cancel is focused in the confirmation and does not call native reset", () => {
  const data = bridge();
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(data.deleteAll).not.toHaveBeenCalled();
});

test("Escape closes the confirmation without calling native reset", () => {
  const data = bridge();
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  expect(data.deleteAll).not.toHaveBeenCalled();
});

test("an active call disables the action", () => {
  const data = bridge();
  const store = createRoomStore();
  act(() => store.patch({ reconnecting: true }));
  render(<RoomProvider store={store} runtime={false}><DangerZone /></RoomProvider>);
  expect(screen.getByRole("button", { name: "Delete all Sidevoice data" })).toBeDisabled();
  expect(screen.getByText(/End the current call/)).toBeInTheDocument();
  expect(data.deleteAll).not.toHaveBeenCalled();
});

test("confirmed reset calls native once and says the app is closing", async () => {
  const data = bridge();
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete all Sidevoice data" }).at(-1)!);
  await waitFor(() => expect(data.deleteAll).toHaveBeenCalledOnce());
  expect(await screen.findByText(/closing to finish deleting/)).toBeInTheDocument();
});

test("native cancellation closes the web confirmation without a reset result", async () => {
  const data = bridge();
  data.deleteAll.mockRejectedValueOnce({ key: "reset.cancelled" });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete all Sidevoice data" }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(data.deleteAll).toHaveBeenCalledOnce();
  expect(screen.queryByText(/closing to finish deleting/)).not.toBeInTheDocument();
});

test.each([
  ["reset.unsafe", /standard Sidevoice installation/],
  ["reset.unavailable", /standard Sidevoice installation/],
  ["reset.unsupported-connector", /version that supports safe removal/],
])("%s explains the unsupported reset scope without implying a partial deletion", async (key, expected) => {
  const data = bridge();
  data.deleteAll.mockRejectedValueOnce({ key });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete all Sidevoice data" }).at(-1)!);
  expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  expect(screen.queryByText(/Some data may already be removed/)).not.toBeInTheDocument();
});

test("a partial helper report names the failed step without claiming success", async () => {
  bridge({ state: "partial", completed: ["app-data"], failed: [{ step: "models", key: "remove" }], agents: {} });
  render(<RoomProvider runtime={false}><dialog id="wizard" open /><ResetReportNotice /></RoomProvider>);
  expect(await screen.findByText(/Some Sidevoice data could not be deleted/)).toBeInTheDocument();
  expect(screen.getByText(/Could not delete models/)).toBeInTheDocument();
  expect(screen.getByText(/After setup, open Settings › Danger zone/)).toBeInTheDocument();
  await waitFor(() => expect(document.getElementById("wizard")).toContainElement(screen.getByRole("alert")));
});

test("German partial results form a grammatical sentence for a plural step", async () => {
  try {
    act(() => setUiLanguage("de"));
    bridge({ state: "partial", completed: [], failed: [{ step: "models", key: "remove" }], agents: {} });
    render(<RoomProvider runtime={false}><ResetReportNotice /></RoomProvider>);
    expect(await screen.findByText("Löschen fehlgeschlagen: Modelle.")).toBeInTheDocument();
  } finally { act(() => setUiLanguage("en")); }
});
