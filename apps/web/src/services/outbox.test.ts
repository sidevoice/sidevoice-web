import { expect, test } from "vitest";
import { createOutbox, OUTBOX_LIMIT } from "./outbox.js";

/* The outbox: entries kept in order until their acknowledgement, bounded by count (never by age), and kept across a
 * reload of the same tab. */

/** IndexedDB as far as the outbox uses it: one database, one store keyed by id, answers on a later turn. The map is the
 *  disk, so two outboxes on the same fake are one tab before and after a reload. */
function fakeIndexedDB(disk = new Map<string, unknown>()) {
  const later = (fn: () => void) => setTimeout(fn, 0);
  let created = false;
  const store = {
    put(value: { id: string }) { disk.set(value.id, structuredClone(value)); },
    delete(id: string) { disk.delete(id); },
    getAll() {
      const request: { result?: unknown[]; onsuccess?: () => void } = {};
      later(() => { request.result = [...disk.values()].map((value) => structuredClone(value)); request.onsuccess?.(); });
      return request;
    },
  };
  const db = { createObjectStore() { created = true; }, transaction: () => ({ objectStore: () => store }) };
  const factory = {
    open() {
      const request: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = {};
      later(() => { request.result = db; if (!created) request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, disk };
}
const entry = (id: string, kind: "user-turn" | "playback" = "user-turn") => ({ id, kind, session_id: "s", node: "mac", payload: { id } });

test("without IndexedDB it keeps entries in memory, oldest first, until each is removed", async () => {
  let now = 1000;
  const box = createOutbox({ indexedDB: null, now: () => now });
  await box.ready;
  box.add(entry("a"));
  box.add(entry("b", "playback"));
  now = 1000;   // the same millisecond: the order they were added in still holds
  box.add(entry("c", "playback"));
  expect(box.list().map((e) => e.id)).toEqual(["a", "b", "c"]);
  expect(box.remove("b")).toBe(true);
  expect(box.remove("b")).toBe(false);
  expect(box.list().map((e) => [e.id, e.kind, e.session_id, e.node])).toEqual([["a", "user-turn", "s", "mac"], ["c", "playback", "s", "mac"]]);
  box.clear();
  expect(box.size).toBe(0);
});

test("it is bounded in count, the oldest going first, and nothing expires with time", async () => {
  let now = 0;
  const box = createOutbox({ indexedDB: null, now: () => now, limit: 3 });
  for (const id of ["a", "b", "c", "d"]) { box.add(entry(id)); now += 100; }
  expect(box.list().map((e) => e.id)).toEqual(["b", "c", "d"]);
  now += 365 * 24 * 3600 * 1000;
  expect(box.list().map((e) => e.id)).toEqual(["b", "c", "d"]);
  expect(OUTBOX_LIMIT).toBe(200);
});

test("a reload of the same tab finds what was not acknowledged, and nothing of another tab's", async () => {
  const { factory, disk } = fakeIndexedDB();
  let now = 1000;
  const before = createOutbox({ scope: "tab-1", indexedDB: factory, now: () => now });
  await before.ready;
  before.add({ ...entry("t1"), payload: { type: "voice-user-turn", data: { text: "hola" } } });
  before.add(entry("t2", "playback"));
  before.remove("t2");
  const other = createOutbox({ scope: "tab-2", indexedDB: factory, now: () => now });
  await other.ready;
  other.add(entry("o1"));
  const after = createOutbox({ scope: "tab-1", indexedDB: factory, now: () => now });
  await after.ready;
  expect(after.list().map((e) => e.id)).toEqual(["t1"]);
  expect(after.get("t1")!.payload).toEqual({ type: "voice-user-turn", data: { text: "hola" } });
  // However long it waits, what tab-2 left is still there for it.
  now += 365 * 24 * 3600 * 1000;
  const back = createOutbox({ scope: "tab-2", indexedDB: factory, now: () => now });
  await back.ready;
  expect(back.list().map((e) => e.id)).toEqual(["o1"]);
});

test("what tabs that never came back left stored is let go oldest first, once there is more of it than the cap", async () => {
  const { factory, disk } = fakeIndexedDB();
  let now = 0;
  for (const tab of ["gone-1", "gone-2", "gone-3"]) {
    const box = createOutbox({ scope: tab, indexedDB: factory, now: () => now, limit: 10 });
    await box.ready;
    box.add(entry(tab + "-a")); now++;
    box.add(entry(tab + "-b")); now++;
  }
  expect(disk.size).toBe(6);
  const live = createOutbox({ scope: "live", indexedDB: factory, now: () => now, limit: 2 });
  await live.ready;
  expect([...disk.keys()].sort()).toEqual(["gone-3-a", "gone-3-b"]);
});

test("an entry acknowledged before the stored ones were read does not come back, and one added meanwhile is stored", async () => {
  const { factory, disk } = fakeIndexedDB();
  const first = createOutbox({ scope: "tab", indexedDB: factory });
  await first.ready;
  first.add(entry("acked"));
  const reloaded = createOutbox({ scope: "tab", indexedDB: factory });
  reloaded.remove("acked");          // the database is still opening
  reloaded.add(entry("fresh"));
  await reloaded.ready;
  expect(reloaded.list().map((e) => e.id)).toEqual(["fresh"]);
  expect([...disk.keys()]).toEqual(["fresh"]);
});

test("a database that cannot be opened leaves the outbox working in memory", async () => {
  const failing = { open() { const request: { onerror?: () => void } = {}; setTimeout(() => request.onerror?.(), 0); return request; } } as unknown as IDBFactory;
  const box = createOutbox({ indexedDB: failing });
  box.add(entry("a"));
  await box.ready;
  expect(box.list().map((e) => e.id)).toEqual(["a"]);
  const throwing = { open() { throw Error("SecurityError"); } } as unknown as IDBFactory;
  const other = createOutbox({ indexedDB: throwing });
  await other.ready;
  other.add(entry("b"));
  expect(other.size).toBe(1);
});
