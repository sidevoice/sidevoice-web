import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog } from "./Dialog";

afterEach(cleanup);

/* A dialog gives focus back to what opened it as it closes, whichever way it closes: never on to what follows it in the
 * page (the stage's model chips, whose tooltip opened). */

/** A press, as a browser does it: the pointer down, focus on what was pressed, the click. */
function press(element: HTMLElement) {
  fireEvent.pointerDown(element);
  element.focus();
  fireEvent.click(element);
}

function Page({ unmount = false }: { unmount?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialog = <Dialog open={open} titleId="rename-title" title="Rename machine" onClose={() => setOpen(false)}><input aria-label="Name" /></Dialog>;
  return <main>
    <button type="button" onClick={() => setOpen(true)}>Rename</button>
    <span className="voice-chip" tabIndex={0}>whisper-base</span>
    {/* A dialog drawn only while open (a key's): gone from the page as it closes. */}
    {unmount ? open && dialog : dialog}
  </main>;
}

async function openAndClose(close: () => void) {
  const rename = screen.getByRole("button", { name: "Rename" });
  await act(async () => { press(rename); });
  const name = screen.getByRole("textbox", { name: "Name" });
  await act(async () => { name.focus(); });
  expect(name).toHaveFocus();
  await act(async () => { close(); });
  return rename;
}

test("closed by its ×, focus goes back to what opened it, not to what follows it", async () => {
  render(<Page />);
  const rename = await openAndClose(() => press(screen.getByRole("button", { name: "Close Rename machine" })));
  await waitFor(() => expect(rename).toHaveFocus());
  expect(document.querySelector(".voice-chip")).not.toHaveFocus();
});

test("closed by Escape, focus goes back to what opened it", async () => {
  render(<Page />);
  const rename = await openAndClose(() => { fireEvent(document.querySelector("dialog")!, new Event("cancel", { cancelable: true })); });
  await waitFor(() => expect(rename).toHaveFocus());
});

test("drawn only while open, gone as it closes, focus goes back to what opened it", async () => {
  render(<Page unmount />);
  const rename = await openAndClose(() => press(screen.getByRole("button", { name: "Close Rename machine" })));
  expect(document.querySelector("dialog")).toBeNull();
  await waitFor(() => expect(rename).toHaveFocus());
});
