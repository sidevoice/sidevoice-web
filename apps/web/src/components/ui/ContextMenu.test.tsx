import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";

afterEach(cleanup);

test("the secondary click on the row opens its options, and choosing one runs it", async () => {
  const close = vi.fn();
  render(<ContextMenu label="Options for Fix the bug" items={<ContextMenuItem danger onSelect={close}>Remove from this device</ContextMenuItem>}>
    <div data-testid="row">Fix the bug</div>
  </ContextMenu>);
  expect(screen.queryByRole("menu")).toBeNull();
  await act(async () => { fireEvent.contextMenu(screen.getByTestId("row")); });
  expect(screen.getByRole("menu", { name: "Options for Fix the bug" })).toBeInTheDocument();
  const item = screen.getByRole("menuitem", { name: "Remove from this device" });
  expect(item).toHaveAttribute("data-danger");
  await act(async () => { fireEvent.click(item); });
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("from the keyboard (Shift+F10 or the menu key reach the row's button as a context menu): it opens, Escape closes it, and focus goes back", async () => {
  render(<ContextMenu label="Options for Fix the bug" items={<ContextMenuItem onSelect={() => {}}>Remove from this device</ContextMenuItem>}>
    <div data-testid="row"><button type="button">Fix the bug</button></div>
  </ContextMenu>);
  const button = screen.getByRole("button", { name: "Fix the bug" });
  button.focus();
  await act(async () => { fireEvent.contextMenu(button); });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await act(async () => { fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }); });
  expect(screen.queryByRole("menu")).toBeNull();
  // The menu hands focus back once it has closed, a frame later: on a loaded runner that is after the line above.
  await waitFor(() => expect(button).toHaveFocus());
});
