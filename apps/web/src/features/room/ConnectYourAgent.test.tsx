import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectYourAgent } from "./ConnectYourAgent";
import { setUiLanguage } from "../../i18n/translator";

/* What to tell an agent, in the interface's language: the phrase shown is the phrase copied, exactly. */

const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  cleanup();
  act(() => setUiLanguage("en"));
  if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

test("in Spanish it shows and copies exactly «Conecta esta conversación a Sidevoice.»", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  act(() => setUiLanguage("es"));
  render(<ConnectYourAgent why />);
  expect(document.querySelector(".agent-message-text")?.textContent).toBe("Conecta esta conversación a Sidevoice.");
  expect(document.querySelector(".connect-agent-body")).toHaveTextContent("En la sesión de tu agente, di:");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copiar el mensaje para tu agente" })); });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledWith("Conecta esta conversación a Sidevoice.");
});

test("compact (the setup's last step) is the same block, marked to lay the creature beside the title and the line", () => {
  render(<ConnectYourAgent titleAs="h3" compact />);
  const block = document.querySelector(".connect-agent") as HTMLElement;
  expect(block).toHaveAttribute("data-compact");
  expect(block.querySelector("h3.connect-agent-title")).toHaveTextContent("Connect your agent to talk to it");
  expect(block.querySelector(".connect-waiting-creature")).toHaveAttribute("aria-hidden", "true");
  // No note in the setup: nobody asked the page to start a conversation there.
  expect(block.querySelector(".connect-agent-note")).toBeNull();
});
