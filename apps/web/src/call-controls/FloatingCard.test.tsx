import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VARIANTS_KEY } from "../lib/variants";
import { cardSnapshot, fakeHost, row, type FakeHost } from "../test/call-card";
import { CallCard, CLICK_GUARD_MS, SHOW_DELAY_MS } from "./CallCard";
import { SIZE_KEY } from "./FloatingCard";
import type { CallSnapshot } from "./host";
import { translator } from "./i18n";

// The floating card's options (VARIANTS `floating-card`, briefs/FLOATING-CARD-SPEC.md): each value's states and
// controls, in both call models — A (Call / hang up) and B (the voice switch).
const t = translator("en");
const OPTIONS = ["pip", "caption", "strip", "pill"] as const;
type Option = (typeof OPTIONS)[number];

const pick = (value: string) => localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "floating-card": value }));
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { vi.useRealTimers(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem(SIZE_KEY); delete document.documentElement.dataset.theme; });

const rows = () => [row("a", { title: "Claude", selected: true, model: "opus-5.5", effort: "high" }), row("b", { title: "Codex" }), row("c", { title: "Docs", unread: 2 })];
const A = (extra: Partial<CallSnapshot> = {}) => cardSnapshot({ participants: rows(), conversation: "a", title: "Claude", ...extra });
const B = (extra: Partial<CallSnapshot> = {}) => A({ callModel: "voice-switch", voiceOn: true, ...extra });
const MODELS = { A, B } as const;

function show(option: Option, call: CallSnapshot, extra: Parameters<typeof fakeHost>[0] = {}): FakeHost {
  pick(option);
  const host = fakeHost({ call, ...extra });
  render(<CallCard host={host} t={t} />);
  return host;
}
const root = () => document.querySelector<HTMLElement>(".fc")!;
const conversation = () => document.querySelector<HTMLButtonElement>(".fc .card-title")!;
/** What the option says of the state, wherever it says it: the chip (1, 3), the caption (2), the pill's line (4). */
function said(option: Option) {
  if (option === "caption") return (conversation().textContent ?? "") + " · " + (document.querySelector(".fc-caption")!.textContent ?? "");
  if (option === "pill") return (conversation().textContent ?? "") + " · " + (document.querySelector(".fc-pill-state")!.textContent ?? "");
  return conversation().textContent ?? "";
}
const names = () => [...root().querySelectorAll("button")].map((button) => button.getAttribute("aria-label") || button.textContent?.trim());
const hover = () => {
  fireEvent.pointerEnter(root());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + CLICK_GUARD_MS + 20); });
};

describe.each(OPTIONS)("option %s", (option) => {
  describe.each(["A", "B"] as const)("call model %s", (model) => {
    const call = MODELS[model];

    test("the states, in the card's words", () => {
      const host = show(option, call());
      expect(said(option)).toMatch(/Claude.*Ready/);
      host.call({ mood: "speaking", canSkip: true });
      expect(said(option)).toMatch(/Speaking/);
      host.call({ mood: "working", canSkip: false });
      expect(said(option)).toMatch(/Working/);
      host.call({ mood: "listening", turn: "listening" });
      // The chip says it (1, 3); the caption's and the pill's bars carry it as their name (2, 4).
      if (option === "pip" || option === "strip") expect(said(option)).toMatch(/Listening to you/);
      else expect(screen.getByRole("img", { name: "Listening" })).toBeInTheDocument();
      host.call({ mood: "listening", turn: "transcribing" });
      if (option === "caption") expect(said(option)).toMatch(/Transcribing what you said/);
      host.call({ mood: "offline", turn: null, participants: [row("a", { title: "Claude", selected: true, reach: "offline", available: false }), row("b")] });
      expect(said(option)).toMatch(/Offline/);
      host.call({ mood: "idle", participants: rows(), busy: true, busyReason: "reconnecting" });
      expect(said(option)).toMatch(/Reconnecting…/);
      host.call({ busyReason: "switching", switchingTo: "Codex" });
      expect(said(option)).toMatch(/Switching to Codex…/);
      if (model === "B") {
        host.call({ busy: false, busyReason: null, participants: [row("a", { title: "Claude", selected: true, mark: "waiting-for-you" }), row("b")] });
        expect(said(option)).toMatch(/Waiting for you/);
        host.call({ conversation: null, title: "", participants: [row("b")], micReason: "noConversation", micDisabled: true });
        expect(said(option)).toMatch(/Choose a conversation/);
      }
    });

    test("its controls, always in the page, carry the commands of this call model", () => {
      const host = show(option, call({ canSkip: true }));
      const expected = model === "A" ? ["Microphone and speaker", "Mute", "Skip what is playing", "Hang up"]
        : ["Microphone and speaker", "Mute microphone", "Mute agents", "Skip what is playing", "Turn off voice"];
      if (option === "pill") expected.unshift(expected.splice(2 + Number(model === "B"), 1)[0]); // Skip leads, in a slot of its own
      const all = names();
      expect(all.filter((name) => expected.includes(name!))).toEqual(expected);
      expect(screen.queryByRole("button", { name: model === "A" ? "Turn off voice" : "Hang up" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Mute agents" }) !== null).toBe(model === "B");
      // A keyboard's (or assistive technology's) press carries no pointer: no guard holds it.
      for (const name of [...expected.filter((name) => name !== "Microphone and speaker"), "Open Sidevoice"]) fireEvent.click(screen.getByRole("button", { name }));
      const commands = vi.mocked(host.run).mock.calls.map(([command]) => command.command);
      expect(commands).toEqual(expect.arrayContaining(model === "A" ? ["toggle-mute", "skip-reply", "hang-up", "open-app"] : ["toggle-mute", "toggle-agents", "skip-reply", "voice-off", "open-app"]));
    });

    test("the Tab order: the conversation, Size, Open Sidevoice; then the call's controls", () => {
      show(option, call({ canSkip: true }));
      const order = names();
      const at = (name: string) => order.indexOf(name);
      expect(order[0]).toMatch(/Claude/);
      if (option !== "pill") expect(at("Make larger")).toBe(1);
      expect(at("Open Sidevoice")).toBeLessThan(at("Microphone and speaker"));
      expect(at("Microphone and speaker")).toBeLessThan(at(model === "A" ? "Hang up" : "Turn off voice"));
    });

    test("near the pointer, or with focus inside, what waits for the pointer shows; a pointer's click right after is held", () => {
      const host = show(option, call());
      expect(root()).not.toHaveAttribute("data-expanded");
      fireEvent.focus(conversation());
      expect(root()).toHaveAttribute("data-expanded");
      fireEvent.blur(conversation());
      fireEvent.pointerEnter(root());
      act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
      expect(root()).toHaveAttribute("data-expanded");
      const end = screen.getByRole("button", { name: model === "A" ? "Hang up" : "Turn off voice" });
      fireEvent.click(end, { detail: 1 });
      expect(host.run).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
      fireEvent.click(end, { detail: 1 });
      expect(host.run).toHaveBeenCalledWith({ command: model === "A" ? "hang-up" : "voice-off" });
    });

    test("the microphone: A's flips its name and is disabled when it cannot be used; B's keeps one name and says why", () => {
      const host = show(option, call({ micEnabled: false }));
      if (model === "A") {
        expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
        host.call({ micDisabled: true });
        expect(screen.getByRole("button", { name: "Unmute" })).toBeDisabled();
      } else {
        expect(screen.getByRole("button", { name: "Mute microphone" })).toHaveAttribute("aria-pressed", "true");
        host.call({ micReason: "cantHear", micDisabled: true });
        const mic = screen.getByRole("button", { name: "Mute microphone" });
        expect(mic).not.toBeDisabled();
        expect(mic).toHaveAttribute("aria-disabled", "true");
        expect(mic).toHaveAccessibleDescription("Claude can't hear you right now");
        fireEvent.click(mic);
        expect(host.run).not.toHaveBeenCalled();
      }
    });

    test("the idle warning, with Keep in this call model's words", () => {
      const host = show(option, call({ idleWarning: true }));
      const keep = screen.getByRole("button", { name: model === "A" ? "Stay in the call" : "Keep voice on" });
      expect(screen.getByText(model === "A" ? "Still there? The call ends in 1 minute." : "Still there? Voice turns off in 1 minute.")).toBeInTheDocument();
      fireEvent.click(keep);
      expect(host.run).toHaveBeenCalledWith({ command: "keep-alive" });
    });

    test("the exit notice: when the call or the voice ends by itself, why, Open Sidevoice and Close — never when the person ended it", () => {
      const host = show(option, call());
      host.call(model === "A" ? { joined: false, ended: { reason: "idle", detail: "" } } : { voiceOn: false, voiceOffReason: "micLost" });
      expect(screen.getByText(model === "A" ? "The call ended after 15 minutes without activity." : "Voice turned off: your microphone was disconnected.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: model === "A" ? "Hang up" : "Turn off voice" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open Sidevoice" }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(vi.mocked(host.run).mock.calls.map(([command]) => command.command)).toEqual(["open-app", "dismiss"]);
      expect(root()).toBeNull();
      // A new session, and the person ending it: no notice.
      host.call(model === "A" ? { joined: true, ended: null, since: Date.now() } : { voiceOn: true, voiceOffReason: null, since: Date.now() });
      expect(root()).not.toBeNull();
      host.call(model === "A" ? { joined: false } : { voiceOn: false });
      expect(root()).toBeNull();
    });

    test("the conversation opens the picker; Escape closes it and gives focus back", () => {
      const host = show(option, call({ participants: [...rows(), row("d", { title: "Landing", reach: "holding" })] }));
      conversation().focus();
      fireEvent.click(conversation());
      expect(conversation()).toHaveAttribute("aria-expanded", "true");
      const panel = document.querySelector<HTMLElement>(".card-panel.conversations")!;
      // A cannot call one that cannot hear; B can make any one active (D5).
      expect(within(panel).getByRole("button", { name: /Landing/ }).hasAttribute("disabled")).toBe(false);
      fireEvent.click(within(panel).getByRole("button", { name: /Codex/ }));
      expect(host.run).toHaveBeenLastCalledWith({ command: "select-participant", threadId: "b" });
      fireEvent.click(conversation());
      fireEvent.keyDown(root(), { key: "Escape" });
      expect(document.querySelector(".card-panel")).toBeNull();
      expect(conversation()).toHaveFocus();
    });

    test("nothing until the first setup is finished", () => {
      show(option, call({ setupDone: false }));
      expect(root()).toBeNull();
    });
  });
});

describe("call model B on the card", () => {
  test.each(OPTIONS)("%s: Hear it for the active conversation's mark; asking; Mute agents' badge only while muted", (option) => {
    const marked = row("a", { title: "Claude", selected: true, mark: "waiting-for-you" });
    const host = show(option, B({ participants: [marked, row("b", { mark: "wants-to-talk" })], wantToTalk: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    expect(host.run).toHaveBeenCalledWith({ command: "hear-it", threadId: "a" });
    host.call({ participants: [{ ...marked, mark: null, hearing: "asking" }, row("b", { mark: "wants-to-talk" })] });
    const asking = screen.getByRole("button", { name: "Asking Claude…" });
    expect(asking).toHaveAttribute("aria-disabled", "true");
    expect(asking).toHaveTextContent("Asking…");
    const agents = screen.getByRole("button", { name: "Mute agents" });
    expect(agents.querySelector(".card-agents-badge")).toBeNull();
    host.call({ agentsMuted: true, wantToTalk: 1 });
    expect(screen.getByRole("button", { name: "Mute agents" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mute agents" }).querySelector(".card-agents-badge")).toHaveTextContent("1");
    // Others with a mark: an amber hand by the title, and its words in the conversation button's description.
    expect(conversation()).toHaveAccessibleDescription(option === "strip" ? "Switch conversation" : "Switch conversation. Another conversation wants to talk");
  });
});

describe("option 1–3: the picture-in-picture", () => {
  test("the scene is the conversation's bicho; the chip lifts nothing; Size switches S and L, kept in the card's storage", () => {
    show("pip", A({ mood: "working" }));
    expect(document.querySelector(".fc-tile .stage-agent")).toHaveAttribute("data-avatar-state", "working");
    expect(document.querySelector(".fc-tile")).toHaveAttribute("data-mood", "working");
    expect(root()).toHaveAttribute("data-size", "S");
    fireEvent.click(screen.getByRole("button", { name: "Make larger" }));
    expect(root()).toHaveAttribute("data-size", "L");
    expect(localStorage.getItem(SIZE_KEY)).toBe("L");
    fireEvent.doubleClick(document.querySelector(".fc-tile")!);
    expect(root()).toHaveAttribute("data-size", "S");
    expect(screen.getByRole("button", { name: "Make larger" })).toBeInTheDocument();
  });

  test("speaking rings the tile; reconnecting dims it; with no conversation (B) the brand mark", () => {
    const host = show("pip", A({ mood: "speaking" }));
    expect(document.querySelector(".fc-tile")).toHaveAttribute("data-ring");
    host.call({ mood: "idle", busy: true, busyReason: "reconnecting" });
    expect(document.querySelector(".fc-tile")).toHaveAttribute("data-dim");
    host.call({ busy: false, busyReason: null, callModel: "voice-switch", voiceOn: true, conversation: null, participants: [row("b")] });
    expect(document.querySelector(".fc-brand")).toBeInTheDocument();
    expect(document.querySelector(".stage-agent")).toBeNull();
  });

  test("the sub-line near the pointer: machine, model, effort and the clock", () => {
    show("pip", A({ since: Date.now() - 754_000 }));
    expect(document.querySelector(".fc-sub")).toHaveTextContent("daimon · opus-5.5 · high · 12:34");
  });

  test("the you-chip: crossed out and on the muted fill when muted; agents muted shows (B)", () => {
    const host = show("pip", B({ micEnabled: false, agentsMuted: true }));
    const chip = document.querySelector(".fc-you")!;
    expect(chip).toHaveAttribute("aria-hidden", "true");
    expect(chip).toHaveAttribute("data-muted");
    expect(chip).toHaveAttribute("title", "Microphone muted");
    host.call({ micEnabled: true, turn: "listening", mood: "listening" });
    expect(document.querySelector(".fc-you")).toHaveAttribute("data-turn", "listening");
  });
});

describe("option 2: the caption", () => {
  const caption = () => document.querySelector<HTMLElement>(".fc-caption")!;
  test("the title chip says the title alone; the caption the rest, the first row that applies", () => {
    const host = show("caption", A());
    expect(conversation()).toHaveTextContent(/^Claude$/);
    expect(caption()).toHaveAttribute("data-row", "state");
    // The reply being said: the chunk before, dim; the chunk now, its said words lit.
    host.push({ call: A({ mood: "speaking", canSkip: true }), caption: { who: "agent", previous: "I ran the tests.", current: "Two fail in settings.", spoken: 8, source: "voice" } });
    expect(caption()).toHaveAttribute("data-row", "speaking");
    expect(caption().querySelector(".fc-karaoke-previous")).toHaveTextContent("I ran the tests.");
    expect(caption().querySelector(".fc-said")).toHaveTextContent("Two fail");
    expect(caption().querySelector(".fc-unsaid")).toHaveTextContent("in settings.");
    // Your turn wins over the reply it talks over: your bars, named; then transcribing; then what it sent.
    host.push({ call: A({ mood: "speaking", turn: "listening" }) });
    expect(caption()).toHaveAttribute("data-row", "you");
    expect(within(caption()).getByRole("img", { name: "Listening" })).toBeInTheDocument();
    host.push({ call: A({ mood: "listening", turn: "transcribing" }) });
    expect(caption()).toHaveTextContent("You · Transcribing what you said");
    host.push({ call: A({ mood: "working" }), caption: { who: "you", previous: "", current: "Run the tests", spoken: null, source: "voice" } });
    expect(caption().querySelector(".fc-sent")).toHaveTextContent("Run the tests");
    host.push({ caption: null });
    expect(caption()).toHaveAttribute("data-row", "working");
    expect(caption()).toHaveTextContent("Working…");
    // A reply that just ended: its last chunk, dim.
    host.push({ call: A(), caption: { who: "agent", previous: "", current: "Shall I fix them?", spoken: null, source: "voice" } });
    expect(caption()).toHaveAttribute("data-row", "ended");
    expect(caption()).toHaveTextContent("Shall I fix them?");
  });

  test("B with the agents muted: a reply that came in writing, while its mark stays", () => {
    const host = show("caption", B({ agentsMuted: true }), { caption: { who: "agent", previous: "", current: "Pushed. CI is running.", spoken: null, source: "written" } });
    expect(caption()).toHaveAttribute("data-row", "written");
    expect(caption()).toHaveTextContent("In writing · Pushed. CI is running.");
    host.push({ call: A() });
    expect(caption()).not.toHaveAttribute("data-row", "written");
  });

  test("the notices go in the caption: the idle warning with Keep, the exit notice with Open Sidevoice and Close", () => {
    const host = show("caption", A({ idleWarning: true }));
    expect(within(caption()).getByRole("button", { name: "Stay in the call" })).toBeInTheDocument();
    expect(document.querySelector(".fc-banner")).toBeNull();
    host.call({ idleWarning: false, joined: false, ended: { reason: "failed", detail: "the room closed it" } });
    expect(caption()).toHaveTextContent("The call ended: the room closed it");
    expect(within(caption()).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(root()).toHaveAttribute("data-exit");
  });

  test("the caption is a group, named, never a live region", () => {
    show("caption", A());
    expect(screen.getByRole("group", { name: "Caption" })).toBe(caption());
    expect(document.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
  });
});

describe("option 3: the conversations strip", () => {
  const strip = () => document.querySelector(".fc-strip");
  test("the others, by who wants the person, one click each; A cannot call one that cannot hear", () => {
    const host = show("strip", A({ participants: [...rows(), row("d", { title: "Landing", reach: "offline", available: false })] }));
    const buttons = within(strip() as HTMLElement).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Docs · Ready", "Codex · Ready", "Landing · Offline"]);
    expect(buttons[2]).toHaveAttribute("aria-disabled", "true");
    expect(buttons[2]).toHaveAccessibleDescription("Landing can't hear you right now");
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[1]);
    expect(host.run).toHaveBeenCalledTimes(1);
    expect(host.run).toHaveBeenCalledWith({ command: "select-participant", threadId: "b" });
    expect(screen.getByRole("group", { name: "Other conversations" })).toBe(strip());
  });

  test("B: marks first; up to six, then +N, which opens the picker; none without others", () => {
    const many = [row("a", { title: "Claude", selected: true }), ...["b", "c", "d", "e", "f", "g", "h"].map((id) => row(id, { title: id })), row("w", { title: "Wants", mark: "wants-to-talk" })];
    const host = show("strip", B({ participants: many }));
    const buttons = within(strip() as HTMLElement).getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("aria-label", "Wants · Wants to talk");
    expect(buttons).toHaveLength(7);
    const more = screen.getByRole("button", { name: "2 more conversations" });
    expect(more).toHaveTextContent("+2");
    fireEvent.click(more);
    expect(document.querySelector(".card-panel.conversations")).toBeInTheDocument();
    host.call({ participants: [row("a", { title: "Claude", selected: true })] });
    expect(strip()).toBeNull();
  });

  test("the order holds while the pointer is over the card", () => {
    const host = show("strip", B({ participants: [rows()[0], row("b", { title: "Codex", mark: "wants-to-talk" }), row("c", { title: "Docs" })] }));
    expect(within(strip() as HTMLElement).getAllByRole("button")[0]).toHaveAttribute("aria-label", "Codex · Wants to talk");
    fireEvent.pointerEnter(root());
    host.call({ participants: [rows()[0], row("b", { title: "Codex" }), row("c", { title: "Docs", mark: "waiting-for-you" })] });
    expect(within(strip() as HTMLElement).getAllByRole("button").map((button) => button.getAttribute("aria-label"))[0]).toBe("Codex · Ready");
    fireEvent.pointerLeave(root());
    host.call({});
    expect(within(strip() as HTMLElement).getAllByRole("button")[0]).toHaveAttribute("aria-label", "Docs · Waiting for you");
  });
});

describe("option 4: the pill", () => {
  test("every control in view without hover; Skip takes its slot only while something plays; one more button in B", () => {
    const host = show("pill", A());
    expect(root()).toHaveAttribute("data-model", "a");
    expect(screen.queryByRole("button", { name: "Skip what is playing" })).toBeNull();
    host.call({ canSkip: true, mood: "speaking" });
    expect(screen.getByRole("button", { name: "Skip what is playing" })).toBeEnabled();
    expect(document.querySelector(".fc-pill-avatar")).toHaveAttribute("data-ring");
    host.call({ callModel: "voice-switch", voiceOn: true });
    expect(root()).toHaveAttribute("data-model", "b");
  });

  test("the state line: the state's words and O4; Hear it inline in S8; your bars while your turn is open", () => {
    const host = show("pill", B({ participants: [row("a", { title: "Claude", selected: true, mark: "wants-to-talk" }), row("b", { mark: "waiting-for-you" })] }));
    const line = document.querySelector(".fc-pill-state")!;
    expect(line).toHaveTextContent("Wants to talk");
    expect(within(line as HTMLElement).getByRole("button", { name: "Hear it" })).toBeInTheDocument();
    host.call({ participants: rows(), turn: "transcribing", mood: "listening" });
    expect(within(line as HTMLElement).getByRole("img", { name: "Transcribing what you said" })).toBeInTheDocument();
  });

  test("the notices make a second row: Keep, or Open Sidevoice and Close", () => {
    const host = show("pill", B({ idleWarning: true }));
    expect(root()).toHaveAttribute("data-notice");
    expect(within(document.querySelector(".fc-pill-notice") as HTMLElement).getByRole("button", { name: "Keep voice on" })).toBeInTheDocument();
    host.call({ idleWarning: false });
    expect(document.querySelector(".fc-pill-notice")).toBeNull();
  });
});

describe("every option", () => {
  test("wears the room's theme and language (FC12)", () => {
    const host = show("pip", A({ theme: "dark", language: "es" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Colgar" })).toBeInTheDocument();
    expect(conversation()).toHaveTextContent("Claude · Lista");
    host.call({ theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("today's card stays the default until the operator chooses", () => {
    render(<CallCard host={fakeHost({ call: A() })} t={t} />);
    expect(document.querySelector(".call-card")).toBeInTheDocument();
    expect(root()).toBeNull();
  });
});
