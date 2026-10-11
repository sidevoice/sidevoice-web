import { afterEach, expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { UpdatesEntry } from "./UpdatesEntry";
import { updateLater, useUpdates } from "./useUpdates";

afterEach(() => localStorage.removeItem("sidevoice.updates-later"));

/* The updates waiting: none, nothing shown; a newer build of the page held during a call, one entry; put off, gone. */

function Items() {
  const { items, inCall } = useUpdates();
  return <p data-testid="items">{items.map((item) => item.id).join(",")}|{String(inCall)}</p>;
}

test("nothing waits: no entry; a newer build held in a call is one, and Later puts it off", () => {
  const store = createRoomStore();
  render(<RoomProvider store={store}><UpdatesEntry /><Items /></RoomProvider>);
  expect(screen.queryByRole("button", { name: /^Updates/ })).toBeNull();
  act(() => store.patch({ ws: {}, webUpdate: "b2" } as never));
  expect(screen.getByRole("button", { name: "Updates, 1 waiting" })).toBeInTheDocument();
  expect(screen.getByTestId("items")).toHaveTextContent("web|true");
  act(() => updateLater({ id: "web", kind: "web", version: "b2", required: false }));
  expect(screen.queryByRole("button", { name: /^Updates/ })).toBeNull();
  // A newer version than the one put off comes back.
  act(() => store.patch({ webUpdate: "b3" } as never));
  expect(screen.getByTestId("items")).toHaveTextContent("web|true");
});
