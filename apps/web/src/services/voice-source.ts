/* The page's models for its voice: @sidevoice/engine's models wired into @sidevoice/voice's model interfaces
 * (`js/voice-models.d.ts`). The voice names no model; this file chooses which one fills each slot:
 *
 * - the voice activity detector: the local catalogue's Silero VAD (family `silero-vad`), else another `vad` model that
 *   runs here; never a person's choice;
 * - the transcriber and the speaker: the models of the person's settings, each `{catalog, model}`, loaded from that
 *   catalogue (`engine.catalog(catalog).load(model)`); a slot marked `unused` (a try of the other one) is neither
 *   checked nor loaded, and refuses what it would be asked to do;
 * - the end-of-turn classifier: the local catalogue's `end-of-turn` model, only when the settings choose `smart-turn`.
 *
 * It is the `source` @sidevoice/voice's `createVoiceHost` takes: `models(settings)` refuses with a code what this
 * device cannot run before anything loads. Both packages are typed here, so a version of one that no longer fits the
 * other fails this page's type check. */
import type { Catalog, EngineError, LocalModelInfo, Model, ModelInfo, Progress, WebEngine } from "@sidevoice/engine";
import type {
  VoiceEndOfTurn, VoiceModels, VoiceModelSource, VoiceSettings, VoiceSpeaker, VoiceTranscriber, VoiceVad,
} from "@sidevoice/voice";
import { LOCAL_CATALOG } from "./model-catalogs.js";
import { engineFailureCode } from "./failure-code.js";

/** How the detector decides, as the voice's turn logic was written against: probability, and confirmation times. */
export const VAD_OPTIONS = { threshold: 0.6, minSilenceMs: 200, minSpeechMs: 400 };

type Capability = ModelInfo["capabilities"][number];
/** A slot's model as the settings name it. */
interface ModelChoice { catalog: string; model: string; build?: string }

/** A refusal with a code, and what a provider said when it is the one refusing. */
export function voiceRefusal(code: string, message = code, detail?: string): Error & { code: string; detail?: string } {
  return Object.assign(new Error(message), { code }, detail ? { detail } : {});
}

/** An engine failure as the voice's: its code (a platform exception's name), and the provider's detail, kept. */
function asRefusal(error: unknown): Error {
  const code = engineFailureCode(error, "");
  return code ? voiceRefusal(code, (error as Error).message, (error as Partial<EngineError>).detail) : (error as Error);
}

/** A slot no call of these settings uses: a try of the other slot's marks it (voice-trial.js `settingsToTry`). */
const isUnused = (slot: VoiceSettings["stt"] | VoiceSettings["tts"]) => (slot as { unused?: unknown }).unused === true;

/** `choice` as the settings hold it, or null when it does not name a catalogue and a model. */
function choiceOf(slot: VoiceSettings["stt"] | VoiceSettings["tts"]): ModelChoice | null {
  const { catalog, model, build } = slot as Partial<ModelChoice>;
  return typeof catalog === "string" && catalog && typeof model === "string" && model
    ? { catalog, model, ...(typeof build === "string" && build ? { build } : {}) } : null;
}

/** Whether a local model can run here: a build of it is available. */
const runsHere = (model: LocalModelInfo) => model.builds.some((build) => build.available);

/** The local model with `capability` that runs here, of `family` when one is. */
function runnable(models: LocalModelInfo[], family?: string): LocalModelInfo | null {
  const runs = models.filter(runsHere);
  return runs.find((model) => model.family === family) ?? runs[0] ?? null;
}

/** The catalogue `id` of `engine`, or a refusal when it has none. */
function catalogOf(engine: WebEngine, id: string): Catalog {
  try {
    return engine.catalog(id);
  } catch (error) {
    throw asRefusal(error);
  }
}

/** Why `choice` cannot fill a slot of `capability`, as a refusal, or null when it can: its catalogue lists it, for the
 *  task, and a local one runs here. A catalogue that cannot list its models refuses with its own code. */
async function choiceRefusal(engine: WebEngine, choice: ModelChoice, capability: Capability): Promise<Error | null> {
  const listed = (await catalogOf(engine, choice.catalog).models(capability).catch((error: unknown) => { throw asRefusal(error); })) as ModelInfo[];
  const model = listed.find((candidate) => candidate.id === choice.model);
  if (!model) return voiceRefusal("model-unknown");
  if (choice.catalog === LOCAL_CATALOG && !runsHere(model as LocalModelInfo)) return voiceRefusal("model-unfit");
  return null;
}

/** The engine's VAD as the voice's: one stream, its frames as they come. */
async function vadOf(model: Model): Promise<VoiceVad> {
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

function transcriberOf(model: Model): VoiceTranscriber {
  const stt = model.asStt();
  if (!stt) throw voiceRefusal("model-wrong-task");
  return { transcribe: (samples, sampleRate, language) => stt.transcribe(samples, sampleRate, language ?? null).catch((error: unknown) => { throw asRefusal(error); }) };
}

/** The engine's TTS as the voice's speaker: with no voice chosen, the model's first (for a provider, the account's). */
function speakerOf(model: Model): VoiceSpeaker {
  const tts = model.asTts();
  if (!tts) throw voiceRefusal("model-wrong-task");
  let first: Promise<string> | null = null;
  const firstVoice = () => (first ??= tts.voices().then((voices) => {
    if (!voices.length) throw voiceRefusal("voice-missing");
    return voices[0].id;
  }));
  return {
    speak: async (text, voice, language, speed) =>
      tts.speak(text, voice ?? await firstVoice(), language ?? null, speed).catch((error: unknown) => { throw asRefusal(error); }),
  };
}

/** What an unused slot answers if it is asked after all. */
const NOT_LOADED = () => { throw voiceRefusal("model-unused"); };
const unusedTranscriber: VoiceTranscriber = { transcribe: NOT_LOADED };
const unusedSpeaker: VoiceSpeaker = { speak: NOT_LOADED };

function endOfTurnOf(model: Model): VoiceEndOfTurn {
  const classifier = model.asEndOfTurn();
  if (!classifier) throw voiceRefusal("model-wrong-task");
  return { endOfTurn: (samples, sampleRate) => classifier.probability(samples, sampleRate) };
}

export interface VoiceSourceOptions {
  /** How far loading has got, per model id. */
  onProgress?: (model: string, progress: Progress) => void;
}

/** The page's source of models for `createVoiceHost`, over `engine`. */
export function engineVoiceSource(engine: WebEngine, { onProgress }: VoiceSourceOptions = {}): VoiceModelSource {
  const progress = (model: string) => (value: Progress) => onProgress?.(model, value);
  // A build the person chose (Settings, "How it runs") is loaded as such; else the engine picks one installed that runs.
  const load = (choice: ModelChoice) => ((choice.build && choice.catalog === "local"
    ? engine.load(choice.model, choice.build, progress(choice.model))
    : catalogOf(engine, choice.catalog).load(choice.model, progress(choice.model))) as Promise<Model>)
    .catch((error: unknown) => { throw asRefusal(error); });
  return {
    async models(settings: VoiceSettings): Promise<VoiceModels> {
      // A slot in use names a model; one unused names none to check.
      const stt = isUnused(settings.stt) ? null : choiceOf(settings.stt), tts = isUnused(settings.tts) ? null : choiceOf(settings.tts);
      if ((!stt && !isUnused(settings.stt)) || (!tts && !isUnused(settings.tts))) throw voiceRefusal("model-unknown");
      const refusal = (stt && await choiceRefusal(engine, stt, "stt")) || (tts && await choiceRefusal(engine, tts, "tts"));
      if (refusal) throw refusal;
      const local = engine.localCatalog();
      const vad = runnable(await local.models("vad"), "silero-vad");
      if (!vad) throw voiceRefusal("vad-unavailable");
      // The end-of-turn model chosen (Settings → Call), when it runs here; else the first that does.
      const turnModels = settings.end_of_turn === "smart-turn" ? (await local.models("end-of-turn")).filter(runsHere) : [];
      const chosenTurn = (settings as { turn_model?: unknown }).turn_model;
      const endOfTurn = turnModels.find((model) => model.id === chosenTurn) ?? turnModels[0] ?? null;
      if (settings.end_of_turn === "smart-turn" && !endOfTurn) throw voiceRefusal("end-of-turn-unavailable");
      return {
        async load() {
          const [detector, transcriber, speaker, classifier] = await Promise.all([
            load({ catalog: LOCAL_CATALOG, model: vad.id }),
            stt && load(stt),
            tts && load(tts),
            endOfTurn ? load({ catalog: LOCAL_CATALOG, model: endOfTurn.id }) : Promise.resolve(null),
          ]);
          return {
            createVad: () => vadOf(detector),
            transcriber: transcriber ? transcriberOf(transcriber) : unusedTranscriber,
            speaker: speaker ? speakerOf(speaker) : unusedSpeaker,
            ...(classifier ? { endOfTurn: endOfTurnOf(classifier) } : {}),
          };
        },
      };
    },
  };
}
