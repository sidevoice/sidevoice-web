import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { StageSettings } from "./StageSettings";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { diagnosticsText } from "../../state/stage-settings.js";
import { offers, type Capabilities, type Catalog } from "../../../../../packages/browser-audio/offers";
import catalog from "../../../../../packages/browser-audio/models.json";
import voices from "../../../../../packages/browser-audio/catalog.json";
import type { StageTask } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* What a pane shows while a model is selected (sidevoice/sidevoice-core#21) and what Diagnóstico says (sidevoice/sidevoice-core#13), from the store alone: the
 * selection's record is stage-selection.js's, published by the controller. */
const WASM: Capabilities = { runs: "page", has: ["wasm"] };
const SAVED = { place: "device", model: "whisper-tiny", options: { language: "es" }, build: null };
const BASE = { place: "device", model: "whisper-base", options: { language: "es" }, build: null };

function room() {
  const store = createRoomStore();
  render(<RoomProvider store={store}><StageSettings task="stt" /></RoomProvider>);
  act(() => {
    store.patch({ modelCatalog: catalog as never, voiceLanguages: voices.languages as never, speechLanguage: "es",
      deviceCapabilities: WASM, deviceOffers: offers(catalog as Catalog, WASM, "device") as never,
      integrations: { providers: [] }, integrationsStatus: "ready", voicePreferences: { stt: SAVED } as never,
      pageFacts: { adapter: null, crossOriginIsolated: false, threads: 1, cores: 8 } });
  });
  const actions = { decideStage: vi.fn(), cancelStage: vi.fn(), recheckStage: vi.fn(), copyDiagnostics: vi.fn(async () => true), chooseStageModel: vi.fn(), chooseStagePlace: vi.fn(), chooseStageBuild: vi.fn(), setStageOption: vi.fn() };
  window.sidevoiceActions = actions as unknown as typeof window.sidevoiceActions;
  const check = (value: Record<string, unknown> | null) => act(() => store.patch({ stageChecks: { stt: value && { previous: "Whisper tiny", ...value } } }));
  return { store, actions, check };
}
const pane = (task: StageTask = "stt") => document.querySelector<HTMLElement>(`.stage-settings[data-task=${task}]`)!;
const picker = () => pane().querySelector<HTMLSelectElement>("#stt-model")!;

test("a model not on this device asks before downloading, with its size; the pane waits for the answer", () => {
  const { actions, check } = room();
  check({ phase: "consent", stage: BASE, size: 79_664_191 });
  expect(pane().textContent).toContain("Descarga necesaria:");
  expect(pane().textContent).toContain("80 MB");
  expect(picker().value).toBe("whisper-base");
  expect(picker().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Descargar y probar" }));
  expect(actions.decideStage).toHaveBeenCalledWith("stt", true);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(actions.decideStage).toHaveBeenCalledWith("stt", false);
});

test("a download in progress says the step and its bytes, and can be cancelled", () => {
  const { actions, check } = room();
  check({ phase: "running", stage: BASE, progress: { step: "download", done: 20_000_000, total: 79_664_191 } });
  expect(pane().textContent).toContain("Descarga");
  expect(pane().textContent).toContain("20 MB / 80 MB");
  expect(pane().querySelector("progress")!.value).toBeCloseTo(0.251, 2);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(actions.cancelStage).toHaveBeenCalledWith("stt");
  check({ phase: "running", stage: BASE, progress: { step: "check", pass: 2, passes: 2 } });
  expect(pane().textContent).toContain("Comprobación 2/2");
});

test("a failure names the model, the step and the cause, and the pane is back on the model still in use", () => {
  const { check } = room();
  check({ phase: "failed", stage: BASE, step: "download", reason: { key: "download_failed", message: "reset" } });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("No se activó:");
  expect(alert.textContent).toContain("Whisper base");
  expect(alert.textContent).toContain("Descarga");
  expect(alert.textContent).toContain("La descarga se interrumpió.");
  expect(alert.textContent).toContain("Sigue activo");
  expect(alert.textContent).toContain("Whisper tiny");
  expect(picker().value).toBe("whisper-tiny");
  expect(picker().disabled).toBe(false);
  check({ phase: "failed", stage: BASE, step: "check", reason: { key: "check_mismatch", heard: "Thanks for watching", message: "x" } });
  expect(screen.getByRole("alert").textContent).toContain("El modelo entendió otra cosa: «Thanks for watching»");
});

test("a slow model says its latency against the comfort line and asks", () => {
  const { actions, check } = room();
  check({ phase: "slow", stage: BASE, result: { ok: true, slow: true, latency_ms: 2800, load_ms: 900, passes: [{ latency_ms: 3100 }, { latency_ms: 2800 }] } });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("2,80 s");
  expect(alert.textContent).toContain("2,00 s");
  fireEvent.click(screen.getByRole("button", { name: "Usar igualmente" }));
  expect(actions.decideStage).toHaveBeenCalledWith("stt", true);
  fireEvent.click(screen.getByRole("button", { name: "Elegir otro" }));
  expect(actions.decideStage).toHaveBeenCalledWith("stt", false);
});

test("a model that took effect shows what it was measured at", () => {
  const { check } = room();
  check({ phase: "done", stage: BASE, result: { ok: true, load_ms: 1234, latency_ms: 812, passes: [{ latency_ms: 950 }, { latency_ms: 812 }] } });
  const text = pane().textContent!;
  expect(text).toContain("Activado:");
  expect(text).toContain("1,23 s");
  expect(text).toContain("0,81 s");
});

test("Diagnóstico shows the build, the resolver's reason, both passes and the page's facts; Copiar resultados copies them", async () => {
  const { store, actions } = room();
  act(() => store.patch({ stageDiagnostics: { stt: { at: 0, stage: SAVED, ok: true, step: "done", build: { engine: "transformers-js", accelerator: "wasm" }, load_ms: 640,
    passes: [{ latency_ms: 900 }, { latency_ms: 700 }], memory: { device_gb: 8 } } } }));
  const rows = Object.fromEntries([...pane().querySelectorAll(".stage-diagnostics dt")].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]));
  expect(rows).toMatchObject({ Lugar: "Este dispositivo", Motor: "transformers-js · 3.8.1 · onnx", Acelerador: "WASM", Resultado: "Correcto", Carga: "0,64 s",
    "Pasada 1": "0,90 s", "Pasada 2": "0,70 s", "Memoria del dispositivo": "≈ 8 GB", "Adaptador WebGPU": "Ninguno", crossOriginIsolated: "No", Hilos: "1 / 8" });
  expect(rows.Motivo).toMatch(/transformers-js/);
  fireEvent.click(screen.getByRole("button", { name: "Copiar resultados" }));
  expect(actions.copyDiagnostics).toHaveBeenCalledWith("stt");
  expect(await screen.findByText("Copiado")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Comprobar ahora" }));
  expect(actions.recheckStage).toHaveBeenCalledWith("stt");

  const diagnostics = store.getState().stages!.stt.diagnostics!;
  const text = diagnosticsText("stt", diagnostics, [{ label: "Compilación", value: "abc" }], (value: string) => (value === "Lugar" ? "Place" : value));
  expect(text.split("\n")[0]).toBe("Transcripción");
  expect(text).toContain("Place: Este dispositivo");
  expect(text).toContain("Pasada 2: 0,70 s");
  expect(text.split("\n").at(-1)).toBe("Compilación: abc");
});
