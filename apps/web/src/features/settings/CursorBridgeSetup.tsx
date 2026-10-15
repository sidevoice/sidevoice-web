import { useState } from "react";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator, type MessageKey } from "../../i18n/translator";
import type { CursorBridgeReason, CursorBridgeState, CursorBridgeStatus, CursorBridgeStepId, CursorBridgeStepState } from "../../state/room-types";

const states: Record<CursorBridgeState, MessageKey> = {
  ready: "agents.cursorBridge.state.ready",
  needs_attention: "agents.cursorBridge.state.needs_attention",
  unknown: "agents.cursorBridge.state.unknown",
  unsupported: "agents.cursorBridge.state.unsupported",
};
const reasons: Record<CursorBridgeReason, MessageKey> = {
  cursor_version_too_old: "agents.cursorBridge.reason.cursor_version_too_old",
  bridge_missing: "agents.cursorBridge.reason.bridge_missing",
  bridge_stale: "agents.cursorBridge.reason.bridge_stale",
  sqlite3_missing: "agents.cursorBridge.reason.sqlite3_missing",
  sidevoice_not_registered: "agents.cursorBridge.reason.sidevoice_not_registered",
  cursor_version_unknown: "agents.cursorBridge.reason.cursor_version_unknown",
  registration_unknown: "agents.cursorBridge.reason.registration_unknown",
  editor_unavailable: "agents.cursorBridge.reason.editor_unavailable",
};
const steps: Record<CursorBridgeStepId, MessageKey> = {
  cursor_version: "agents.cursorBridge.step.cursor_version",
  enable_desktop_bridge: "agents.cursorBridge.step.enable_desktop_bridge",
  bridge_running: "agents.cursorBridge.step.bridge_running",
  sqlite3: "agents.cursorBridge.step.sqlite3",
  register_sidevoice: "agents.cursorBridge.step.register_sidevoice",
  join_editor_chat: "agents.cursorBridge.step.join_editor_chat",
  wait_for_chat_registration: "agents.cursorBridge.step.wait_for_chat_registration",
};
const stepStates: Record<CursorBridgeStepState, MessageKey> = {
  done: "agents.cursorBridge.stepState.done",
  needs_action: "agents.cursorBridge.stepState.needs_action",
  unknown: "agents.cursorBridge.stepState.unknown",
};

/** The connector reports facts, never prose. Keep bridge readiness separate from MCP registration and per-chat state. */
export function CursorBridgeSetup({ bridge, id }: { bridge: CursorBridgeStatus; id: string }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const state = states[bridge.state] ?? states.unknown;
  const reason = bridge.reason && reasons[bridge.reason];
  return <div className="host-agent-bridge" data-state={bridge.state}>
    <DisclosureButton className="host-agent-bridge-toggle" open={open} controls={id} onClick={() => setOpen((value) => !value)}>
      <span>{t("agents.cursorBridge.title")}</span>
      <span className="host-agent-bridge-state">{t(state)}</span>
    </DisclosureButton>
    {open && <div className="host-agent-bridge-body" id={id} role="group" aria-label={t("agents.cursorBridge.title")}>
      {reason && <p className="host-agent-bridge-reason">{t(reason, { minimum: bridge.minimum_cursor_version })}</p>}
      <p className="host-agent-bridge-requirements">
        {bridge.cursor_version ? t("agents.cursorBridge.version.observed", { version: bridge.cursor_version }) : t("agents.cursorBridge.version.unknown")}
        <span aria-hidden="true"> · </span>{t("agents.cursorBridge.connectorMinimum", { minimum: bridge.minimum_connector_version })}
      </p>
      <ol className="host-agent-bridge-steps">{bridge.steps.map((step) => {
        const status = stepStates[step.state] ?? stepStates.unknown;
        const instruction = steps[step.id];
        if (!instruction) return null;
        return <li key={step.id} data-state={step.state}>
          <span className="host-agent-bridge-step-copy">{t(instruction, { minimum: bridge.minimum_cursor_version })}
            {step.id === "enable_desktop_bridge" && step.state === "unknown" &&
              <span className="host-agent-bridge-setting-note">{t("agents.cursorBridge.settingUnknown")}</span>}
          </span>
          <span className="host-agent-bridge-step-state">{t(status)}</span>
        </li>;
      })}</ol>
    </div>}
  </div>;
}
