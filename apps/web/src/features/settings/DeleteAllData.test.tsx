import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteAllData } from "./DeleteAllData";
import { RoomProvider } from "../../app/RoomProvider";

afterEach(() => { cleanup(); Reflect.deleteProperty(window, "__sidevoiceDesktop"); });

function bridge(result: unknown = null) {
  const data = {
    pairings: { read: vi.fn(async () => ({ pairings: [] })), write: vi.fn(async () => {}) },
    deleteAll: vi.fn(async () => ({ state: "needs-restart", service: "removed", agents: {}, failed: [], pending: [] })),
    resetReport: vi.fn(async () => result),
  };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { data } } });
  return data;
}

function show() { return render(<RoomProvider runtime={false}><DeleteAllData /></RoomProvider>); }

test("the destructive action is absent in a browser", () => {
  const { container } = show();
  expect(container).toBeEmptyDOMElement();
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

test("confirmed reset calls native once and says the app is closing", async () => {
  const data = bridge();
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Sidevoice data" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete all Sidevoice data" }).at(-1)!);
  await waitFor(() => expect(data.deleteAll).toHaveBeenCalledOnce());
  expect(await screen.findByText(/closing to finish deleting/)).toBeInTheDocument();
});

test("a partial helper report names the failed step without claiming success", async () => {
  bridge({ state: "partial", completed: ["app-data"], failed: [{ step: "models", key: "remove" }] });
  show();
  expect(await screen.findByText(/Some Sidevoice data could not be deleted/)).toBeInTheDocument();
  expect(screen.getByText(/Could not delete models/)).toBeInTheDocument();
});
