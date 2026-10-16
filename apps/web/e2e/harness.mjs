import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
export async function installHarness(page, { onboarding = { version: 1, choice: "remote", agents_done: false, completed_at: 1, trials: {}, baseline_release: 2 }, secondMachine = false, participants = {}, agents = null, microphone = "granted", voiceReady = true } = {}) {
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
  // The microphone's permission as the browser reads it (the setup's microphone step, web#129): allowed unless a test
  // says otherwise, so a setup walked to a later step is not stopped at it. Only the read: nothing here opens a microphone.
  await page.addInitScript((state) => {
    const permissions = navigator.permissions;
    if (!permissions) return;
    const query = permissions.query.bind(permissions);
    const status = Object.assign(new EventTarget(), { name: "microphone", state, onchange: null });
    permissions.query = (descriptor) => descriptor?.name === "microphone" ? Promise.resolve(status) : query(descriptor);
    // A computer with a microphone plugged in: the setup reads an allowed permission with no input device as "none found",
    // and a headless browser lists none.
    const devices = navigator.mediaDevices;
    if (devices) devices.enumerateDevices = async () => [{ kind: "audioinput", deviceId: "default", groupId: "e2e", label: "", toJSON() { return this; } }];
  }, microphone);
  // A finished setup is a room whose voice works (the default flow shows the Voice setup card, not the stage, while the
  // models are not ready): the installed local transcription and voice the device's own settings choose, once the room
  // has read them. A spec that wants them missing passes `voiceReady: false`.
  if (voiceReady) await page.addInitScript(() => {
    const model = (id, capability) => ({ id, family: "e2e", capabilities: [capability], languages: ["en"], voices: [], installed: true,
      builds: [{ id: id + "/e2e", backend: "e2e", precision: "e2e", accelerator: "cpu", available: true, installed: true, reasons: [] }] });
    // Whenever the room reads the catalogue (it does again after a download, a change of settings, a retry), what it reads
    // is these models, installed: the harness has no engine to install them in.
    let seeded = null;
    const timer = setInterval(() => {
      const store = window.sidevoiceUI?.store;
      if (!store?.subscribe) return;
      clearInterval(timer);
      const seed = (state) => {
        const { voiceSettings, voiceCatalogue } = state.facts;
        if (!voiceSettings || !["ready", "failed"].includes(voiceCatalogue.state) || voiceCatalogue.catalogs === seeded) return;
        seeded = [{ id: "local", name: null, status: { stale: false }, models: [model(voiceSettings.stt.model, "stt"), model(voiceSettings.tts.model, "tts")] }];
        store.patch({ voiceCatalogue: { state: "ready", error: "", catalogs: seeded } });
      };
      store.subscribe(seed);
      seed(store.getState());
    }, 20);
  });
  await page.addInitScript(({ hostPairing, otherPairing, onboarding }) => {
    localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [hostPairing, ...(otherPairing ? [otherPairing] : [])] }));
    localStorage.setItem("sidevoice.onboarding", JSON.stringify(onboarding));
    // Machines in the list layout (VARIANTS machines B): these follow a machine from its row to its page and back.
    localStorage.setItem("sidevoice.variants", JSON.stringify({ machines: "b" }));
    window.__SIDEVOICE_TARGET__ = window.location.origin;
  }, { hostPairing: pairing, otherPairing: secondMachine ? secondPairing : null, onboarding });
  return fake;
}


/** Serve the installed voice package as browser modules for deterministic host/WASM contract tests. */
export async function installVoicePackageRoute(page) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../node_modules/@sidevoice/voice");
  await page.route("**/voice-contract/**", (route) => {
    const relative = new URL(route.request().url()).pathname.split("/voice-contract/")[1];
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return route.abort();
    return route.fulfill({ body: readFileSync(file), contentType: file.endsWith(".wasm") ? "application/wasm" : "text/javascript" });
  });
}
