import { clampDeviceName } from "../services/device-name-rules.js";
import { host } from "../host";

const DEVICE_NAME_KEY = "sidevoice.deviceName";

/** This device's name as machines list it, shared by General, the setup and the next pairing: the person's own; else the
 *  host's default for it (the computer's own name where the desktop app knows it, "Mac de Ana"; "Chrome on Mac" in a
 *  browser, in the interface's language; else "Sidevoice"). */
export function currentDeviceName() {
  try {
    const saved = globalThis.localStorage?.getItem(DEVICE_NAME_KEY)?.trim();
    if (saved) return clampDeviceName(saved);
  } catch { /* Name it by what it is. */ }
  return clampDeviceName(host().identity.deviceName());
}
