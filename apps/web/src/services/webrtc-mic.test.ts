import { beforeEach, expect, test, vi } from "vitest";
import { createMicLink, webrtcAllowed, type MicLinkOptions } from "./webrtc-mic.js";

/* The test environment has no WebRTC, and neither does this pod: everything below runs against a fake peer
 * connection that only records what the page asked of it and moves when the test says so. What a real browser
 * and a real node do with the SDP is not covered here. */
class FakePeer {
  static all: FakePeer[] = [];
  connectionState = "new";
  iceGatheringState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  remote: unknown = null;
  closed = false;
  transceivers: { track: unknown; init: unknown; sender: { track: unknown; replaceTrack: ReturnType<typeof vi.fn> } }[] = [];
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  constructor(public config: unknown) { FakePeer.all.push(this); }
  addTransceiver(track: unknown, init: unknown) {
    const sender = { track, replaceTrack: vi.fn(async (next: unknown) => { sender.track = next; }) };
    const transceiver = { track, init, sender };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  async createOffer() { return { type: "offer", sdp: "v=0 offer" }; }
  async setLocalDescription(description: { type: string; sdp: string }) { this.localDescription = { ...description }; }
  async setRemoteDescription(description: unknown) { this.remote = description; }
  // Like the real one: closing fires no state change.
  close() { this.closed = true; this.connectionState = "closed"; }
  gather() { this.iceGatheringState = "complete"; this.localDescription = { type: "offer", sdp: this.localDescription!.sdp + " a=candidate" }; this.onicegatheringstatechange?.(); }
  move(state: string) { this.connectionState = state; this.onconnectionstatechange?.(); }
}

function fakeClock() {
  let now = 0, next = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout(fn: () => void, ms: number) { timers.set(++next, { at: now + ms, fn }); return next; },
    clearTimeout(id: unknown) { timers.delete(id as number); },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at))
        if (timer.at <= now && timers.delete(id)) timer.fn();
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const track = { kind: "audio", id: "mic-1" } as unknown as MediaStreamTrack;

function attempt(overrides: Partial<MicLinkOptions> = {}) {
  const clock = fakeClock(), said: string[] = [], offers: unknown[] = [];
  const config = vi.fn(async () => ({ enabled: true, ice_servers: [{ urls: ["stun:stun.example:3478"] }] }));
  const link = createMicLink({
    sessionId: "s-1", track, Peer: FakePeer as unknown as typeof RTCPeerConnection, clock, config,
    offer: async (body) => { offers.push(body); return { sdp: "v=0 answer", type: "answer" }; },
    announce: (path) => { said.push(path); },
    ...overrides,
  });
  return { link, clock, said, offers, config, peer: () => FakePeer.all.at(-1)! };
}
/** Up to the point where the node has answered and the page waits for `connected`. */
async function answered(overrides: Partial<MicLinkOptions> = {}) {
  const run = attempt(overrides);
  const started = run.link.start();
  await settle();
  run.peer().gather();
  await started;
  return run;
}

beforeEach(() => { FakePeer.all = []; });

test("the offer carries the session and the gathered candidates, and the node hears webrtc only once connected", async () => {
  const { link, clock, said, offers, peer } = attempt();
  const started = link.start();
  await settle();
  expect(link.state).toBe("negotiating");
  expect(peer().config).toEqual({ iceServers: [{ urls: ["stun:stun.example:3478"] }] });
  expect(peer().transceivers).toHaveLength(1);
  expect(peer().transceivers[0]).toMatchObject({ track, init: { direction: "sendonly" } });   // the same track, sending only
  expect(offers).toEqual([]);   // no trickle: it waits for gathering
  peer().gather();
  await started;
  expect(offers).toEqual([{ session_id: "s-1", sdp: "v=0 offer a=candidate", type: "offer" }]);
  expect(peer().remote).toEqual({ type: "answer", sdp: "v=0 answer" });

  peer().move("connecting");
  expect([said, link.path]).toEqual([[], "socket"]);   // the socket still carries the microphone
  peer().move("connected");
  expect([said, link.path, link.state]).toEqual([["webrtc"], "webrtc", "connected"]);
  clock.advance(60_000);
  expect(link.path).toBe("webrtc");   // the wait for `connected` is over, and nothing else is timing it

  link.close();
  expect(peer().closed).toBe(true);
  expect(said).toEqual(["webrtc", "socket"]);
  expect(link.state).toBe("closed");
});

test("a slow gathering is capped: past it the offer goes with what it has", async () => {
  const { link, clock, offers } = attempt({ gatherMs: 3000 });
  const started = link.start();
  await settle();
  clock.advance(2999);
  expect(offers).toEqual([]);
  clock.advance(1);
  await started;
  expect(offers).toEqual([{ session_id: "s-1", sdp: "v=0 offer", type: "offer" }]);
});

test("an offer the node refuses leaves the microphone on the socket, says why, and was never announced", async () => {
  const run = attempt({ offer: async () => { throw new Error("Esa sesión no está en la sala."); } });
  const started = run.link.start();
  await settle();
  run.peer().gather();
  await started;
  expect(run.link).toMatchObject({ path: "socket", state: "fallback", reason: "offer", detail: "Esa sesión no está en la sala." });
  expect(run.said).toEqual([]);
  expect(run.peer().closed).toBe(true);
});

test("no connection within the wait: back to the socket, and a late connection is not taken", async () => {
  const { link, clock, said, peer } = await answered({ connectMs: 8000 });
  clock.advance(7999);
  expect(link.state).toBe("negotiating");
  clock.advance(1);
  expect(link).toMatchObject({ path: "socket", state: "fallback", reason: "timeout" });
  expect(peer().closed).toBe(true);
  peer().move("connected");   // one attempt per session
  expect([said, link.path]).toEqual([[], "socket"]);
});

test("a connection that fails puts the microphone back on the socket and tells the node", async () => {
  const { link, said, peer } = await answered();
  peer().move("connected");
  peer().move("failed");
  expect(link).toMatchObject({ path: "socket", state: "fallback", reason: "failed" });
  expect(said).toEqual(["webrtc", "socket"]);
  expect(peer().closed).toBe(true);
});

test("a connection that drops: the socket takes the microphone at once, and past the threshold WebRTC is done", async () => {
  const { link, clock, said, peer } = await answered({ disconnectedMs: 3000 });
  peer().move("connected");
  peer().move("disconnected");
  // Nothing said while it decides is lost: the node is told at once and the PCM resumes.
  expect([said, link.path, link.state]).toEqual([["webrtc", "socket"], "socket", "recovering"]);
  clock.advance(2999);
  expect(peer().closed).toBe(false);
  clock.advance(1);
  expect(link).toMatchObject({ path: "socket", state: "fallback", reason: "disconnected" });
  expect(peer().closed).toBe(true);
  expect(said).toEqual(["webrtc", "socket"]);
});

test("a drop that recovers within the threshold gives the microphone back to WebRTC", async () => {
  const { link, clock, said, peer } = await answered({ disconnectedMs: 3000 });
  peer().move("connected");
  peer().move("disconnected");
  clock.advance(1500);
  peer().move("connected");
  expect([said, link.path, link.state]).toEqual([["webrtc", "socket", "webrtc"], "webrtc", "connected"]);
  clock.advance(10_000);
  expect(peer().closed).toBe(false);
});

test("switched off by this device, by the node, or not available: nothing is negotiated and nothing announced", async () => {
  expect(webrtcAllowed({})).toBe(true);
  expect(webrtcAllowed({ search: "?webrtc=0" })).toBe(false);
  expect(webrtcAllowed({ search: "?v=abc&webrtc=0" })).toBe(false);
  expect(webrtcAllowed({ search: "?webrtc=1" })).toBe(true);
  expect(webrtcAllowed({ stored: "off" })).toBe(false);
  expect(webrtcAllowed({ stored: "on", search: "" })).toBe(true);

  const off = attempt({ allowed: false });
  await off.link.start();
  expect(off.link).toMatchObject({ path: "socket", state: "off", reason: "page_off" });
  expect(off.config).not.toHaveBeenCalled();

  const nodeOff = attempt({ config: async () => ({ enabled: false, ice_servers: [] }) });
  await nodeOff.link.start();
  expect(nodeOff.link).toMatchObject({ state: "off", reason: "node_off" });

  const older = attempt({ config: async () => { throw new Error("No se pudo completar la operación"); } });
  await older.link.start();
  expect(older.link).toMatchObject({ state: "off", reason: "unavailable" });

  const noWebrtc = attempt({ Peer: undefined });
  await noWebrtc.link.start();
  expect(noWebrtc.link).toMatchObject({ state: "off", reason: "unsupported" });

  expect(FakePeer.all).toHaveLength(0);
  expect([...off.said, ...nodeOff.said, ...older.said, ...noWebrtc.said]).toEqual([]);
});

test("a session that ends while negotiating posts no offer afterwards", async () => {
  const { link, clock, offers, peer } = attempt();
  const started = link.start();
  await settle();
  link.close();
  clock.advance(3000);
  await started;
  expect(offers).toEqual([]);
  expect(peer().closed).toBe(true);
  expect(link.state).toBe("closed");
});

test("another microphone mid-call keeps the connection with the new track; one it refuses falls back", async () => {
  const { link, peer } = await answered();
  peer().move("connected");
  const next = { kind: "audio", id: "mic-2" } as unknown as MediaStreamTrack;
  link.replaceTrack(next);
  await settle();
  expect(peer().transceivers[0].sender.replaceTrack).toHaveBeenCalledWith(next);
  expect(link.path).toBe("webrtc");

  peer().transceivers[0].sender.replaceTrack.mockRejectedValueOnce(new Error("InvalidModificationError"));
  link.replaceTrack(track);
  await settle();
  expect(link).toMatchObject({ path: "socket", state: "fallback", reason: "track" });
});
