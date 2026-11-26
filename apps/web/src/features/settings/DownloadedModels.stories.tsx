import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { DownloadedModels } from "./DownloadedModels";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import "./settings.css";

/* The models on this device's storage (Settings › Advanced): each with its purpose chip (PurposeChip: Transcription, Voice,
 * End of turn, Every call — a hand-made `.model-purpose`, not the Badge primitive), In use, its size, and Delete for those
 * not in use where the engine can take a model off the device. PurposeChip is not exported: it is shown here, in its row.
 * Seeded with the local catalogue as the engine lists it: the models the default settings use, the voice detector, and one
 * not used for twelve days. Deleting asks first; the delete itself is the runtime's, which is not here. */

const build = (id: string, bytes: number) => ({ id: id + "/int8", backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", acceleratorClass: "cpu",
  downloadBytes: bytes, memoryMb: 300, available: true, reasons: [], installed: true });
const model = (id: string, family: string, capability: string, bytes: number, extra: Record<string, unknown> = {}) =>
  ({ id, family, capabilities: [capability], parametersM: 74, license: "MIT", languages: ["en", "es"], voices: [], installed: true, builds: [build(id, bytes)], recommendedBuild: id + "/int8", ...extra });
const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [
  model("whisper-base", "whisper", "stt", 148e6),
  model("whisper-small", "whisper", "stt", 466e6, { lastUsedAt: Date.now() - 12 * 86_400_000 }),
  model("kokoro-82m-v1.0", "kokoro", "tts", 330e6),
  model("smart-turn-v3", "smart-turn", "end-of-turn", 8.7e6),
  model("silero-vad-v5", "silero-vad", "vad", 2.2e6),
] }];

function Room({ removable, children }: { removable: boolean; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch({ voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" }, voiceSettings: defaultVoiceSettings(), modelsRemovable: removable } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}><div style={{ maxWidth: 560 }}>{children}</div></RoomStoreContext.Provider>;
}

const meta = {
  title: "Product/Settings/DownloadedModels",
  component: DownloadedModels,
} satisfies Meta<typeof DownloadedModels>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Where the engine can delete models: Delete on those not in use. */
export const Removable: Story = { render: () => <Room removable><DownloadedModels /></Room> };

/** Where it cannot: the list alone, and why under its label. */
export const NotRemovable: Story = { render: () => <Room removable={false}><DownloadedModels /></Room> };
