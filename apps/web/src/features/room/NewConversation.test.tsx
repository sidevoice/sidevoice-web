import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VARIANTS_KEY } from "../../lib/variants";
import { NewConversation } from "./NewConversation";
import { messages as en } from "../../i18n/locales/en";
import { messages as es } from "../../i18n/locales/es";

afterEach(cleanup);

/* A new conversation can't be started from the page yet: its button says what to tell the agent, ready to copy. */

test("the message to say names the tool literally in every language, so a weaker model finds it too", () => {
  for (const bundle of [en, es]) expect(bundle["sidebar.newPhrase"]).toContain("voice_connect");
});

test("the button opens a small panel that says why and quotes the message, with its copy button", () => {
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  const panel = document.querySelector(".ui-popover") as HTMLElement;
  expect(panel).toHaveAttribute("role", "dialog");
  expect(panel).toHaveTextContent("isn't possible yet");
  expect(panel).toHaveTextContent("Connect your agent to talk to it");
  // A phrase to say, so a Quote (not a Snippet, which is for a terminal), with its copy button and nothing under it.
  expect(panel.querySelector(".ui-quote blockquote")).toHaveTextContent("Connect to Sidevoice (use its voice_connect tool)");
  expect(panel.querySelector(".ui-snippet")).toBeNull();
  expect(panel.querySelector(".ui-quote button[aria-label='Copy the message for your agent']")).toBeInTheDocument();
});

test("in the rail it is a + with its name for those who cannot see it", () => {
  render(<NewConversation rail />);
  expect(screen.getByRole("button", { name: "New conversation" })).not.toHaveTextContent("New conversation");
});

/* The open decisions (sidevoice-web#463): the panel's variants and the button's options, each behind its VARIANTS switch,
 * today's by default. Whatever is shown, the phrase is the same and copies, and the button is named. */
const choose = (variants: Record<string, string>) => localStorage.setItem(VARIANTS_KEY, JSON.stringify(variants));
afterEach(() => localStorage.removeItem(VARIANTS_KEY));

test("each panel variant puts the phrase on one line, with the Sidevoice mark and its copy button, and says the page cannot start one", () => {
  for (const variant of ["a", "b", "c"]) {
    choose({ "new-conversation-panel": variant });
    render(<NewConversation />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    const panel = document.querySelector(".ui-popover") as HTMLElement;
    expect(panel, variant).toHaveClass("connect-popover", "connect-popover--" + variant);
    expect(panel.querySelector(".connect-agent")).toHaveAttribute("data-variant", variant);
    expect(panel).toHaveTextContent("Connect your agent to talk to it");
    expect(panel.querySelector(".agent-message blockquote")).toHaveTextContent(/^Connect to Sidevoice \(use its voice_connect tool\)$/);
    expect(panel.querySelector(".agent-message .agent-message-mark")).toBeInTheDocument();
    expect(panel.querySelector(".ui-quote")).toBeNull();
    expect(panel.querySelector(".agent-message button[aria-label='Copy the message for your agent']")).toBeInTheDocument();
    expect(panel.querySelector(".connect-agent-note")).toHaveTextContent("Starting a conversation from here isn't possible yet.");
    cleanup();
  }
});

test("B is the landing's three steps, in order, the phrase under the second; C has a creature behind the phrase, for the eye only", () => {
  choose({ "new-conversation-panel": "b" });
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  const steps = [...document.querySelectorAll(".connect-steps > li")];
  expect(steps.map((step) => step.querySelector(".connect-step-body")!.textContent)).toEqual(
    ["Open your agent's session.", "Tell it:Connect to Sidevoice (use its voice_connect tool)", "It joins your conversations, and you can talk to it."]);
  for (const disc of document.querySelectorAll(".connect-step-n")) expect(disc).toHaveAttribute("aria-hidden", "true");
  cleanup();
  choose({ "new-conversation-panel": "c" });
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  expect(document.querySelector(".connect-waiting > .connect-waiting-creature")).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector(".connect-waiting > .agent-message")).toBeInTheDocument();
});

test("an unknown variant is today's panel", () => {
  choose({ "new-conversation-panel": "z", "new-conversation-button": "z" });
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  expect(document.querySelector(".ui-popover")).not.toHaveClass("connect-popover");
  expect(document.querySelector(".ui-popover .ui-quote blockquote")).toBeInTheDocument();
  expect(document.querySelector(".new-conversation-option")).toBeNull();
});

test("each button option is named in every place, its name in words in the list, and opens the same panel", () => {
  for (const option of ["a", "b", "c"]) {
    choose({ "new-conversation-button": option });
    for (const place of ["list", "rail", "header"] as const) {
      render(<NewConversation rail={place === "rail"} header={place === "header"} />);
      const button = screen.getByRole("button", { name: "New conversation" });
      expect(button, option + " " + place).toHaveAttribute("data-option", option);
      expect(button).toHaveAttribute("data-place", place);
      // The header's keeps the class focus finds it by (RoomHeader, ConversationSidebar); the others, the list's.
      expect(button).toHaveClass(place === "header" ? "header-new" : "new-conversation");
      if (place === "list") expect(button).toHaveTextContent("New conversation");
      else expect(button).not.toHaveTextContent("New conversation");
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.querySelector(".ui-popover .connect-agent")).toBeInTheDocument();
      cleanup();
    }
  }
});
