import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeveloperOptions } from "./DeveloperOptions";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { DebugSwitch } from "../../host";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* Developer options' debugging switches (`host.debug`, sidevoice-desktop #168): Web Inspector, Compositing borders and
 * Repaint counters, each only where the app says its platform has it. Each moves at once, calls `set`, reads what took
 * once it resolves, and goes back with a line saying so if the app refuses. */

const ALL: DebugSwitch[] = ["inspectable", "compositingBorders", "repaintCounters"];

/** The app's `host.debug`: live getters over what each switch holds, `set` taking it unless told otherwise. */
function withDebug({ available = ALL, initial = {}, set }: { available?: DebugSwitch[]; initial?: Partial<Record<DebugSwitch, boolean>>;
  set?: (name: DebugSwitch, on: boolean, held: Record<DebugSwitch, boolean>) => Promise<void> } = {}) {
  const held: Record<DebugSwitch, boolean> = { inspectable: false, compositingBorders: false, repaintCounters: false, ...initial };
  const debug = {
    available,
    get inspectable() { return held.inspectable; },
    get compositingBorders() { return held.compositingBorders; },
    get repaintCounters() { return held.repaintCounters; },
    set: vi.fn(async (name: DebugSwitch, on: boolean) => { if (set) await set(name, on, held); else held[name] = on; }),
  };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "nightly", version: "0.2.1-nightly.608" }, debug } } });
  return { debug, held };
}

function mount() {
  return render(<RoomProvider store={createRoomStore()}><DeveloperOptions /></RoomProvider>);
}
/** The switch of a row, by what it says. */
const toggle = (name: string) => screen.getByRole("switch", { name });
const rows = () => [...document.querySelectorAll(".ui-row-label")].map((label) => label.textContent);
const groups = () => [...document.querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const deferred = () => {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

test("in a Rendering group, the three switches in their order, each with its line, the Web Inspector with its how-to", () => {
  withDebug();
  mount();
  expect(groups()).toEqual(["Rendering"]);
  expect(rows().slice(0, 3)).toEqual(["Web Inspector", "Compositing borders", "Repaint counters"]);
  const inspector = toggle("Web Inspector").closest(".ui-row")!;
  expect([...inspector.querySelectorAll(".developer-howto")].map((line) => line.textContent)).toEqual([
    "Safari → Settings → Advanced → “Show features for web developers”, then Develop → this Mac → Sidevoice → the room or the card.",
    "In the inspector, Layers → compositing borders / paint flashing shows the CPU repaints.",
  ]);
  expect(toggle("Compositing borders").closest(".ui-row")!.querySelector(".ui-row-description")).toHaveTextContent("Outlines each layer the GPU composites.");
  expect(toggle("Repaint counters").closest(".ui-row")!.querySelector(".ui-row-description")).toHaveTextContent("Counts on each layer how often the CPU repainted it.");
});

test("each starts as the app's getter says", () => {
  withDebug({ initial: { compositingBorders: true } });
  mount();
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "false");
  expect(toggle("Compositing borders")).toHaveAttribute("aria-checked", "true");
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "false");
});

test("a switch shows again as the app holds it after being away, not as it was first read", () => {
  const { held } = withDebug();
  const first = mount();
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "false");
  held.repaintCounters = true;
  first.unmount();
  mount();
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "true");
});

test("only the switches the platform has are shown; none, no group at all", () => {
  withDebug({ available: ["compositingBorders"] });
  const first = mount();
  expect(rows().slice(0, 1)).toEqual(["Compositing borders"]);
  expect(screen.queryByRole("switch", { name: "Web Inspector" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Repaint counters" })).toBeNull();
  first.unmount();
  withDebug({ available: [] });
  mount();
  expect(screen.queryAllByRole("switch")).toEqual([]);
  expect(groups()).not.toContain("Rendering");
});

test("a name the page does not know is not drawn", () => {
  withDebug({ available: ["inspectable", "heapSnapshots" as DebugSwitch] });
  mount();
  expect(screen.getAllByRole("switch").map((item) => item.getAttribute("aria-label"))).toEqual(["Web Inspector"]);
});

test.each([
  ["no debugging seam (a browser, a release app)", undefined],
  ["no list of switches", { inspectable: true, set: async () => {} }],
  ["no way to set them", { available: ALL }],
])("with %s there is no Rendering group", (_, debug) => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { debug } } });
  mount();
  expect(screen.queryAllByRole("switch")).toEqual([]);
  expect(groups()).not.toContain("Rendering");
  expect(screen.getByText("Developer options")).toBeInTheDocument();
});

test.each([
  ["Web Inspector", "inspectable"],
  ["Compositing borders", "compositingBorders"],
  ["Repaint counters", "repaintCounters"],
] as const)("%s turns on and off through set(%s), and says what the app took", async (label, name) => {
  const { debug, held } = withDebug();
  mount();
  await act(async () => { fireEvent.click(toggle(label)); });
  expect(debug.set).toHaveBeenCalledTimes(1);
  expect(debug.set).toHaveBeenLastCalledWith(name, true);
  expect(toggle(label)).toHaveAttribute("aria-checked", "true");
  expect(held[name]).toBe(true);
  await act(async () => { fireEvent.click(toggle(label)); });
  expect(debug.set).toHaveBeenLastCalledWith(name, false);
  expect(toggle(label)).toHaveAttribute("aria-checked", "false");
  // The other two were never touched.
  expect(debug.set).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the switch moves at once, before the app answers, and a second click meanwhile is ignored", async () => {
  const pending = deferred();
  const { debug } = withDebug({ set: async (name, on, held) => { await pending.promise; held[name] = on; } });
  mount();
  await act(async () => { fireEvent.click(toggle("Compositing borders")); });
  expect(toggle("Compositing borders")).toHaveAttribute("aria-checked", "true");
  await act(async () => { fireEvent.click(toggle("Compositing borders")); });
  expect(toggle("Compositing borders")).toHaveAttribute("aria-checked", "true");
  expect(debug.set).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(toggle("Compositing borders")).toHaveAttribute("aria-checked", "true");
  // Free again once it answered.
  await act(async () => { fireEvent.click(toggle("Compositing borders")); });
  expect(debug.set).toHaveBeenCalledTimes(2);
});

test("one switch pending does not hold up the others", async () => {
  const pending = deferred();
  const { debug } = withDebug({ set: async (name, on, held) => { if (name === "inspectable") await pending.promise; held[name] = on; } });
  mount();
  await act(async () => { fireEvent.click(toggle("Web Inspector")); });
  await act(async () => { fireEvent.click(toggle("Repaint counters")); });
  expect(debug.set.mock.calls).toEqual([["inspectable", true], ["repaintCounters", true]]);
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "true");
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "true");
});

test("what took is what the getter reads once set resolves: an app that kept it off shows it off", async () => {
  // macOS before 13.3, say: the call goes through and the switch has no effect.
  const { debug } = withDebug({ set: async () => {} });
  mount();
  await act(async () => { fireEvent.click(toggle("Web Inspector")); });
  expect(debug.set).toHaveBeenCalledWith("inspectable", true);
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a refusal puts the switch back and says so; the next try clears the line", async () => {
  let refuse = true;
  const { debug } = withDebug({ set: async (name, on, held) => { if (refuse) throw { key: "bad_request" }; held[name] = on; } });
  mount();
  await act(async () => { fireEvent.click(toggle("Repaint counters")); });
  expect(debug.set).toHaveBeenCalledWith("repaintCounters", true);
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "false");
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("The app could not change it.");
  // In its own row, the others unaffected.
  expect(toggle("Repaint counters").closest(".ui-row")).toContainElement(alert);
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "false");
  refuse = false;
  await act(async () => { fireEvent.click(toggle("Repaint counters")); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(toggle("Repaint counters")).toHaveAttribute("aria-checked", "true");
});

test("a refusal turning one off puts it back on", async () => {
  const { debug } = withDebug({ initial: { inspectable: true }, set: async () => { throw new Error("refused"); } });
  mount();
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "true");
  await act(async () => { fireEvent.click(toggle("Web Inspector")); });
  expect(debug.set).toHaveBeenCalledWith("inspectable", false);
  expect(toggle("Web Inspector")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

test("the switch is back at once if the app throws before answering", async () => {
  const { debug } = withDebug();
  debug.set.mockImplementation(() => { throw new Error("no webview"); });
  mount();
  await act(async () => { fireEvent.click(toggle("Compositing borders")); });
  expect(toggle("Compositing borders")).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("alert")).toHaveTextContent("The app could not change it.");
});

test("Animate conversation thumbnails: shown while developer mode is on, off by default, kept on the device", () => {
  withDebug();
  mount();
  expect(screen.queryByRole("switch", { name: "Animate conversation thumbnails" })).toBeNull();
  cleanup();
  localStorage.setItem("sidevoiceDeveloperMode", "1");
  mount();
  expect(groups()).toContain("Conversations");
  expect(toggle("Animate conversation thumbnails")).toHaveAttribute("aria-checked", "false");
  act(() => { fireEvent.click(toggle("Animate conversation thumbnails")); });
  expect(toggle("Animate conversation thumbnails")).toHaveAttribute("aria-checked", "true");
  expect(localStorage.getItem("sidevoiceAnimatedThumbnails")).toBe("1");
  act(() => { fireEvent.click(toggle("Animate conversation thumbnails")); });
  expect(localStorage.getItem("sidevoiceAnimatedThumbnails")).toBeNull();
});
