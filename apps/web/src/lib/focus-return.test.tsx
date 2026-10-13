import { useRef } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { returnFocus, useDialogFocusReturn } from "./focus-return";

afterEach(cleanup);
// A press on nothing first: what an earlier test pressed opens nothing here.
beforeEach(() => { fireEvent.pointerDown(document.body); });

/* A dialog the runtime opens and closes by its id (Settings, the statistics, pairing) gives focus back as it closes: to
 * what opened it; that gone, to what opens it; with nothing that opened it, to the main region — never on to what
 * follows it in the page (the stage's model chips, whose tooltip opened). */

function RuntimeDialog({ id }: { id: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogFocusReturn(dialog);
  return <dialog ref={dialog} id={id}><button type="button">Close</button></dialog>;
}

/** A press, as a browser does it: the pointer down, focus on what was pressed, the click. */
function press(element: HTMLElement) {
  fireEvent.pointerDown(element);
  element.focus();
  fireEvent.click(element);
}

/** Opened as the runtime does: open, and focus in it. */
async function show(id: string) {
  const dialog = document.getElementById(id) as HTMLDialogElement;
  await act(async () => { dialog.setAttribute("open", ""); dialog.querySelector("button")!.focus(); });
  expect(dialog.querySelector("button")).toHaveFocus();
}
async function shut(id: string, then?: () => void) {
  await act(async () => { document.getElementById(id)!.removeAttribute("open"); then?.(); });
}

const chip = () => document.querySelector<HTMLElement>(".voice-chip")!;

test("opened from a menu's item, the menu shut as it opened: closed, focus goes back to the menu", async () => {
  render(<main>
    <details id="call-menu" open><summary>More</summary><button type="button">Connection statistics</button></details>
    <span className="voice-chip" tabIndex={0}>whisper-base</span>
    <RuntimeDialog id="connection-stats" />
  </main>);
  press(screen.getByRole("button", { name: "Connection statistics" }));
  (document.getElementById("call-menu") as HTMLDetailsElement).open = false;
  await show("connection-stats");
  await shut("connection-stats");
  expect(screen.getByText("More")).toHaveFocus();
  expect(chip()).not.toHaveFocus();
});

test("what opened it gone, focus goes to what opens it: a control that says it controls it", async () => {
  render(<main>
    <button type="button" aria-controls="language-settings">Settings</button>
    <span className="voice-chip" tabIndex={0}>whisper-base</span>
    <RuntimeDialog id="language-settings" />
  </main>);
  const opener = document.body.appendChild(document.createElement("button"));
  press(opener);
  await show("language-settings");
  opener.remove();
  await shut("language-settings");
  expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
});

test("opened by the page itself, nothing pressed: closed, focus goes to the main region, focusable for that once", async () => {
  render(<main>
    <span className="voice-chip" tabIndex={0}>whisper-base</span>
    <RuntimeDialog id="device-pairing" />
  </main>);
  await show("device-pairing");
  await shut("device-pairing");
  const main = screen.getByRole("main");
  expect(main).toHaveFocus();
  expect(chip()).not.toHaveFocus();
  // Focus moved on, the region is no longer one a click lands focus on.
  act(() => { chip().focus(); });
  expect(main).not.toHaveAttribute("tabindex");
});

test("focus sent somewhere by what closed it stays there", async () => {
  render(<main>
    <button type="button">Rename</button>
    <button type="button">Machine</button>
    <RuntimeDialog id="rename" />
  </main>);
  press(screen.getByRole("button", { name: "Rename" }));
  await show("rename");
  await shut("rename", () => screen.getByRole("button", { name: "Machine" }).focus());
  expect(screen.getByRole("button", { name: "Machine" })).toHaveFocus();
});

test("a notice gone by itself, with no opener: focus to the main region, not to what follows the notice", () => {
  render(<main>
    <aside><button type="button">Hide</button></aside>
    <span className="voice-chip" tabIndex={0}>whisper-base</span>
  </main>);
  act(() => { returnFocus(); });
  expect(screen.getByRole("main")).toHaveFocus();
});
