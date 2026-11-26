import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ProviderKeys } from "./ProviderKeys";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import "./settings.css";

/* The remote providers in Settings › Providers: "Your providers", a row for each with a key — its mark, its name with how
 * its key stands right after it as a Badge `tag` (Checking… and Connected without a dot; a problem in its tone with a dot:
 * danger where the key itself is refused or unreadable, warning where the provider limits it, neutral where it can't be
 * reached), an accent "In use" tag when Transcription or Voice uses it, and Disconnect (secondary, Unlink); under it, a
 * problem in words with the one thing to do (Replace key, or Test again). "Add a provider" offers the rest as cards with
 * Connect. The row is not a component of its own: each specimen is the real section on a room store seeded with one
 * provider's key kept and what the provider said last (its catalogue's reason), cut to the row (the section's heading,
 * where the keys are kept, the card's heading and the cards to add, hidden). Checking… is the row's own while a test
 * runs: Test again is pressed, and the test never answers here. A key that is absent or not known is not a row: that
 * provider is a card to add. */

type Provider = "openai" | "elevenlabs";
const NAMES: Record<Provider, string> = { openai: "OpenAI", elevenlabs: "ElevenLabs" };

/** A provider's catalogue as the engine reports it: why it is not current (a reason's code), and what the provider said. */
const catalog = (id: Provider, code?: string, detail?: string) =>
  ({ id, name: NAMES[id], status: { stale: false, ...(code ? { reason: { code } } : {}), ...(detail ? { detail } : {}) }, models: [] });

function Room({ keys, catalogs, inUse = false, children }: { keys: Provider[]; catalogs: ReturnType<typeof catalog>[]; inUse?: boolean; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    const settings = defaultVoiceSettings();
    store.patch({
      inApp: false,
      providerKeys: Object.fromEntries(keys.map((key) => [key, true])),
      voiceCatalogue: { state: "ready", error: "", catalogs },
      voiceSettings: inUse ? { ...settings, stt: { ...settings.stt, catalog: "openai", model: "gpt-4o-transcribe" }, tts: { ...settings.tts, catalog: "openai", model: "gpt-4o-mini-tts" } } : settings,
    } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

/** Only the row of the section: the rest of it hidden, the row left in its card. */
const ROW_ONLY = ".catalogue-provider-row :is(.ui-section-head, .provider-keys-where, .providers-card-head, .providers-card ~ .providers-card) { display: none; }";

interface Specimen { name: string; note: string; provider: Provider; code?: string; detail?: string; inUse?: boolean; test?: boolean }

const SPECIMENS: Specimen[] = [
  { name: "Connected", note: "no reason: Badge tag positive, no dot", provider: "openai" },
  { name: "Connected · in use", note: "+ Badge tag accent: what uses it", provider: "openai", inUse: true },
  { name: "Checking…", note: "Test again pressed: Badge tag neutral, no dot; the test loading", provider: "openai", code: "provider-unreachable", test: true },
  { name: "Key rejected", note: "credential-rejected · danger + dot · Replace key; the provider's words after", provider: "openai", code: "credential-rejected", detail: "Incorrect API key provided." },
  { name: "Missing permission", note: "listing-not-permitted · warning + dot · Replace key", provider: "openai", code: "listing-not-permitted" },
  { name: "No credit", note: "provider-quota · warning + dot · Test again", provider: "elevenlabs", code: "provider-quota" },
  { name: "Rate limited", note: "rate-limited · warning + dot · Test again", provider: "elevenlabs", code: "rate-limited" },
  { name: "Can't reach", note: "provider-unreachable · neutral + dot · Test again", provider: "openai", code: "provider-unreachable" },
  { name: "Key unreadable", note: "credentials-failed · danger + dot · Replace key", provider: "elevenlabs", code: "credentials-failed" },
  { name: "Problem", note: "a reason with no words here · warning + dot · its code behind Details", provider: "openai", code: "engine-upstream-500", detail: "upstream returned 500" },
];

const meta = {
  title: "Product/Settings/ProviderKeys",
  component: ProviderKeys,
  decorators: [(Story) => <div style={{ maxWidth: 600 }}><Story /></div>],
} satisfies Meta<typeof ProviderKeys>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The whole section: OpenAI's key kept and in use, ElevenLabs to add. */
export const InItsSection: Story = {
  render: () => <Room keys={["openai"]} catalogs={[catalog("openai"), catalog("elevenlabs")]} inUse><ProviderKeys /></Room>,
};

/** A connected provider's row in each state its key can be in. */
export const RowStates: Story = {
  // The test a press starts never answers, so the row stays Checking…; the actions as they were, after.
  beforeEach: () => {
    const before = window.sidevoiceActions;
    window.sidevoiceActions = { ...before, testProviderKey: () => new Promise<void>(() => {}) } as typeof window.sidevoiceActions;
    return () => { window.sidevoiceActions = before; };
  },
  play: async ({ canvasElement }) => {
    canvasElement.querySelectorAll<HTMLButtonElement>("[data-test] .provider-row-problem .ui-button").forEach((button) => button.click());
  },
  render: () => (
    <div className="catalogue-stack">
      <style>{ROW_ONLY}</style>
      {SPECIMENS.map(({ name, note, provider, code, detail, inUse, test }) => (
        <div key={name} className="catalogue-provider-row" data-test={test || undefined}>
          <p className="catalogue-label" style={{ margin: 0 }}>{name}</p>
          <span className="muted" style={{ display: "block", marginBottom: 6, fontSize: "var(--sv-font-xs)" }}>{note}</span>
          <Room keys={[provider]} catalogs={[catalog(provider, code, detail)]} inUse={inUse}><ProviderKeys /></Room>
        </div>
      ))}
    </div>
  ),
};
