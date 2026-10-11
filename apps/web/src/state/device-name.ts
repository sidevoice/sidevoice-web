import { desktopComputerName } from "../services/desktop-host";

const DEVICE_NAME_KEY = "sidevoice.deviceName";

/** What this browser is, for its default name: the browser and the system it runs on — so a machine's list of paired
 *  devices reads "Chrome on Mac", "Safari on iPhone". */
export function deviceKind(nav: { userAgent?: string; platform?: string; userAgentData?: { platform?: string } } | undefined = globalThis.navigator): { app: string; os: string } {
  const agent = String(nav?.userAgent || "");
  const text = agent + " " + String(nav?.userAgentData?.platform || nav?.platform || "");
  const os = /iPhone/.test(text) ? "iPhone" : /iPad/.test(text) ? "iPad" : /Android/.test(text) ? "Android"
    : /Mac/.test(text) ? "Mac" : /Win/.test(text) ? "Windows" : /CrOS/.test(text) ? "ChromeOS" : /Linux/.test(text) ? "Linux" : "";
  const app = /Edg\//.test(agent) ? "Edge" : /OPR\/|Opera/.test(agent) ? "Opera" : /Firefox\/|FxiOS/.test(agent) ? "Firefox"
    : /CriOS|Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "";
  return { app, os };
}

/** This device's name as machines list it, shared by General, the setup and the next pairing: the person's own; else
 *  the computer's own name where the desktop app knows it ("Mac de Ana"); else "{browser} on {system}" (`say` puts it
 *  in words, in the interface's language); else "Sidevoice". */
export function currentDeviceName(say: (kind: "browser", params: { browser: string; os: string }) => string) {
  try {
    const saved = globalThis.localStorage?.getItem(DEVICE_NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 60);
  } catch { /* Name it by what it is. */ }
  const computer = desktopComputerName();
  if (computer) return computer.slice(0, 60);
  const { app, os } = deviceKind();
  if (!app && !os) return "Sidevoice";
  return say("browser", { browser: app || "Browser", os: os || "?" }).slice(0, 60);
}
