import { useVariant } from "../lib/variants";

/* The call model (VARIANTS `call-model`; briefs/CALL-MODEL-B-SPEC.md): A is today's call, joined and left with the call
 * button; B is the voice switch — the room always open, the voice turned on and off on its own, and the agents muted
 * apart. The runtime reads it once as the page loads (room-session-controller.js) and loads the page again when it
 * changes, since it decides the session's lifecycle; the view follows it here. A is the default. */
export const CALL_MODEL = ["a", "b"] as const;

/** Whether this page shows call model B, the voice switch. */
export function useVoiceSwitch(): boolean {
  return useVariant("call-model", CALL_MODEL) === "b";
}
