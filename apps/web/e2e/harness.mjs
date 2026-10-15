import { createHash, generateKeyPairSync, sign } from "node:crypto";

/* The paired machine the e2e specs talk to, answered at the page's own origin: its identity proved with a real P-256
 * key, and its Agents API faked (salvaged from #48). `onboarding` is the setup's record the page starts with. */

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const spki = publicKey.export({ type: "spki", format: "der" });
const hostFingerprint = createHash("sha256").update(spki).digest("base64url");
const pairing = {
  fp: hostFingerprint,
  public_key: spki.toString("base64"),
  host: "E2E Host",
  urls: ["http://127.0.0.1:4173"],
  rv: null,
  device_id: "device-e2e",
  token: "e2e-device-token",
  paired_at: 1_790_000_000,
};

/* A second paired machine, elsewhere on the network (https), with its own key and token: the device is connected to
 * both at once. */
const second = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const secondSpki = second.publicKey.export({ type: "spki", format: "der" });
export const SECOND_HOST = "second.e2e.example";
const secondPairing = {
  fp: createHash("sha256").update(secondSpki).digest("base64url"),
  public_key: secondSpki.toString("base64"),
  host: "Second Host",
  urls: ["https://" + SECOND_HOST],
  rv: null,
  device_id: "device-e2e-2",
  token: "e2e-second-token",
  paired_at: 1_790_000_100,
};

// As the connector reports them: what it can do itself (`can`), and the steps by hand (`manual`) for each.
const foreignCodex = {
  id: "codex", label: "Codex", present: true, version: "1.0", registration: "foreign", connect: "manual", actionable: false,
  can: { connect: true, update: true, disconnect: true },
  manual: { replace: [{ command: "codex mcp remove sidevoice" }, { command: "codex mcp add sidevoice -- /opt/sidevoice/bin/connector mcp --stdio" }] },
};
const claude = (connected = false, actionable = true) => ({
  id: "claude", label: "Claude Code", present: true, version: "1.0", registration: connected ? "connected" : "not-connected",
  connect: "auto", actionable, can: { connect: true, update: true, disconnect: true },
  manual: { connect: [{ command: "claude mcp add sidevoice" }], disconnect: [{ command: "claude mcp remove sidevoice" }] },
});
export const listing = ({ connected = false, actionable = true } = {}) => ({
  agents: [foreignCodex, claude(connected, actionable)], scanned_at: "2026-10-02T12:00:00Z",
});

export async function respond(route, value, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

/** The paired machine, answering at the page's own origin; what it was asked, and how it answers next. */
export async function installHarness(page, { onboarding = { version: 1, choice: "remote", agents_done: false, deferred_at: null, completed_at: 1, trials: {}, baseline_release: 2 }, secondMachine = false, participants = {}, agents = null } = {}) {
  // `presentation`: every presentation request, with the machine it went to and the token it carried.
  const fake = { scans: 0, hostMode: "normal", connectMode: "success", authorization: [], presentation: [] };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const machine = url.host === SECOND_HOST ? "second" : "first";
    if (machine === "second" && !secondMachine) return route.abort();
    if (pathname === "/api/rendezvous") return respond(route, { kind: "node", fingerprint: hostFingerprint });
    if (pathname === "/api/device/identity") {
      const nonce = url.searchParams.get("nonce") || "";
      const key = machine === "second" ? second.privateKey : privateKey;
      const signature = sign("sha256", Buffer.from(`sidevoice-node-identity:${nonce}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
      return respond(route, { public_key: machine === "second" ? secondPairing.public_key : pairing.public_key, signature });
    }
    if (pathname.startsWith("/api/presentation")) fake.presentation.push({ machine, pathname, authorization: request.headers().authorization || "" });
    if (pathname === "/api/presentation") return respond(route, { binding: null, call: null, room: { web_build: null } });
    if (pathname === "/api/presentation/participants") return respond(route, { participants: participants[machine] ?? [] });
    if (pathname === "/api/presentation/history") return respond(route, { messages: [] });
    if (pathname === "/api/host/agents") {
      fake.authorization.push(request.headers().authorization || "");
      if (fake.hostMode === "revoked") return respond(route, { detail: "pairing revoked" }, 401);
      fake.scans++;
      return respond(route, agents ?? listing({ actionable: fake.scans >= 2 }));
    }
    if (pathname === "/api/host/agents/claude/connect") {
      fake.authorization.push(request.headers().authorization || "");
      if (fake.connectMode === "fail") return respond(route, { error: { key: "no-connector" } }, 503);
      return respond(route, listing({ connected: true }));
    }
    if (pathname.startsWith("/api/host/agents/")) return respond(route, listing());
    if (pathname === "/api/device/devices") return respond(route, { devices: [{ id: "device-e2e", name: "This browser", current: true }, { id: "device-phone", name: "Phone" }] });
    if (pathname.startsWith("/api/")) return respond(route, {});
    return route.continue();
  });
  // This device paired with that machine, its first setup finished (so the room shows, not the setup), and the page
  // pointed at the machine: the static site's own origin.
  await page.addInitScript(({ hostPairing, otherPairing, onboarding }) => {
    localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [hostPairing, ...(otherPairing ? [otherPairing] : [])] }));
    localStorage.setItem("sidevoice.onboarding", JSON.stringify(onboarding));
    // Machines in the list layout (VARIANTS machines B): these follow a machine from its row to its page and back.
    localStorage.setItem("sidevoice.variants", JSON.stringify({ machines: "b" }));
    window.__SIDEVOICE_TARGET__ = window.location.origin;
  }, { hostPairing: pairing, otherPairing: secondMachine ? secondPairing : null, onboarding });
  return fake;
}
