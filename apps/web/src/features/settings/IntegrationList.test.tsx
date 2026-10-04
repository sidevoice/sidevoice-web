import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { IntegrationList } from "./IntegrationList";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { OnboardingProvider } from "../onboarding/onboarding-context";
import { createRoomStore } from "../../state/room-store";
import type { IntegrationListing } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));

const listing: IntegrationListing = { providers: [
  { id: "openai", label: "OpenAI", capabilities: ["transcription"], configured: true, source: "environment", hint: "…9f2a", environment: "VOICE_STT_API_KEY" },
  { id: "elevenlabs", label: "ElevenLabs", capabilities: ["voice"], configured: false, source: null, hint: null, environment: "VOICE_ELEVENLABS_API_KEY" },
] };

function room(ui: React.ReactNode, facts: Record<string, unknown>) {
  const store = createRoomStore();
  render(<RoomProvider store={store}><OnboardingProvider>{ui}</OnboardingProvider></RoomProvider>);
  act(() => { store.patch(facts); });
  return store;
}
function actions() {
  const done = { typeIntegrationKey: vi.fn(), checkIntegrationKey: vi.fn().mockResolvedValue(undefined),
    clearIntegrationKey: vi.fn().mockResolvedValue(undefined), openIntegration: vi.fn(), previewVoice: vi.fn().mockResolvedValue(false) };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  return done;
}

test("one row per provider: what it serves, its key masked, and never the key itself", () => {
  actions();
  room(<IntegrationList />, { integrations: listing });
  const [openai, eleven] = [...document.querySelectorAll(".integration-row")];
  expect(openai.textContent).toMatch(/OpenAI/);
  expect(openai.textContent).toMatch(/Transcripción/);
  expect(screen.getByLabelText("Clave de API de OpenAI")).toHaveAttribute("placeholder", "•••••••• …9f2a");
  expect(screen.getByLabelText("Clave de API de OpenAI")).toHaveValue("");
  expect(openai.textContent).toMatch(/entorno de la máquina \(VOICE_STT_API_KEY\)/);
  expect(screen.getByRole("button", { name: "Quitar la clave de OpenAI" })).toBeDisabled();
  expect(eleven.textContent).toMatch(/Voz/);
  expect(screen.getByLabelText("Clave de API de ElevenLabs")).toHaveAttribute("placeholder", "Sin clave");
});

test("typing, leaving the field and Enter are the runtime's to act on; Enter does not submit the settings", () => {
  const done = actions();
  const store = room(<form onSubmit={() => { throw new Error("the settings were submitted"); }}><IntegrationList /></form>, { integrations: listing });
  const field = screen.getByLabelText("Clave de API de ElevenLabs");
  fireEvent.change(field, { target: { value: "xi-nueva" } });
  expect(done.typeIntegrationKey).toHaveBeenCalledWith("elevenlabs", "xi-nueva");
  act(() => { store.patch({ integrationDrafts: { elevenlabs: "xi-nueva" } }); });
  expect(field).toHaveValue("xi-nueva");
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.blur(field);
  expect(done.checkIntegrationKey).toHaveBeenCalledTimes(2);
  act(() => { store.patch({ integrationChecks: { elevenlabs: { note: "Clave rechazada · ElevenLabs rejected the key. · No hay ninguna clave guardada", status: "refused" } } }); });
  expect(document.querySelector('.integration-note[data-status="refused"]')!.textContent).toMatch(/Clave rechazada/);
});

test("integrations are scoped to machine settings instead of appearing in the global sidebar", () => {
  actions();
  const store = room(<SettingsDialog />, { integrations: null });
  expect(document.getElementById("settings-machines")).toBeInTheDocument();
  expect(document.getElementById("settings-integrations")).toBeNull();
  act(() => { store.patch({ integrations: listing }); });
  expect(document.getElementById("settings-integrations")).toBeNull();
});

test("a previously selected but unavailable local host still keeps stages out of global defaults", () => {
  room(<SettingsDialog />, { pairings: [], pairingInUse: "@sidevoice/local-host", localHostAvailable: true,
    localHostSelected: true, localHostStatus: { state: "backoff", reachable: false } });
  expect(document.getElementById("settings-voice")).toBeNull();
  expect(document.getElementById("settings-transcription")).toBeNull();
});
