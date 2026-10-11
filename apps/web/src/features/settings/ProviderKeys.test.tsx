import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { ProviderKeys } from "./ProviderKeys";
import { createRoomStore, installRoomBridge, RoomStoreContext, type RoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { VARIANTS_KEY } from "../../lib/variants";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

/* Settings → Providers: a card per provider, its key given and taken back the way being compared (`provider-connect`:
 * a dialog, a row in place, a popover). The host stands in as the controller does: a key kept patches the providers'
 * keys and the catalogues read with it. The interface speaks English here (the test's system). */

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

function renderKeys(variant?: "dialog" | "row" | "popover", facts: Record<string, unknown> = {}) {
  if (variant) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "provider-connect": variant }));
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

const card = (provider: string) => document.querySelector(`.provider-card[data-provider='${provider}']`) as HTMLElement;
const pending = () => { let resolve!: () => void; let reject!: (error: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
/** Timers run out: a menu's close (Radix gives focus back on the next tick), a popover listening for clicks outside. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const hint = (provider: string, last4: string) => localStorage.setItem("sidevoice.provider-key-hint." + provider, JSON.stringify({ last4, addedAt: 1 }));

async function chooseFromMenu(provider: string, name: string, item: string) {
  fireEvent.keyDown(within(card(provider)).getByRole("button", { name: `More for ${name}` }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
  await settle();
}

test("a card is the mark, the name, one short line and one control: Connect, or Connected with the key's last four and its menu", () => {
  hint("elevenlabs", "9xyz");
  renderKeys();
  expect([...document.querySelectorAll(".provider-card")].map((element) => [element.getAttribute("data-provider"), element.getAttribute("data-state")]))
    .toEqual([["elevenlabs", "connected"], ["openai", "absent"]]);
  expect(card("openai").querySelector(".provider-card-purpose")).toHaveTextContent(/^Transcription and voices$/);
  expect(card("elevenlabs").querySelector(".provider-card-purpose")).toHaveTextContent(/^Voices and transcription$/);
  expect(within(card("openai")).getByRole("button", { name: "Connect OpenAI" })).toHaveTextContent("Connect");
  const connected = within(card("elevenlabs"));
  expect(connected.getByText("Connected")).toBeInTheDocument();
  expect(card("elevenlabs").querySelector(".provider-card-masked")).toHaveTextContent("••••9xyz");
  expect(connected.getByText("key ending in 9xyz")).toHaveClass("sr-only");
  expect(connected.getByRole("button", { name: "More for ElevenLabs" })).toBeInTheDocument();
  expect(connected.queryByRole("button", { name: /Replace|Remove/ })).toBeNull();
});

test("dialog: Connect opens a small dialog with its field focused; Test and save waits for a key; success closes it, says so, and focuses the menu", async () => {
  const { actions } = renderKeys();
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
  expect(dialog).toHaveAttribute("data-size", "sm");
  // Drawn on the page's top layer, not inside the card (nor inside Settings, a dialog itself).
  expect(card("openai").contains(dialog)).toBe(false);
  const field = within(dialog).getByLabelText("API key") as HTMLInputElement;
  expect(field.type).toBe("password");
  expect(field).toHaveAttribute("placeholder", "Paste your key");
  expect(document.activeElement).toBe(field);
  fireEvent.click(within(dialog).getByRole("button", { name: "Show" }));
  expect(field.type).toBe("text");
  expect(within(dialog).getByRole("link", { name: /Get a key at OpenAI/ })).toHaveAttribute("href", "https://platform.openai.com/api-keys");
  expect(dialog).toHaveTextContent("Kept in this browser, unencrypted.");
  const save = within(dialog).getByRole("button", { name: "Test and save" });
  expect(save).toBeDisabled();
  fireEvent.change(field, { target: { value: " sk-test-7f3a " } });
  expect(save).toBeEnabled();
  // Enter tests it, as the button does.
  await act(async () => { fireEvent.keyDown(field, { key: "Enter" }); });
  expect(actions.connectProviderKey).toHaveBeenCalledWith("openai", "sk-test-7f3a");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(card("openai")).toHaveAttribute("data-state", "connected");
  expect(card("openai").querySelector(".provider-card-masked")).toHaveTextContent("••••7f3a");
  expect(within(card("openai")).getByRole("status")).toHaveTextContent("OpenAI connected.");
  expect(document.activeElement).toBe(within(card("openai")).getByRole("button", { name: "More for OpenAI" }));
});

test("dialog: while the provider is asked nothing calls it off — the field is read-only, Cancel and × are gone or off, Escape does nothing — and it says Testing…", async () => {
  const { actions } = renderKeys();
  const asked = pending();
  actions.connectProviderKey.mockImplementation(() => asked.promise);
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
  // Before: Escape is the browser's to turn into a close, and the dialog closes on it.
  expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("API key"), { target: { value: "sk-slow" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Test and save" }));
  expect(within(dialog).getByRole("status")).toHaveTextContent("Testing…");
  expect(within(dialog).getByLabelText("API key")).toHaveAttribute("readonly");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(within(dialog).queryByRole("button", { name: /Close/ })).toBeNull();
  expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog", { name: "Connect OpenAI" })).toBeInTheDocument();
  await act(async () => { asked.resolve(); });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("dialog: Escape (the dialog's cancel) closes it and gives the focus back to Connect", () => {
  renderKeys();
  const connect = screen.getByRole("button", { name: "Connect OpenAI" });
  connect.focus();
  fireEvent.click(connect);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(connect);
});

test("a key the provider refuses is not kept: the field is marked with what to check, the key selected and focused to paste over", async () => {
  const { actions, store } = renderKeys();
  actions.connectProviderKey.mockRejectedValue(Object.assign(new Error("credential-rejected"), { code: "credential-rejected", detail: "invalid_api_key" }));
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
  const field = within(dialog).getByLabelText("API key") as HTMLInputElement;
  fireEvent.change(field, { target: { value: "sk-bad" } });
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Test and save" })); });
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription(/OpenAI didn't accept this key\. Check you copied all of it\. invalid_api_key/);
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 6]);
  expect(store.getState().facts.providerKeys.openai).toBe(false);
  expect(localStorage.getItem("sidevoice.provider-key-hint.openai")).toBeNull();
});

test("a provider that can't be reached keeps the key: the entry closes, the card says Not checked and offers Test again — never that it wasn't saved", async () => {
  const { actions, store } = renderKeys();
  actions.connectProviderKey.mockImplementation(async (provider: string) => hostSays(store, provider, true, "provider-unreachable"));
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test-7f3a" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Test and save" })); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(card("openai")).toHaveAttribute("data-state", "unverified");
  expect(card("openai")).toHaveTextContent("Not checked");
  expect(card("openai").querySelector(".provider-card-problem")).toHaveTextContent("Saved, but OpenAI couldn't be reached to check it.");
  expect(card("openai")).not.toHaveTextContent(/not saved/i);
  await act(async () => { fireEvent.click(within(card("openai")).getByRole("button", { name: "Test the OpenAI connection" })); });
  expect(actions.testProviderKey).toHaveBeenCalledWith("openai");
  expect(card("openai")).toHaveAttribute("data-state", "connected");
  expect(within(card("openai")).getByRole("status")).toHaveTextContent("Checked just now.");
});

test("a kept key with a problem says it in words with the one thing to do: refused, Replace key; unreachable, Test again", async () => {
  hint("elevenlabs", "9xyz");
  const refused = CATALOGS.map((catalog) => catalog.id === "elevenlabs" ? { ...catalog, status: { ...status("credential-rejected"), detail: "invalid_api_key" } } : catalog);
  renderKeys(undefined, { voiceCatalogue: { state: "ready", catalogs: refused, error: "" } });
  expect(card("elevenlabs")).toHaveAttribute("data-state", "rejected");
  expect(card("elevenlabs")).toHaveTextContent("Key rejected");
  expect(card("elevenlabs").querySelector(".provider-card-problem")).toHaveTextContent("ElevenLabs didn't accept the key: it was revoked or mistyped. invalid_api_key");
  fireEvent.click(within(card("elevenlabs")).getByRole("button", { name: "Replace key" }));
  const dialog = screen.getByRole("dialog", { name: "Replace ElevenLabs key" });
  expect(dialog).toHaveTextContent("Replaces the key ending in 9xyz.");
  localStorage.clear();
  const unreachable = CATALOGS.map((catalog) => catalog.id === "elevenlabs" ? { ...catalog, status: status("provider-unreachable") } : catalog);
  cleanup();
  renderKeys(undefined, { voiceCatalogue: { state: "ready", catalogs: unreachable, error: "" } });
  expect(card("elevenlabs")).toHaveTextContent("Can't reach");
  expect(card("elevenlabs").querySelector(".provider-card-problem")).toHaveTextContent("ElevenLabs couldn't be reached from here; the key may be fine.");
  expect(within(card("elevenlabs")).getByRole("button", { name: "Test the ElevenLabs connection" })).toHaveTextContent("Test again");
});

test("dialog: the menu replaces the key (naming the one it replaces) and removes it after asking in a small dialog, Cancel focused", async () => {
  hint("elevenlabs", "9xyz");
  const { actions } = renderKeys("dialog", { voiceSettings: { ...defaultVoiceSettings(), tts: { catalog: "elevenlabs", model: "eleven_v3", voice: null, speed: 1 } } });
  await chooseFromMenu("elevenlabs", "ElevenLabs", "Replace key");
  const replace = screen.getByRole("dialog", { name: "Replace ElevenLabs key" });
  expect(replace).toHaveTextContent("Replaces the key ending in 9xyz.");
  expect(document.activeElement).toBe(within(replace).getByLabelText("API key"));
  fireEvent.click(within(replace).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(within(card("elevenlabs")).getByRole("button", { name: "More for ElevenLabs" }));

  await chooseFromMenu("elevenlabs", "ElevenLabs", "Remove");
  const remove = screen.getByRole("dialog", { name: "Remove the ElevenLabs key?" });
  expect(remove).toHaveTextContent("Voice use ElevenLabs. They stop until you add a key or choose another source.");
  expect(document.activeElement).toBe(within(remove).getByRole("button", { name: "Cancel" }));
  const removing = pending();
  actions.saveProviderKey.mockImplementationOnce(() => removing.promise);
  fireEvent.click(within(remove).getByRole("button", { name: "Remove" }));
  expect(within(remove).getByRole("status")).toHaveTextContent("Removing…");
  expect(within(remove).getByRole("button", { name: "Cancel" })).toBeDisabled();
  await act(async () => { removing.resolve(); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("elevenlabs", null);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem("sidevoice.provider-key-hint.elevenlabs")).toBeNull();
  expect(within(card("elevenlabs")).getByRole("status")).toHaveTextContent("Key removed.");
});

test("row: Connect turns the card's line and button into one row — the key's box, Test and save, × — with the link and where it's kept under it; Escape gives Connect the focus back", async () => {
  const { actions } = renderKeys("row");
  const connect = screen.getByRole("button", { name: "Connect OpenAI" });
  fireEvent.click(connect);
  expect(screen.queryByRole("dialog")).toBeNull();
  const row = within(card("openai")).getByRole("group", { name: "Connect OpenAI" });
  expect(card("openai").querySelector(".provider-card-purpose")).toBeNull();
  expect(within(card("openai")).queryByRole("button", { name: "Connect OpenAI" })).toBeNull();
  const field = within(row).getByLabelText("OpenAI API key") as HTMLInputElement;
  expect(field.type).toBe("password");
  expect(document.activeElement).toBe(field);
  expect(within(row).getByRole("button", { name: "Test and save" })).toBeDisabled();
  expect(field).toHaveAccessibleDescription(/Get a key at OpenAI.*Kept in this browser, unencrypted\./);
  // Escape stays in the row: Settings, the dialog around it, isn't closed by it.
  expect(fireEvent.keyDown(field, { key: "Escape" })).toBe(false);
  expect(within(card("openai")).queryByRole("group", { name: "Connect OpenAI" })).toBeNull();
  expect(document.activeElement).toBe(within(card("openai")).getByRole("button", { name: "Connect OpenAI" }));

  fireEvent.click(within(card("openai")).getByRole("button", { name: "Connect OpenAI" }));
  const again = within(card("openai")).getByLabelText("OpenAI API key");
  actions.connectProviderKey.mockRejectedValueOnce(Object.assign(new Error("credential-rejected"), { code: "credential-rejected" }));
  fireEvent.change(again, { target: { value: "sk-bad" } });
  await act(async () => { fireEvent.click(within(card("openai")).getByRole("button", { name: "Test and save" })); });
  expect(again).toHaveAttribute("aria-invalid", "true");
  expect(again).toHaveAccessibleDescription(/OpenAI didn't accept this key\. Check you copied all of it\./);
  fireEvent.change(again, { target: { value: "sk-good-7f3a" } });
  await act(async () => { fireEvent.click(within(card("openai")).getByRole("button", { name: "Test and save" })); });
  expect(card("openai")).toHaveAttribute("data-state", "connected");
  expect(card("openai").querySelector(".provider-card-purpose")).toHaveTextContent("Transcription and voices");
  expect(document.activeElement).toBe(within(card("openai")).getByRole("button", { name: "More for OpenAI" }));
});

test("row: while the provider is asked the row stays — × off, Escape kept — and Remove asks in place of the line, not in a dialog", async () => {
  const { actions } = renderKeys("row");
  const asked = pending();
  actions.connectProviderKey.mockImplementation(() => asked.promise);
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const field = within(card("openai")).getByLabelText("OpenAI API key");
  fireEvent.change(field, { target: { value: "sk-slow" } });
  fireEvent.click(within(card("openai")).getByRole("button", { name: "Test and save" }));
  expect(within(card("openai")).getByText("Testing…")).toBeInTheDocument();
  expect(within(card("openai")).getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.keyDown(field, { key: "Escape" });
  expect(within(card("openai")).getByRole("group", { name: "Connect OpenAI" })).toBeInTheDocument();
  await act(async () => { asked.resolve(); });

  await chooseFromMenu("elevenlabs", "ElevenLabs", "Remove");
  expect(screen.queryByRole("dialog")).toBeNull();
  const question = within(card("elevenlabs")).getByRole("group", { name: "Remove the ElevenLabs key?" });
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Cancel" }));
  await act(async () => { fireEvent.click(within(question).getByRole("button", { name: "Remove" })); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("elevenlabs", null);
  expect(document.activeElement).toBe(within(card("elevenlabs")).getByRole("button", { name: "Connect ElevenLabs" }));
});

test("popover: Connect opens a popover by it; while the provider is asked, Escape and a click outside leave it open; Replace opens the same one", async () => {
  hint("elevenlabs", "9xyz");
  const { actions, store } = renderKeys("popover");
  const connect = screen.getByRole("button", { name: "Connect OpenAI" });
  expect(connect).toHaveAttribute("aria-haspopup", "dialog");
  fireEvent.click(connect);
  await settle();
  const popover = screen.getByRole("dialog", { name: "Connect OpenAI" });
  expect(popover).toHaveClass("ui-popover");
  expect(connect).toHaveAttribute("aria-expanded", "true");
  expect(within(popover).getByRole("link", { name: /Get a key at OpenAI/ })).toBeInTheDocument();
  const field = within(popover).getByLabelText("API key");
  expect(document.activeElement).toBe(field);
  const asked = pending();
  actions.connectProviderKey.mockImplementation(async (provider: string) => { await asked.promise; hostSays(store, provider, true); });
  fireEvent.change(field, { target: { value: "sk-test-7f3a" } });
  fireEvent.click(within(popover).getByRole("button", { name: "Test and save" }));
  expect(within(popover).getByRole("status")).toHaveTextContent("Testing…");
  fireEvent.keyDown(field, { key: "Escape" });
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole("dialog", { name: "Connect OpenAI" })).toBeInTheDocument();
  await act(async () => { asked.resolve(); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(card("openai")).toHaveAttribute("data-state", "connected");

  await chooseFromMenu("elevenlabs", "ElevenLabs", "Replace key");
  const replace = screen.getByRole("dialog", { name: "Replace ElevenLabs key" });
  expect(replace).toHaveClass("ui-popover");
  expect(replace).toHaveTextContent("Replaces the key ending in 9xyz.");
  // Not testing: Escape closes it, and the menu has the focus back.
  fireEvent.keyDown(within(replace).getByLabelText("API key"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(within(card("elevenlabs")).getByRole("button", { name: "More for ElevenLabs" }));
});

test("popover: on a phone it is the dialog instead, the whole screen there", () => {
  const original = window.matchMedia;
  window.matchMedia = ((media: string) => ({ ...original(media), matches: media === "(max-width: 599px)" })) as typeof window.matchMedia;
  try {
    renderKeys("popover");
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
    const dialog = screen.getByRole("dialog", { name: "Connect OpenAI" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("data-layout", "dialog");
  } finally { window.matchMedia = original; }
});

test("in the app the key is said to be kept in the system keychain", () => {
  renderKeys("dialog", { inApp: true });
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Kept in the system keychain.");
});

test("in a browser one line says where the key lives and to cap the spend; in the app it names the keychain", () => {
  renderKeys();
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/unencrypted in this browser/);
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/spending limit/);
  cleanup();
  renderKeys(undefined, { inApp: true });
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/system keychain/);
});

test("the providers are the catalogues: while they load it says so, and when they could not be read it says why, never an empty list", () => {
  renderKeys(undefined, { voiceCatalogue: { state: "loading", catalogs: [], error: "" } });
  expect(document.getElementById("provider-keys-loading")).toBeInTheDocument();
  expect(document.getElementById("provider-keys-none")).toBeNull();
  cleanup();
  const { actions } = renderKeys(undefined, { voiceCatalogue: { state: "failed", catalogs: [], error: "This browser is blocking site data for this page." } });
  expect(screen.getByRole("alert")).toHaveTextContent("blocking site data");
  expect(document.getElementById("provider-keys-none")).toBeNull();
  fireEvent.click(document.getElementById("provider-keys-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
  cleanup();
  renderKeys(undefined, { voiceCatalogue: { state: "ready", catalogs: [CATALOGS[0]], error: "" } });
  expect(document.getElementById("provider-keys-none")).toBeInTheDocument();
});
