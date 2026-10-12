import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { ProviderKeys } from "./ProviderKeys";
import { createRoomStore, installRoomBridge, RoomStoreContext, type RoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

/* Settings → Providers: "Your providers" (a row each, Disconnect asking first) and "Add a provider" (cards to Connect,
 * searched), one key dialog for connecting. The host stands in as the controller does: a key kept patches the
 * providers' keys and the catalogues read with it. The interface speaks English here (the test's system). */

afterEach(() => { localStorage.clear(); delete window.sidevoiceActions; });

const status = (reason?: string) => ({ stale: false, ...(reason ? { reason: { code: reason, params: {} } } : {}) });
const CATALOGS = [
  { id: "local", name: null, status: status(), models: [] },
  { id: "elevenlabs", name: "ElevenLabs", status: status(), models: [] },
  { id: "openai", name: "OpenAI", status: status("credential-missing"), models: [] },
] as unknown as CatalogView[];

/** The store as the controller leaves it: `provider`'s key kept (or not), and what the provider said of it. */
function hostSays(store: RoomStore, provider: string, kept: boolean, reason?: string) {
  const { providerKeys, voiceCatalogue } = store.getState().facts;
  store.patch({
    providerKeys: { ...providerKeys, [provider]: kept },
    voiceCatalogue: { ...voiceCatalogue, catalogs: voiceCatalogue.catalogs.map((catalog) => catalog.id === provider ? { ...catalog, status: status(reason) } : catalog) },
  });
}

function renderKeys(facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" }, providerKeys: { openai: false, elevenlabs: true }, ...facts });
  installRoomBridge(store);
  const actions = {
    loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined),
    connectProviderKey: vi.fn(async (provider: string) => hostSays(store, provider, true)),
    saveProviderKey: vi.fn(async (provider: string, key: string | null) => hostSays(store, provider, !!key, key ? undefined : "credential-missing")),
    testProviderKey: vi.fn(async (provider: string) => hostSays(store, provider, true)),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  render(<RoomStoreContext.Provider value={store}><TooltipProvider><ProviderKeys /></TooltipProvider></RoomStoreContext.Provider>);
  return { store, actions };
}

const row = (provider: string) => document.querySelector(`.provider-row[data-provider='${provider}']`) as HTMLElement | null;
const card = (provider: string) => document.querySelector(`.provider-card[data-provider='${provider}']`) as HTMLElement | null;
const yours = () => screen.queryByRole("region", { name: "Your providers" });
const add = () => screen.getByRole("region", { name: "Add a provider" });
const pending = () => { let resolve!: () => void; let reject!: (error: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
/** Timers run out: a menu's close (Radix gives focus back on the next tick), a popover listening for clicks outside. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const hint = (provider: string, last4: string) => localStorage.setItem("sidevoice.provider-key-hint." + provider, JSON.stringify({ last4, addedAt: 1 }));


test("connected providers are rows in Your providers — the name with Connected right after it, what it's for, Disconnect; the rest are cards to Connect in Add a provider", () => {
  hint("elevenlabs", "9xyz");
  renderKeys();
  const eleven = row("elevenlabs")!;
  expect(yours()).toContainElement(eleven);
  expect(within(eleven).getByText("Connected").closest(".provider-row-title")).toHaveTextContent(/^ElevenLabs\s*Connected/);
  expect(eleven.querySelector(".provider-row-line")).toHaveTextContent(/^Voice · Transcription$/);
  expect(card("openai")!.querySelector(".provider-card-purpose")).toHaveTextContent(/^Transcription · Voice$/);
  expect(within(eleven).getByRole("button", { name: "Disconnect ElevenLabs" })).toHaveAttribute("aria-haspopup", "dialog");
  expect(row("openai")).toBeNull();
  expect(add()).toContainElement(card("openai"));
  expect(within(card("openai")!).getByRole("button", { name: "Connect OpenAI" })).toHaveTextContent("Connect");
  expect(card("elevenlabs")).toBeNull();
  expect(within(add()).getByRole("searchbox", { name: "Search providers" })).toBeInTheDocument();
});

test("with nothing connected there is no Your providers; with everything connected Add a provider says so, with no search", () => {
  renderKeys({ providerKeys: { openai: false, elevenlabs: false } });
  expect(yours()).toBeNull();
  expect(within(add()).getAllByRole("button", { name: /^Connect / })).toHaveLength(2);
  cleanup();
  renderKeys({ providerKeys: { openai: true, elevenlabs: true } });
  expect(add()).toHaveTextContent("Every available provider is connected.");
  expect(screen.queryByRole("searchbox")).toBeNull();
});

test("Connect opens the key's dialog, its field focused; a refused key says why with the provider's words and stays, selected; a taken one moves the provider up, its row focused", async () => {
  const { actions } = renderKeys();
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
  const field = within(dialog).getByLabelText("API key") as HTMLInputElement;
  expect(document.activeElement).toBe(field);
  expect(field.type).toBe("password");
  expect(within(dialog).getByRole("button", { name: "Connect" })).toBeDisabled();
  expect(dialog).toHaveTextContent("Get a key at OpenAI");
  actions.connectProviderKey.mockRejectedValueOnce(Object.assign(new Error("credential-rejected"), { code: "credential-rejected", detail: "Incorrect API key provided." }));
  fireEvent.change(field, { target: { value: "  sk-bad  " } });
  await act(async () => { fireEvent.keyDown(field, { key: "Enter" }); });
  await settle();
  expect(actions.connectProviderKey).toHaveBeenCalledWith("openai", "sk-bad");
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription(/OpenAI didn't accept this key\. Check you copied all of it\. Incorrect API key provided\./);
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, { target: { value: "sk-good-7f3a" } });
  expect(field).not.toHaveAttribute("aria-invalid");
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Connect" })); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(yours()).toContainElement(row("openai"));
  expect(card("openai")).toBeNull();
  expect(document.activeElement).toBe(row("openai"));
  expect(screen.getByText("OpenAI connected.")).toHaveAttribute("role", "status");
});

test("while the key is tested nothing closes the dialog and it says so; a provider that can't be reached saves nothing and says to try again", async () => {
  const { actions } = renderKeys();
  const asked = pending();
  actions.connectProviderKey.mockImplementationOnce(() => asked.promise);
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
  const field = within(dialog).getByLabelText("API key");
  fireEvent.change(field, { target: { value: "sk-slow" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
  expect(within(dialog).getByRole("status")).toHaveTextContent("Testing the key with OpenAI…");
  expect(field).toHaveAttribute("readonly");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.keyDown(field, { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Connect OpenAI" })).toBeInTheDocument();
  await act(async () => { asked.reject(Object.assign(new Error("provider-unreachable"), { code: "provider-unreachable" })); });
  expect(field).toHaveAccessibleDescription(/Couldn't reach OpenAI to test the key, so it wasn't saved\. Try again in a moment\./);
  expect(card("openai")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await settle();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Connect OpenAI" }));
});

test("Disconnect asks first — what stops, that the key is forgotten, Cancel focused — then moves the provider down, its Connect focused", async () => {
  hint("openai", "7f3a");
  const settings = defaultVoiceSettings();
  const openai = { catalog: "openai", model: "whisper-1", language: null };
  const { actions } = renderKeys({ providerKeys: { openai: true, elevenlabs: true }, voiceSettings: { ...settings, stt: openai, tts: { ...settings.tts, catalog: "openai", model: "tts-1" } } });
  expect(within(row("openai")!).getByText("In use: Transcription and Voice")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect OpenAI" }));
  const question = screen.getByRole("dialog", { name: "Disconnect OpenAI?" });
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Cancel" }));
  expect(question).toHaveTextContent("Transcription and Voice use OpenAI and will stop working");
  expect(question).toHaveTextContent("Sidevoice will forget the key ending in 7f3a.");
  expect(question).toHaveTextContent("revoke it there");
  fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
  await settle();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect OpenAI" }));
  expect(actions.saveProviderKey).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect OpenAI" }));
  await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disconnect" })); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", null);
  expect(row("openai")).toBeNull();
  expect(card("openai")).toBeInTheDocument();
  await settle();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Connect OpenAI" }));
  expect(screen.getByText("OpenAI disconnected. Its key was forgotten.")).toHaveAttribute("role", "status");
});

test("search filters Add a provider by name or use, any case or accent; none says so; × and Escape clear it", () => {
  renderKeys({ providerKeys: { openai: false, elevenlabs: false } });
  const search = screen.getByRole("searchbox", { name: "Search providers" });
  fireEvent.change(search, { target: { value: "ELÉVEN" } });
  expect(card("elevenlabs")).toBeInTheDocument();
  expect(card("openai")).toBeNull();
  fireEvent.change(search, { target: { value: "zzz" } });
  expect(add()).toHaveTextContent("No providers match “zzz”.");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(search).toHaveValue("");
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "open" } });
  expect(fireEvent.keyDown(search, { key: "Escape" })).toBe(false);
  expect(search).toHaveValue("");
  expect(card("elevenlabs")).toBeInTheDocument();
  cleanup();
  renderKeys();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search providers" }), { target: { value: "eleven" } });
  expect(add()).toHaveTextContent("ElevenLabs is already connected, under Your providers.");
});

test("a kept key with a problem says it in words, its state in place of Connected, with the one thing to do: refused, Replace key; unreachable, Test again", async () => {
  hint("elevenlabs", "9xyz");
  const { store, actions } = renderKeys();
  act(() => hostSays(store, "elevenlabs", true, "credential-rejected"));
  const eleven = row("elevenlabs")!;
  expect(within(eleven).getByText("Key rejected")).toBeInTheDocument();
  expect(within(eleven).queryByText("Connected")).toBeNull();
  expect(eleven).toHaveTextContent("ElevenLabs didn't accept the key: it was revoked or mistyped.");
  fireEvent.click(within(eleven).getByRole("button", { name: "Replace key" }));
  const replace = screen.getByRole("dialog", { name: "Replace ElevenLabs key" });
  expect(replace).toHaveTextContent("Replaces the key ending in 9xyz.");
  fireEvent.change(within(replace).getByLabelText("API key"), { target: { value: "sk-new-1234" } });
  await act(async () => { fireEvent.click(within(replace).getByRole("button", { name: "Replace key" })); });
  expect(actions.connectProviderKey).toHaveBeenCalledWith("elevenlabs", "sk-new-1234");
  expect(JSON.parse(localStorage.getItem("sidevoice.provider-key-hint.elevenlabs")!).last4).toBe("1234");
  act(() => hostSays(store, "elevenlabs", true, "provider-unreachable"));
  await act(async () => { fireEvent.click(within(row("elevenlabs")!).getByRole("button", { name: "Test the ElevenLabs connection" })); });
  expect(actions.testProviderKey).toHaveBeenCalledWith("elevenlabs");
  expect(row("elevenlabs")).toHaveAttribute("data-state", "connected");
});

test("in the app the key is said to be kept in the system keychain", () => {
  renderKeys({ inApp: true });
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Kept in the system keychain.");
});

test("in a browser one line says where the key lives and to cap the spend; in the app it names the keychain", () => {
  renderKeys();
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/unencrypted in this browser/);
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/spending limit/);
  cleanup();
  renderKeys({ inApp: true });
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/system keychain/);
});

test("the providers are the catalogues: while they load it says so, and when they could not be read it says why, never an empty list", () => {
  renderKeys({ voiceCatalogue: { state: "loading", catalogs: [], error: "" } });
  expect(document.getElementById("provider-keys-loading")).toBeInTheDocument();
  expect(document.getElementById("provider-keys-none")).toBeNull();
  cleanup();
  const { actions } = renderKeys({ voiceCatalogue: { state: "failed", catalogs: [], error: "This browser is blocking site data for this page." } });
  expect(screen.getByRole("alert")).toHaveTextContent("blocking site data");
  expect(document.getElementById("provider-keys-none")).toBeNull();
  fireEvent.click(document.getElementById("provider-keys-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
  cleanup();
  renderKeys({ voiceCatalogue: { state: "ready", catalogs: [CATALOGS[0]], error: "" } });
  expect(document.getElementById("provider-keys-none")).toBeInTheDocument();
});
