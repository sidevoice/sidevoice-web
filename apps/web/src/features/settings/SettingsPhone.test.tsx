import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { withMicrophone } from "./with-microphone.test-util";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";
import type { HostAgentsState } from "../../state/room-types";
import { SETTINGS_PHONE_QUERY, useSectionShown } from "./settings-levels";
import { openSettings } from "./open-settings";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* Settings on a phone (PHONE-SETTINGS-SPEC, part 1): the list of sections, a section's page under it, a machine's page
 * under Machines; one history entry per level, Back, Escape and the system's back up a level; a desktop unchanged. */

const build = (id: string) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 63e6, memoryMb: 1, available: true, reasons: [], installed: true });
const model = (id: string, family: string, task: string) =>
  ({ id, family, capabilities: [task], parametersM: 1, license: "MIT", languages: ["es"], voices: [], installed: true, builds: [build(id + "/int8")], recommendedBuild: id + "/int8" });
const catalogs = [
  { id: "local", name: null, status: { stale: false }, models: [model("whisper-base", "whisper", "stt"), model("kokoro-82m-v1.0", "kokoro", "tts")] },
  { id: "openai", name: "OpenAI", status: { stale: false }, models: [] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [] },
] as unknown as CatalogView[];
const paired = (fp: string, host: string, extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp, host, urls: [`https://${host.toLowerCase().replace(/ /g, "-")}.example`], device_id: "d-" + fp, paired_at: 1_700_000_000, revoked: false, ...extra,
});
const NUC = paired("fp-nuc", "NUC");
const LAB = paired("fp-lab", "Lab box", { insecure: true, urls: ["http://192.168.1.20:8768"] });
const LOCAL = paired("fp-local", "MacBook", { local: true, urls: ["http://127.0.0.1:45781"] });
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };
const agents: HostAgentsState = { status: "ready", value: { agents: [], scanned_at: "2026-10-02T10:00:00Z", custom: { command: "sidevoice connector mcp", snippet: "{}", version: "connector 4.2.1" } },
  error: null, busy: {}, actionErrors: {} } as unknown as HostAgentsState;

/** A window of a phone's width, or a desktop's; `cross` moves it across the breakpoint, as a rotation would. */
let phoneNow = true;
const listeners = new Set<() => void>();
function viewport(phone: boolean) {
  phoneNow = phone;
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === SETTINGS_PHONE_QUERY && phoneNow, onchange: null,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
const cross = (phone: boolean) => { phoneNow = phone; for (const listener of [...listeners]) listener(); };

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
/** Something that moves the history, and what follows it: a browser fires `popstate` later, so it is waited for. */
async function traverse(action: () => void) {
  const popped = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
  await act(async () => { action(); });
  await act(async () => { await Promise.race([popped, new Promise((resolve) => setTimeout(resolve, 3000))]); await settle(); });
}

/** Entries pushed since the test began: the tests share one history, whose length counts what a push drops. */
let pushes: ReturnType<typeof vi.spyOn>;
const pushed = () => pushes.mock.calls.length;
beforeEach(() => {
  viewport(true);
  // The room's own entry, whatever the test before left.
  history.pushState(null, "");
  pushes = vi.spyOn(history, "pushState");
  window.sidevoiceActions = { editVoice: vi.fn(), installVoiceModel: vi.fn(), loadVoiceCatalogue: vi.fn(), openPairing: vi.fn(), loadHostAgents: vi.fn(),
    machineDevices: vi.fn().mockResolvedValue([]), localHostDevices: vi.fn().mockResolvedValue([]), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { cleanup(); listeners.clear(); vi.restoreAllMocks(); delete window.sidevoiceActions; });

function room(facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  const settings = defaultVoiceSettings();
  act(() => store.patch({ voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { openai: true, elevenlabs: false },
    pairings: [NUC], machinesReady: true, machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, localHostStatus: { state: "absent" }, ...facts }));
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  return store;
}
const dialog = () => document.getElementById("language-settings")!;
/** Opened as the runtime opens it (the gear's handler): here simply its `open`, then what follows it. */
const open = async () => { await act(async () => { dialog().setAttribute("open", ""); await settle(); }); };
const close = async () => { await act(async () => { dialog().removeAttribute("open"); await settle(); }); };
/** Closed with levels in the history: they are taken back off. */
const closeOff = () => traverse(() => dialog().removeAttribute("open"));
const title = () => document.getElementById("settings-title")!;
/** A page's Back, up a level; and the back arrow that leaves Settings (the runtime binds #settings-close). */
const back = () => document.querySelector<HTMLButtonElement>(".settings-back:not(#settings-close)");
const leave = () => document.getElementById("settings-close") as HTMLButtonElement;
/** The back arrows a person sees in the header: one at a time. */
const shownBacks = () => [...document.querySelectorAll<HTMLButtonElement>(".ui-dialog-head > button")].filter((button) => !button.hidden);
const nav = () => document.querySelector<HTMLElement>(".settings-nav")!;
const content = () => document.querySelector<HTMLElement>(".settings-content")!;
const tap = async (element: Element) => { await act(async () => { fireEvent.click(element); await settle(); }); };
const systemBack = () => traverse(() => history.back());
const tapBack = () => traverse(() => fireEvent.click(back()!));
const stack = () => (history.state as { sidevoiceSettings?: { stack: string[] } } | null)?.sidevoiceSettings?.stack ?? null;
const row = (id: string) => document.getElementById("settings-" + id)!;
const summary = (id: string) => row(id).querySelector(".settings-menu-summary")?.textContent ?? null;

test("opened from the gear it is the list of sections, under Settings: each a row saying how it stands, one history entry", async () => {
  withMicrophone();
  room();
  await open();
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(document.activeElement).toBe(title());
  expect(back()).toBeNull();
  // At the list the header's arrow leaves Settings.
  expect(shownBacks()).toEqual([leave()]);
  expect(leave()).toHaveAccessibleName("Back");
  // Named Settings whatever level shows.
  expect(dialog()).toHaveAttribute("aria-label", "Settings");
  expect(dialog()).not.toHaveAttribute("aria-labelledby");
  expect(nav()).not.toHaveAttribute("hidden");
  expect(content()).toHaveAttribute("hidden");
  expect([...nav().querySelectorAll(".settings-menu-label")].map((label) => label.textContent)).toEqual(["General", "Transcription", "Voice", "Call", "Permissions", "Providers", "Machines", "Advanced"]);
  // A line under the sections with one state; none under those of preferences; no row is "current".
  expect(summary("transcription")).toBe("whisper-base");
  expect(summary("voice")).toBe("kokoro-82m-v1.0");
  expect(summary("providers")).toBe("OpenAI");
  expect(summary("machines")).toBe("NUC · Online");
  expect([summary("general"), summary("call"), summary("advanced")]).toEqual([null, null, null]);
  expect(nav().querySelector("[aria-current]")).toBeNull();
  expect(screen.getByRole("navigation", { name: "Settings sections" }).querySelector("ul > li > button")).toBe(row("general"));
  expect(stack()).toEqual(["list"]);
  expect(pushed()).toBe(1);
});

test("the lines say what is not known yet as nothing, no model chosen, no provider, and how many machines are connected", async () => {
  const store = room({ voiceCatalogue: { state: "loading", catalogs: [], error: "" } });
  await open();
  expect(summary("transcription")).toBe("");
  expect(summary("providers")).toBe("");
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { openai: false }, voiceDraft: { ...defaultVoiceSettings(), stt: { catalog: "openai", model: "", language: null } } }));
  expect(summary("transcription")).toBe("No model chosen");
  expect(summary("providers")).toBe("None connected");
  act(() => store.patch({ pairings: [] }));
  expect(summary("machines")).toBe("None paired yet");
  act(() => store.patch({ pairings: [NUC, LAB, paired("fp-w", "Workstation")], machineLinks: { "fp-nuc": { reach: "ok", via: "node" }, "fp-w": { reach: "ok", via: "node" } } }));
  expect(summary("machines")).toBe("3 machines · 2 connected");
});

test("a row opens its section's page under the list; Back, Escape and the system's back go up, and from the list close Settings", async () => {
  room();
  await open();
  await tap(row("transcription"));
  expect(title()).toHaveTextContent(/^Transcription$/);
  expect(document.activeElement).toBe(title());
  expect(back()).toHaveAccessibleName("Back to Settings");
  expect(back()).toHaveAttribute("title", "Back");
  // Only the page's Back shows: the arrow that leaves Settings is still there, hidden.
  expect(shownBacks()).toEqual([back()]);
  expect(leave()).toBeInTheDocument();
  expect(leave()).toHaveAttribute("hidden");
  expect(nav()).toHaveAttribute("hidden");
  expect(content()).not.toHaveAttribute("hidden");
  expect(document.getElementById("pane-transcription")).not.toHaveAttribute("hidden");
  expect(stack()).toEqual(["list", "transcription"]);
  expect(pushed()).toBe(2);

  // Back: the list, focus on the row that led there.
  await tapBack();
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(document.activeElement).toBe(row("transcription"));
  expect(shownBacks()).toEqual([leave()]);
  expect(content()).toHaveAttribute("hidden");
  expect(stack()).toEqual(["list"]);

  // Escape (and Android's back) comes as the dialog's cancel: up a level from a page…
  await tap(row("voice"));
  const escape = new Event("cancel", { cancelable: true });
  await traverse(() => dialog().dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(title()).toHaveTextContent(/^Settings$/);
  // …and from the list it is left to close Settings.
  const last = new Event("cancel", { cancelable: true });
  dialog().dispatchEvent(last);
  expect(last.defaultPrevented).toBe(false);

  // The system's back from the list closes Settings, and never leaves the room: nothing more to take off.
  const go = vi.spyOn(history, "go");
  await systemBack();
  expect(dialog()).not.toHaveAttribute("open");
  expect(stack()).toBeNull();
  expect(go).not.toHaveBeenCalled();
});

test("every close takes its entries back off, and the next opening is at the list again", async () => {
  const store = room();
  await open();
  await tap(row("providers"));
  expect(pushed()).toBe(2);
  await closeOff();
  expect(stack()).toBeNull();
  expect(store.getState().facts.settingsLevel).toBe("list");
  await open();
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(stack()).toEqual(["list"]);
  // A history entry of Settings met while it is closed does not open it again.
  await close();
  await traverse(() => history.forward());
  expect(dialog()).not.toHaveAttribute("open");
});

test("asked for a page (a call's model action), it opens there, the list under it, with no slide", async () => {
  const store = room();
  openSettings({ section: "providers" }, store);
  await open();
  expect(title()).toHaveTextContent(/^Providers$/);
  expect(document.activeElement).toBe(title());
  expect(stack()).toEqual(["list", "providers"]);
  expect(pushed()).toBe(2);
  expect(content().hasAttribute("data-motion")).toBe(false);
  await tapBack();
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(document.activeElement).toBe(row("providers"));
});

test("Machines is a list, each machine's state on its row; a machine is a page of its own, and forgotten there it is back at the list, said", async () => {
  const forgetMachine = vi.fn();
  const store = room({ pairings: [NUC, LAB], machineLinks: { "fp-nuc": { reach: "ok", via: "node" }, "fp-lab": { reach: "away", via: "" } } });
  window.sidevoiceActions = { ...window.sidevoiceActions, forgetMachine: forgetMachine.mockImplementation(() => act(() => store.patch({ pairings: [NUC] }))) } as unknown as typeof window.sidevoiceActions;
  await open();
  await tap(row("machines"));
  expect(title()).toHaveTextContent(/^Machines$/);
  const list = document.querySelector<HTMLElement>(".machines-menu")!;
  expect([...list.querySelectorAll(".settings-menu-row")].map((entry) => [entry.querySelector(".settings-menu-label")?.textContent, entry.querySelector(".settings-menu-summary")?.textContent ?? null]))
    .toEqual([["NUC", ""], ["Lab box", ""], ["Add a machine", null]]);
  // Connected: the green dot on its icon; not connected, nothing — both said in its name.
  expect(list.querySelector('[data-machine="fp-nuc"] .state-on-icon-dot')).not.toBeNull();
  expect(list.querySelector('[data-machine="fp-lab"] .state-on-icon-dot')).toBeNull();
  // Paired without encryption: nothing after its name, and its name as any machine's.
  expect(list.querySelector('[data-machine="fp-lab"] .settings-menu-label')!.children.length).toBe(1);
  expect(list.querySelector('[data-machine="fp-lab"] svg.lucide-lock-open')).toBeNull();
  expect(list.querySelector('[data-machine="fp-lab"]')).toHaveAccessibleName("Lab box, Offline");
  // Add a machine opens a dialog, not a page: no chevron; and no chips at the page's head.
  expect(list.querySelector(".settings-menu-row--add .settings-menu-chevron")).toBeNull();
  expect(document.querySelector(".machines-inline")).toBeNull();
  await tap(within(list).getByText("Add a machine"));
  expect(window.sidevoiceActions!.openPairing).toHaveBeenCalled();

  await tap(list.querySelector('[data-machine="fp-lab"]')!);
  expect(title()).toHaveTextContent(/^Lab box$/);
  expect(back()).toHaveAccessibleName("Back to Machines");
  expect(shownBacks()).toEqual([back()]);
  expect(leave()).toHaveAttribute("hidden");
  expect(stack()).toEqual(["list", "machines", "fp-lab"]);
  await tapBack();
  expect(title()).toHaveTextContent(/^Machines$/);
  expect(document.activeElement).toBe(list.querySelector('[data-machine="fp-lab"]'));

  await tap(list.querySelector('[data-machine="fp-lab"]')!);
  await tap(screen.getByRole("button", { name: "Forget Lab box" }));
  await tap(screen.getByRole("button", { name: "Yes, forget" }));
  expect(forgetMachine).toHaveBeenCalledWith("fp-lab");
  // Back a level once history's back lands (its popstate comes later than the page going, which already titles it
  // Machines).
  await waitFor(() => expect(stack()).toEqual(["list", "machines"]));
  expect(title()).toHaveTextContent(/^Machines$/);
  expect(document.activeElement).toBe(list.querySelector('[data-machine="fp-nuc"]'));
  await waitFor(() => expect(dialog().querySelector('form > [role="status"]')).toHaveTextContent("Lab box forgotten"));
});

test("an agent's request opens at its machine's page, its Agents focused", async () => {
  const store = room({ hostAgents: { "fp-nuc": agents } });
  act(() => store.patch({ settingsSection: "machines", settingsLevel: "page", settingsAgentRequest: { fp: "fp-nuc", id: 7 } }));
  await open();
  expect(title()).toHaveTextContent(/^NUC$/);
  expect(stack()).toEqual(["list", "machines", "fp-nuc"]);
  expect(pushed()).toBe(3);
  expect(document.activeElement).toBe(document.querySelector("#pane-machines #host-agents-title"));
});

test("This device's rename goes to General in place of its page: Back still goes to the list", async () => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
  } } } });
  room({ pairings: [LOCAL, NUC], inApp: true, localHostAvailable: true, localHostStatus: running });
  await open();
  // Its service running: the green dot on its icon, no words.
  expect(summary("this-computer")).toBe("");
  expect(row("this-computer").querySelector(".state-on-icon-dot")).not.toBeNull();
  await tap(row("this-computer"));
  expect(title()).toHaveTextContent(/^This device$/);
  await tap(screen.getByRole("button", { name: "Rename this device" }));
  await waitFor(() => expect(title()).toHaveTextContent(/^General$/));
  expect(stack()).toEqual(["list", "general"]);
  expect(pushed()).toBe(2);
  await waitFor(() => expect(document.activeElement).toBe(document.getElementById("device-name")));
  await tapBack();
  expect(title()).toHaveTextContent(/^Settings$/);
});

test("a dialog over Settings goes first on the system's back, and Settings stays where it was", async () => {
  room();
  await open();
  await tap(row("machines"));
  const pairing = document.createElement("dialog");
  pairing.setAttribute("open", "");
  document.body.append(pairing);
  await systemBack();
  expect(pairing).not.toHaveAttribute("open");
  expect(title()).toHaveTextContent(/^Machines$/);
  expect(stack()).toEqual(["list", "machines"]);
  pairing.remove();
  await systemBack();
  expect(title()).toHaveTextContent(/^Settings$/);
});

test("what fails is said under the header, outside every level", async () => {
  room();
  await open();
  const error = document.getElementById("settings-error")!;
  expect(error).toHaveAttribute("role", "alert");
  expect(nav().contains(error) || content().contains(error)).toBe(false);
  expect(error.parentElement).toHaveClass("settings-layout");
});

test("across the breakpoint while open: into a phone at the section's page; out of one, the entries off and the section beside the rest", async () => {
  viewport(false);
  const store = room({ settingsSection: "voice" });
  await open();
  expect(pushed()).toBe(0);
  await act(async () => cross(true));
  expect(title()).toHaveTextContent(/^Voice$/);
  expect(stack()).toEqual(["list", "voice"]);
  await traverse(() => cross(false));
  expect(stack()).toBeNull();
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(document.getElementById("settings-voice")).toHaveAttribute("aria-current", "page");
  expect(store.getState().facts.settingsSection).toBe("voice");
});

test("a desktop is as it was: its sections beside the page, named by its title, no history of its own", async () => {
  withMicrophone();
  viewport(false);
  room({ settingsSection: "call" });
  await open();
  expect(dialog()).toHaveAttribute("aria-labelledby", "settings-title");
  expect(dialog()).not.toHaveAttribute("aria-label");
  expect(document.querySelector(".settings-menu")).toBeNull();
  expect([...document.querySelectorAll(".settings-nav > button")].map((button) => button.textContent)).toEqual(["General", "Transcription", "Voice", "Call", "Permissions", "Providers", "Machines", "Advanced"]);
  expect(document.getElementById("settings-call")).toHaveAttribute("aria-current", "page");
  expect(nav()).not.toHaveAttribute("hidden");
  expect(content()).not.toHaveAttribute("hidden");
  await tap(row("advanced"));
  expect(title()).toHaveTextContent(/^Settings$/);
  expect(back()).toBeNull();
  // Whatever section shows, the header's one arrow leaves Settings.
  expect(shownBacks()).toEqual([leave()]);
  expect(pushed()).toBe(0);
  await close();
  expect(pushed()).toBe(0);
});

test("a section is on show only at its page on a phone (a try there stops at the list or closed); on a desktop, while chosen", () => {
  const store = createRoomStore();
  const wrapper = ({ children }: { children: ReactNode }) => <RoomProvider store={store}>{children}</RoomProvider>;
  act(() => store.patch({ settingsSection: "call", settingsLevel: "list" }));
  const { result, rerender } = renderHook(() => useSectionShown("call"), { wrapper });
  expect(result.current).toBe(false);
  act(() => store.patch({ settingsLevel: "page" }));
  expect(result.current).toBe(true);
  viewport(false);
  act(() => store.patch({ settingsLevel: "list" }));
  rerender();
  expect(result.current).toBe(true);
});

