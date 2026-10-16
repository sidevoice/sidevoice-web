import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";

afterEach(cleanup);

test("the secondary click on the row opens its options, and choosing one runs it", async () => {
  const close = vi.fn();
  render(<ContextMenu label="Options for Fix the bug" items={<ContextMenuItem danger onSelect={close}>Close conversation</ContextMenuItem>}>
    <div data-testid="row">Fix the bug</div>
  </ContextMenu>);
  expect(screen.queryByRole("menu")).toBeNull();
  await act(async () => { fireEvent.contextMenu(screen.getByTestId("row")); });
  expect(screen.getByRole("menu", { name: "Options for Fix the bug" })).toBeInTheDocument();
  const item = screen.getByRole("menuitem", { name: "Close conversation" });
  expect(item).toHaveAttribute("data-danger");
  await act(async () => { fireEvent.click(item); });
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();
});
