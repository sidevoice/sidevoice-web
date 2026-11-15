import { act, render } from "@testing-library/react";
import { onTestFinished } from "vitest";
import type { ReactNode } from "react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { installApp } from "../../host/testing";
import type { PairingSummary } from "../../services/device-pairing.js";
import { installLogSources, type LogBatch, type LogSources } from "./log-sources";
import type { LogEvent, LogPiece } from "./log-model";

/* What the tests of this feature share: a room with the machines it is paired with (answering or not), an app that sends crash
 * reports, and log sources that serve what the test gives. */

export const THIS: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
export const NUC: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
export const LAPTOP: PairingSummary = { fp: "fp-old", host: "Old laptop", urls: ["https://laptop.example"], device_id: "d-old", paired_at: 1_690_000_000, revoked: false };

/** An app that sends crash reports and holds the choice (`mode`, `auto` by default; `set` changes it, `subscribe` hears of it), with
 *  whatever else the test gives it. `crashReports` replaces the member whole. */
export const withApp = (members: Record<string, unknown> = {}, mode: "auto" | "never" = "auto") => {
  let held = mode;
  const listeners = new Set<(mode: "auto" | "never") => void>();
  installApp({ crashReports: {
    get: async () => held,
    set: async (next: "auto" | "never") => { held = next; },
    subscribe: (listener: (mode: "auto" | "never") => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  }, ...members });
  return { change: (next: "auto" | "never") => { held = next; for (const listener of listeners) listener(next); }, listeners };
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

/** The real timer, taken before a test fakes the clock: the frame the viewer draws in is real time. */
export const realTimeout = globalThis.setTimeout.bind(globalThis);

type Follower = { onLines: (batch: LogBatch) => void; onError?: (error: unknown) => void; onEnd?: () => void };

/** Log sources that serve `events` for any place (oldest first, cut to what is asked), as log-sources.ts says a source does: the
 *  log grows with what `push` or `write` gives it, a read says where it ended (the number of lines written since), and a follow from
 *  a cursor is told what was written after it, then what is written. `push` is a line written while the follow is on; `write`, one
 *  written while nobody follows (between the read and the follow, or while a follow is down); `fail` and `end` end the follows as a
 *  dropped link or a log that ended do. */
export function serving(events: LogEvent[] | ((place: unknown) => LogEvent[])) {
  const followers = new Set<Follower>();
  const reads: unknown[] = [];
  const follows: { place: unknown; sinceCursor: string }[] = [];
  const written: LogEvent[] = [];
  const sources: LogSources = { open: (place) => ({
    tail: async ({ limit }) => {
      reads.push(place);
      const all = [...(typeof events === "function" ? events(place) : events), ...written];
      return { lines: all.slice(-limit), cursor: String(written.length) };
    },
    follow: ({ sinceCursor }, onLines, onError, onEnd) => {
      follows.push({ place, sinceCursor });
      const follower = { onLines, onError, onEnd };
      const missed = written.slice(Number(sinceCursor));
      if (missed.length) onLines({ lines: missed, cursor: String(written.length) });
      followers.add(follower);
      return () => { followers.delete(follower); };
    },
  }) };
  const restore = installLogSources(sources);
  onTestFinished(restore);
  const settle = () => new Promise((resolve) => realTimeout(resolve, 30));
  return {
    reads, follows, followers, written,
    push: (...more: LogEvent[]) => act(async () => { written.push(...more); for (const follower of followers) follower.onLines({ lines: more, cursor: String(written.length) }); await settle(); }),
    write: (...more: LogEvent[]) => { written.push(...more); },
    fail: (error: unknown = new Error("the link dropped")) => act(async () => { for (const follower of [...followers]) { followers.delete(follower); follower.onError?.(error); } await settle(); }),
    end: () => act(async () => { for (const follower of [...followers]) { followers.delete(follower); follower.onEnd?.(); } await settle(); }),
  };
}
