import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CONNECT_VARIANTS, ConnectYourAgent } from "./ConnectYourAgent";
import { VARIANTS_KEY } from "../../lib/variants";

afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); });

const PHRASE = "Connect to Sidevoice (use its voice_connect tool)";

test("with nothing picked it is today's design", () => {
  render(<ConnectYourAgent why />);
  expect(document.querySelector(".connect-agent")).toHaveAttribute("data-variant", "current");
  expect(document.querySelector(".ui-quote blockquote")).toHaveTextContent(PHRASE);
});

test("the stored choice picks a variant, and an unknown one is today's", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ connectAgent: "steps" }));
  const view = render(<ConnectYourAgent />);
  expect(document.querySelector(".connect-agent")).toHaveAttribute("data-variant", "steps");
  view.unmount();
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ connectAgent: "nope" }));
  render(<ConnectYourAgent />);
  expect(document.querySelector(".connect-agent")).toHaveAttribute("data-variant", "current");
});

test("every variant shows the whole phrase, names the tool, and copies it", async () => {
  let copied = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied = text; } } });
  for (const variant of CONNECT_VARIANTS) {
    copied = "";
    const view = render(<ConnectYourAgent why variant={variant} />);
    expect(document.querySelector(".connect-agent")).toHaveTextContent(PHRASE);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy the message for your agent" })); });
    expect(copied).toBe(PHRASE);
    view.unmount();
  }
  Reflect.deleteProperty(navigator, "clipboard");
});
