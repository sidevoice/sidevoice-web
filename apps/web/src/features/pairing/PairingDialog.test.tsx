import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { PairingDialog } from "./PairingDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { PAIRING_HTTP_BLOCKED, PAIRING_HTTP_ONLY, PAIRING_HTTP_PRIVATE, pairingError } from "../../services/device-pairing.js";
import { VARIANTS_KEY } from "../../lib/variants";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* "Connect to your machine" in the pairing dialog (Settings › Machines › Add a machine): the code first, the machine's
 * address only when it is needed, what came of connecting where it can be acted on. */

afterEach(() => { localStorage.removeItem("sidevoice.deviceName"); localStorage.removeItem(VARIANTS_KEY); });

/** Where the address is asked for (VARIANTS `pair-address`): A's disclosure by default, B's link, C's field always there. */
const pairAddress = (place: "disclosure" | "link" | "always") => localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "pair-address": place }));

function dialog(pairDevice: (...args: unknown[]) => Promise<unknown> = vi.fn()) {
  const store = createRoomStore();
  const closePairing = vi.fn(() => store.patch({ pairingOpen: false, pairingNote: "" }));
  window.sidevoiceActions = { pairDevice, closePairing } as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><PairingDialog /></RoomProvider>);
  act(() => { store.patch({ pairingOpen: true }); });
  return { store, closePairing, element: () => document.getElementById("device-pairing") as HTMLDialogElement };
}
/** A code as `sidevoice pair-device` prints it, for "nuc", valid for ten minutes from now. */
function pairingCode(extra: Record<string, unknown> = {}) {
  const payload = { v: 1, fp: "A".repeat(43), host: "nuc", urls: ["http://127.0.0.1:8768", "https://nuc.example:8768"], rv: null, secret: "s3cret",
    exp: Math.floor(Date.now() / 1000) + 600, ...extra };
  return "SV1." + Buffer.from(JSON.stringify(payload)).toString("base64url");
}
const code = () => screen.getByRole("textbox", { name: "Pairing code" }) as HTMLTextAreaElement;
const paste = (text: string) => fireEvent.change(code(), { target: { value: text } });
// Connect sits in the dialog's footer, submitting the form through its `form` attribute.
const submit = () => document.querySelector("#device-pairing button[type=submit][form]") as HTMLButtonElement;
const connect = () => act(async () => { fireEvent.submit(submit().form!); });
const address = () => screen.getByRole("textbox", { name: /^Machine address/ }) as HTMLInputElement;
const noAddress = () => expect(screen.queryByRole("textbox", { name: /^Machine address/ })).toBeNull();
const disclosure = () => screen.getByRole("button", { name: "Specify the machine's address" });
const optional = "Machine address (optional)", needed = "Machine address";

test("it opens on the code, how to get one folded away, with no device name field and Connect ready", () => {
  const { element } = dialog(vi.fn());
  expect(element().open).toBe(true);
  expect(screen.getByRole("heading", { name: "Connect to a machine" })).toBeInTheDocument();
  expect(screen.getByText("Paste the one-time code from the machine where your agents run.")).toBeInTheDocument();
  expect(document.activeElement).toBe(code());
  const how = screen.getByRole("button", { name: "How do I get a code?" });
  expect(how).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById(how.getAttribute("aria-controls")!)).not.toBeVisible();
  fireEvent.click(how);
  expect(how).toHaveAttribute("aria-expanded", "true");
  expect([...element().querySelectorAll(".ui-snippet code")].map((command) => command.textContent)).toEqual(["npx sidevoice@latest install", "npx sidevoice@latest pair-device"]);
  expect(screen.getByText("Then run this. It prints a code starting with SV1.")).toBeVisible();
  // The address waits until a code says it is needed; the device's name is General's.
  noAddress();
  expect(screen.queryByRole("textbox", { name: /device name/i })).toBeNull();
  expect(submit().disabled).toBe(false);
});

test("it says what it was opened for, above the code", () => {
  const { store } = dialog(vi.fn());
  act(() => { store.patch({ pairingNote: "«mac» ya no reconoce este dispositivo." }); });
  expect(screen.getByText("«mac» ya no reconoce este dispositivo.")).toBeInTheDocument();
});

test("a code is recognised as it is pasted, and redeemed under this device's name; the dialog closes on success", async () => {
  window.localStorage.setItem("sidevoice.deviceName", "Kitchen iPad");
  let finish!: (value: unknown) => void;
  const pairDevice = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const { store, element } = dialog(pairDevice);
  const pasted = pairingCode();
  paste(pasted);
  expect(code()).toHaveAccessibleDescription("Code for “nuc” · expires in 10 min");
  // The code says where the machine is: no address to give, unless the person wants another.
  noAddress();
  expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  submit().focus();
  await connect();
  expect(pairDevice).toHaveBeenCalledWith(pasted, "Kitchen iPad", "");
  expect(submit().form).toHaveAttribute("aria-busy", "true");
  expect(submit()).toHaveAttribute("aria-busy", "true");
  expect(document.activeElement).toBe(submit());
  expect(code().readOnly).toBe(true);
  expect(screen.getByText("Connecting to “nuc”…")).toHaveAttribute("role", "status");
  await act(async () => { store.patch({ pairingOpen: false }); finish({ host: "nuc" }); });
  expect(element().open).toBe(false);
  // A closed dialog is out of the accessibility tree; the field is still there, emptied for the next time.
  expect((document.getElementById("device-pairing-code") as HTMLTextAreaElement).value).toBe("");
});

test("the default pairing name follows the English UI language", async () => {
  const previousName = navigator.userAgent;
  const previousHost = window.__sidevoiceDesktop;
  delete window.__sidevoiceDesktop;
  Object.defineProperty(navigator, "userAgent", { configurable: true,
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  try {
    const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
    dialog(pairDevice);
    const pasted = pairingCode();
    paste(pasted);
    await connect();
    expect(pairDevice).toHaveBeenCalledWith(pasted, "Safari on iPhone", "");
  } finally {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: previousName });
    if (previousHost) window.__sidevoiceDesktop = previousHost;
    else delete window.__sidevoiceDesktop;
  }
});

test("Connect is always there: an empty or unusable code is said under the field, which takes the focus; Enter connects", async () => {
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  submit().focus();
  await connect();
  expect(code()).toHaveAccessibleDescription("Paste the pairing code from the machine.");
  expect(code()).toHaveAttribute("aria-invalid", "true");
  expect(document.activeElement).toBe(code());
  paste("123-456");
  expect(code()).not.toHaveAttribute("aria-invalid");
  await act(async () => { fireEvent.keyDown(code(), { key: "Enter" }); });
  expect(code()).toHaveAccessibleDescription("That's not a Sidevoice code. Codes start with SV1.");
  expect(pairDevice).not.toHaveBeenCalled();
  // A new line is still Shift+Enter's; Enter alone connects.
  const pasted = pairingCode();
  paste(pasted);
  await act(async () => { fireEvent.keyDown(code(), { key: "Enter", shiftKey: true }); });
  expect(pairDevice).not.toHaveBeenCalled();
  await act(async () => { fireEvent.keyDown(code(), { key: "Enter" }); });
  expect(pairDevice).toHaveBeenCalledWith(pasted, expect.any(String), "");
  expect(screen.getByText("Connected to “nuc”.")).toHaveAttribute("role", "status");
});

test("a spent code says so, with the command that prints another; what was pasted is kept", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    const { element } = dialog(vi.fn().mockRejectedValue(pairingError("Unknown, used or expired pairing code.", "code-spent")));
    const pasted = pairingCode();
    paste(pasted);
    await connect();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This code expired or was already used. Run pair-device again.");
    await act(async () => { within(alert).getByRole("button", { name: "Copy command" }).click(); });
    expect(writeText).toHaveBeenCalledWith("npx sidevoice@latest pair-device");
    expect(code().value).toBe(pasted);
    expect(submit().disabled).toBe(false);
    expect(element().open).toBe(true);
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

test("a machine that refuses the pairing says so in words, its own sentence only behind Details; any other failure is the generic line", async () => {
  const refused = "The pairing secret is invalid.";
  const pairDevice = vi.fn().mockRejectedValue(pairingError(refused, "pair-refused"));
  dialog(pairDevice);
  paste(pairingCode());
  await connect();
  const alert = screen.getByRole("alert");
  expect(alert.querySelector(".ui-alert-title")).toHaveTextContent("The machine did not accept the pairing. Try again.");
  expect(alert.querySelector(".ui-alert-title")).not.toHaveTextContent(refused);
  expect(alert.querySelector("details:not([open]) > pre")).toHaveTextContent(refused);
  pairDevice.mockRejectedValue(new TypeError("format model is not a function"));
  await connect();
  expect(screen.getByRole("alert").querySelector(".ui-alert-title")).toHaveTextContent("Something went wrong with the pairing.");
  expect(screen.getByRole("alert").querySelector("details > pre")).toHaveTextContent("TypeError format model is not a function");
});

test("a machine its code's addresses don't reach is asked for by its address, which opens, takes the focus and is needed for that code", async () => {
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc»: ni directamente ni a través de la sala.", "unreachable"));
  dialog(pairDevice);
  const pasted = pairingCode();
  paste(pasted);
  submit().focus();
  await connect();
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach “nuc”. Check it's running and on your network, or enter its address.");
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).toBe(address());
  expect(address()).toHaveAccessibleName(needed);
  expect(address()).toBeRequired();
  expect(screen.getByRole("button", { name: "About the address" })).toBeInTheDocument();
  // Needed: Connect without one says so under it, and asks nothing.
  await connect();
  expect(pairDevice).toHaveBeenCalledTimes(1);
  expect(address()).toHaveAccessibleDescription("The code's addresses didn't reach the machine. Enter its address.");
  // Typed as host:port; an https:// pasted with it goes.
  fireEvent.change(address(), { target: { value: "https://192.168.1.20:8768" } });
  expect(address().value).toBe("192.168.1.20:8768");
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768");
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach 192.168.1.20:8768 over https. Check the address and port.");
  // Another code: its own addresses are tried again, the address optional (and still there).
  paste(pairingCode({ host: "other" }));
  expect(address()).toHaveAccessibleName(optional);
  expect(address()).not.toBeRequired();
});

test("a code that doesn't say where its machine is needs its address; one it lists over plain http on a private network is filled in", async () => {
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  paste(pairingCode({ urls: ["http://127.0.0.1:8768"] }));
  expect(address()).toHaveAccessibleName("Machine address");
  expect(address()).toBeRequired();
  expect(address()).toHaveAccessibleDescription("This code doesn't say where the machine is. Enter its address.");
  await connect();
  expect(pairDevice).not.toHaveBeenCalled();
  expect(address()).toHaveAttribute("aria-invalid", "true");
  expect(document.activeElement).toBe(address());
  // Listed over plain http on a private network: the address starts there, for https first and then the person's say.
  paste(pairingCode({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8768"] }));
  expect(address().value).toBe("192.168.1.20:8768");
  expect(address()).not.toHaveAccessibleDescription(/doesn't say/);
  // Folded away, it is still needed: Connect opens it again, saying so.
  fireEvent.click(disclosure());
  noAddress();
  fireEvent.change(document.getElementById("device-pairing-address")!, { target: { value: "" } });
  await connect();
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(address()).toHaveAccessibleDescription("This code doesn't say where the machine is. Enter its address.");
  expect(document.activeElement).toBe(address());
  expect(pairDevice).not.toHaveBeenCalled();
});

test("an http:// address on a private network goes straight to agreeing to no encryption; at a public address or a name, it is refused under the field", async () => {
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  const pasted = pairingCode();
  paste(pasted);
  fireEvent.click(disclosure());
  // https://, or no scheme, is https as always: the https:// goes.
  fireEvent.change(address(), { target: { value: "https://192.168.1.20:8768" } });
  expect(address().value).toBe("192.168.1.20:8768");
  // http:// to a public address or a name: said under the address, and nothing is sent.
  for (const typed of ["http://203.0.113.5:8768", "http://mac.example:8768"]) {
    fireEvent.change(address(), { target: { value: typed } });
    expect(address().value).toBe(typed);
    await connect();
    expect(address()).toHaveAccessibleDescription("Unencrypted http:// is only for addresses on a private network. Write this one without http:// to pair over HTTPS.");
    expect(document.activeElement).toBe(address());
  }
  expect(pairDevice).not.toHaveBeenCalled();
  // http:// to a private-network address: no https attempt, what that exposes and its own button at once.
  fireEvent.change(address(), { target: { value: "http://192.168.1.20:8768" } });
  await connect();
  expect(pairDevice).not.toHaveBeenCalled();
  expect(address()).not.toHaveAttribute("aria-invalid");
  const warning = document.querySelector<HTMLElement>(".pairing-consent")!;
  expect(warning).toHaveTextContent("This machine only answers without encryption. Anyone on this network could read the pairing code and this device's access token.");
  expect(document.activeElement).toBe(within(warning).getByText(/^This machine only answers without encryption/));
  await act(async () => { within(warning).getByRole("button", { name: "Connect without encryption" }).click(); });
  expect(pairDevice).toHaveBeenCalledTimes(1);
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "http://192.168.1.20:8768", { insecure: true });
  expect(screen.getByText("Connected to “nuc” without encryption.")).toHaveAttribute("role", "status");
});

test("a machine that answers only without encryption: refused at a public address, out of a secure page's reach", async () => {
  const pairDevice = vi.fn().mockRejectedValue(pairingError(PAIRING_HTTP_ONLY));
  dialog(pairDevice);
  paste(pairingCode());
  fireEvent.click(disclosure());
  fireEvent.change(address(), { target: { value: "203.0.113.5:8768" } });
  await connect();
  expect(screen.getByRole("alert")).toHaveTextContent("“nuc” only answers without encryption, at a public address. Put an HTTPS proxy or tunnel in front of that machine, then get a new code.");
  expect(screen.getByRole("alert")).toHaveAttribute("data-tone", "danger");
  pairDevice.mockRejectedValue(pairingError(PAIRING_HTTP_BLOCKED));
  await connect();
  expect(screen.getByRole("alert")).toHaveTextContent("This machine only answers without encryption, which a secure page can't reach. Pair from the Sidevoice desktop app, or put an HTTPS proxy or tunnel in front of that machine.");
  expect(screen.getByRole("alert")).toHaveAttribute("data-tone", "warning");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

test("a machine on a private network that answers only without encryption is reached so once the person agrees", async () => {
  let finish!: (value: unknown) => void;
  const pairDevice = vi.fn().mockRejectedValueOnce(pairingError(PAIRING_HTTP_PRIVATE)).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  dialog(pairDevice);
  const pasted = pairingCode({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8768"] });
  paste(pasted);
  submit().focus();
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768");
  const warning = document.querySelector<HTMLElement>(".pairing-consent")!;
  expect(warning).toHaveAttribute("data-tone", "warning");
  expect(warning).toHaveTextContent("This machine only answers without encryption. Anyone on this network could read the pairing code and this device's access token.");
  // The focus is brought to what it means, not to the button; the next Tab reaches it.
  expect(document.activeElement).toBe(within(warning).getByText(/^This machine only answers without encryption/));
  expect(document.activeElement).toHaveAttribute("tabindex", "-1");
  const agree = within(warning).getByRole("button", { name: "Connect without encryption" });
  await act(async () => { agree.click(); });
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768", { insecure: true });
  // Only this button is busy, saying so; Connect waits, the fields are read-only, and the warning stays.
  expect(agree).toHaveAttribute("aria-busy", "true");
  expect(agree).toHaveTextContent("Connecting without encryption…");
  expect(submit().disabled).toBe(true);
  expect(submit()).not.toHaveAttribute("aria-busy");
  expect(submit().form).toHaveAttribute("aria-busy", "true");
  expect(code().readOnly).toBe(true);
  expect(address().readOnly).toBe(true);
  expect(warning).toBeInTheDocument();
  await act(async () => { finish({ host: "nuc" }); });
  expect(screen.getByText("Connected to “nuc” without encryption.")).toHaveAttribute("role", "status");
  expect(document.querySelector(".pairing-consent")).toBeNull();
});

test("agreeing holds for that code and address only, Connect and Enter never go without encryption, and a failure replaces the warning", async () => {
  const pairDevice = vi.fn().mockRejectedValue(pairingError(PAIRING_HTTP_PRIVATE));
  dialog(pairDevice);
  paste(pairingCode({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8768"] }));
  await connect();
  expect(document.querySelector(".pairing-consent")).not.toBeNull();
  // Connect, or Enter, again: https again.
  await connect();
  await act(async () => { fireEvent.keyDown(code(), { key: "Enter" }); });
  expect(pairDevice).toHaveBeenCalledTimes(3);
  expect(pairDevice.mock.calls.every((call) => call.length === 3)).toBe(true);
  // Another address, or another code, and the warning is gone.
  fireEvent.change(address(), { target: { value: "192.168.1.21:8768" } });
  expect(document.querySelector(".pairing-consent")).toBeNull();
  await connect();
  paste(pairingCode({ urls: ["http://192.168.1.20:8768"], host: "other" }));
  expect(document.querySelector(".pairing-consent")).toBeNull();
  // Agreed to, and failing: what failed replaces the warning, and the focus goes back to Connect.
  await connect();
  pairDevice.mockRejectedValueOnce(pairingError("No se pudo llegar a «other» para emparejar. Vuelve a intentarlo.", "unreachable"));
  await act(async () => { screen.getByRole("button", { name: "Connect without encryption" }).click(); });
  expect(pairDevice).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "192.168.1.21:8768", { insecure: true });
  expect(document.querySelector(".pairing-consent")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach “other”. Check it's running and on your network, or enter its address.");
  expect(document.activeElement).toBe(submit());
});

// ----- where the address is asked for (VARIANTS `pair-address`) -----
test("pair-address A, the default: a disclosure like How's, folded; open, its field is optional, and folded again it is not used", async () => {
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  const toggle = disclosure();
  // How's toggle, chevron and all, after How.
  expect(toggle).toHaveClass("pairing-how-toggle");
  expect(toggle.parentElement).toHaveClass("pairing-how");
  expect(toggle.querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "How do I get a code?" }).compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Enter the machine's address" })).toBeNull();
  noAddress();
  const pasted = pairingCode();
  paste(pasted);
  noAddress();
  // Opened by the person: the focus stays on the toggle, as How's does.
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).not.toBe(address());
  expect(address()).toHaveAccessibleName(optional);
  expect(address()).not.toBeRequired();
  fireEvent.change(address(), { target: { value: "192.168.1.20:8768" } });
  fireEvent.click(toggle);
  noAddress();
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "");
  paste(pasted);
  fireEvent.click(toggle);
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768");
});

test("pair-address B: a quiet link under the code brings the field in, in its place, with the focus", async () => {
  pairAddress("link");
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  expect(screen.queryByRole("button", { name: "Specify the machine's address" })).toBeNull();
  const link = screen.getByRole("button", { name: "Enter the machine's address" });
  expect(link).toHaveClass("pairing-address-link");
  expect(link).not.toHaveAttribute("aria-expanded");
  // Under the code, before how to get one.
  expect(code().compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(link.compareDocumentPosition(screen.getByRole("button", { name: "How do I get a code?" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  noAddress();
  const pasted = pairingCode();
  paste(pasted);
  noAddress();
  fireEvent.click(link);
  expect(link).not.toBeInTheDocument();
  expect(document.activeElement).toBe(address());
  expect(address()).toHaveAccessibleName(optional);
  expect(address()).not.toBeRequired();
  fireEvent.change(address(), { target: { value: "192.168.1.20:8768" } });
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768");
});

test("pair-address B brings the field in by itself, needed, where A opens: a code that says nowhere, one whose addresses did not reach the machine, and what is said about the address", async () => {
  pairAddress("link");
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc».", "unreachable"));
  dialog(pairDevice);
  paste(pairingCode({ urls: ["http://127.0.0.1:8768"] }));
  expect(screen.queryByRole("button", { name: "Enter the machine's address" })).toBeNull();
  expect(address()).toHaveAccessibleName(needed);
  expect(address()).toBeRequired();
  cleanup();
  dialog(pairDevice);
  paste(pairingCode());
  noAddress();
  await connect();
  expect(address()).toHaveAccessibleName(needed);
  expect(address()).toBeRequired();
  expect(document.activeElement).toBe(address());
  cleanup();
  // A machine that says the code does not say where it is: said under the address, brought in to say it.
  dialog(vi.fn().mockRejectedValue(pairingError("El código no dice dónde encontrar la máquina.", "code-no-address")));
  paste(pairingCode());
  noAddress();
  await connect();
  expect(address()).toHaveAccessibleDescription("This code doesn't say where the machine is. Enter its address.");
  expect(document.activeElement).toBe(address());
});

test("pair-address C: the field always there, optional unless the code says nowhere — also once its addresses did not reach the machine", async () => {
  pairAddress("always");
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc».", "unreachable"));
  dialog(pairDevice);
  expect(address()).toHaveAccessibleName(optional);
  expect(screen.queryByRole("button", { name: "Specify the machine's address" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Enter the machine's address" })).toBeNull();
  paste(pairingCode());
  await connect();
  expect(document.activeElement).toBe(address());
  expect(address()).toHaveAccessibleName(optional);
  expect(address()).not.toBeRequired();
  // Connect again tries the code's own addresses.
  await connect();
  expect(pairDevice).toHaveBeenCalledTimes(2);
  expect(pairDevice).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "");
  paste(pairingCode({ urls: ["http://127.0.0.1:8768"] }));
  expect(address()).toHaveAccessibleName(needed);
  expect(address()).toBeRequired();
});

test("the variant follows the preview's panel live", () => {
  dialog(vi.fn());
  expect(disclosure()).toBeInTheDocument();
  act(() => { pairAddress("always"); window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY })); });
  expect(address()).toHaveAccessibleName(optional);
  expect(screen.queryByRole("button", { name: "Specify the machine's address" })).toBeNull();
});
