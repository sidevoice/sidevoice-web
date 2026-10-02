import { deviceName as browserDeviceName } from "../services/device-pairing.js";
import { desktopComputerName } from "../services/desktop-host";

const DEVICE_NAME_KEY = "sidevoice.deviceName";

/** The pairing name shared by General and the next device pairing. */
export function currentDeviceName(say: (where: string) => string) {
  try {
    const saved = globalThis.localStorage?.getItem(DEVICE_NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 60);
  } catch { /* Use the device's computer or browser name. */ }
  const computer = desktopComputerName();
  if (computer) return computer.slice(0, 60);
  const browserName = browserDeviceName();
  const where = browserName.replace(/^Sidevoice(?: en | on )?/, "");
  return where ? say(where).slice(0, 60) : "Sidevoice";
}
