import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { TurnChoices } from "./VoiceSettings";
import { VARIANTS_KEY } from "../../lib/variants";
import { createRoomStore, installRoomBridge, RoomStoreContext, useRoomStore } from "../../state/room-store";
import { defaultVoiceSettings, type DeviceVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions, TrialProgress } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";
import type { TurnStep } from "../../services/voice-trial.js";
import type { VoiceTake } from "../../services/voice-take";

/* Trying the end of turn where it is chosen, in its card after the choices: the actions stand in for
 * the voice, and tell the try's steps as the controller would (voice-trial.js TurnStep). The interface speaks English
 * here (the test's system). */

afterEach(() => { vi.useRealTimers(); localStorage.removeItem(VARIANTS_KEY); delete window.sidevoiceActions; });

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1e6, memoryMb: 1, available: true, reasons: [], installed: true, ...extra });
const local = (id: string, family: string, capabilities: string[], extra: Record<string, unknown> = {}) =>
  ({ id, family, capabilities, parametersM: 1, license: "MIT", languages: ["es"], voices: [], installed: true, builds: [build(id + "/int8")], ...extra });
const catalogs = (turnInstalled = true, sttInstalled = true) => [{ id: "local", name: null, status: { stale: false }, models: [
  local("whisper-base", "whisper", ["stt"], sttInstalled ? {} : { installed: false, builds: [build("whisper-base/int8", { installed: false })] }),
  local("kokoro-82m-v1.0", "kokoro", ["tts"]),
  local("smart-turn-v3.2", "smart-turn", ["end-of-turn"], turnInstalled ? {} : { installed: false, builds: [build("smart-turn-v3.2/int8", { installed: false })] }),
] }] as unknown as CatalogView[];

const variants = ["card"] as const;

/** The end-of-turn choices with their try, on `settings`; the try runs until the test tells it why it ended. */
function renderTurn({ variant: _variant = "card" as (typeof variants)[number], settings = {} as Partial<DeviceVoiceSettings>, turnInstalled = true, sttInstalled = true, setup = false } = {}) {
  const store = createRoomStore();
  store.patch({ voiceSettings: { ...defaultVoiceSettings(), ...settings }, voiceCatalogue: { state: "ready", catalogs: catalogs(turnInstalled, sttInstalled), error: "" } });
  installRoomBridge(store);
  let running: { progress: TrialProgress; reject(error: unknown): void } | null = null;
  const end = (error: unknown) => { const run = running; running = null; run?.reject(error); };
  const actions = {
    editVoice: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
    tryTurnSettings: vi.fn((progress: TrialProgress) => new Promise<void>((_, reject) => { running = { progress, reject }; })),
    cancelVoiceTry: vi.fn(() => end(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }))),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  function Pane({ active }: { active: boolean }) {
    const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
    return draft ? <TurnChoices draft={draft} setup={setup} active={active} /> : null;
  }
  const tree = (active: boolean) => <RoomStoreContext.Provider value={store}><TooltipProvider><dialog open><Pane active={active} /></dialog></TooltipProvider></RoomStoreContext.Provider>;
  const view = render(tree(true));
  return {
    store, actions, view,
    show: (active: boolean) => view.rerender(tree(active)),
    step: (step: TurnStep) => act(() => { running!.progress.onTurnStep!(step); }),
    /** The take the voice hands once it has stopped (contract gap #40), when it hands one. */
    take: (take: VoiceTake) => act(() => { running!.progress.onTake?.(take); }),
    end: async (error: unknown) => { await act(async () => { end(error); }); },
    start: async () => { await act(async () => { fireEvent.click(button()); }); },
  };
}

const panel = () => document.getElementById("turn-try-panel")!;
const button = () => document.getElementById("turn-try") as HTMLButtonElement;
const status = () => panel().querySelector(".turn-try-said")!;

test.each(variants)("%s: before a try, what to do and that it uses what is selected; then where the latest turn stands, always in words", async (variant) => {
  const { actions, step, start } = renderTurn({ variant });
  expect(panel()).toHaveTextContent("Talk as you would to the agent, pausing to think. Headphones help.");
  expect(panel()).toHaveTextContent("Uses what's selected, even before saving.");
  const tryButton = button();
  expect(tryButton).toHaveTextContent("Try it");
  await start();
  expect(actions.tryTurnSettings).toHaveBeenCalledTimes(1);
  expect(panel()).toHaveTextContent("Getting ready…");
  // Try and Stop are one button: the focus stays on it.
  expect(button()).toBe(tryButton);
  expect(tryButton).toHaveTextContent("Stop");
  step({ step: "listening", again: false });
  expect(panel()).toHaveTextContent("Listening — start talking");
  step({ step: "speaking" });
  expect(panel()).toHaveTextContent("You're talking…");
  step({ step: "pause" });
  expect(panel()).toHaveTextContent("Pause — still your turn");
  // The end the moment the voice decides it; its words and the seconds once they come, then what to change.
  step({ step: "ended" });
  expect(panel()).toHaveTextContent("Turn ended — the agent would answer now");
  step({ step: "heard", text: "Quiero que revises… el PR de ayer", endpoint_silence_ms: 900 });
  expect(panel()).toHaveTextContent("Turn ended after 0.9 s of silence — the agent would answer now");
  // What was heard shows once the try stops, in the same place.
  expect(document.getElementById("turn-try-heard")).toBeNull();
  // Only the latest turn: the next one starting takes its place.
  step({ step: "speaking" });
  expect(panel()).toHaveTextContent("You're talking…");
  expect(panel().querySelector(".stt-try-area")).not.toHaveTextContent("Turn ended");
  // The waveform is decoration.
  expect(panel().querySelector(".voice-wave, .voice-bars")?.closest("[aria-hidden]")).not.toBeNull();
});

test.each(variants)("%s: a screen reader hears whole messages, and only listening, the end without its words, and the stop", async (variant) => {
  const { step, start } = renderTurn({ variant });
  await start();
  expect(status()).toHaveTextContent(/^$/);
  step({ step: "listening", again: false });
  expect(status()).toHaveTextContent(/^Listening — start talking$/);
  step({ step: "speaking" });
  step({ step: "pause" });
  step({ step: "speaking" });
  expect(status()).toHaveTextContent(/^Listening — start talking$/);
  step({ step: "ended" });
  expect(status()).toHaveTextContent(/^Turn ended — the agent would answer now$/);
  step({ step: "heard", text: "hola", endpoint_silence_ms: 900 });
  expect(status()).toHaveTextContent(/^Turn ended — the agent would answer now$/);
  // An end the voice only told with its words is read out with its seconds.
  step({ step: "speaking" });
  step({ step: "heard", text: "otra vez", endpoint_silence_ms: 2500 });
  expect(status()).toHaveTextContent(/^Turn ended after 2.5 s of silence — the agent would answer now$/);
  const tryButton = button();
  await act(async () => { fireEvent.click(tryButton); });
  expect(button()).toBe(tryButton);
  expect(tryButton).toHaveTextContent("Try again");
  expect(status()).toHaveTextContent(/^The try was stopped\.$/);
  // Stopped, the last turn stays to be read.
  expect(document.getElementById("turn-try-heard")).toHaveTextContent("otra vez");
});

test.each(variants)("%s: a turn that did not count, or a new setting listening, is a notice for a moment, then listening; the same notice again is read again", async (variant) => {
  const { step, start } = renderTurn({ variant });
  await start();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  step({ step: "listening", again: false });
  step({ step: "speaking" });
  step({ step: "not-a-turn" });
  expect(panel()).toHaveTextContent("That didn't count as a turn — still listening");
  const first = status().textContent;
  expect(first).toMatch(/^That didn't count as a turn — still listening/);
  act(() => { vi.advanceTimersByTime(1999); });
  expect(panel()).toHaveTextContent("That didn't count as a turn — still listening");
  act(() => { vi.advanceTimersByTime(1); });
  expect(panel()).toHaveTextContent("Listening — start talking");
  step({ step: "speaking" });
  step({ step: "not-a-turn" });
  expect(status().textContent).not.toBe(first);
  // A new setting: the turn goes, the voice starts again, and listens again.
  step({ step: "speaking" });
  step({ step: "ended" });
  step({ step: "restarting" });
  expect(panel()).toHaveTextContent("Getting ready…");
  expect(panel().querySelector(".turn-try-state")).toBeNull();
  step({ step: "listening", again: true });
  expect(panel()).toHaveTextContent("Listening again with the new setting");
  expect(status()).toHaveTextContent(/^Listening again with the new setting/);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(panel()).toHaveTextContent("Listening — start talking");
  // A turn started meanwhile is not overwritten by the notice's end.
  step({ step: "not-a-turn" });
  step({ step: "speaking" });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(panel()).toHaveTextContent("You're talking…");
});

test.each(variants)("%s: nothing heard for 30 s stops the try; a failure says why in an alert; both offer it again", async (variant) => {
  const { actions, step, end, start } = renderTurn({ variant });
  await start();
  step({ step: "listening", again: false });
  await end(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  expect(panel()).toHaveTextContent("Nothing heard for 30 s, so the try stopped.");
  expect(status()).toHaveTextContent("Nothing heard for 30 s, so the try stopped.");
  expect(button()).toHaveTextContent("Try again");
  await start();
  expect(actions.tryTurnSettings).toHaveBeenCalledTimes(2);
  await end(Object.assign(new Error("The microphone is blocked for this page."), { code: "microphone-denied" }));
  expect(panel().querySelector('[role="alert"]')).toHaveTextContent("The microphone is blocked for this page.");
  expect(button()).toHaveTextContent("Try again");
});

test.each(variants)("%s: Smart without its model ready cannot be tried, and says why; switching to it while a try runs stops it, and says why", async (variant) => {
  const { actions, store, step, end, start } = renderTurn({ variant, turnInstalled: false });
  expect(button()).toHaveAttribute("aria-disabled", "true");
  const reason = document.getElementById(button().getAttribute("aria-describedby")!);
  expect(reason).toHaveTextContent("Get the end-of-turn model ready to try Smart.");
  fireEvent.click(button());
  expect(actions.tryTurnSettings).not.toHaveBeenCalled();
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(button()).not.toHaveAttribute("aria-disabled");
  await start();
  step({ step: "listening", again: false });
  // The controller stops a try that Smart without its model would take over.
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" } }));
  await end(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }));
  expect(status()).toHaveTextContent("Get the end-of-turn model ready to try Smart.");
  expect(button()).toHaveAttribute("aria-disabled", "true");
});

test.each(variants)("%s: transcription not ready on this device: nothing to hear the words with, and it says so", (variant) => {
  renderTurn({ variant, sttInstalled: false });
  expect(button()).toHaveAttribute("aria-disabled", "true");
  expect(document.getElementById(button().getAttribute("aria-describedby")!)).toHaveTextContent("The transcription model isn't ready yet.");
});

test("with Silence already at Calm, a cut-off's remedy is the smart end of turn", async () => {
  const { step, start } = renderTurn({ settings: { end_of_turn: "silence", patience: "calm" } });
  await start();
  step({ step: "heard", text: "hola", endpoint_silence_ms: 3500 });
  await act(async () => { fireEvent.click(button()); });
  expect(panel()).toHaveTextContent("Cut you off? Try Smart.");
  expect(panel()).not.toHaveTextContent("Choose Calm");
});

test.each(variants)("%s: leaving stops a try that runs — its section hidden, its dialog closed, or gone — and touches none that does not", async (variant) => {
  const { actions, show, start, view } = renderTurn({ variant });
  show(false);
  expect(actions.cancelVoiceTry).not.toHaveBeenCalled();
  show(true);
  await start();
  show(false);
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(1);
  show(true);
  await start();
  await act(async () => { panel().closest("dialog")!.dispatchEvent(new Event("close")); });
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(2);
  await start();
  view.unmount();
  expect(actions.cancelVoiceTry).toHaveBeenCalledTimes(3);
});

test("the card is its own block, titled, after the model's block (Smart) or after the choice (Silence), and stays put when the choice changes", async () => {
  const { store } = renderTurn();
  const card = panel();
  expect(card).toHaveAttribute("data-variant", "card");
  const row = card.closest(".ui-row")!;
  expect(row.querySelector(".ui-row-label")).toHaveTextContent("Try the end of turn");
  expect(row.previousElementSibling).toContainElement(document.getElementById("turn-model-card"));
  expect(card).toHaveAttribute("data-phase", "idle");
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(panel()).toBe(card);
  expect(card.closest(".ui-row")!.previousElementSibling).toContainElement(document.getElementById("voice-end-of-turn"));
});

test("in the first-run setup the try says nothing of what is kept: the choices there are the setup's", () => {
  renderTurn({ setup: true });
  expect(panel()).toHaveTextContent("Talk as you would to the agent, pausing to think. Headphones help.");
  expect(panel()).not.toHaveTextContent("Uses what's selected");
});

test("once stopped, the try's take shows in its card to be played, with its turn's marks; not while it runs, and a new try lets it go", async () => {
  const { step, start, end, take } = renderTurn();
  await start();
  step({ step: "listening", again: false });
  step({ step: "speaking" });
  step({ step: "heard", text: "hola", endpoint_silence_ms: 900 });
  const recorded: VoiceTake = { sampleRate: 16000, samples: new Float32Array(48000), started_at: 0, ended_at: 3000,
    turns: [{ turn_id: "t1", speech_ms: 400, pauses: [{ from_ms: 1000, to_ms: 1400 }], end_ms: 2600 }] };
  take(recorded);
  expect(document.getElementById("turn-try-take")).toBeNull();
  await end(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }));
  const card = panel().querySelector("#turn-try-take")!;
  expect(card).toHaveTextContent("Your recording");
  expect(card).toHaveTextContent("3.0 s recorded");
  expect(card).toHaveTextContent("speech starts at 0.4 s");
  expect(card).toHaveTextContent("pause from 1.0 to 1.4 s");
  expect(card).toHaveTextContent("turn ends at 2.6 s");
  expect(card.querySelector("button[aria-pressed='false']")).toHaveAccessibleName("Play your recording");
  await start();
  expect(document.getElementById("turn-try-take")).toBeNull();
  // Ended by a quiet stretch, what the microphone gave shows all the same.
  take({ ...recorded, turns: [] });
  await end(Object.assign(new Error("Nothing heard."), { code: "trial-silence" }));
  expect(document.getElementById("turn-try-take")).toHaveTextContent("no speech detected");
});

test("a voice that hands no take shows none (@sidevoice/voice 0.3.x, the desktop app's)", async () => {
  const { step, start, end } = renderTurn();
  await start();
  step({ step: "listening", again: false });
  step({ step: "heard", text: "hola", endpoint_silence_ms: 900 });
  await end(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }));
  expect(document.getElementById("turn-try-heard")).toHaveTextContent("hola");
  expect(document.getElementById("turn-try-take")).toBeNull();
});

test("laid out as the other tries: the button and the level on one row, then one area for the hint, the state and the result, then the take", async () => {
  const { step, start, end, take } = renderTurn();
  const head = () => panel().querySelector(".stt-try-head")!;
  const area = () => panel().querySelector(".stt-try-area")!;
  const wave = () => head().querySelector(".model-try-wave .voice-wave, .model-try-wave .voice-bars");
  expect(panel().querySelector(".turn-try-main, .model-try, .model-try-listening")).toBeNull();
  // Before a try: the button and the level, and the hint in the area.
  expect(head()).toContainElement(button());
  expect(wave()).not.toBeNull();
  expect(area()).toHaveTextContent("Talk as you would to the agent, pausing to think.");
  await start();
  expect(head()).toContainElement(button());
  expect(wave()).not.toBeNull();
  step({ step: "listening", again: false });
  expect(area().querySelector(".turn-try-state")).toHaveTextContent("Listening — start talking");
  expect(area()).not.toHaveTextContent("Talk as you would to the agent");
  step({ step: "speaking" });
  expect(area().querySelector(".turn-try-state")).toHaveTextContent("You're talking…");
  expect(wave()).not.toBeNull();
  step({ step: "heard", text: "Quiero que revises el PR", endpoint_silence_ms: 900 });
  expect(area()).toHaveTextContent("Turn ended after 0.9 s of silence — the agent would answer now");
  take({ sampleRate: 16000, samples: new Float32Array(16000), started_at: 0, ended_at: 1000, turns: [] });
  await end(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }));
  // Stopped: the result in the same area, the button and the level still on their row, the take after the area.
  const result = area().querySelector(".turn-try-result")!;
  expect(result).toContainElement(document.getElementById("turn-try-heard"));
  expect(result).toHaveTextContent("Quiero que revises el PR");
  expect(result).toHaveTextContent("Cut you off? Choose Calm. Slow to end? Choose Fast.");
  expect(head()).toContainElement(button());
  expect(button()).toHaveTextContent("Try again");
  expect(wave()).not.toBeNull();
  const recorded = document.getElementById("turn-try-take")!;
  expect(recorded).not.toBeNull();
  expect(area()).not.toContainElement(recorded);
  expect(area().compareDocumentPosition(recorded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
