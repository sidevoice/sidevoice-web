import { afterEach, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AgentReadiness, AgentReadinessDetails } from "./AgentReadiness";
import { setUiLanguage, translator, UI_LANGUAGES } from "../../i18n/translator";
import type { AgentReadinessStatus } from "../../state/room-types";

function Card({ readiness }: { readiness: AgentReadinessStatus }) {
  const [open, setOpen] = useState(false);
  return <><AgentReadiness readiness={readiness} id="agent-readiness" open={open} onToggle={() => setOpen((value) => !value)} />
    {open && <AgentReadinessDetails readiness={readiness} id="agent-readiness" />}</>;
}
const show = (readiness: AgentReadinessStatus) => render(<Card readiness={readiness} />);
afterEach(() => setUiLanguage("en"));

test("ready says nothing", () => {
  const ready = show({ state: "ready", reasons: [] });
  expect(ready.container).toBeEmptyDOMElement();
  ready.unmount();
});

test("unsupported opens its known reason, preserving other reasons and translating unknown codes", () => {
  show({ state: "unsupported", reasons: [
    { code: "cursor.unsupported", message: "Connector English must not replace the translation." },
    { code: "future.unavailable", message: "Try the new agent setup." },
    { code: "cursor.bridge_not_running", message: "Connector English must not replace the translation." },
  ] });
  const button = screen.getByRole("button", { name: "Not supported" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  const group = screen.getByRole("group", { name: "Not supported" });
  expect([...group.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
    translator()("agents.readiness.cursor.unsupported"), "Try the new agent setup.",
    translator()("agents.readiness.cursor.bridge_not_running"),
  ]);
  expect(group).not.toHaveTextContent("future.unavailable");
});

test("unsupported with only an unknown reason shows the translated fallback", () => {
  show({ state: "unsupported", reasons: [{ code: "future.unsupported" }] });
  fireEvent.click(screen.getByRole("button", { name: "Not supported" }));
  expect(screen.getByRole("group", { name: "Not supported" })).toHaveTextContent(translator()("agents.readiness.unknown_reason"));
});

test("Cursor bridge reason opens one translated dependency and setup explanation", () => {
  show({ state: "needs_attention", reasons: [{ code: "cursor.bridge_not_running", message: "Connector English fallback" }] });
  const button = screen.getByRole("button", { name: "Needs attention" });
  expect(button).toHaveAttribute("aria-controls", "agent-readiness");
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  const group = screen.getByRole("group", { name: "Needs attention" });
  expect(group.querySelectorAll("p")).toHaveLength(1);
  expect(group).toHaveTextContent("Voice in the Cursor editor needs Cursor's Desktop Bridge");
  expect(group).toHaveTextContent("Settings › Beta");
  expect(group).toHaveTextContent("Allow CLI to access desktop agents");
  expect(group).toHaveTextContent("restart Cursor");
  expect(group).not.toHaveTextContent("sqlite3");
  expect(group).not.toHaveTextContent("Join the Sidevoice");
  expect(group).not.toHaveTextContent("Connector English fallback");
});

test("multiple reasons render in order; an unknown code uses its message", () => {
  show({ state: "needs_attention", reasons: [
    { code: "cursor.bridge_not_running", message: "Connector English fallback" },
    { code: "future.secret_code", message: "Check the new agent setting." },
  ] });
  fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
  const group = screen.getByRole("group", { name: "Needs attention" });
  expect([...group.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
    translator()("agents.readiness.cursor.bridge_not_running"), "Check the new agent setting.",
  ]);
  expect(group).not.toHaveTextContent("future.secret_code");
});

test("all eight catalogues contain only the final readiness keys", () => {
  expect(UI_LANGUAGES).toHaveLength(8);
  const keys = ["agents.readiness.needs_attention", "agents.readiness.unsupported",
    "agents.readiness.unknown_reason", "agents.readiness.cursor.bridge_not_running", "agents.readiness.cursor.unsupported"] as const;
  for (const language of UI_LANGUAGES) {
    const t = translator(language);
    for (const key of keys) expect(t(key), `${language}: ${key}`).not.toBe(key);
  }
  setUiLanguage("de");
  const view = show({ state: "needs_attention", reasons: [{ code: "cursor.bridge_not_running", message: "English fallback" }] });
  fireEvent.click(screen.getByRole("button", { name: "Aktion erforderlich" }));
  expect(screen.getByRole("group", { name: "Aktion erforderlich" })).toHaveTextContent("Settings → Beta");
  expect(screen.getByRole("group", { name: "Aktion erforderlich" })).not.toHaveTextContent("English fallback");
  view.unmount();
  const unknown = show({ state: "needs_attention", reasons: [{ code: "cursor.future_code", message: "Use the connector's English instruction." }] });
  fireEvent.click(screen.getByRole("button", { name: "Aktion erforderlich" }));
  expect(screen.getByRole("group", { name: "Aktion erforderlich" })).toHaveTextContent("Use the connector's English instruction.");
  unknown.unmount();
});
