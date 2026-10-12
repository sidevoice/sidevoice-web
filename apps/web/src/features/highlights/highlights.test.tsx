import { afterEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { NewMark } from "./highlights";
import { RoomHeader } from "../room/RoomHeader";
import { MachineList } from "../room/MachineList";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* The setup's state, as the provider would say it: whether its record is read, and whether it was finished. */
const setup = vi.hoisted(() => ({ ready: true, completed_at: null as number | null }));
vi.mock("../onboarding/onboarding-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../onboarding/onboarding-context")>()),
  useOnboardingIfAny: () => ({
    ready: setup.ready, open: false, markFeatures: async () => true,
    record: { completed_at: setup.completed_at, deferred_at: null, baseline_release: 999, features: {} },
  }),
}));

afterEach(() => { setup.ready = true; setup.completed_at = null; });

/* Nothing is new during the first-run setup, and what was there then never becomes new after it. */

const agent = (id: string): DetectedAgent => ({
  id, label: id, present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] },
});
const listing = (ids: string[]): HostAgentsState => ({
  status: "ready", value: { agents: ids.map(agent), scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } },
  error: null, busy: {}, actionErrors: {},
});
const pairing = (fp: string): PairingSummary => ({ fp, host: fp.toUpperCase(), urls: [`https://${fp}.example`], rv: null,
  device_id: `device-${fp}`, paired_at: 1_700_000_000, revoked: false });

const seen = () => JSON.parse(localStorage.getItem("sidevoice.highlights") || "{}") as Record<string, { shownAt: number; seenAt?: number }>;
const gear = () => document.getElementById("settings-open") as HTMLButtonElement;

function room(fp: string, ids: string[]) {
  const store = createRoomStore();
  act(() => store.patch({ pairings: [pairing(fp)], machinesReady: true, hostAgents: { [fp]: listing(ids) } } as never));
  const marks = () => <>{ids.map((id) => <NewMark key={id} id={`agent:${fp}:${id}`} />)}</>;
  const view = render(<RoomProvider store={store} runtime={false}><RoomHeader /><MachineList />{marks()}</RoomProvider>);
  return { store, view, rerender: () => view.rerender(<RoomProvider store={store} runtime={false}><RoomHeader /><MachineList />{marks()}</RoomProvider>) };
}

test("during the setup an agent a paired machine can connect is not new anywhere, and is recorded as seen", () => {
  room("fp-setup", ["codex"]);
  expect(document.querySelector(".new-mark")).toBeNull();
  expect(document.querySelector(".new-on-icon-dot")).toBeNull();
  expect(gear().querySelector(".settings-notice-dot")).toBeNull();
  expect(gear()).not.toHaveAttribute("aria-label", expect.stringContaining("new"));
  expect(seen()["agent:fp-setup:codex"]?.seenAt).toEqual(expect.any(Number));
});

test("after the setup what was there during it stays not new; an agent that appears after it is new", () => {
  const { store, rerender } = room("fp-after", ["codex"]);
  expect(seen()["agent:fp-after:codex"]?.seenAt).toEqual(expect.any(Number));
  setup.completed_at = 1;
  rerender();
  expect(document.querySelector(".new-mark")).toBeNull();
  expect(gear().querySelector(".settings-notice-dot")).toBeNull();
  act(() => store.patch({ hostAgents: { "fp-after": listing(["codex", "cursor"]) } } as never));
  expect(gear()).toHaveAttribute("aria-label", "Settings, 1 new");
  expect(gear().querySelector(".settings-notice-dot")).not.toBeNull();
  expect(seen()["agent:fp-after:cursor"]).toEqual({ shownAt: expect.any(Number) });
  expect(seen()["agent:fp-after:codex"]?.seenAt).toEqual(expect.any(Number));
});

test("while the setup's record is not read yet nothing shows and nothing is recorded", () => {
  setup.ready = false;
  room("fp-unknown", ["codex"]);
  expect(document.querySelector(".new-mark")).toBeNull();
  expect(document.querySelector(".new-on-icon-dot")).toBeNull();
  expect(gear().querySelector(".settings-notice-dot")).toBeNull();
  expect(seen()["agent:fp-unknown:codex"]).toBeUndefined();
});
