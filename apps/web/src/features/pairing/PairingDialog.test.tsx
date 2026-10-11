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
const code = () => screen.getByRole("textbox", { name: "Pairing code" }) as HTMLTextAreaElement;
const submit = () => document.querySelector(".pairing-form button[type=submit]") as HTMLButtonElement;
const address = () => screen.getByRole("textbox", { name: /^Machine address/ }) as HTMLInputElement;

test("it opens when asked with remote setup guidance before the code, and no device name field", () => {
  const { store, element } = dialog(vi.fn());
  expect(element().open).toBe(false);
  act(() => { store.patch({ pairingOpen: true, pairingNote: "«mac» ya no reconoce este dispositivo." }); });
  expect(element().open).toBe(true);
  expect(screen.getByRole("heading", { name: "Connect to a machine" })).toBeInTheDocument();
  expect(screen.getByText("«mac» ya no reconoce este dispositivo.")).toBeInTheDocument();
  expect([...element().querySelectorAll(".setup-command code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install", "npx sidevoice@latest pair-device"]);
  expect(screen.queryByRole("textbox", { name: /device name/i })).toBeNull();
  expect(submit().disabled).toBe(true);           // nothing to redeem yet
});

test("a code is redeemed without asking for a device name, and the dialog closes on success", async () => {
  window.localStorage.setItem("sidevoice.deviceName", "Kitchen iPad");
  let finish!: (value: unknown) => void;
  const pairDevice = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const { store, element } = dialog(pairDevice);
  act(() => { store.patch({ pairingOpen: true }); });
  fireEvent.change(address(), { target: { value: "192.168.1.20:8765" } });
  fireEvent.change(code(), { target: { value: "SV1.abc" } });
  await act(async () => { fireEvent.submit(submit().form!); });
  expect(pairDevice).toHaveBeenCalledWith("SV1.abc", "Kitchen iPad", "192.168.1.20:8765");
  expect(submit().textContent).toBe("Connecting…");
  expect(submit().disabled).toBe(true);
  expect(code().disabled).toBe(true);
  await act(async () => { store.patch({ pairingOpen: false }); finish({ host: "mac" }); });
  expect(element().open).toBe(false);
  // A closed dialog is out of the accessibility tree; the field is still there, emptied for the next time.
  expect((document.getElementById("device-pairing-code") as HTMLTextAreaElement).value).toBe("");
  window.localStorage.removeItem("sidevoice.deviceName");
});

test("the default pairing name follows the English UI language", async () => {
  const previousName = navigator.userAgent;
  const previousHost = window.__sidevoiceDesktop;
  window.localStorage.removeItem("sidevoice.deviceName");
  delete window.__sidevoiceDesktop;
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
  try {
    const pairDevice = vi.fn().mockResolvedValue({ host: "Mac" });
    const { store } = dialog(pairDevice);
    act(() => { store.patch({ pairingOpen: true }); });
    fireEvent.change(address(), { target: { value: "mac.example" } });
    fireEvent.change(code(), { target: { value: "SV1.abc" } });
    await act(async () => { fireEvent.submit(submit().form!); });
    expect(pairDevice).toHaveBeenCalledWith("SV1.abc", "Sidevoice on iPhone", "mac.example");
  } finally {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: previousName });
    if (previousHost) window.__sidevoiceDesktop = previousHost;
    else delete window.__sidevoiceDesktop;
  }
});

test("a code that does not work says why in an alert, and keeps what was pasted to try again", async () => {
  const pairDevice = vi.fn().mockRejectedValue(new Error("Este código ya caducó: duran 10 minutos. Pide uno nuevo."));
  const { store, element } = dialog(pairDevice);
  act(() => { store.patch({ pairingOpen: true }); });
  fireEvent.change(address(), { target: { value: "192.168.1.20:8765" } });
  fireEvent.change(code(), { target: { value: "SV1.old" } });
  await act(async () => { fireEvent.submit(submit().form!); });
  expect(screen.getByRole("alert")).toHaveTextContent("This code has expired or was already used. Ask the machine for a new code.");
  expect(code().value).toBe("SV1.old");
  expect(address().value).toBe("192.168.1.20:8765");
  expect(submit().disabled).toBe(false);
  expect(element().open).toBe(true);
});

test("closing it tells the page, which keeps working without a machine", async () => {
  const { store, closePairing } = dialog(vi.fn());
  act(() => { store.patch({ pairingOpen: true }); });
  await act(async () => { screen.getByRole("button", { name: "Close pairing" }).click(); });
  expect(closePairing).toHaveBeenCalled();
  expect(store.getState().pairing.open).toBe(false);
});

test("another machine is asked for by its address: the code fills it in when it carries one, and a plain http one is refused", async () => {
  const payload = { v: 1, fp: "A".repeat(43), host: "nuc", urls: ["http://127.0.0.1:8765", "https://nuc.example:8765"], rv: null, secret: "s3cret", exp: 4_000_000_000 };
  const pasted = "SV1." + Buffer.from(JSON.stringify(payload)).toString("base64url");
  const pairDevice = vi.fn().mockRejectedValue(new Error("address-insecure"));
  const { store } = dialog(pairDevice);
  act(() => { store.patch({ pairingOpen: true }); });
  expect(submit().disabled).toBe(true);
  fireEvent.change(code(), { target: { value: pasted } });
  expect(address().value).toBe("https://nuc.example:8765");
  fireEvent.change(address(), { target: { value: "http://192.168.1.20:8765" } });
  await act(async () => { fireEvent.submit(submit().form!); });
  expect(screen.getByRole("alert")).toHaveTextContent("Pairing only travels over HTTPS to another machine.");
});
