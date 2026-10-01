/* This device's name, as the machines it pairs with list it (operator, 2026-10-02): by default the computer's own
 * name where the desktop app can read it, else what the browser says it runs on; the person may change it in
 * General. It names pairings made from then on; renaming it on machines already paired needs the core
 * (sidevoice-core: a device rename). */
import { desktopHost } from "../services/desktop-host";
import { deviceName as browserDeviceName } from "../services/device-pairing.js";

const KEY = "sidevoice.deviceName";

/** The name to pair with: the one chosen, else the computer's, else «Sidevoice en Mac» (from the browser). */
export function currentDeviceName(say: (where: string) => string): string {
  try { const chosen = localStorage.getItem(KEY); if (chosen?.trim()) return chosen.trim(); } catch { /* none kept */ }
  const computer = desktopHost()?.computerName?.trim();
  if (computer) return computer;
  const where = browserDeviceName().replace(/^Sidevoice( en )?/, "");
  return where ? say(where) : "Sidevoice";
}

export function setDeviceName(name: string) {
  try { if (name.trim()) localStorage.setItem(KEY, name.trim()); else localStorage.removeItem(KEY); } catch { /* not kept */ }
}
