/* What the desktop card reads off the host's snapshot. No clock, no DOM. */
import type { CallSnapshot } from "./host";

/** Call model B, the voice switch, as the snapshot says it (FC2): never guessed from what the snapshot carries. */
export const isVoiceSwitch = (call: Pick<CallSnapshot, "callModel">) => call.callModel === "voice-switch";
