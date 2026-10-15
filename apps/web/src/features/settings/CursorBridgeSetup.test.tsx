import { afterEach, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CursorBridgeSetup } from "./CursorBridgeSetup";
import { setUiLanguage, translator, UI_LANGUAGES } from "../../i18n/translator";
import type { CursorBridgeStatus } from "../../state/room-types";

const show = (bridge: CursorBridgeStatus) => {
  const view = render(<CursorBridgeSetup bridge={bridge} id="cursor-setup" />);
  const button = screen.queryByRole("button", { name: /Desktop Bridge/ });
  if (!button) return { view, button, panel: null };
  fireEvent.click(button);
  return { view, button, panel: screen.getByRole("group", { name: "Desktop Bridge" }) };
};
afterEach(() => setUiLanguage("en"));

test("running bridge shows Ready and only the dependency sentence", () => {
  const { button, panel } = show({ state: "running", chat_known: false });
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(button).toHaveAttribute("aria-controls", "cursor-setup");
  expect(button).toHaveTextContent("Ready");
  expect(panel).toHaveTextContent("Voice in the Cursor editor depends on Cursor’s Desktop Bridge.");
  expect(panel?.querySelectorAll("p")).toHaveLength(1);
  expect(panel).not.toHaveTextContent("Settings → Beta");
  expect(panel).not.toHaveTextContent("Join the Sidevoice");
  fireEvent.click(button!);
  expect(screen.queryByRole("group", { name: "Desktop Bridge" })).toBeNull();
});

test("not running shows Needs attention and one setup instruction", () => {
  const { button, panel } = show({ state: "not_running", chat_known: null });
  expect(button).toHaveTextContent("Needs attention");
  expect(panel?.querySelectorAll("p")).toHaveLength(2);
  expect(panel).toHaveTextContent("Voice in the Cursor editor depends on Cursor’s Desktop Bridge.");
  expect(panel).toHaveTextContent("Settings → Beta");
  expect(panel).toHaveTextContent("Allow CLI to access desktop agents");
  expect(panel).toHaveTextContent("restart Cursor");
  expect(panel).not.toHaveTextContent("sqlite3");
  expect(panel).not.toHaveTextContent("~/.cursor");
});

test("unsupported and unknown bridge states look like agents without a bridge", () => {
  for (const state of ["unsupported", "future_state"] as const) {
    const { view, button } = show({ state, chat_known: false } as CursorBridgeStatus);
    expect(button).toBeNull();
    expect(document.querySelector(".host-agent-bridge")).toBeNull();
    view.unmount();
  }
});

test("all eight catalogues have exactly the five final bridge keys", () => {
  expect(UI_LANGUAGES).toHaveLength(8);
  const keys = ["agents.cursorBridge.title", "agents.cursorBridge.state.ready", "agents.cursorBridge.state.needs_attention",
    "agents.cursorBridge.dependency", "agents.cursorBridge.instruction"] as const;
  for (const language of UI_LANGUAGES) {
    const t = translator(language);
    for (const key of keys) expect(t(key), `${language}: ${key}`).not.toBe(key);
  }
  setUiLanguage("de");
  const { panel, view } = show({ state: "not_running", chat_known: false });
  expect(panel).toHaveTextContent("Settings → Beta");
  view.unmount();
});
