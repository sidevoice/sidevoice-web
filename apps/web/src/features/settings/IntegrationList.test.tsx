import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { IntegrationList, MissingIntegrations } from "./IntegrationList";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { IntegrationListing } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));

const owner: IntegrationListing = { owner: true, providers: [
  { id: "openai", label: "OpenAI", capabilities: ["transcription"], configured: true, source: "environment", hint: "…9f2a", environment: "VOICE_STT_API_KEY" },
  { id: "elevenlabs", label: "ElevenLabs", capabilities: ["voice"], configured: false, source: null, hint: null, environment: "VOICE_ELEVENLABS_API_KEY" },
] };

function room(ui: React.ReactNode, facts: Record<string, unknown>) {
  const store = createRoomStore();
  render(<RoomProvider store={store}>{ui}</RoomProvider>);
  act(() => { store.patch(facts); });
  return store;
}
function actions() {
  const done = { typeIntegrationKey: vi.fn(), checkIntegrationKey: vi.fn().mockResolvedValue(undefined),
    clearIntegrationKey: vi.fn().mockResolvedValue(undefined), openIntegration: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  return done;
}

test("one row per provider: what it serves, its key masked, and never the key itself", () => {
  actions();
  room(<IntegrationList />, { integrations: owner });
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
  const store = room(<form onSubmit={() => { throw new Error("the settings were submitted"); }}><IntegrationList /></form>, { integrations: owner });
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

test("a pane greys out a provider with no key and offers to configure it; a guest is offered nothing", () => {
  const done = actions();
  const store = room(<MissingIntegrations capability="voice" />, { integrations: owner });
  expect(document.querySelector("#missing-voice")!.textContent).toMatch(/ElevenLabs necesita una clave de API/);
  fireEvent.click(screen.getByRole("button", { name: "Configurar ElevenLabs" }));
  expect(done.openIntegration).toHaveBeenCalledWith("elevenlabs");
  act(() => { store.patch({ integrations: { owner: false, providers: [owner.providers[0]] } }); });
  expect(document.querySelector("#missing-voice")).toBeNull();
});

test("Integraciones is the owner's section: a device that is not the owner has no such tab", () => {
  actions();
  const store = room(<SettingsDialog />, { integrations: owner });
  const tab = () => document.getElementById("settings-integrations")!;
  expect(tab()).not.toHaveAttribute("hidden");
  act(() => { store.patch({ integrations: { owner: false, providers: [] } }); });
  expect(tab()).toHaveAttribute("hidden");
});
