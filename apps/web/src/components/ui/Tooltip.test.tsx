import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

/* A tooltip opens on hover and on focus the browser shows (`:focus-visible`: a key moved it there), never on focus a
 * script put there — a dialog or a notice closing used to land focus on the stage's model chips and open theirs. */

/** jsdom counts any focus as visible: whether the last focus was a key's is the test's to say. */
let keyboard = false;
const matches = Element.prototype.matches;
beforeEach(() => {
  keyboard = false;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" ? keyboard && document.activeElement === this : matches.call(this, selector);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function chip() {
  render(<Tooltip content="whisper-base · on this device · ready"><span className="voice-chip" tabIndex={0}>whisper-base</span></Tooltip>);
  return document.querySelector<HTMLElement>(".voice-chip")!;
}
/** Past the tooltip's delay. */
const wait = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));

test("focus a script puts on it opens no tooltip", async () => {
  const element = chip();
  act(() => { element.focus(); });
  expect(element).toHaveFocus();
  await wait();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("focus a key moves there opens it", async () => {
  const element = chip();
  keyboard = true;
  act(() => { element.focus(); });
  expect(await screen.findByRole("tooltip")).toHaveTextContent("whisper-base · on this device · ready");
});

test("hovering it opens it", async () => {
  const element = chip();
  fireEvent.pointerMove(element, { pointerType: "mouse" });
  await wait();
  expect(screen.getByRole("tooltip")).toHaveTextContent("whisper-base · on this device · ready");
});
