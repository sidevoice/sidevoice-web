import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewConversation } from "./NewConversation";
import { en } from "../call/messages/en";
import { es } from "../call/messages/es";

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
  expect(panel).toHaveTextContent("Tell your agent to connect");
  expect(panel.querySelector("blockquote")).toHaveTextContent("Connect to Sidevoice (use its voice_connect tool)");
  expect(panel.querySelector("button[aria-label='Copy the message for your agent']")).toBeInTheDocument();
});

test("in the rail it is a + with its name for those who cannot see it", () => {
  render(<NewConversation rail />);
  expect(screen.getByRole("button", { name: "New conversation" })).not.toHaveTextContent("New conversation");
});
