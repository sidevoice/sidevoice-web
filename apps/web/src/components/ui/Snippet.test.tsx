import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { COPY_FAILED_MS, COPY_FEEDBACK_MS, Quote, Snippet } from "./Snippet";

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
  // As it is, line breaks and all. Several lines may be selected in part (ui.css); one line, a tap selects whole.
  expect(document.querySelector(".ui-snippet pre code")?.textContent).toBe('{\n  "mcpServers": {}\n}');
  expect(document.querySelector(".ui-snippet pre")).toHaveAttribute("data-lines", "many");
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

/** The older way to copy (a hidden field and execCommand), answering `works`; jsdom has none of its own. */
function legacy(works: boolean) {
  const execCommand = vi.fn((_command: string) => works);
  Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
  onTestFinished(() => { Reflect.deleteProperty(document, "execCommand"); });
  return execCommand;
}

test("without the clipboard API (a page over plain http) the older way copies, and the button says Copied", async () => {
  clipboard();
  const execCommand = legacy(true);
  render(<Snippet text="npx sidevoice@latest install" label="Copy setup command" />);
  await click("Copy setup command");
  expect(execCommand).toHaveBeenCalledWith("copy");
  // Its hidden field goes once it has copied.
  expect(document.querySelector("textarea")).toBeNull();
  expect(screen.getByRole("button", { name: "Copy setup command" })).toHaveAttribute("data-state", "copied");
  expect(screen.getByRole("status")).toHaveTextContent(/^Copied$/);
});

test("when neither way copies, the text is selected and Select and copy shows by the button, for longer", async () => {
  for (const refuse of [() => clipboard(vi.fn(async () => { throw new Error("denied"); })), () => clipboard()]) {
    refuse();
    legacy(false);
    const view = render(<Quote text="Connect to Sidevoice" label="Copy the message" />);
    const button = screen.getByRole("button", { name: "Copy the message" });
    await click("Copy the message");
    expect(button).toHaveAttribute("data-state", "failed");
    expect(window.getSelection()?.toString()).toBe("Connect to Sidevoice");
    // In words by the button, on a phone too, and the same said to a screen reader.
    expect(document.querySelector(".ui-copy-failed")).toHaveTextContent("Select and copy");
    expect(screen.getByRole("status")).toHaveTextContent("Select and copy");
    act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });
    expect(button).toHaveAttribute("data-state", "failed");
    act(() => { vi.advanceTimersByTime(COPY_FAILED_MS - COPY_FEEDBACK_MS); });
    expect(button).not.toHaveAttribute("data-state");
    expect(document.querySelector(".ui-copy-failed")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("");
    view.unmount();
    window.getSelection()?.removeAllRanges();
  }
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

