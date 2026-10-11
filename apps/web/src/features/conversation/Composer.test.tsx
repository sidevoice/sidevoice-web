import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { Composer } from "./Composer";

/** jsdom lays nothing out: the box is given a 20px line, 10px padding and a 1px border, and a content height of one
 *  line per line of text, the way a browser measures it. */
function box(container: HTMLElement) {
  const textarea = container.querySelector<HTMLTextAreaElement>("#text-message")!;
  Object.assign(textarea.style, { lineHeight: "20px", paddingTop: "10px", paddingBottom: "10px", borderTopWidth: "1px", borderBottomWidth: "1px" });
  Object.defineProperty(textarea, "scrollHeight", { configurable: true, get: () => textarea.value.split("\n").length * 20 + 20 });
  return textarea;
}
const type = (textarea: HTMLTextAreaElement, value: string) => { textarea.value = value; fireEvent.input(textarea); };
const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index}`).join("\n");

test("the runtime finds the form, the box and Send by their ids, and the box is one row and never resizable", () => {
  const { container } = render(<Composer narrow={false} />);
  expect(container.querySelector("form#text-composer")).toBeInTheDocument();
  expect(container.querySelector("#text-message")).toHaveAttribute("rows", "1");
  expect(container.querySelector("#text-message")).toHaveClass("ui-textarea");
  expect(container.querySelector("button#text-send")).toHaveAttribute("type", "submit");
  expect(container.querySelector(".compose-toggle")).toBeNull();
});

test("it grows with the text up to eight rows, five on a phone", () => {
  const { container, rerender } = render(<Composer narrow={false} />);
  const textarea = box(container);
  type(textarea, lines(3));
  expect(textarea.style.height).toBe(`${3 * 20 + 22}px`);
  type(textarea, lines(20));
  expect(textarea.style.height).toBe(`${8 * 20 + 22}px`);
  expect(textarea.style.overflowY).toBe("auto");
  rerender(<Composer narrow />);
  expect(textarea.style.height).toBe(`${5 * 20 + 22}px`);
});

test("when the runtime clears the sent text itself, the box shrinks back to one row", async () => {
  const { container } = render(<Composer narrow={false} />);
  const textarea = box(container);
  const send = container.querySelector<HTMLButtonElement>("#text-send")!;
  textarea.disabled = false;
  type(textarea, lines(4));
  expect(textarea.style.height).toBe(`${4 * 20 + 22}px`);
  // What sendText does once the room took the text: the value goes, with no input event, then updateComposer runs.
  send.disabled = true;
  textarea.value = "";
  send.disabled = false;
  textarea.placeholder = "Write a message…";
  await waitFor(() => expect(textarea.style.height).toBe(`${20 + 22}px`));
});
