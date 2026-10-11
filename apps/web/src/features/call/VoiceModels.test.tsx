import { afterEach, expect, test } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { VoiceModels, type VoiceModelsPlace } from "./VoiceModels";

afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); });

/* The call's voice models, where the variant puts them: each model's id, and in words what it does and where it runs. */

const build = { id: "b", backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true };
const catalogs = [
  { id: "local", name: null, status: { stale: false }, models: [{ id: "whisper-base", family: "whisper", capabilities: ["stt"], installed: true, builds: [build], languages: [], voices: [] }] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "eleven_flash_v2_5", capabilities: ["tts"], languages: [], voices: [] }] },
] as unknown as CatalogView[];

function shown(variant: VoiceModelsPlace, place: VoiceModelsPlace) {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "voice-models": variant }));
  const store = createRoomStore();
  const settings = { ...defaultVoiceSettings(), tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } };
  act(() => store.patch({ voiceSettings: settings, voiceCatalogue: { state: "ready", catalogs, error: "" } }));
  render(<RoomProvider store={store}><TooltipProvider><VoiceModels place={place} /></TooltipProvider></RoomProvider>);
}

test("in the tile (A, the default), both models' ids, said in full for a screen reader", () => {
  shown("tile", "tile");
  const badge = screen.getByLabelText("Your voice: whisper-base turns speech to text, eleven_flash_v2_5 speaks");
  expect(badge).toHaveTextContent("whisper-base·eleven_flash_v2_5");
});

test("in the call bar (B), a chip each; elsewhere nothing", () => {
  shown("bar", "bar");
  expect(document.querySelectorAll(".voice-chip")).toHaveLength(2);
  cleanup();
  shown("bar", "tile");
  expect(document.querySelector(".voice-models")).toBeNull();
});
