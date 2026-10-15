import { afterEach, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentReadiness } from "./AgentReadiness";
import { setUiLanguage, translator, UI_LANGUAGES } from "../../i18n/translator";
import type { AgentReadinessStatus } from "../../state/room-types";

const show = (readiness: AgentReadinessStatus) => render(<AgentReadiness readiness={readiness} id="agent-readiness" />);
afterEach(() => setUiLanguage("en"));

test("ready shows only its chip", () => {
  const ready = show({ state: "ready", reasons: [] });
  expect(screen.getByRole("status")).toHaveTextContent("Ready");
  expect(screen.queryByRole("button")).toBeNull();
  ready.unmount();
});

test("unsupported opens its known reason, preserving other reasons and translating unknown codes", () => {
  show({ state: "unsupported", reasons: ["cursor.unsupported", "future.unavailable", "cursor.bridge_not_running"] });
  const button = screen.getByRole("button", { name: "Not supported" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  const group = screen.getByRole("group", { name: "Not supported" });
  expect([...group.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
    translator()("agents.readiness.cursor.unsupported"), translator()("agents.readiness.unknown_reason"),
    translator()("agents.readiness.cursor.bridge_not_running"),
  ]);
  expect(group).not.toHaveTextContent("future.unavailable");
});

test("unsupported with only an unknown reason shows the translated fallback", () => {
  show({ state: "unsupported", reasons: ["future.unsupported"] });
  fireEvent.click(screen.getByRole("button", { name: "Not supported" }));
  expect(screen.getByRole("group", { name: "Not supported" })).toHaveTextContent(translator()("agents.readiness.unknown_reason"));
});

test("Cursor bridge reason opens one translated dependency and setup explanation", () => {
  show({ state: "needs_attention", reasons: ["cursor.bridge_not_running"] });
  const button = screen.getByRole("button", { name: "Needs attention" });
  expect(button).toHaveAttribute("aria-controls", "agent-readiness");
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  const group = screen.getByRole("group", { name: "Needs attention" });
  expect(group.querySelectorAll("p")).toHaveLength(1);
  expect(group).toHaveTextContent("Voice in the Cursor editor depends on Cursor’s Desktop Bridge.");
  expect(group).toHaveTextContent("Settings → Beta");
  expect(group).toHaveTextContent("Allow CLI to access desktop agents");
  expect(group).toHaveTextContent("restart Cursor");
  expect(group).not.toHaveTextContent("sqlite3");
  expect(group).not.toHaveTextContent("Join the Sidevoice");
});

test("multiple reasons render in order; unknown and absent codes use only translated fallback text", () => {
  show({ state: "needs_attention", reasons: ["cursor.bridge_not_running", "future.secret_code"] });
  fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
  const group = screen.getByRole("group", { name: "Needs attention" });
  expect([...group.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
    translator()("agents.readiness.cursor.bridge_not_running"), translator()("agents.readiness.unknown_reason"),
  ]);
  expect(group).not.toHaveTextContent("future.secret_code");
});

test("all eight catalogues contain only the final readiness keys", () => {
  expect(UI_LANGUAGES).toHaveLength(8);
  const keys = ["agents.readiness.ready", "agents.readiness.needs_attention", "agents.readiness.unsupported",
    "agents.readiness.unknown_reason", "agents.readiness.cursor.bridge_not_running", "agents.readiness.cursor.unsupported"] as const;
  for (const language of UI_LANGUAGES) {
    const t = translator(language);
    for (const key of keys) expect(t(key), `${language}: ${key}`).not.toBe(key);
  }
  setUiLanguage("de");
  const view = show({ state: "needs_attention", reasons: ["cursor.bridge_not_running"] });
  fireEvent.click(screen.getByRole("button", { name: "Aktion erforderlich" }));
  expect(screen.getByRole("group", { name: "Aktion erforderlich" })).toHaveTextContent("Settings → Beta");
  view.unmount();
});
