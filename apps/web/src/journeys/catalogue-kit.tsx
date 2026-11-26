import { useEffect, useRef, useState, type ReactNode } from "react";
import { installApp, removeApp } from "../host/testing";
import { installLogSources } from "../features/crash-reports/log-sources";
import { createRoomStore, RoomStoreContext } from "../state/room-store";
import { fixtureLogSources, type FixtureOptions } from "./log-fixtures";

/* What the catalogue's stories stand in for, as the journeys' storyboard does: an app (the members it gives the page), the
 * logs a place can be read from, and a room with this device and two machines. It lives beside the storyboard because
 * only the dev harness may inject an app (lint/host-rules.mjs: `host/testing`). A story file imports this, never the host. */

/** How many specimens hold the app now: the app goes away with the last of them (the "light + dark" toolbar draws a story twice). */
let holders = 0;

/** Stands `members` in for the app while it is on the page. One app per story: two specimens that need different apps
 *  belong in two stories (the page has one host). Installed while rendering, since the children read the host as they draw. */
export function AppHost({ members, children }: { members: Record<string, unknown>; children: ReactNode }) {
  const held = useRef(false);
  if (!held.current) { held.current = true; holders++; installApp(members); }
  useEffect(() => () => { if (--holders === 0) removeApp(); }, []);
  return <>{children}</>;
}

/** Makes the fixture logs what the viewer reads (sample lines for this device, the NUC and the old laptop, seeded the same on
 *  every visit), and takes them away with the story. `none`: nothing can be read from here, as in a browser. */
export function LogSourcesHost({ options, children }: { options: FixtureOptions | "none"; children: ReactNode }) {
  const [remove] = useState(() => options === "none" ? null : installLogSources(fixtureLogSources(options)));
  useEffect(() => () => remove?.(), [remove]);
  return <>{children}</>;
}

const NUC = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const LAPTOP = { fp: "fp-old", host: "Old laptop", urls: ["https://laptop.example"], device_id: "d-old", paired_at: 1_690_000_000, revoked: false };
const THIS = { fp: "fp-local", host: "MacBook", urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false, local: true };
const RUNNING = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.4.0", api: 1 }, calls: 0 };

/** The room's store with this device (its service running), the NUC (answering) and an old laptop (not). */
export function LogsRoom({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch({
      machinesReady: true, pairings: [THIS, NUC, LAPTOP], callNode: NUC.fp, localHostStatus: RUNNING, localHostAvailable: true,
      machineLinks: { [THIS.fp]: { reach: "ok", via: "node" }, [NUC.fp]: { reach: "ok", via: "node" }, [LAPTOP.fp]: { reach: "away", via: "" } },
    } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

const noop = () => undefined;
const later = () => Promise.resolve(undefined);

/** A desktop app as the catalogue stands it in: it sends crash reports (and holds the person's choice, as an app does, so a
 *  change made in a story stays in it), says its build and its install id, runs this device's service and can open its log's
 *  folder. Every story that needs an app uses this one, so that the overview board, which draws many stories on one page (and a page
 *  has one host), shows each as it is; a story that shows another state of the app says so by what it overrides. */
export function desktopApp(overrides: { mode?: "auto" | "never"; build?: Record<string, unknown>; installId?: (() => Promise<{ installId: string | null }>) | null } = {}): Record<string, unknown> {
  let held = overrides.mode ?? "auto";
  const installId = overrides.installId === undefined ? async () => ({ installId: "9c1e4b27f08a4d63b5e2a7d19c3f6e80" }) : overrides.installId;
  return {
    build: overrides.build ?? { channel: "release", version: "0.34.1" },
    crashReports: { get: async () => held, set: async (next: typeof held) => { held = next; }, ...(installId ? { installId } : {}) },
    localHost: { state: async () => RUNNING, subscribe: () => noop, pairing: async () => null, start: later, stop: later, restart: later, serviceInstall: later, serviceUninstall: later, revealLog: later },
  };
}

/** Waits for what a story's `play` needs to have been drawn. */
export const drawn = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

/** A text typed into a field, as React hears it. */
export function typeInto(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
