import { useVariant } from "../lib/variants";
import { useRoomStore } from "./room-store";

/** Where this computer is shown in Settings (VARIANTS `this-computer`): one entry under Machines (`in-machines`), or
 *  a section of its own above Machines wherever this device can host (`own-section`), Machines then the other
 *  machines alone. */
export const THIS_COMPUTER = ["in-machines", "own-section"] as const;
export function useThisComputerSection() {
  const placed = useVariant("this-computer", THIS_COMPUTER);
  // Where this device can host (the desktop app), whatever is paired: a browser or a phone never has it.
  const canHost = useRoomStore((state) => state.facts.localHostAvailable);
  return placed === "own-section" && canHost;
}
