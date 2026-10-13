import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import type { SidevoiceActions } from "../../state/room-types";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { VoiceModels } from "./VoiceModels";

afterEach(() => { cleanup(); delete window.sidevoiceActions; });

/* The call's voice models, stacked in the tile's corner: each model's id, and in words what it does. */

const build = { id: "b", backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true };
const catalogs = [
  { id: "local", name: null, status: { stale: false }, models: [{ id: "whisper-base", family: "whisper", capabilities: ["stt"], installed: true, builds: [build], languages: [], voices: [] }] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "eleven_flash_v2_5", capabilities: ["tts"], languages: [], voices: [] }] },
] as unknown as CatalogView[];

function shown(settings: ReturnType<typeof defaultVoiceSettings> = { ...defaultVoiceSettings(), tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } }) {
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: settings, voiceCatalogue: { state: "ready", catalogs, error: "" } }));
  render(<RoomProvider store={store}><TooltipProvider><VoiceModels /></TooltipProvider></RoomProvider>);
}

test("speech to text over text to speech, each its model's id, said in full for a screen reader", () => {
  shown();
  const group = screen.getByRole("group", { name: "Your voice: whisper-base turns speech to text, eleven_flash_v2_5 speaks" });
  expect([...group.querySelectorAll(".voice-chip")].map((chip) => chip.getAttribute("aria-label"))).toEqual(["Speech to text: whisper-base", "Text to speech: eleven_flash_v2_5"]);
});

test("quiet while ready; a model that needs something says so in words, in the attention style", () => {
  shown({ ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-small", language: null } });
  const [stt, tts] = [...document.querySelectorAll(".voice-chip")];
  expect(stt).toHaveAttribute("data-attention");
  expect(stt).toHaveAccessibleName("Speech to text: whisper-small, not available now");
  expect(tts).toHaveAttribute("data-attention");
  cleanup();
  shown();
  expect(document.querySelector(".voice-chip")).not.toHaveAttribute("data-attention");
});

test("before the catalogue is read, a badge claims nothing about its model: quiet, no state", () => {
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: defaultVoiceSettings() }));
  render(<RoomProvider store={store}><TooltipProvider><VoiceModels /></TooltipProvider></RoomProvider>);
  expect([...document.querySelectorAll(".voice-chip")].map((chip) => chip.hasAttribute("data-attention"))).toEqual([false, false]);
  expect(document.querySelector(".voice-chip-state")).toBeNull();
});

test("the smart end of turn adds its model's badge under the other two; the silence one adds none", () => {
  const turnModel = { id: "smart-turn-v3", family: "smart-turn", capabilities: ["end-of-turn"], installed: false, builds: [{ ...build, installed: false }], languages: [], voices: [] };
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models, turnModel] } : catalog) as CatalogView[];
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" }, voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } }));
  render(<RoomProvider store={store}><TooltipProvider><VoiceModels /></TooltipProvider></RoomProvider>);
  const chips = [...document.querySelectorAll(".voice-chip")];
  expect(chips).toHaveLength(3);
  expect(chips[2]).toHaveAccessibleName("End of turn: smart-turn-v3, not downloaded");
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(document.querySelectorAll(".voice-chip")).toHaveLength(2);
});

test("the stage reads the catalogue itself: the Smart Turn badge shows, and the others say their state, without Settings opened", () => {
  const loadVoiceCatalogue = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { loadVoiceCatalogue } as unknown as SidevoiceActions;
  const store = createRoomStore();
  // The smart end of turn names no model in the settings: its badge waits for the catalogue's.
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn", tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } } }));
  expect(store.getState().facts.voiceCatalogue.state).toBe("idle");
  render(<RoomProvider store={store}><TooltipProvider><VoiceModels /></TooltipProvider></RoomProvider>);
  expect(loadVoiceCatalogue).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll(".voice-chip")).toHaveLength(2);
  const details = () => { fireEvent.click(document.querySelector(".voice-chip")!); return screen.getByRole("tooltip").textContent; };
  expect(details()).toContain("whisper-base · on this device · not checked yet");

  const turnModel = { id: "smart-turn-v3", family: "smart-turn", capabilities: ["end-of-turn"], installed: false, builds: [{ ...build, installed: false }], languages: [], voices: [] };
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models, turnModel] } : catalog) as CatalogView[];
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } }));
  const chips = [...document.querySelectorAll(".voice-chip")];
  expect(chips).toHaveLength(3);
  expect(chips[2]).toHaveAccessibleName("End of turn: smart-turn-v3, not downloaded");
  expect(chips[2].querySelector(".voice-chip-state")).toHaveTextContent("not downloaded");
  const said = details();
  expect(said).not.toContain("not checked yet");
  expect(said).toContain("whisper-base · on this device · ready");
  expect(said).toContain("eleven_flash_v2_5 · through ElevenLabs · ready");
  expect(loadVoiceCatalogue).toHaveBeenCalledTimes(1);
});

test("a catalogue read or being read is not read again by the stage", () => {
  const loadVoiceCatalogue = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { loadVoiceCatalogue } as unknown as SidevoiceActions;
  for (const voiceCatalogue of [{ state: "loading" as const, catalogs: [], error: "" }, { state: "ready" as const, catalogs, error: "" }, { state: "failed" as const, catalogs: [], error: "x" }]) {
    const store = createRoomStore();
    act(() => store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue }));
    render(<RoomProvider store={store}><TooltipProvider><VoiceModels /></TooltipProvider></RoomProvider>);
    cleanup();
  }
  expect(loadVoiceCatalogue).not.toHaveBeenCalled();
});

test("on a phone: nothing while every model is ready, and only a dot when one needs something", () => {
  const narrow = vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === "(max-width: 899px)", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  shown({ ...defaultVoiceSettings(), tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } });
  expect(document.querySelector(".voice-chip")).toBeNull();
  expect(screen.queryByRole("button", { name: "Your voice needs attention" })).toBeNull();
  cleanup();
  shown({ ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-small", language: null } });
  expect(document.querySelector(".voice-chip")).toBeNull();
  expect(screen.getByRole("button", { name: "Your voice needs attention" })).toBeInTheDocument();
  narrow.mockRestore();
});
