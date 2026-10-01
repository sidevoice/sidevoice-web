import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { StageSettings } from "./StageSettings";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import { stageContext } from "../../state/room-session-state.js";
import { effectiveStage, withBuild, withModel, withPlace } from "../../state/stage-settings.js";
import { offers, type Capabilities, type Catalog } from "../../../../../packages/browser-audio/offers";
import catalog from "../../../../../packages/browser-audio/models.json";
import voices from "../../../../../packages/browser-audio/catalog.json";
import type { StageTask } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));

const PAGE: Capabilities = { runs: "page", has: ["webgpu", "webgpu-f16", "wasm"] };
const WASM: Capabilities = { runs: "page", has: ["wasm"] };
const MAC: Capabilities = { runs: "native", os: "macos", arch: "aarch64", has: ["cpu", "coreml"], memory_mb: 16384 };
const LISTING = { providers: [{ id: "openai", label: "OpenAI", capabilities: ["transcription" as const], configured: false }] };

/* The store and the pure edits the controller's actions are made of, without the controller. */
function room(capabilities: Capabilities, inApp = false, models: Catalog = catalog as Catalog) {
  const store = createRoomStore();
  render(<RoomProvider store={store}><StageSettings task="stt" /><StageSettings task="tts" /></RoomProvider>);
  act(() => {
    store.patch({ modelCatalog: models as never, voiceLanguages: voices.languages as never, speechLanguage: "es", inApp,
      deviceCapabilities: capabilities, deviceOffers: offers(models, capabilities, "device") as never,
      integrations: LISTING, integrationsStatus: "ready" });
  });
  const edit = (task: StageTask, next: (stage: ReturnType<typeof effectiveStage>) => unknown) => act(() => {
    const facts = store.facts, ctx = stageContext(facts);
    const current = effectiveStage(ctx, task, (facts.stageDraft || facts.voicePreferences || {})[task]);
    store.patch({ stageDraft: { ...(facts.stageDraft || {}), [task]: next(current) as Record<string, unknown> } });
  });
  const openIntegration = vi.fn();
  window.sidevoiceActions = {
    chooseStagePlace: (task: StageTask, place: string) => edit(task, (stage) => withPlace(stageContext(store.facts), task, stage, place, null)),
    chooseStageModel: (task: StageTask, model: string) => edit(task, (stage) => withModel(stageContext(store.facts), task, stage, model)),
    chooseStageBuild: (task: StageTask, value: string) => edit(task, (stage) => withBuild(stageContext(store.facts), task, stage, value)),
    setStageOption: vi.fn(), previewVoice: vi.fn(), prepareVoice: vi.fn(), openIntegration,
  } as unknown as typeof window.sidevoiceActions;
  return { store: store as RoomStore, openIntegration };
}
const pane = (task: StageTask) => document.querySelector(`.stage-settings[data-task=${task}]`)!;
const modelIds = (task: StageTask) => [...pane(task).querySelectorAll<HTMLOptionElement>(`#${task}-model option`)].map((o) => o.value);

test("a WASM-only page offers three models, one with WebGPU and f16 five; no engine choice outside Avanzado", () => {
  room(WASM);
  expect(modelIds("stt")).toEqual(["whisper-tiny", "whisper-base"]);
  expect(modelIds("tts")).toEqual(["kokoro-82m-v1.0"]);
  expect(screen.getAllByRole("button", { name: "Este dispositivo" })).toHaveLength(2);
  expect(pane("stt").textContent).toMatch(/este navegador/);
  expect(pane("stt").querySelector("summary")!.textContent).toBe("Avanzado");
  document.body.innerHTML = "";
  room(PAGE);
  expect([...modelIds("stt"), ...modelIds("tts")]).toHaveLength(5);
});

test("a place change makes the model list follow; a model change makes the options follow its family", () => {
  // A configured provider, and a second stt family with a schema of its own (synthetic), so both the place and
  // the family really change (the review found the first version of this test changed neither).
  const synthetic = structuredClone(catalog) as Catalog & { families: Record<string, { task: string; options: unknown[] }>; models: { id: string }[] };
  synthetic.engines.find((engine) => engine.id === "transformers-js")!.families.push("parakeet");
  synthetic.families.parakeet = { task: "stt", options: [{ id: "beam", kind: "range", min: 1, max: 8, step: 1, default: 4 }] };
  synthetic.models.splice(1, 0, { id: "test-parakeet", family: "parakeet", label: "Parakeet (test)",
    builds: [{ engine: "transformers-js", format: "onnx", config: {} }] } as never);
  const { store } = room(PAGE, false, synthetic);
  act(() => { store.patch({ integrations: { providers: [{ id: "openai", label: "OpenAI", capabilities: ["transcription"], configured: true }] },
    remoteModels: { "openai:stt": { models: [{ id: "gpt-4o-transcribe", label: "GPT-4o" }] } } }); });
  const optionIds = () => [...pane("stt").querySelectorAll("[id^=stt-option-]")].map((node) => node.id.replace("stt-option-", ""));
  expect(modelIds("stt")[0]).toBe("whisper-tiny");
  expect(optionIds()).toEqual(["language"]);
  fireEvent.change(document.getElementById("stt-model")!, { target: { value: "test-parakeet" } });
  expect(document.getElementById("stt-model")).toHaveValue("test-parakeet");
  expect(optionIds()).toEqual(["beam"]);
  expect(document.getElementById("stt-option-beam")).toHaveValue("4");
  fireEvent.click(document.getElementById("stt-place-openai")!);
  expect(document.getElementById("stt-place-openai")).toHaveAttribute("aria-pressed", "true");
  expect(modelIds("stt")).toEqual(["gpt-4o-transcribe"]);
  expect(optionIds()).toEqual(["language", "context"]);
  expect(pane("stt").querySelector("#stt-build")).toBeNull();
  fireEvent.click(document.getElementById("stt-place-device")!);
  expect(modelIds("stt")).toContain("test-parakeet");
  fireEvent.change(document.getElementById("stt-build")!, { target: { value: "transformers-js/wasm" } });
  expect(document.getElementById("stt-build")).toHaveValue("transformers-js/wasm");
});

test("a keyless provider opens Integraciones at its row instead of being chosen", () => {
  const { openIntegration } = room(PAGE);
  const openai = document.getElementById("stt-place-openai")!;
  expect(openai.textContent).toBe("OpenAI · Configurar");
  fireEvent.click(openai);
  expect(openIntegration).toHaveBeenCalledWith("openai");
  expect(document.getElementById("stt-place-device")).toHaveAttribute("aria-pressed", "true");
});

test("in the app, the native engine's capabilities never yield a page build, and the page's words are absent", () => {
  room(MAC, true);
  expect([...modelIds("stt"), ...modelIds("tts")]).toHaveLength(5);
  const text = document.body.textContent!;
  expect(text).not.toMatch(/navegador|WebGPU|WASM|transformers/);
  expect([...document.querySelectorAll<HTMLOptionElement>("#stt-build option")].map((o) => o.value)).toEqual(["auto", "sherpa-onnx/cpu", "sherpa-onnx/coreml"]);
});

test("in the app the whole settings dialog, every pane, says nothing of a browser (review R10)", async () => {
  const { SettingsDialog } = await import("./SettingsDialog");
  const { ConnectionStatsDialog } = await import("../diagnostics/ConnectionStatsDialog");
  const { PreparationDialog } = await import("../call/PreparationDialog");
  const store = createRoomStore();
  render(<RoomProvider store={store}><SettingsDialog /><ConnectionStatsDialog /><PreparationDialog /></RoomProvider>);
  act(() => {
    store.patch({ modelCatalog: catalog as never, voiceLanguages: voices.languages as never, speechLanguage: "es", inApp: true,
      deviceCapabilities: MAC, deviceOffers: offers(catalog as Catalog, MAC, "device") as never, integrations: LISTING, integrationsStatus: "ready" });
  });
  expect(document.querySelectorAll(".stage-settings")).toHaveLength(2);
  expect(document.body.textContent).not.toMatch(/navegador|WebGPU|WASM|transformers/i);
});
