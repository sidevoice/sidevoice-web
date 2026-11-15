import { act, render } from "@testing-library/react";
import { onTestFinished } from "vitest";
import type { ReactNode } from "react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { installApp } from "../../host/testing";
import type { PairingSummary } from "../../services/device-pairing.js";
import { installLogSources, type LogSources } from "./log-sources";
import type { LogEvent, LogPiece } from "./log-model";

/* What the tests of this feature share: a room with the machines it is paired with (answering or not), an app that sends crash
 * reports, and log sources that serve what the test gives. */

export const THIS: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
export const NUC: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
export const LAPTOP: PairingSummary = { fp: "fp-old", host: "Old laptop", urls: ["https://laptop.example"], device_id: "d-old", paired_at: 1_690_000_000, revoked: false };

/** An app that sends crash reports and is told the choice (`set`), with whatever else the test gives it. */
export const withApp = (members: Record<string, unknown> = {}) => {
  installApp({ crashReports: { set: async () => undefined }, ...members });
};

/** The machines the room is paired with, each `ok` (answering) or `away` (not), as the room's links say it. */
export function roomWith(machines: [PairingSummary, "ok" | "away"][] = [[NUC, "ok"]], facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  act(() => {
    store.patch({ pairings: machines.map(([pairing]) => pairing), machinesReady: true,
      machineLinks: Object.fromEntries(machines.map(([pairing, reach]) => [pairing.fp, { reach, via: "node" }])) as never, ...facts } as never);
  });
  return store;
}

export function renderInRoom(ui: ReactNode, store = roomWith()) {
  const view = render(<RoomProvider store={store} runtime={false}>{ui}</RoomProvider>);
  return { store, ...view };
}

export const event = (id: string, piece: LogPiece, text: string): LogEvent => ({ id, piece, text });

/** Log sources that serve `events` for any place (oldest first, cut to what is asked), and tell followers what `push` gives. */
export function serving(events: LogEvent[] | ((place: unknown) => LogEvent[])) {
  const followers = new Set<(events: LogEvent[]) => void>();
  const reads: unknown[] = [];
  const sources: LogSources = { open: (place) => ({
    tail: async (lines) => { reads.push(place); const all = typeof events === "function" ? events(place) : events; return all.slice(-lines); },
    follow: (onEvents) => { followers.add(onEvents); return () => { followers.delete(onEvents); }; },
  }) };
  const restore = installLogSources(sources);
  onTestFinished(restore);
  return { reads, push: (...more: LogEvent[]) => act(async () => { for (const follower of followers) follower(more); await new Promise((resolve) => setTimeout(resolve, 30)); }), followers };
}
