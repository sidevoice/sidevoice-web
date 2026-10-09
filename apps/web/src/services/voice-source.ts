/* The page's models for its voice: @sidevoice/engine's models wired into @sidevoice/voice's model interfaces
 * (`js/voice-models.d.ts`). The voice names no model; this file chooses which one fills each slot:
 *
 * - the voice activity detector: the engine's Silero VAD (family `silero-vad`), else another `vad` model that runs
 *   here; never a person's choice;
 * - the transcriber and the speaker: the models and builds of the person's settings;
 * - the end-of-turn classifier: the engine's `end-of-turn` model, only when the settings choose `smart-turn`.
 *
 * It is the `source` @sidevoice/voice's `createVoiceHost` takes: `catalogue()` backs the seam's `models()`, and
 * `models(settings)` refuses with the seam's codes what this device cannot run before anything loads. Both packages
 * are typed here, so a version of one that no longer fits the other fails this page's type check. */
import type { EngineError, LoadedModel, Model, Progress, WebEngine } from "@sidevoice/engine";
import type {
  VoiceEndOfTurn, VoiceModels, VoiceModelSource, VoiceSettings, VoiceSpeaker, VoiceTranscriber, VoiceVad,
} from "@sidevoice/voice";

/** How the detector decides, as the voice's turn logic was written against: probability, and confirmation times. */
export const VAD_OPTIONS = { threshold: 0.6, minSilenceMs: 200, minSpeechMs: 400 };

/** A refusal with one of the seam's codes. */
export function voiceRefusal(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/** The model with `capability` that runs here (a build of it is available), of `family` when one is. */
function runnable(catalogue: Model[], capability: Model["capabilities"][number], family?: string): Model | null {
  const runs = catalogue.filter((model) => model.capabilities.includes(capability) && model.builds.some((build) => build.available));
  return runs.find((model) => model.family === family) ?? runs[0] ?? null;
}

/** Why `catalogue` cannot take `settings`, as the seam's code, or null when it can. */
export function settingsRefusal(catalogue: Model[], settings: VoiceSettings): string | null {
  for (const [task, stage] of [["stt", settings.stt], ["tts", settings.tts]] as const) {
    const model = catalogue.find((candidate) => candidate.id === stage.model);
    if (!model) return "model-unknown";
    if (!model.capabilities.includes(task)) return "model-wrong-task";
    if (stage.build != null && !model.builds.some((build) => build.id === stage.build && build.available)) return "build-unfit";
    // The automatic build is one that runs here: with none, the model cannot be loaded on this device.
    if (stage.build == null && !model.builds.some((build) => build.available)) return "model-unfit";
  }
  if (!runnable(catalogue, "vad")) return "vad-unavailable";
  if (settings.end_of_turn === "smart-turn" && !runnable(catalogue, "end-of-turn")) return "end-of-turn-unavailable";
  return null;
}

/** The engine's VAD as the voice's: one stream, its frames as they come. */
async function vadOf(model: LoadedModel): Promise<VoiceVad> {
  const vad = model.asVad();
  if (!vad) throw voiceRefusal("model-wrong-task");
  const stream = await vad.stream(VAD_OPTIONS);
  // The voice feeds 16 kHz mono; a detector at another rate would decide on audio it misreads.
  if (stream.sampleRate !== 16000) throw voiceRefusal("vad-sample-rate", `the detector runs at ${stream.sampleRate} Hz`);
  return {
    accept: async (samples) => (await stream.accept(samples)).frames,
    reset: () => stream.reset(),
  };
}

function transcriberOf(model: LoadedModel): VoiceTranscriber {
  const stt = model.asStt();
  if (!stt) throw voiceRefusal("model-wrong-task");
  return { transcribe: (samples, sampleRate, language) => stt.transcribe(samples, sampleRate, language ?? null) };
}

/** The engine's TTS as the voice's speaker: with no voice chosen, the model's first (for a provider, the account's). */
function speakerOf(model: LoadedModel): VoiceSpeaker {
  const tts = model.asTts();
  if (!tts) throw voiceRefusal("model-wrong-task");
  let first: Promise<string> | null = null;
  const firstVoice = () => (first ??= tts.voices().then((voices) => {
    if (!voices.length) throw voiceRefusal("voice-missing");
    return voices[0].id;
  }));
  return { speak: async (text, voice, language, speed) => tts.speak(text, voice ?? await firstVoice(), language ?? null, speed) };
}

function endOfTurnOf(model: LoadedModel): VoiceEndOfTurn {
  const classifier = model.asEndOfTurn();
  if (!classifier) throw voiceRefusal("model-wrong-task");
  return { endOfTurn: (samples, sampleRate) => classifier.probability(samples, sampleRate) };
}

/** An engine failure as the seam's: its code kept. */
function asRefusal(error: unknown): Error {
  const code = (error as Partial<EngineError> | null)?.code;
  return code ? voiceRefusal(code, (error as Error).message) : (error as Error);
}

export interface VoiceSourceOptions {
  /** How far loading has got, per model id. */
  onProgress?: (model: string, progress: Progress) => void;
}

/** The page's source of models for `createVoiceHost`, over `engine`. */
export function engineVoiceSource(engine: WebEngine, { onProgress }: VoiceSourceOptions = {}): VoiceModelSource {
  const progress = (model: string) => (value: Progress) => onProgress?.(model, value);
  return {
    catalogue: () => engine.models(),
    async models(settings: VoiceSettings): Promise<VoiceModels> {
      const catalogue = await engine.models();
      const refusal = settingsRefusal(catalogue, settings);
      if (refusal) throw voiceRefusal(refusal);
      const vad = runnable(catalogue, "vad", "silero-vad")!;
      const endOfTurn = settings.end_of_turn === "smart-turn" ? runnable(catalogue, "end-of-turn") : null;
      const load = (model: string, build: string | null | undefined) => engine.load(model, build ?? null, progress(model)).catch((error: unknown) => { throw asRefusal(error); });
      return {
        async load() {
          const [detector, stt, tts, classifier] = await Promise.all([
            load(vad.id, null),
            load(settings.stt.model, settings.stt.build),
            load(settings.tts.model, settings.tts.build),
            endOfTurn ? load(endOfTurn.id, null) : Promise.resolve(null),
          ]);
          return {
            vad: await vadOf(detector),
            transcriber: transcriberOf(stt),
            speaker: speakerOf(tts),
            ...(classifier ? { endOfTurn: endOfTurnOf(classifier) } : {}),
          };
        },
      };
    },
  };
}
