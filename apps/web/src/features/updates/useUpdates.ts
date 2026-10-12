import { useEffect, useState } from "react";
import { localHostBridge, type LocalHostVersion } from "../../services/desktop-host";
import { useRoomStore } from "../../state/room-store";
import { useVoiceLive } from "../call/stage-view";

/* What wants updating, from three places: this page (a newer build the room serves, held while a call is on — out of a
 * call the page reloads itself), the desktop app (its updater, behind the host's `updater` seam; the app has none yet,
 * so nothing shows until it does), and this computer's machine (the bridge's `version()`). A paired machine elsewhere
 * reports no version to this page today, so it cannot be listed. "Later" hides an item for a day, or until a newer
 * version comes. */

export type UpdateKind = "web" | "app" | "machine";
export interface UpdateItem { id: string; kind: UpdateKind; version: string; required: boolean; machine?: string }

/** The desktop app's updater as the host would give it (sidevoice-desktop BRIDGE.md, to be added). */
export interface AppUpdater {
  status(): Promise<{ available: boolean; version?: string; required?: boolean }>;
  subscribe?(listener: () => void): () => void;
  restart(): Promise<void>;
}
export function appUpdater(): AppUpdater | null {
  const host = (globalThis.window as unknown as { __sidevoiceDesktop?: { host?: { updater?: AppUpdater } } } | undefined)?.__sidevoiceDesktop?.host;
  return host?.updater && typeof host.updater.status === "function" ? host.updater : null;
}

const LATER_KEY = "sidevoice.updates-later";
const DAY = 24 * 60 * 60 * 1000;
type Later = Record<string, { version: string; at: number }>;
function readLater(): Later {
  try { return JSON.parse(localStorage.getItem(LATER_KEY) || "{}") ?? {}; } catch { return {}; }
}
export function updateLater(item: UpdateItem) {
  try { localStorage.setItem(LATER_KEY, JSON.stringify({ ...readLater(), [item.id]: { version: item.version, at: Date.now() } })); } catch { /* For this visit only. */ }
  window.dispatchEvent(new Event("sidevoice-updates-later"));
}

export function useUpdates() {
  const web = useRoomStore((state) => state.facts.webUpdate);
  // A call (A), or the voice on (call model B): what a reload or a restart waits for.
  const inCall = useVoiceLive();
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [app, setApp] = useState<{ version: string; required: boolean } | null>(null);
  const [machine, setMachine] = useState<LocalHostVersion | null>(null);
  const [later, setLater] = useState<Later>(readLater);

  useEffect(() => {
    const changed = () => setLater(readLater());
    window.addEventListener("sidevoice-updates-later", changed);
    return () => window.removeEventListener("sidevoice-updates-later", changed);
  }, []);
  useEffect(() => {
    const updater = appUpdater();
    if (!updater) return;
    let current = true;
    const read = () => void updater.status().then((answer) => {
      if (current) setApp(answer.available ? { version: answer.version ?? "", required: !!answer.required } : null);
    }).catch(() => undefined);
    read();
    const stop = updater.subscribe?.(read);
    return () => { current = false; stop?.(); };
  }, []);
  useEffect(() => {
    const bridge = localHostBridge();
    if (typeof bridge?.version !== "function") return;
    let current = true;
    void bridge.version().then((answer) => { if (current) setMachine(answer); }).catch(() => undefined);
    return () => { current = false; };
  }, [status.state, status.core?.version]);

  const items: UpdateItem[] = [];
  if (app) items.push({ id: "app", kind: "app", version: app.version, required: app.required });
  if (web) items.push({ id: "web", kind: "web", version: web, required: false });
  if (machine?.update === "available") items.push({ id: "machine:local", kind: "machine", version: typeof machine.bundled?.version === "string" ? machine.bundled.version : "", required: false });
  // Required ones first, then this device's, then machines'; one put off waits a day or a newer version.
  const shown = items.filter((item) => item.required || !later[item.id] || later[item.id].version !== item.version || Date.now() - later[item.id].at > DAY)
    .sort((a, b) => Number(b.required) - Number(a.required));
  return { items: shown, inCall };
}
