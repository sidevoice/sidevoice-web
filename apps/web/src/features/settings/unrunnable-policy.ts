import { useVariant } from "../../lib/variants";

/* What the model pickers do with families and models that no engine here can run (the engine says which, per build:
 * `available` and its reasons). Open question, so two variants behind the VARIANTS panel: `hide` leaves them out of the
 * main view; `disable` (today's look, the default) lists them greyed out, with why. Advanced lists everything either way (ModelRuntime). */
export const UNRUNNABLE_POLICIES = ["disable", "hide"] as const;
export type UnrunnablePolicy = (typeof UNRUNNABLE_POLICIES)[number];

export const UNRUNNABLE_VARIANT = "unrunnable-models";

export function useUnrunnablePolicy(): UnrunnablePolicy {
  return useVariant(UNRUNNABLE_VARIANT, UNRUNNABLE_POLICIES);
}
