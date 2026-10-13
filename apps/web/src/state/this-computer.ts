import { useRoomStore } from "./room-store";

/** Whether this device has a section of its own in Settings ("This device", before Providers; decided 2026-10-12):
 *  in the desktop app only, where it can host — never in a browser (not even one talking to a local Sidevoice) nor on a phone. Machines then lists
 *  the remote machines alone. */
export function useThisComputerSection() {
  return useRoomStore((state) => state.facts.inApp && state.facts.localHostAvailable);
}
