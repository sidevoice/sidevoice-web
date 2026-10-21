import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { useRoomStore } from "../../state/room-store";
import { TURN_BOUNDS, TURN_TUNING, type TurnTuning } from "../../services/voice-settings.js";

/* "Turn tuning (dev)": a developer tool to tune the turn and barge-in numbers in real calls. It lives in Settings ›
 * Developer options (DeveloperOptions.tsx), hidden from normal users, and is deliberately English-only and outside the
 * i18n catalogues. Every change goes through
 * the same `editVoice` action as the rest of Settings, so it is stored in the device settings and reaches a call in
 * progress (audio_grace_ms at once, the input numbers from the next turn; on desktop fade_ms is fixed at 30 ms natively). */

/** The flag that shows Developer options without developer mode, which only a nightly desktop build has: a browser, a
 *  playground. It is set by hand: `localStorage.sidevoiceDevTurnTuning = "1"` and reload, or open the app with
 *  `?devTurnTuning=1` once (it is then kept in localStorage); `?devTurnTuning=0` turns it off. */
export const DEV_TURN_TUNING_KEY = "sidevoiceDevTurnTuning";

export function turnTuningDevEnabled(storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage, search: string = typeof location === "undefined" ? "" : location.search): boolean {
  try {
    const asked = new URLSearchParams(search).get("devTurnTuning");
    if (asked === "1") storage?.setItem(DEV_TURN_TUNING_KEY, "1");
    else if (asked === "0") storage?.removeItem(DEV_TURN_TUNING_KEY);
    return storage?.getItem(DEV_TURN_TUNING_KEY) === "1";
  } catch {
    return false;
  }
}

type Patch = Parameters<NonNullable<typeof window.sidevoiceActions>["editVoice"]>[0];
const edit = (patch: Patch) => window.sidevoiceActions?.editVoice(patch);

type Control = { id: string; label: string; unit: string; bound: keyof typeof TURN_BOUNDS; step: number; read: (turn: TurnTuning) => number; patch: (value: number) => NonNullable<Patch["turn"]> };
const CONTROLS: Control[] = [
  { id: "playing", label: "Listening bar, agent playing", unit: "0-1", bound: "playing", step: 0.01, read: (t) => t.listening_bar.playing, patch: (v) => ({ listening_bar: { playing: v } }) },
  { id: "quiet", label: "Listening bar, quiet", unit: "0-1", bound: "quiet", step: 0.01, read: (t) => t.listening_bar.quiet, patch: (v) => ({ listening_bar: { quiet: v } }) },
  { id: "barge_in_min_speech", label: "Barge-in min speech", unit: "s", bound: "barge_in_min_speech", step: 0.05, read: (t) => t.barge_in_min_speech, patch: (v) => ({ barge_in_min_speech: v }) },
  { id: "barge_in_window", label: "Barge-in window", unit: "x", bound: "barge_in_window", step: 0.1, read: (t) => t.barge_in_window, patch: (v) => ({ barge_in_window: v }) },
  { id: "vad_confidence", label: "VAD confidence", unit: "0-1", bound: "vad_confidence", step: 0.01, read: (t) => t.vad_confidence, patch: (v) => ({ vad_confidence: v }) },
  { id: "speech_start_ms", label: "Speech start", unit: "ms", bound: "speech_start_ms", step: 10, read: (t) => t.speech_start_ms, patch: (v) => ({ speech_start_ms: v }) },
  { id: "pre_roll_ms", label: "Pre-roll", unit: "ms", bound: "pre_roll_ms", step: 50, read: (t) => t.pre_roll_ms, patch: (v) => ({ pre_roll_ms: v }) },
  { id: "audio_grace_ms", label: "Audio grace", unit: "ms", bound: "audio_grace_ms", step: 50, read: (t) => t.audio_grace_ms, patch: (v) => ({ audio_grace_ms: v }) },
  { id: "fade_ms", label: "Fade", unit: "ms", bound: "fade_ms", step: 5, read: (t) => t.fade_ms, patch: (v) => ({ fade_ms: v }) },
];

/** The panel's presets: A is the defaults (tuned by the operator in real calls, 2026-10-21); B more eager and C more
 *  tolerant than A, each around it. */
export const TURN_PRESETS: Record<"A" | "B" | "C", { name: string; turn: NonNullable<Patch["turn"]> }> = {
  A: { name: "A (defaults)", turn: { ...TURN_TUNING, listening_bar: { ...TURN_TUNING.listening_bar } } },
  B: { name: "B (eager)", turn: { listening_bar: { quiet: 0.45, playing: 0.55 }, barge_in_min_speech: 0.3, barge_in_window: 2.5, vad_confidence: 0.6, speech_start_ms: 100, pre_roll_ms: 1000, audio_grace_ms: 200, fade_ms: 15 } },
  C: { name: "C (tolerant)", turn: { listening_bar: { quiet: 0.55, playing: 0.7 }, barge_in_min_speech: 0.8, barge_in_window: 2, vad_confidence: 0.7, speech_start_ms: 300, pre_roll_ms: 1000, audio_grace_ms: 800, fade_ms: 60 } },
};

export function TurnTuningDev() {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const active = useRoomStore((state) => state.facts.voiceSettings);
  if (!draft) return null;
  const turn = draft.turn;
  return <Group title="Turn tuning (dev)">
    <Row label="Developer tool" description="Applies to the call in progress and is kept on this device. English only.">
      <div className="turn-tuning-dev-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(TURN_PRESETS) as (keyof typeof TURN_PRESETS)[]).map((key) =>
          <Button key={key} type="button" size="sm" variant="ghost" onClick={() => edit({ turn: TURN_PRESETS[key].turn })}>{"Preset " + TURN_PRESETS[key].name}</Button>)}
        <Button type="button" size="sm" variant="ghost" id="turn-tuning-reset" onClick={() => edit({ turn: TURN_PRESETS.A.turn })}>Reset to defaults</Button>
      </div>
    </Row>
    {CONTROLS.map((control) => {
      const bound = TURN_BOUNDS[control.bound];
      const value = control.read(turn), fallback = control.read(TURN_TUNING);
      const inUse = active ? control.read(active.turn) : value;
      // `above` bounds exclude their minimum: the slider starts one step above it.
      const min = bound.above ? Math.max(control.step, bound.min + control.step) : bound.min;
      const set = (next: number) => { if (Number.isFinite(next)) edit({ turn: control.patch(next) }); };
      return <Row key={control.id} label={control.label} htmlFor={"turn-" + control.id}
        description={`${control.unit}, ${bound.above ? ">" : ""}${bound.min} to ${bound.max}. Default ${fallback}${value === fallback ? "" : " (changed)"}. Active ${inUse}.`}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="range" aria-label={control.label + " slider"} min={min} max={bound.max} step={control.step} value={value} onChange={(event) => set(Number(event.target.value))} />
          <input id={"turn-" + control.id} type="number" min={min} max={bound.max} step={control.step} value={value} style={{ width: 80 }} onChange={(event) => set(event.target.valueAsNumber)} />
        </span>
      </Row>;
    })}
    <Row label="Active turn settings" block><code id="turn-tuning-active" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify((active ?? draft).turn)}</code></Row>
  </Group>;
}
