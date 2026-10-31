import { clampDeviceName } from "../services/device-name-rules.js";
import { describeBrowser, host } from "../host";

const DEVICE_NAME_KEY = "sidevoice.deviceName";

/** This device's name as machines list it, shared by General, the setup and the next pairing: the person's own; else
 *  the computer's own name where the desktop app knows it ("Mac de Ana"); else "{browser} on {system}" (`say` puts it
 *  in words, in the interface's language); else "Sidevoice". */
export function currentDeviceName(say: (kind: "browser", params: { browser: string; os: string }) => string) {
  try {
    const saved = globalThis.localStorage?.getItem(DEVICE_NAME_KEY)?.trim();
    if (saved) return clampDeviceName(saved);
  } catch { /* Name it by what it is. */ }
  const computer = host().identity.deviceName();
  if (computer) return clampDeviceName(computer);
  // What this browser is, for its default name: the browser and the system it runs on — so a machine's list of paired
  // devices reads "Chrome on Mac", "Safari on iPhone".
  const { app, system } = describeBrowser();
  if (!app && !system) return "Sidevoice";
  return clampDeviceName(say("browser", { browser: app || "Browser", os: system || "?" }));
}
