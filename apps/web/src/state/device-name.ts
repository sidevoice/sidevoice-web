import { desktopHost } from "../services/desktop-host";

const DEVICE_NAME_KEY = "sidevoice.deviceName";

/** What this device is, for its default name: the browser (or the Sidevoice app) and the system it runs on — so a
 *  machine's list of paired devices reads "Chrome on Mac", "Safari on iPhone", "Sidevoice app on Mac". */
export function deviceKind(nav: { userAgent?: string; platform?: string; userAgentData?: { platform?: string } } | undefined = globalThis.navigator): { app: string | null; os: string } {
  const agent = String(nav?.userAgent || "");
  const text = agent + " " + String(nav?.userAgentData?.platform || nav?.platform || "");
  const os = /iPhone/.test(text) ? "iPhone" : /iPad/.test(text) ? "iPad" : /Android/.test(text) ? "Android"
    : /Mac/.test(text) ? "Mac" : /Win/.test(text) ? "Windows" : /CrOS/.test(text) ? "ChromeOS" : /Linux/.test(text) ? "Linux" : "";
  const app = desktopHost() ? null
    : /Edg\//.test(agent) ? "Edge" : /OPR\/|Opera/.test(agent) ? "Opera" : /Firefox\/|FxiOS/.test(agent) ? "Firefox"
    : /CriOS|Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "";
  return { app, os };
}

/** The pairing name shared by General and the next device pairing: the person's own, else "{browser} on {system}"
 *  (`say` puts it in words, in the interface's language), else "Sidevoice". */
export function currentDeviceName(say: (kind: "browser" | "app", params: { browser: string; os: string }) => string) {
  try {
    const saved = globalThis.localStorage?.getItem(DEVICE_NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 60);
  } catch { /* Name it by what it is. */ }
  const { app, os } = deviceKind();
  if (app === null) return say("app", { browser: "", os: os || "?" }).replace(/ \?$/, "").slice(0, 60);
  if (!app && !os) return "Sidevoice";
  return say("browser", { browser: app || "Browser", os: os || "?" }).slice(0, 60);
}
