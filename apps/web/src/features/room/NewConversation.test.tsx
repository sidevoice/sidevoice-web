import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewConversation } from "./NewConversation";
import { messages as en } from "../../i18n/locales/en";
import { messages as es } from "../../i18n/locales/es";

afterEach(cleanup);

/* A new conversation can't be started from the page yet: its button says what to tell the agent, ready to copy. */

/** Every language's catalogue, by its file. */
const catalogues = import.meta.glob<{ messages: Record<string, string> }>("../../i18n/locales/*.ts", { eager: true });

test("the phrase to say is the landing's, in every language, and names no tool: an agent connects from it alone", () => {
  expect(en["connect.phrase"]).toBe("Connect this conversation to Sidevoice.");
  expect(es["connect.phrase"]).toBe("Conecta esta conversación a Sidevoice.");
  expect(Object.keys(catalogues).length).toBeGreaterThan(1);
  for (const [file, { messages }] of Object.entries(catalogues)) {
    expect(messages["connect.phrase"], file).toContain("Sidevoice");
    expect(messages["connect.phrase"], file).not.toMatch(/voice_connect/);
  }
});

test("the button opens a panel: its title, a creature waiting, where to say it, the phrase with its copy button, and why", () => {
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  const panel = document.querySelector(".ui-popover") as HTMLElement;
  expect(panel).toHaveAttribute("role", "dialog");
  // Wider than a popover, so the phrase has room (new-conversation.css).
  expect(panel).toHaveClass("connect-popover");
  const order = [...panel.querySelector(".connect-agent")!.children].map((child) => child.className);
  expect(order).toEqual(["connect-agent-title", "connect-waiting-creature", "connect-agent-body", "agent-message", "connect-agent-note"]);
  expect(panel.querySelector(".connect-agent-title")).toHaveTextContent("Connect your agent to talk to it");
  // The creature is a picture for the eye only.
  expect(panel.querySelector(".connect-waiting-creature")).toHaveAttribute("aria-hidden", "true");
  expect(panel.querySelector(".connect-agent-body")).toHaveTextContent("In your agent's session, say:");
  expect(panel.querySelector(".agent-message blockquote")).toHaveTextContent(/^Connect this conversation to Sidevoice\.$/);
  expect(panel.querySelector(".agent-message button[aria-label='Copy the message for your agent']")).toBeInTheDocument();
  expect(panel.querySelector(".connect-agent-note")).toHaveTextContent("Starting a conversation from here isn't possible yet.");
  // A phrase to say, not a command for a terminal (a Snippet), nor today's guillemets (a Quote).
  expect(panel.querySelector(".ui-snippet, .ui-quote")).toBeNull();
});

test("in the rail it is a + with its name for those who cannot see it", () => {
  render(<NewConversation rail />);
  expect(screen.getByRole("button", { name: "New conversation" })).not.toHaveTextContent("New conversation");
});

test("in a phone's header it is the empty avatar's slot, named, and opens the same panel", () => {
  render(<NewConversation header />);
  const button = screen.getByRole("button", { name: "New conversation" });
  expect(button).toHaveClass("header-new");
  fireEvent.click(button);
  expect(document.querySelector(".ui-popover .agent-message")).toBeInTheDocument();
});
