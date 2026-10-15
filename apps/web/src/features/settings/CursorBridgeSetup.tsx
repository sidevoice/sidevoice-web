import { useState } from "react";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator } from "../../i18n/translator";
import type { CursorBridgeStatus } from "../../state/room-types";

/** The bridge readiness is separate from MCP registration and any particular Cursor chat. */
export function CursorBridgeSetup({ bridge, id }: { bridge: CursorBridgeStatus; id: string }) {
  const [open, setOpen] = useState(false);
  if (bridge.state !== "running" && bridge.state !== "not_running") return null;
  const t = translator();
  return <div className="host-agent-bridge" data-state={bridge.state}>
    <DisclosureButton className="host-agent-bridge-toggle" open={open} controls={id} onClick={() => setOpen((value) => !value)}>
      <span className="host-agent-bridge-labels">
        <span>{t("agents.cursorBridge.title")}</span>
        <span className="host-agent-bridge-state">{t(bridge.state === "running" ? "agents.cursorBridge.state.ready" : "agents.cursorBridge.state.needs_attention")}</span>
      </span>
    </DisclosureButton>
    {open && <div className="host-agent-bridge-body" id={id} role="group" aria-label={t("agents.cursorBridge.title")}>
      <p>{t("agents.cursorBridge.dependency")}</p>
      {bridge.state === "not_running" && <p>{t("agents.cursorBridge.instruction")}</p>}
    </div>}
  </div>;
}
