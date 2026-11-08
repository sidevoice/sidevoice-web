import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentMessage } from "./AgentMessage";
import { COPY_FEEDBACK_MS } from "../../components/ui/Snippet";

/* The phrase to say to an agent on one line (the landing's message for the agent): the mark, the phrase, its copy button. */

const PHRASE = "Connect to Sidevoice (use its voice_connect tool)";
const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

/** Its stylesheet, comments out: what the button's visibility is decided by. */
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-message.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of every rule whose selector is exactly `selector`, inside `within` (an at-rule's text) or anywhere. */
function rules(selector: string, within = css) {
  const found: string[] = [];
  for (let at = within.indexOf(selector + " {"); at >= 0; at = within.indexOf(selector + " {", at + 1)) {
    // A selector that only ends with this one is another rule.
    if (at > 0 && !/[\s{}]/.test(within[at - 1])) continue;
    found.push(within.slice(at + selector.length + 2, within.indexOf("}", at)).trim());
  }
  return found;
}
/** An at-rule's block, by its prelude. */
function block(prelude: string) {
  const at = css.indexOf(prelude + " {");
  expect(at, prelude).toBeGreaterThanOrEqual(0);
  let depth = 0, i = css.indexOf("{", at);
  const start = i + 1;
  do { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; } while (depth && i < css.length);
  return css.slice(start, i - 1);
}

test("it shows the Sidevoice mark at its start, then the phrase, quoted as it is to be said", () => {
  render(<AgentMessage text={PHRASE} label="Copy the message for your agent" />);
  const box = document.querySelector(".agent-message blockquote.agent-message-box") as HTMLElement;
  expect(box).toBeInTheDocument();
  // The mark first, a picture for the eye only (its bars, one in the other voice's mustard).
  const mark = box.firstElementChild as SVGElement;
  expect(mark.tagName.toLowerCase()).toBe("svg");
  expect(mark).toHaveClass("agent-message-mark");
  expect(mark).toHaveAttribute("aria-hidden", "true");
  expect([...mark.querySelectorAll("rect")].some((bar) => bar.getAttribute("style")?.includes("--sv-voice"))).toBe(true);
  expect(box.querySelector(".agent-message-text")).toHaveTextContent(PHRASE);
  expect(box).toHaveTextContent(new RegExp("^" + PHRASE.replace(/[()]/g, "\\$&") + "$"));
});

test("its button copies the phrase, turns into a check and says Copied out of sight, then is the copy button again", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<AgentMessage text={PHRASE} label="Copy the message for your agent" />);
  const button = screen.getByRole("button", { name: "Copy the message for your agent" });
  await act(async () => { fireEvent.click(button); });
  expect(writeText).toHaveBeenCalledWith(PHRASE);
  expect(button).toHaveAttribute("data-state", "copied");
  expect(screen.getByRole("status")).toHaveTextContent(/^Copied$/);
  expect(button).toHaveAccessibleName("Copy the message for your agent");
  act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });
  expect(button).not.toHaveAttribute("data-state");
});

test("the button is always there, named and in the tab order: pointing at the line changes nothing in the page", () => {
  render(<AgentMessage text={PHRASE} label="Copy the message for your agent" />);
  const line = document.querySelector(".agent-message") as HTMLElement;
  const button = screen.getByRole("button", { name: "Copy the message for your agent" });
  const before = line.outerHTML;
  for (const event of [fireEvent.mouseEnter, fireEvent.mouseOver, fireEvent.mouseLeave]) event(line);
  expect(line.outerHTML).toBe(before);
  // Nothing hides it but the stylesheet: no hidden, no aria-hidden, no inline style, no tabindex taking it out.
  expect(button).not.toHaveAttribute("hidden");
  expect(button).not.toHaveAttribute("aria-hidden");
  expect(button).not.toHaveAttribute("style");
  expect(button).not.toHaveAttribute("tabindex");
  button.focus();
  expect(button).toHaveFocus();
});

test("faint until pointed at, solid on keyboard focus or while it says how a copy went, stronger on a touch screen: CSS alone", () => {
  // Nearly transparent at rest, faded and never hidden.
  expect(rules(".agent-message .ui-copy-button")).toContain("opacity: .28;");
  expect(css).not.toMatch(/\.ui-copy-button[^{]*\{[^}]*(display:\s*none|visibility:\s*hidden)/);
  // Solid with the keyboard's focus (focus-visible, so a click does not leave it solid) and while it says how a copy went.
  expect(rules(".agent-message .ui-copy-button:is(:focus-visible, [data-state])")).toEqual(["opacity: 1;"]);
  // Solid while the line is pointed at, only where something points (no hover that sticks after a tap).
  expect(rules(".agent-message:hover .ui-copy-button", block("@media (hover: hover)"))).toEqual(["opacity: 1;"]);
  expect(rules(".agent-message:hover .ui-copy-button", css.replace(block("@media (hover: hover)"), ""))).toEqual([]);
  // A touch screen points at nothing: .7 there, but for focus and feedback, which stay solid.
  expect(rules(".agent-message .ui-copy-button:not(:focus-visible, [data-state])", block("@media (hover: none)"))).toEqual(["opacity: .7;"]);
});

test("its look is the design system's tokens: no colour of its own", () => {
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  for (const token of ["--sv-quote-edge", "--sv-quote-shadow", "--sv-surface-raised", "--sv-accent", "--sv-text"]) expect(css).toContain("var(" + token + ")");
});
