import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { stageContext } from "../../state/room-session-state.js";
import { effectiveStage, withModel } from "../../state/stage-settings.js";
import { offers, type Capabilities, type Catalog } from "../../../../../packages/browser-audio/offers";
import catalog from "../../../../../packages/browser-audio/models.json";
import voices from "../../../../../packages/browser-audio/catalog.json";
import { StageEditor } from "./StageEditor";

vi.mock("../../services/room-session-controller.js", () => ({}));

const WASM: Capabilities = { runs: "page", has: ["wasm"] };
const HOST = "fp-stage-editor";
const SAVED = { place: "device", model: "whisper-tiny", options: { language: "auto", context: "" }, build: null };

function setupEditor(stageStatus: "ready" | "idle" = "ready") {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "en" }));
  const store = createRoomStore();
  act(() => store.patch({
    modelCatalog: catalog as never,
    voiceLanguages: voices.languages as never,
    speechLanguage: "en",
    deviceCapabilities: WASM,
    deviceOffers: offers(catalog as Catalog, WASM, "device") as never,
    pairings: [{ fp: HOST, device_id: "device-stage", urls: ["https://host.example"], rv: null,
      host: "Stage host", paired_at: 1_700_000_000, revoked: false }],
    pairingInUse: HOST,
    node: HOST,
    nodeReach: "ok",
    machinesReady: true,
    integrations: { providers: [] },
    integrationsStatus: "ready",
    voicePreferences: { stt: SAVED, tts: { place: "device", model: "kokoro-82m-v1.0", options: {}, build: null } } as never,
    stagePreparation: { host: HOST, request: 1, status: stageStatus },
  }));
  const prepareStage = vi.fn(async () => true);
  const prepareStages = vi.fn(async () => true);
  const draftStageModel = vi.fn((task: "stt" | "tts", model: string) => {
    const facts = store.getState().facts;
    const source = facts.stageDraft || facts.voicePreferences || {};
    const next = withModel(stageContext(facts), task, effectiveStage(stageContext(facts), task, source[task]), model);
    store.patch({ stageDraft: { ...source, [task]: next } });
  });
  const actions = {
    prepareOnboardingStage: prepareStage,
    prepareOnboardingStages: prepareStages,
    draftStageModel,
    draftStagePlace: vi.fn(),
    draftStageBuild: vi.fn(),
    draftStageOption: vi.fn(),
    setStageOption: vi.fn(),
    stopVoicePreview: vi.fn(),
    transcriptionTrial: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as typeof window.sidevoiceActions;
  const view = render(<RoomProvider store={store}><dialog id="language-settings" open><StageEditor task="stt" machineSettings /></dialog></RoomProvider>);
  return { store, actions, view };
}

test("machine Settings loads shared stage facts when its selected host is idle", () => {
  const { actions } = setupEditor("idle");
  expect(actions.prepareOnboardingStages).toHaveBeenCalledWith(HOST);
});

test("machine Settings keeps a model change as a draft until explicit Prepare", async () => {
  const { actions } = setupEditor();
  const picker = await screen.findByLabelText("Modelo");
  fireEvent.change(picker, { target: { value: "whisper-base" } });

  expect(actions.draftStageModel).toHaveBeenCalledWith("stt", "whisper-base");
  fireEvent.change(document.getElementById("stt-option-language")!, { target: { value: "en" } });
  expect(actions.draftStageOption).toHaveBeenCalledWith("stt", "language", "en", undefined);
  expect(actions.setStageOption).not.toHaveBeenCalled();
  expect(actions.prepareOnboardingStage).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Prepare stage" })); await Promise.resolve(); });
  await vi.waitFor(() => expect(actions.prepareOnboardingStage).toHaveBeenCalledWith("stt", HOST));
  expect(actions.prepareOnboardingStage).toHaveBeenCalledOnce();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("closing retained Settings cancels capture, stops its track, and clears trial state", async () => {
  const result = deferred<{ text: string }>();
  const stopTrack = vi.fn();
  const cancel = vi.fn(() => stopTrack());
  const ready = new Promise<void>(() => {});
  const { actions } = setupEditor();
  actions.transcriptionTrial = vi.fn(() => ({ ready, result: result.promise, finish: vi.fn(), cancel })) as never;

  fireEvent.click(await screen.findByRole("button", { name: "Speak" }));
  expect(document.querySelector(".stage-try-status")).toHaveTextContent(/Listening/);
  act(() => document.getElementById("language-settings")!.dispatchEvent(new Event("close")));

  expect(cancel).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(screen.queryByText("Listening")).toBeNull();
  await act(async () => { result.resolve({ text: "late transcript" }); await result.promise; });
  expect(screen.queryByText("late transcript")).toBeNull();
});

test("closing retained Settings aborts pending inference and discards its late transcript", async () => {
  const result = deferred<{ text: string }>();
  const inference = new AbortController();
  const cancel = vi.fn(() => inference.abort());
  let onState: ((state: "listening" | "transcribing") => void) | undefined;
  const { actions } = setupEditor();
  actions.transcriptionTrial = vi.fn((options: { onState(state: "listening" | "transcribing"): void }) => {
    onState = options.onState;
    return { ready: Promise.resolve(), result: result.promise, finish: vi.fn(), cancel };
  }) as never;

  fireEvent.click(await screen.findByRole("button", { name: "Speak" }));
  act(() => onState?.("transcribing"));
  expect(document.querySelector(".stage-try-status")).toHaveTextContent(/Transcribing/);
  act(() => document.getElementById("language-settings")!.dispatchEvent(new Event("close")));

  expect(cancel).toHaveBeenCalledOnce();
  expect(inference.signal.aborted).toBe(true);
  await act(async () => { result.resolve({ text: "late transcript" }); await result.promise; });
  expect(screen.queryByText("late transcript")).toBeNull();
  expect(screen.queryByText(/Transcribing/)).toBeNull();
});
