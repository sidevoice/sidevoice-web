import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { COPY_FEEDBACK_MS, Quote, Snippet } from "./Snippet";

const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
function clipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  localStorage.removeItem("sidevoice.variants");
  if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

const click = (name: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });

test("a Snippet is a command or a file's lines in monospace, and a Quote a phrase between guillemets", () => {
  render(<>
    <Snippet text={'{\n  "mcpServers": {}\n}'} label="Copy the configuration" />
    <Quote text="Connect to Sidevoice (use its voice_connect tool)" label="Copy the message" />
  </>);
  // As it is, line breaks and all: the text alone is what a tap selects whole.
  expect(document.querySelector(".ui-snippet pre code")?.textContent).toBe('{\n  "mcpServers": {}\n}');
  expect(document.querySelector(".ui-quote blockquote")).toHaveTextContent("Connect to Sidevoice (use its voice_connect tool)");
  expect(screen.getByRole("button", { name: "Copy the configuration" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy the message" })).toBeInTheDocument();
});

test("copied, the button itself turns into a check and says so out of sight, then is the copy button again", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  clipboard(writeText);
  render(<Snippet text="npx sidevoice@latest install" label="Copy setup command" />);
  const button = screen.getByRole("button", { name: "Copy setup command" });
  expect(screen.getByRole("status")).toHaveTextContent("");
  await click("Copy setup command");
  expect(writeText).toHaveBeenCalledWith("npx sidevoice@latest install");
  expect(button).toHaveAttribute("data-state", "copied");
  expect(screen.getByRole("status")).toHaveTextContent(/^Copied$/);
  expect(screen.getByRole("status")).toHaveClass("ui-copy-live");
  // The name stays what the button does; only the live text says how it went.
  expect(button).toHaveAccessibleName("Copy setup command");
  act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1); });
  expect(button).toHaveAttribute("data-state", "copied");
  act(() => { vi.advanceTimersByTime(1); });
  expect(button).not.toHaveAttribute("data-state");
  expect(screen.getByRole("status")).toHaveTextContent("");
});

test("when the clipboard refuses, or there is none, the same button says to select the text, for as long", async () => {
  clipboard(vi.fn(async () => { throw new Error("denied"); }));
  render(<Quote text="Connect to Sidevoice" label="Copy the message" />);
  const button = screen.getByRole("button", { name: "Copy the message" });
  await click("Copy the message");
  expect(button).toHaveAttribute("data-state", "failed");
  expect(screen.getByRole("status")).toHaveTextContent("Couldn’t copy — select the text");
  act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });
  expect(button).not.toHaveAttribute("data-state");
  expect(screen.getByRole("status")).toHaveTextContent("");

  clipboard();
  await click("Copy the message");
  expect(button).toHaveAttribute("data-state", "failed");
  expect(screen.getByRole("status")).toHaveTextContent("Couldn’t copy — select the text");
});

test("a second copy before the first has gone shows its own result for the whole time again", async () => {
  clipboard(vi.fn(async () => {}));
  render(<Snippet text="npx sidevoice@latest pair-device" />);
  const button = screen.getByRole("button", { name: "Copy" });
  await click("Copy");
  act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS - 100); });
  await click("Copy");
  act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1); });
  expect(button).toHaveAttribute("data-state", "copied");
  act(() => { vi.advanceTimersByTime(1); });
  expect(button).not.toHaveAttribute("data-state");
});

test("the design-system page can keep one in a state", () => {
  render(<><Snippet text="a" label="Snippet" feedback="copied" /><Quote text="b" label="Quote" feedback="failed" /></>);
  expect(screen.getByRole("button", { name: "Snippet" })).toHaveAttribute("data-state", "copied");
  expect(screen.getByRole("button", { name: "Quote" })).toHaveAttribute("data-state", "failed");
});

test("how visible the copy button is follows the copy-button variant, always visible by default", () => {
  const view = render(<><Snippet text="a" /><Quote text="b" /></>);
  const roots = () => [...document.querySelectorAll(".ui-copy")].map((root) => root.getAttribute("data-copy-button"));
  expect(roots()).toEqual(["visible", "visible"]);
  view.unmount();
  for (const value of ["faint", "hover"]) {
    localStorage.setItem("sidevoice.variants", JSON.stringify({ "copy-button": value }));
    const next = render(<><Snippet text="a" /><Quote text="b" /></>);
    expect(roots()).toEqual([value, value]);
    next.unmount();
  }
});
