import { afterEach, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CursorBridgeSetup } from "./CursorBridgeSetup";
import { setUiLanguage, translator, UI_LANGUAGES } from "../../i18n/translator";
import type { CursorBridgeReason, CursorBridgeStatus } from "../../state/room-types";

const base: CursorBridgeStatus = {
  state: "needs_attention", reason: "bridge_missing", cursor_version: "3.22.12",
  minimum_cursor_version: "3.22.12", minimum_connector_version: "0.9.0",
  steps: [
    { id: "cursor_version", state: "done" },
    { id: "enable_desktop_bridge", state: "unknown" },
    { id: "bridge_running", state: "needs_action" },
    { id: "sqlite3", state: "done" },
    { id: "register_sidevoice", state: "done" },
    { id: "join_editor_chat", state: "unknown" },
    { id: "wait_for_chat_registration", state: "unknown" },
  ],
};
const show = (bridge: CursorBridgeStatus) => {
  const view = render(<CursorBridgeSetup bridge={bridge} id="cursor-setup" />);
  const title = translator()("agents.cursorBridge.title");
  const button = screen.getByRole("button", { name: new RegExp(title) });
  fireEvent.click(button);
  return { view, panel: screen.getByRole("group", { name: title }), button };
};
afterEach(() => setUiLanguage("en"));

test("bridge status stays separate from the setup steps, with the setting unknown rather than off", () => {
  const { panel, button } = show(base);
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(button).toHaveAttribute("aria-controls", "cursor-setup");
  expect(button).toHaveTextContent("Needs attention");
  expect(panel).toHaveTextContent("No running Desktop Bridge was found.");
  expect(panel).toHaveTextContent("Cursor 3.22.12");
  expect(panel).toHaveTextContent("Sidevoice service 0.9.0 or newer required");
  const steps = [...panel.querySelectorAll(".host-agent-bridge-steps li")];
  expect(steps).toHaveLength(7);
  expect(steps.map((step) => step.getAttribute("data-state"))).toEqual(["done", "unknown", "needs_action", "done", "done", "unknown", "unknown"]);
  expect(steps[1]).toHaveTextContent("Settings → Beta");
  expect(steps[1]).toHaveTextContent("Allow CLI to access desktop agents");
  expect(steps[1]).toHaveTextContent("Sidevoice cannot read this setting; check it in Cursor.");
  expect(steps[1]).toHaveTextContent("Not verified");
  expect(panel).toHaveTextContent("~/.cursor/desktop-bridge/*.json");
  expect(panel).toHaveTextContent("sqlite3");
  expect(panel).toHaveTextContent("new Cursor editor chat");
  expect(panel).toHaveTextContent("bridge_chat_known is true");
  fireEvent.click(button);
  expect(screen.queryByRole("group", { name: "Desktop Bridge setup" })).toBeNull();
});

test("ready, attention, unknown, and unsupported use distinct summaries without calling unsupported an error", () => {
  for (const [state, reason, summary] of [
    ["ready", null, "Ready"], ["needs_attention", "bridge_stale", "Needs attention"],
    ["unknown", "cursor_version_unknown", "Cannot verify"], ["unsupported", "editor_unavailable", "Unsupported"],
  ] as const) {
    const { view, panel, button } = show({ ...base, state, reason });
    expect(button).toHaveTextContent(summary);
    expect(button.closest(".host-agent-bridge")).toHaveAttribute("data-state", state);
    if (reason === null) expect(panel.querySelector(".host-agent-bridge-reason")).toBeNull();
    if (reason === "editor_unavailable") expect(panel).toHaveTextContent("the CLI alone cannot use the Desktop Bridge");
    view.unmount();
  }
});

test("every connector reason is localized and the unknown version is not presented as an old version", () => {
  const cases: [CursorBridgeReason, string][] = [
    ["cursor_version_too_old", "Update Cursor to 3.22.12"],
    ["bridge_missing", "No running Desktop Bridge"],
    ["bridge_stale", "file was found"],
    ["sqlite3_missing", "cannot find sqlite3"],
    ["sidevoice_not_registered", "not connected to Sidevoice"],
    ["cursor_version_unknown", "version could not be verified"],
    ["registration_unknown", "registration could not be verified"],
    ["editor_unavailable", "editor is unavailable"],
  ];
  for (const [reason, words] of cases) {
    const { view, panel } = show({ ...base, reason, cursor_version: null });
    expect(within(panel).getByText((text) => text.includes(words))).toBeInTheDocument();
    expect(panel).toHaveTextContent("Cursor version not verified");
    view.unmount();
  }
});

test("the new copy exists in all eight catalogues, including the unreadable-setting explanation", () => {
  expect(UI_LANGUAGES).toHaveLength(8);
  for (const language of UI_LANGUAGES) {
    const t = translator(language);
    for (const key of ["agents.cursorBridge.title", "agents.cursorBridge.state.unsupported", "agents.cursorBridge.reason.editor_unavailable",
      "agents.cursorBridge.step.enable_desktop_bridge", "agents.cursorBridge.step.wait_for_chat_registration", "agents.cursorBridge.settingUnknown"] as const)
      expect(t(key), `${language}: ${key}`).not.toBe(key);
    expect(t("agents.cursorBridge.step.cursor_version", { minimum: "3.22.12" })).toContain("3.22.12");
  }
  setUiLanguage("es");
  const { panel, view } = show({ ...base, reason: "bridge_missing" });
  expect(panel).toHaveTextContent("No se encontró ningún Desktop Bridge en ejecución.");
  expect(panel).toHaveTextContent("Sidevoice no puede leer este ajuste");
  view.unmount();
});
