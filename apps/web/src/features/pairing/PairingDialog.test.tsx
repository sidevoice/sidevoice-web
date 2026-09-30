import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { PairingDialog } from "./PairingDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

vi.mock("../../services/room-session-controller.js", () => ({}));

function dialog(pairDevice: (code: string, name: string) => Promise<unknown>) {
  const store = createRoomStore();
  const closePairing = vi.fn(() => store.patch({ pairingOpen: false, pairingNote: "" }));
  window.sidevoiceActions = { pairDevice, closePairing } as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><PairingDialog /></RoomProvider>);
  return { store, closePairing, element: () => document.getElementById("device-pairing") as HTMLDialogElement };
}
const code = () => screen.getByRole("textbox", { name: /Código de emparejamiento/ }) as HTMLTextAreaElement;
const name = () => screen.getByRole("textbox", { name: /Nombre de este dispositivo/ }) as HTMLInputElement;
const submit = () => document.querySelector(".pairing-form button[type=submit]") as HTMLButtonElement;

test("it opens when the page asks, says why on top, and says where the code comes from", () => {
  const { store, element } = dialog(vi.fn());
  expect(element().open).toBe(false);
  act(() => { store.patch({ pairingOpen: true, pairingNote: "«mac» ya no reconoce este dispositivo." }); });
  expect(element().open).toBe(true);
  expect(screen.getByRole("heading", { name: "Emparejar este dispositivo" })).toBeInTheDocument();
  expect(screen.getByText("«mac» ya no reconoce este dispositivo.")).toBeInTheDocument();
  expect(element().textContent).toMatch(/Pide el código a tu agente \(«empareja un dispositivo»\) o ejecuta sidevoice pair-device en la máquina\./);
  expect(name().value).toMatch(/^Sidevoice/);   // prefilled, and the person's to change
  expect(submit().disabled).toBe(true);           // nothing to redeem yet
});

test("a code is redeemed under the name given, busy while it is, and the dialog closes on success", async () => {
  let finish!: (value: unknown) => void;
  const pairDevice = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const { store, element } = dialog(pairDevice);
  act(() => { store.patch({ pairingOpen: true }); });
  fireEvent.change(code(), { target: { value: "SV1.abc" } });
  fireEvent.change(name(), { target: { value: "Mi portátil" } });
  await act(async () => { fireEvent.submit(submit().form!); });
  expect(pairDevice).toHaveBeenCalledWith("SV1.abc", "Mi portátil");
  expect(submit().textContent).toBe("Emparejando…");
  expect(submit().disabled).toBe(true);
  expect(code().disabled).toBe(true);
  await act(async () => { store.patch({ pairingOpen: false }); finish({ host: "mac" }); });
  expect(element().open).toBe(false);
  // A closed dialog is out of the accessibility tree; the field is still there, emptied for the next time.
  expect((document.getElementById("device-pairing-code") as HTMLTextAreaElement).value).toBe("");
});

test("a code that does not work says why in an alert, and keeps what was pasted to try again", async () => {
  const pairDevice = vi.fn().mockRejectedValue(new Error("Este código ya caducó: duran 10 minutos. Pide uno nuevo."));
  const { store, element } = dialog(pairDevice);
  act(() => { store.patch({ pairingOpen: true }); });
  fireEvent.change(code(), { target: { value: "SV1.old" } });
  await act(async () => { fireEvent.submit(submit().form!); });
  expect(screen.getByRole("alert")).toHaveTextContent("Este código ya caducó: duran 10 minutos. Pide uno nuevo.");
  expect(code().value).toBe("SV1.old");
  expect(submit().disabled).toBe(false);
  expect(element().open).toBe(true);
});

test("closing it tells the page, which keeps working without a machine", async () => {
  const { store, closePairing } = dialog(vi.fn());
  act(() => { store.patch({ pairingOpen: true }); });
  await act(async () => { screen.getByRole("button", { name: "Cerrar emparejar este dispositivo" }).click(); });
  expect(closePairing).toHaveBeenCalled();
  expect(store.getState().pairing.open).toBe(false);
});
