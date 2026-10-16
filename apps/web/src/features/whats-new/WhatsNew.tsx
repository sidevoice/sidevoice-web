import { useRoomStore } from "../../state/room-store";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { FEATURES } from "./catalogue";

/* What's new for someone already set up: only what a later release added that needs them (FEATURES), never the setup
 * again, and never while the setup is open. It shows as the "new" highlights on each setting (highlights.tsx), seen
 * where they are (decided 2026-10-12: no dialog). Seen there is seen for good; at most three at a time. */
export function useWhatsNew() {
  const onboarding = useOnboardingIfAny();
  const room = useRoomStore((state) => state);
  const record = onboarding?.record;
  // Settled: the setup done (its one derived fact).
  const settled = !!onboarding && !!record && onboarding.done && !onboarding.open;
  const items = !settled ? [] : FEATURES
    .filter((feature) => feature.introducedIn > record!.baseline_release && !feature.achieved(room) && !record!.features[feature.id])
    .sort((a, b) => b.introducedIn - a.introducedIn).slice(0, 3);
  return { items };
}
