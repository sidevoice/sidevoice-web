import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { Downloads } from "./Downloads";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* The downloads in the room (sidevoice/sidevoice-core#21): from the store alone, as the controller records them. */
const RUNNING = { id: "check:stt:whisper-base", label: "Whisper base", task: "stt" as const, kind: "native" as const, state: "running" as const,
  done: 20e6, total: 80e6, bytes_per_s: 4e6, eta_s: 15, error: "", started: 0, ended: null };

function room() {
  const store = createRoomStore();
  render(<RoomProvider store={store}><Downloads /></RoomProvider>);
  const cancelDownload = vi.fn();
  window.sidevoiceActions = { cancelDownload } as unknown as typeof window.sidevoiceActions;
  return { store, cancelDownload };
}

test("nothing downloading, nothing shown", () => {
  room();
  expect(screen.queryByRole("button", { name: "Descargas" })).toBeNull();
});

test("while a download runs the indicator says how many and how far; its panel lists each with bytes, speed, time left and Cancelar", () => {
  const { store, cancelDownload } = room();
  act(() => store.patch({ downloads: [RUNNING, { ...RUNNING, id: "load:tts:kokoro", label: "Kokoro 82M v1.0", task: "tts", kind: "page", done: 5e6, total: 20e6, bytes_per_s: null, eta_s: null }] }));
  const toggle = screen.getByRole("button", { name: "Descargas" });
  expect(toggle.textContent).toContain("2");
  expect(toggle.textContent).toContain("25 %");
  fireEvent.click(toggle);
  const panel = screen.getByRole("region", { name: "Descargas" });
  const rows = panel.querySelectorAll("li");
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("Whisper base");
  expect(rows[0].textContent).toContain("Transcripción");
  expect(rows[0].textContent).toContain("20 MB / 80 MB");
  expect(rows[0].textContent).toContain("4,0 MB/s");
  expect(rows[0].textContent).toContain("Quedan");
  expect(rows[0].textContent).toContain("15 s");
  expect(rows[0].querySelector("progress")!.value).toBeCloseTo(0.25);
  fireEvent.click(rows[1].querySelector("button")!);
  expect(cancelDownload).toHaveBeenCalledWith("load:tts:kokoro");
});

test("an ended download stays listed briefly with how it ended, and cannot be cancelled", () => {
  const { store } = room();
  act(() => store.patch({ downloads: [{ ...RUNNING, state: "failed", error: "La descarga se interrumpió.", bytes_per_s: null, eta_s: null, ended: 1 },
    { ...RUNNING, id: "b", state: "done", done: 80e6, ended: 1 }] }));
  fireEvent.click(screen.getByRole("button", { name: "Descargas" }));
  const rows = screen.getByRole("region", { name: "Descargas" }).querySelectorAll("li");
  expect(rows[0].textContent).toContain("Falló");
  expect(rows[0].textContent).toContain("La descarga se interrumpió.");
  expect(rows[1].textContent).toContain("Descargado");
  expect(screen.getByRole("region", { name: "Descargas" }).querySelectorAll("button")).toHaveLength(0);
});
