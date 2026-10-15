import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import type { SidevoiceActions } from "../../state/room-types";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { useVoiceModels, VoiceModels } from "./VoiceModels";

afterEach(() => { cleanup(); delete window.sidevoiceActions; });

/* The call's voice models, as the call's details list them (CallDetails): what each is for, its model's id, where it
 * runs and its state; and whether any needs something (the stage title's dot). */

/** The models as the details show them, and what the title's dot reads. */
let attention = false;
function Shown() {
  const voice = useVoiceModels();
  attention = voice.attention;
  return <VoiceModels rows={voice.rows} />;
}
const rowOf = (row: Element) => ({ task: row.querySelector(".voice-model-task")?.textContent, id: row.querySelector(".voice-model-id")?.textContent,
  where: row.querySelector(".voice-model-where")?.firstChild?.textContent, state: row.querySelector(".voice-model-state")?.textContent ?? null,
  attention: row.hasAttribute("data-attention") });
const rows = () => [...document.querySelectorAll(".voice-model")].map(rowOf);

const build = { id: "b", backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true };
const catalogs = [
  { id: "local", name: null, status: { stale: false }, models: [{ id: "whisper-base", family: "whisper", capabilities: ["stt"], installed: true, builds: [build], languages: [], voices: [] }] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "eleven_flash_v2_5", capabilities: ["tts"], languages: [], voices: [] }] },
] as unknown as CatalogView[];

function shown(settings: ReturnType<typeof defaultVoiceSettings> = { ...defaultVoiceSettings(), tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } }) {
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: settings, voiceCatalogue: { state: "ready", catalogs, error: "" } }));
  render(<RoomProvider store={store}><TooltipProvider><Shown /></TooltipProvider></RoomProvider>);
}

test("speech to text over text to speech, each its model's id and where it runs, the list named in full for a screen reader", () => {
  shown();
  expect(screen.getByRole("list", { name: "Your voice: whisper-base turns speech to text, eleven_flash_v2_5 speaks" })).toBeInTheDocument();
  expect(rows()).toEqual([
    { task: "Speech to text", id: "whisper-base", where: "on this device", state: "ready", attention: false },
    { task: "Text to speech", id: "eleven_flash_v2_5", where: "through ElevenLabs", state: "ready", attention: false },
  ]);
  expect(attention).toBe(false);
});

test("a model that needs something says so in words, in the attention style, with what can be done; the title's dot follows", () => {
  shown({ ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-small", language: null } });
  const [stt] = rows();
  expect(stt).toMatchObject({ id: "whisper-small", state: "not available now", attention: true });
  expect(document.querySelector(".voice-model[data-attention] .voice-model-action button")).toHaveTextContent("Open its settings");
  expect(attention).toBe(true);
});

test("before the catalogue is read, a row claims nothing about its model: no state, no attention", () => {
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: defaultVoiceSettings() }));
  render(<RoomProvider store={store}><TooltipProvider><Shown /></TooltipProvider></RoomProvider>);
  expect(rows().map((row) => [row.state, row.attention])).toEqual([[null, false], [null, false]]);
  expect(attention).toBe(false);
});

test("the smart end of turn adds its model's row under the other two; the silence one adds none", () => {
  const turnModel = { id: "smart-turn-v3", family: "smart-turn", capabilities: ["end-of-turn"], installed: false, builds: [{ ...build, installed: false }], languages: [], voices: [] };
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models, turnModel] } : catalog) as CatalogView[];
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" }, voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } }));
  render(<RoomProvider store={store}><TooltipProvider><Shown /></TooltipProvider></RoomProvider>);
  expect(rows()).toHaveLength(3);
  expect(rows()[2]).toMatchObject({ task: "End of turn", id: "smart-turn-v3", state: "not downloaded", attention: true });
  expect(document.querySelectorAll(".voice-model")[2].querySelector(".voice-model-action button")).toHaveTextContent("Download");
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(rows()).toHaveLength(2);
});

test("the stage reads the catalogue itself, once: the Smart Turn row shows when it is read", () => {
  const loadVoiceCatalogue = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { loadVoiceCatalogue } as unknown as SidevoiceActions;
  const store = createRoomStore();
  // The smart end of turn names no model in the settings: its row waits for the catalogue's.
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn", tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } } }));
  expect(store.getState().facts.voiceCatalogue.state).toBe("idle");
  render(<RoomProvider store={store}><TooltipProvider><Shown /></TooltipProvider></RoomProvider>);
  expect(loadVoiceCatalogue).toHaveBeenCalledTimes(1);
  expect(rows()).toHaveLength(2);
  const turnModel = { id: "smart-turn-v3", family: "smart-turn", capabilities: ["end-of-turn"], installed: false, builds: [{ ...build, installed: false }], languages: [], voices: [] };
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models, turnModel] } : catalog) as CatalogView[];
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } }));
  expect(rows()).toHaveLength(3);
  expect(rows()[1]).toMatchObject({ where: "through ElevenLabs" });
  expect(loadVoiceCatalogue).toHaveBeenCalledTimes(1);
});

test("a catalogue read or being read is not read again by the stage", () => {
  const loadVoiceCatalogue = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { loadVoiceCatalogue } as unknown as SidevoiceActions;
  for (const voiceCatalogue of [{ state: "loading" as const, catalogs: [], error: "" }, { state: "ready" as const, catalogs, error: "" }, { state: "failed" as const, catalogs: [], error: "x" }]) {
    const store = createRoomStore();
    act(() => store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue }));
    render(<RoomProvider store={store}><TooltipProvider><Shown /></TooltipProvider></RoomProvider>);
    cleanup();
  }
  expect(loadVoiceCatalogue).not.toHaveBeenCalled();
});
