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

/* Trying the end of turn where it is chosen, in both places the `turn-try` variant puts it: the actions stand in for
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

const variants = ["strip", "card"] as const;

/** The end-of-turn choices with their try, on `settings`; the try runs until the test tells it why it ended. */
function renderTurn({ variant = "strip" as (typeof variants)[number], settings = {} as Partial<DeviceVoiceSettings>, turnInstalled = true, sttInstalled = true, setup = false } = {}) {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "turn-try": variant }));
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
  expect(document.getElementById("turn-try-heard")).toHaveTextContent("Quiero que revises… el PR de ayer");
  expect(panel()).toHaveTextContent("Cut you off? Choose Calm. Slow to end? Choose Fast.");
  // Only the latest turn: the next one starting takes its place.
  step({ step: "speaking" });
  expect(document.getElementById("turn-try-heard")).toBeNull();
  expect(panel()).toHaveTextContent("You're talking…");
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

test("the strip sits right under the end-of-turn choice, above the model's block, and stays put when the choice changes", async () => {
  const { store, step, start } = renderTurn({ variant: "strip" });
  const strip = panel();
  expect(strip).toHaveAttribute("data-variant", "strip");
  expect(document.getElementById("voice-end-of-turn")!.closest(".ui-row")!.nextElementSibling).toBe(strip);
  expect(strip.nextElementSibling).toContainElement(document.getElementById("turn-model-card"));
  await start();
  step({ step: "listening", again: false });
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(panel()).toBe(strip);
  expect(document.getElementById("turn-model-card")).toBeNull();
  expect(panel()).toHaveTextContent("Listening — start talking");
});

test("the card is its own block, titled, after the model's block (Smart) or after the choice (Silence), and stays put when the choice changes", async () => {
  const { store } = renderTurn({ variant: "card" });
  const card = panel();
  expect(card).toHaveAttribute("data-variant", "card");
  const row = card.closest(".ui-row")!;
  expect(row.querySelector(".ui-row-label")).toHaveTextContent("Try the end of turn");
  expect(row.previousElementSibling).toContainElement(document.getElementById("turn-model-card"));
  expect(card.querySelector(".model-try")).toHaveAttribute("data-phase", "idle");
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } }));
  expect(panel()).toBe(card);
  expect(card.closest(".ui-row")!.previousElementSibling).toContainElement(document.getElementById("voice-end-of-turn"));
});

test("in the first-run setup the try says nothing of what is kept: the choices there are the setup's", () => {
  renderTurn({ setup: true });
  expect(panel()).toHaveTextContent("Talk as you would to the agent, pausing to think. Headphones help.");
  expect(panel()).not.toHaveTextContent("Uses what's selected");
});
