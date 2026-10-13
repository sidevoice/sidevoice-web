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

afterEach(() => { localStorage.removeItem("sidevoice.deviceName"); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); });

/** A choice the preview's VARIANTS panel kept while `pair-address` was open; decided, nothing reads it any more. */
const storedPairAddress = (value: string) => localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "pair-address": value }));

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
// The address's link: "(optional)" while the code's addresses can reach the machine, without it once it is needed. The
// field it opens is "Machine address" either way: the link says whether it is optional.
const disclosure = () => screen.getByRole("button", { name: /^Enter the machine's address/ });
const toggleOptional = "Enter the machine's address (optional)", toggleNeeded = "Enter the machine's address";
const fieldName = "Machine address";

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
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc»: por ningún camino.", "unreachable"));
  dialog(pairDevice);
  const pasted = pairingCode();
  paste(pasted);
  submit().focus();
  await connect();
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach “nuc”. Check it's running and on your network, or enter its address.");
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).toBe(address());
  expect(disclosure()).toHaveAccessibleName(toggleNeeded);
  expect(address()).toHaveAccessibleName(fieldName);
  expect(address()).toBeRequired();
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
  expect(disclosure()).toHaveAccessibleName(toggleOptional);
  expect(address()).toHaveAccessibleName(fieldName);
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
  expect(screen.getByText("Connected to “nuc”.")).toHaveAttribute("role", "status");
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
  expect(screen.getByRole("alert")).toHaveTextContent("This page is secure (https) and the browser won't let it connect over http. Use the desktop app or an https address.");
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
  expect(screen.getByText("Connected to “nuc”.")).toHaveAttribute("role", "status");
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

// ----- the machine's address: a quiet link under the code, optional, with when it is worth entering beside it -----
const before = (first: Element, second: Element) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
const when = "Usually not needed: for an IP, a domain or a Tailscale address when the code's own doesn't reach the machine. It connects over https; http:// works only on a private network, and asks you first.";
const tipButton = () => screen.getByRole("button", { name: "When to enter an address" });
const tips = () => [...document.querySelectorAll("#device-pairing form .ui-infotip")];

test("in order: the code, the address's link and its one tip, its field, what came of connecting, how to get a code, and Connect", () => {
  dialog(vi.fn());
  const toggle = disclosure();
  fireEvent.click(toggle);
  const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  const status = document.querySelector("#device-pairing .pairing-status")!;
  const alertBox = document.querySelector("#device-pairing .pairing-alert")!;
  const how = screen.getByRole("button", { name: "How do I get a code?" });
  const sequence = [code(), toggle, tipButton(), body, address(), status, alertBox, how, document.getElementById(how.getAttribute("aria-controls")!)!, submit()];
  sequence.slice(1).forEach((element, at) => expect(before(sequence[at], element), `${at} before ${at + 1}`).toBe(true));
  // The link and its tip side by side, the field the link's to open.
  expect(toggle.parentElement).toHaveClass("pairing-address-head");
  expect(tipButton().parentElement).toBe(toggle.parentElement);
  expect(body).toContainElement(address());
});

test("the address is a quiet link with a chevron, folded: it opens its field, with the focus, and closes it again; optional while the code's addresses can reach the machine, and folded it is not used", async () => {
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  dialog(pairDevice);
  const toggle = disclosure();
  expect(toggle).toHaveAccessibleName(toggleOptional);
  // A link, not How's boxed toggle; its chevron turns with aria-expanded (pairing-css.test.cjs).
  expect(toggle).toHaveClass("pairing-address-link");
  expect(toggle).not.toHaveClass("pairing-how-toggle");
  expect(toggle.closest(".pairing-how")).toBeNull();
  expect(toggle.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(body).not.toBeVisible();
  noAddress();
  // A code whose addresses can reach its machine: still folded, still optional.
  const pasted = pairingCode();
  paste(pasted);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveAccessibleName(toggleOptional);
  noAddress();
  // Opened by the person: the field takes the focus. Its label stays for assistive tech, with no "(optional)": the link
  // says that; the placeholder shows what it takes; nothing under it.
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(body).toBeVisible();
  expect(document.activeElement).toBe(address());
  expect(address()).toHaveAccessibleName(fieldName);
  expect(address().closest(".pairing-address")!.querySelector(".ui-field-head label")).toHaveTextContent(fieldName);
  expect(address()).toHaveAttribute("placeholder", "http://192.168.1.20:8768 or https://…");
  expect(address()).not.toHaveAttribute("aria-describedby");
  expect(address()).not.toBeRequired();
  expect(toggle).toHaveAccessibleName(toggleOptional);
  fireEvent.change(address(), { target: { value: "192.168.1.20:8768" } });
  // Closed again by the person: folded, what was typed is kept and not used.
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(body).not.toBeVisible();
  noAddress();
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "");
  // Open, it is.
  paste(pasted);
  fireEvent.click(toggle);
  expect(address().value).toBe("192.168.1.20:8768");
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(pasted, expect.any(String), "192.168.1.20:8768");
});

test("one tip, beside the link, says when an address is worth entering; it opens nothing else, and is not repeated under the field, folded, open or needed", async () => {
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc».", "unreachable"));
  dialog(pairDevice);
  const tip = tipButton();
  expect(tip).toHaveClass("ui-infotip");
  expect(tips()).toEqual([tip]);
  await act(async () => { fireEvent.click(tip); });
  expect(screen.getByRole("tooltip")).toHaveTextContent(when);
  expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  noAddress();
  // Open: the field has no tip of its own, and no hint.
  fireEvent.click(disclosure());
  expect(tips()).toEqual([tip]);
  expect(address().closest(".pairing-address")!.querySelector(".ui-infotip")).toBeNull();
  expect(screen.queryByRole("button", { name: "About the address" })).toBeNull();
  expect(document.getElementById("device-pairing-address-hint")).toBeNull();
  // Needed, and said so under the field: that alone, and still the one tip.
  paste(pairingCode());
  await connect();
  expect(address()).toBeRequired();
  await connect();
  expect(address()).toHaveAccessibleDescription("The code's addresses didn't reach the machine. Enter its address.");
  expect(tips()).toEqual([tip]);
});

test("the field's only hint is what a code that says nowhere needs; a code that lists its machine over plain http, filled in, needs none", () => {
  dialog(vi.fn());
  paste(pairingCode({ urls: ["http://127.0.0.1:8768"] }));
  expect(address()).toHaveAccessibleDescription("This code doesn't say where the machine is. Enter its address.");
  const hint = document.getElementById("device-pairing-address-hint")!;
  expect(hint).toHaveClass("ui-field-hint");
  expect(before(address(), hint)).toBe(true);
  paste(pairingCode({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8768"] }));
  expect(address().value).toBe("192.168.1.20:8768");
  expect(document.getElementById("device-pairing-address-hint")).toBeNull();
  expect(screen.queryByText(when)).toBeNull();
});

test("in Spanish: the link, optional or needed, its tip, and the field's label and placeholder", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  dialog(vi.fn());
  const toggle = screen.getByRole("button", { name: "Escribir la dirección de la máquina (opcional)" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cuándo escribir una dirección" })); });
  expect(screen.getByRole("tooltip")).toHaveTextContent("Normalmente no hace falta: para una IP, un dominio o una dirección de Tailscale cuando la del código no llega a la máquina. Conecta por https; http:// solo funciona en una red privada, y te lo pregunta antes.");
  fireEvent.click(toggle);
  const field = screen.getByRole("textbox", { name: "Dirección de la máquina" });
  expect(field).not.toBeRequired();
  expect(field).toHaveAttribute("placeholder", "http://192.168.1.20:8768 o https://…");
  fireEvent.change(document.getElementById("device-pairing-code")!, { target: { value: pairingCode({ urls: ["http://127.0.0.1:8768"] }) } });
  expect(screen.getByRole("button", { name: "Escribir la dirección de la máquina" })).toHaveAttribute("aria-expanded", "true");
  expect(field).toBeRequired();
});

test("it opens by itself, needed, the link without \"(optional)\", where the code carries no usable address and where its addresses did not reach the machine", async () => {
  const pairDevice = vi.fn().mockRejectedValue(pairingError("No se pudo llegar a «nuc».", "unreachable"));
  dialog(pairDevice);
  // No usable address: only the machine's own loopback.
  paste(pairingCode({ urls: ["http://127.0.0.1:8768"] }));
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(disclosure()).toHaveAccessibleName(toggleNeeded);
  expect(address()).toHaveAccessibleName(fieldName);
  expect(address()).toBeRequired();
  cleanup();
  // Addresses that did not reach the machine: opened, needed, and the focus taken there.
  dialog(pairDevice);
  paste(pairingCode());
  expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  noAddress();
  await connect();
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(disclosure()).toHaveAccessibleName(toggleNeeded);
  expect(address()).toHaveAccessibleName(fieldName);
  expect(address()).toBeRequired();
  expect(document.activeElement).toBe(address());
  // Needed: the person can still fold it, and Connect opens it again, saying so.
  fireEvent.click(disclosure());
  noAddress();
  await connect();
  expect(pairDevice).toHaveBeenCalledTimes(1);
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(address()).toHaveAccessibleDescription("The code's addresses didn't reach the machine. Enter its address.");
  cleanup();
  // A machine that says the code does not say where it is: said under the address, opened to say it.
  dialog(vi.fn().mockRejectedValue(pairingError("El código no dice dónde encontrar la máquina.", "code-no-address")));
  paste(pairingCode());
  noAddress();
  await connect();
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(address()).toHaveAccessibleDescription("This code doesn't say where the machine is. Enter its address.");
  expect(document.activeElement).toBe(address());
});

test("otherwise it is optional: with no code, with an unrecognised one, with one whose addresses can reach the machine, and with another code after one whose did not", async () => {
  const pairDevice = vi.fn().mockRejectedValueOnce(pairingError("No se pudo llegar a «nuc».", "unreachable")).mockResolvedValue({ host: "other" });
  dialog(pairDevice);
  expect(disclosure()).toHaveAccessibleName(toggleOptional);
  paste("123-456");
  expect(disclosure()).toHaveAccessibleName(toggleOptional);
  expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  paste(pairingCode());
  expect(disclosure()).toHaveAccessibleName(toggleOptional);
  fireEvent.click(disclosure());
  expect(address()).not.toBeRequired();
  // Left empty, Connect tries the code's own addresses; they do not reach it, and it is needed for that code.
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "");
  expect(disclosure()).toHaveAccessibleName(toggleNeeded);
  expect(address()).toBeRequired();
  // Another code: optional again, and still open.
  const other = pairingCode({ host: "other" });
  paste(other);
  expect(disclosure()).toHaveAccessibleName(toggleOptional);
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(address()).toHaveAccessibleName(fieldName);
  expect(address()).not.toBeRequired();
  await connect();
  expect(pairDevice).toHaveBeenLastCalledWith(other, expect.any(String), "");
});

test("a stale stored `pair-address` choice changes nothing: the link, folded, whatever the preview's panel kept or writes", () => {
  const unchanged = () => {
    expect(disclosure()).toHaveAccessibleName(toggleOptional);
    expect(disclosure()).toHaveClass("pairing-address-link");
    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".pairing-address-toggle")).toBeNull();
    noAddress();
  };
  for (const stale of ["link", "always", "disclosure", "something else"]) {
    storedPairAddress(stale);
    dialog(vi.fn());
    unchanged();
    cleanup();
  }
  dialog(vi.fn());
  for (const stale of ["always", "disclosure"]) {
    act(() => { storedPairAddress(stale); window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY })); });
    unchanged();
  }
});
