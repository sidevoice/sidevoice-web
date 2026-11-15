import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { LogsViewer } from "./LogsViewer";
import { installLogSources } from "./log-sources";
import { LAPTOP, NUC, THIS, event, renderInRoom, roomWith, serving, withApp } from "./crash-reports.test-util";
import { removeApp } from "../../host/testing";

/* The logs' viewer: a tab per place, the lines as the file has them, the filters, the end followed, Copy. */

afterEach(() => { cleanup(); removeApp(); });

const WARN = event("2", "app", "14:32:09.031  WARN call{call=c-7f3a}: Lost the connection to the core; trying again  attempt=2");
const LINES = [
  event("1", "app", "14:32:07.412  INFO audio: Microphone opened and listening  stream=microphone"),
  WARN,
  event("3", "connector", "14:32:09.538  INFO delivery{harness=claude}: Received a message from you; its text is not logged  text=<redacted> chars=84"),
  event("4", "core", "14:32:11.205 ERROR panic{thread=tokio}: The core crashed  event=crash_backtrace\n   0: sidevoice_core::room::mixer::Mixer::push\n             at ./rust/room/mixer.rs:97:13"),
];
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const lines = () => [...document.querySelectorAll<HTMLElement>(".logs-line")];
const log = () => document.querySelector<HTMLElement>(".logview")!;

async function open(events = LINES, machines: Parameters<typeof roomWith>[0] = [[THIS, "ok"], [NUC, "ok"], [LAPTOP, "away"]]) {
  withApp();
  const served = serving(events);
  const view = renderInRoom(<LogsViewer />, roomWith(machines));
  await settle();
  return { served, ...view };
}

describe("the places", () => {
  test("a tab for this device, then one for each paired machine, this device's chosen", async () => {
    await open();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replace(/\s*\(.*\)$/, ""))).toEqual(["This device", "NUC", "Old laptop"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tablist", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id);
  });

  test("a machine that is not connected says so, in words a screen reader hears on its tab too, and shows no lines", async () => {
    const { served } = await open();
    const tab = screen.getByRole("tab", { name: /Old laptop/ });
    expect(tab).toHaveTextContent("Old laptop (Offline)");
    fireEvent.click(tab);
    expect(screen.getByText("Old laptop is not connected.")).toBeInTheDocument();
    expect(screen.getByText(/Its logs will show when it connects again\./)).toBeInTheDocument();
    expect(lines()).toHaveLength(0);
    // Nothing was asked of a machine that cannot answer: the app keeps no copy of its logs.
    expect(served.reads).toEqual([{ kind: "device" }]);
  });

  test("a connected machine's own lines are read when its tab opens", async () => {
    const { served } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "NUC" }));
    await settle();
    expect(served.reads).toEqual([{ kind: "device" }, { kind: "machine", id: NUC.fp }]);
    expect(lines()).toHaveLength(4);
  });

  test("where nothing can read a place yet, its tab says so", async () => {
    withApp();
    renderInRoom(<LogsViewer />, roomWith([[THIS, "ok"]]));
    await settle();
    expect(screen.getByText("These logs can't be read from this app yet.")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  test("a phone, or a browser, has no machine of its own: this device is the app's alone, and every machine is another tab", async () => {
    await open(LINES, [[NUC, "ok"]]);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["This device", "NUC"]);
  });

  test("the keys move among the tabs, as in any tab list", async () => {
    await open();
    screen.getAllByRole("tab")[0].focus();
    fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "ArrowRight" });
    await settle();
    expect(screen.getByRole("tab", { name: "NUC" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("reading", () => {
  test("shows a box that says it is reading while the lines come, the same size they will fill", async () => {
    withApp();
    let release!: (events: typeof LINES) => void;
    installLogSources({ open: () => ({ tail: () => new Promise((resolve) => { release = resolve; }) }) });
    renderInRoom(<LogsViewer />, roomWith([[THIS, "ok"]]));
    await settle();
    expect(document.querySelector(".logs-status-box")).toHaveTextContent("Reading the log…");
    expect(document.querySelector(".logs-status-box")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("searchbox")).toBeNull();
    await act(async () => { release(LINES); });
    expect(lines()).toHaveLength(4);
  });

  test("a read that fails says so and can be tried again", async () => {
    withApp();
    const tail = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(LINES);
    installLogSources({ open: () => ({ tail }) });
    renderInRoom(<LogsViewer />, roomWith([[THIS, "ok"]]));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("The log could not be read.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(lines()).toHaveLength(4);
    expect(tail).toHaveBeenCalledTimes(2);
  });

  test("an empty log says nothing has been logged", async () => {
    await open([]);
    expect(screen.getByText("Nothing has been logged yet.")).toBeInTheDocument();
  });

  test("each event is as the file has it, a backtrace in full, and only the piece is outside the text", async () => {
    await open();
    expect(lines().map((line) => line.querySelector(".logs-line-text")!.textContent)).toEqual(LINES.map((line) => line.text));
    expect(lines().map((line) => line.querySelector(".logs-piece")!.textContent)).toEqual(["App", "App", "Connector", "Core"]);
    expect(lines()[1]).toHaveAttribute("data-level", "WARN");
    expect(lines()[3]).toHaveAttribute("data-level", "ERROR");
    expect(lines()[0]).not.toHaveAttribute("data-level");
    expect(lines()[3].querySelector(".logs-line-text")!.textContent).toContain("at ./rust/room/mixer.rs:97:13");
    // The redaction the log left is marked, its text unchanged.
    expect(lines()[2].querySelector(".logs-redacted")).toHaveTextContent("<redacted>");
  });

  test("the box is a labelled region the keyboard can enter", async () => {
    await open();
    expect(screen.getByRole("region", { name: "Log lines of This device" })).toHaveAttribute("tabindex", "0");
  });
});

describe("the search and the filters", () => {
  test("a search narrows the lines, marks what it found, and is cleared by its button or Escape", async () => {
    await open();
    const search = screen.getByRole("searchbox", { name: "Search the log" });
    fireEvent.change(search, { target: { value: "lost the" } });
    await settle();
    expect(lines()).toHaveLength(1);
    expect(log().querySelector("mark")).toHaveTextContent("Lost the");
    expect(screen.getByText("1 of 4 lines")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    await settle();
    expect(lines()).toHaveLength(4);
    fireEvent.change(search, { target: { value: "core" } });
    await settle();
    fireEvent.keyDown(search, { key: "Escape" });
    await settle();
    expect(search).toHaveValue("");
  });

  test("a search nothing matches says so, and Clear filters brings the lines back", async () => {
    await open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such text" } });
    await settle();
    expect(screen.getByText("No line matches what you are looking for.")).toBeInTheDocument();
    fireEvent.click(within(log()).getByRole("button", { name: "Clear filters" }));
    await settle();
    expect(lines()).toHaveLength(4);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  test("Filters opens a popover with the level as cards with their counts and the pieces as chips with theirs; each choice applies at once", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = await screen.findByRole("dialog", { name: "Log filters" });
    const levels = within(popover).getAllByRole("radio");
    expect(levels.map((card) => card.textContent)).toEqual(["All levels4", "Warnings and errors2", "Errors only1"]);
    expect(levels[0]).toHaveAttribute("aria-checked", "true");
    expect(within(popover).getByText("Showing 4 of 4 lines")).toBeInTheDocument();
    fireEvent.click(levels[1]);
    await settle();
    expect(lines()).toHaveLength(2);
    expect(within(popover).getByText("Showing 2 of 4 lines")).toBeInTheDocument();
    // The pieces, with what each would leave under the level chosen.
    const chips = within(popover).getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"));
    expect(chips.map((chip) => chip.textContent)).toEqual(["App1", "Connector0", "Core1"]);
    fireEvent.click(chips[0]);
    await settle();
    expect(lines()).toHaveLength(1);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    // What is on is the button's badge, and chips that come off under the search.
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("2");
    const active = screen.getByRole("group", { name: "Active filters" });
    expect(active).toHaveTextContent("Warnings and errors");
    expect(active).toHaveTextContent("App");
    fireEvent.click(within(active).getByRole("button", { name: "Remove the filter: App" }));
    await settle();
    expect(lines()).toHaveLength(2);
  });

  test("Reset takes the level and the pieces off, and is off itself while none is on", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = await screen.findByRole("dialog", { name: "Log filters" });
    const reset = within(popover).getByRole("button", { name: "Reset" });
    expect(reset).toBeDisabled();
    fireEvent.click(within(popover).getByRole("radio", { name: /Errors only/ }));
    await settle();
    expect(reset).toBeEnabled();
    expect(lines()).toHaveLength(1);
    fireEvent.click(reset);
    await settle();
    expect(lines()).toHaveLength(4);
    expect(reset).toBeDisabled();
  });

  test("the arrows move the level among the cards and take it as they go", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = await screen.findByRole("dialog", { name: "Log filters" });
    fireEvent.keyDown(within(popover).getByRole("radio", { name: /All levels/ }), { key: "ArrowDown" });
    await settle();
    expect(within(popover).getByRole("radio", { name: /Warnings and errors/ })).toHaveAttribute("aria-checked", "true");
    expect(lines()).toHaveLength(2);
  });

  test("the pieces are offered only where the lines come from more than one", async () => {
    await open([LINES[0], LINES[1]]);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = await screen.findByRole("dialog", { name: "Log filters" });
    expect(within(popover).queryByText("Pieces")).toBeNull();
  });

  test("how many lines is a cut of what was read: choosing asks nothing of the place", async () => {
    const many = Array.from({ length: 300 }, (_, i) => event(String(i), "app", `14:32:${String(i % 60).padStart(2, "0")}.000  INFO audio: line ${i}`));
    const { served } = await open(many);
    expect(lines()).toHaveLength(200);
    expect(screen.getByText("200 lines")).toBeInTheDocument();
    expect(lines().at(-1)).toHaveTextContent("line 299");
    fireEvent.click(screen.getByRole("combobox", { name: "How many lines" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last 100 lines" }));
    await settle();
    expect(lines()).toHaveLength(100);
    expect(served.reads).toHaveLength(1);
  });
});

describe("following the end", () => {
  /** jsdom lays nothing out: the box's metrics are given. */
  function metrics(node: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(node, "clientHeight", { configurable: true, value: clientHeight });
  }
  const jump = () => document.querySelector<HTMLElement>(".latest-jump")!;
  const scrollTo = async (node: HTMLElement, top: number) => { node.scrollTop = top; await act(async () => { fireEvent.scroll(node); }); };

  test("opens at the end, with no way back showing", async () => {
    await open();
    expect(jump()).not.toHaveAttribute("data-show");
    expect(jump()).toHaveAttribute("aria-hidden", "true");
    expect(jump()).toHaveAttribute("aria-label", "Go to the end of the log");
  });

  test("a line that arrives while the reader is at the end is followed", async () => {
    const { served } = await open();
    metrics(log(), { scrollHeight: 1000, clientHeight: 400 });
    const toFoot = vi.spyOn(log(), "scrollTop", "set");
    await served.push(event("5", "app", "14:32:12.000  INFO audio: new line"));
    expect(lines()).toHaveLength(5);
    expect(toFoot).toHaveBeenCalledWith(1000);
  });

  test("scrolled up, the place is kept, the way back shows, and a line that arrives gives it a dot", async () => {
    const { served } = await open();
    metrics(log(), { scrollHeight: 1000, clientHeight: 400 });
    await scrollTo(log(), 100);
    expect(jump()).toHaveAttribute("data-show");
    expect(jump()).not.toHaveAttribute("data-new");
    expect(jump()).not.toHaveAttribute("aria-hidden");
    const toFoot = vi.spyOn(log(), "scrollTop", "set");
    await served.push(event("5", "app", "14:32:12.000  INFO audio: new line"));
    expect(lines()).toHaveLength(5);
    expect(toFoot).not.toHaveBeenCalled();
    expect(jump()).toHaveAttribute("data-new");
  });

  test("the way back goes to the end and follows again; scrolling to the end by hand does the same", async () => {
    const { served } = await open();
    metrics(log(), { scrollHeight: 1000, clientHeight: 400 });
    await scrollTo(log(), 100);
    fireEvent.click(jump());
    expect(log().scrollTop).toBe(1000);
    expect(jump()).not.toHaveAttribute("data-show");
    await scrollTo(log(), 50);
    expect(jump()).toHaveAttribute("data-show");
    await scrollTo(log(), 590);
    expect(jump()).not.toHaveAttribute("data-show");
    const toFoot = vi.spyOn(log(), "scrollTop", "set");
    await served.push(event("6", "app", "14:32:13.000  INFO audio: another"));
    expect(toFoot).toHaveBeenCalled();
  });

  test("lines that come together all show, in the order they came", async () => {
    const { served } = await open();
    await served.push(event("7", "app", "14:32:14.000  INFO audio: a"), event("8", "app", "14:32:14.100  INFO audio: b"));
    expect(lines().slice(-2).map((line) => line.querySelector(".logs-line-text")!.textContent)).toEqual(["14:32:14.000  INFO audio: a", "14:32:14.100  INFO audio: b"]);
  });

  test("what is followed is kept to the most the viewer can hold: the oldest go", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => event(`o${i}`, "app", `14:32:00.000  INFO audio: old ${i}`));
    const { served } = await open(first);
    fireEvent.click(screen.getByRole("combobox", { name: "How many lines" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last 1000 lines" }));
    await settle();
    await served.push(...Array.from({ length: 1100 }, (_, i) => event(`n${i}`, "app", `14:33:00.000  INFO audio: new ${i}`)));
    // 1000 shown of 2000 held.
    expect(lines()).toHaveLength(1000);
    expect(lines()[0]).toHaveTextContent("new 100");
  });
});

describe("copying and the folder", () => {
  test("Copy puts the lines in view on the clipboard as the file has them, and says how many", async () => {
    await open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    onTestFinished(() => { delete (navigator as { clipboard?: unknown }).clipboard; });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lost" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await settle();
    expect(writeText).toHaveBeenCalledWith(WARN.text);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((status) => status.textContent === "Copied 1 line.")).toBe(true);
  });

  test("with nothing in view there is nothing to copy, and it says so", async () => {
    await open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such text" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await settle();
    expect(screen.getAllByRole("status").some((status) => status.textContent === "There are no lines to copy.")).toBe(true);
  });

  test("a clipboard that refuses says so in words and asks to copy by hand", async () => {
    await open();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    onTestFinished(() => { delete (navigator as { clipboard?: unknown }).clipboard; });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await settle();
    expect(screen.getByRole("button", { name: "Could not copy" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((status) => status.textContent === "Could not copy. Select the lines and copy them by hand.")).toBe(true);
  });

  test("Open folder is there only on this device, and only where the app can show the log", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Open folder" })).toBeNull();
    cleanup();
    const revealLog = vi.fn(async () => undefined);
    withApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => undefined, pairing: async () => null, revealLog } });
    serving(LINES);
    renderInRoom(<LogsViewer />, roomWith([[THIS, "ok"], [NUC, "ok"]]));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(revealLog).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "NUC" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Open folder" })).toBeNull();
  });

  test("a folder the app could not show says so", async () => {
    withApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => undefined, pairing: async () => null, revealLog: async () => { throw new Error("no"); } } });
    serving(LINES);
    renderInRoom(<LogsViewer />, roomWith([[THIS, "ok"]]));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((status) => status.textContent === "The folder could not be opened.")).toBe(true));
  });

  test("the note that logs are redacted at their source is under the log", async () => {
    await open();
    expect(screen.getByText(/Logs are redacted at their source/)).toBeInTheDocument();
  });
});
