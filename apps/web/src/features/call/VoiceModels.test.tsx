import { afterEach, expect, test } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { VoiceModels } from "./VoiceModels";

afterEach(cleanup);

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
