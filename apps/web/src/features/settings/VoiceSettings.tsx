import { useMemo } from "react";
import { useRoomStore } from "../../state/room-store";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { Button } from "../../components/ui/Button";
import { voiceChoices, SPEED, PROVIDER_NAMES, type DeviceVoiceSettings as Settings } from "../../services/voice-settings.js";
import { SPEECH_LANGUAGES } from "../../services/system-language.js";

/* The call's voice as the person chooses it: what transcribes, what speaks and with which voice, and when a turn ends.
 * The choices are the voice's own catalogue; what does not run here is listed greyed out, with why. Save keeps them. */

const PATIENCE: [string, string][] = [["fast", "Rápida: las pausas cortas cierran el turno"], ["normal", "Normal"], ["calm", "Tranquila: las pausas largas son parte del turno"]];

function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "es"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

type Option = { id: string; provider: string | null; disabled: boolean; note: string };
type Build = { id: string; label: string; disabled: boolean; note: string };

function ModelSelect({ id, value, options, onChange }: { id: string; value: string; options: Option[]; onChange: (model: string) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled && option.id !== value}>
          {option.id}{option.provider ? " · " + PROVIDER_NAMES[option.provider as keyof typeof PROVIDER_NAMES] : ""}{option.note ? " — " + option.note : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

function BuildSelect({ id, value, builds, recommended, onChange }: { id: string; value: string | null; builds: Build[]; recommended: string | null; onChange: (build: string | null) => void }) {
  if (!builds.length) return null;
  return (
    <label>Compilación
      <NativeSelect id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Automática{recommended ? " (" + recommended + ")" : ""}</option>
        {builds.map((build) => <option key={build.id} value={build.id} disabled={build.disabled && build.id !== value}>{build.label}{build.note ? " — " + build.note : ""}</option>)}
      </NativeSelect>
    </label>
  );
}

function VoiceChoices({ draft }: { draft: Settings }) {
  const models = useRoomStore((state) => state.facts.voiceCatalogue.models);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  const choices = useMemo(() => voiceChoices(models, draft, keys, SPEECH_LANGUAGES), [models, draft, keys]);
  const edit = (patch: Parameters<NonNullable<typeof window.sidevoiceActions>["editVoice"]>[0]) => window.sidevoiceActions?.editVoice(patch);
  const note = (options: Option[], value: string) => options.find((option) => option.id === value)?.note;
  return (
    <>
      <fieldset className="voice-stage">
        <legend>Transcripción</legend>
        <label>Modelo<ModelSelect id="stt-model" value={draft.stt.model} options={choices.stt.options} onChange={(model) => edit({ stt: { model } })} /></label>
        {note(choices.stt.options, draft.stt.model) ? <p className="muted">{note(choices.stt.options, draft.stt.model)}</p> : null}
        <BuildSelect id="stt-build" value={draft.stt.build} builds={choices.stt.builds} recommended={choices.stt.recommendedBuild} onChange={(build) => edit({ stt: { build } })} />
        <label>Idioma
          <NativeSelect id="stt-language" value={draft.stt.language ?? ""} onChange={(event) => edit({ stt: { language: event.target.value || null } })}>
            <option value="">Detectarlo</option>
            {choices.stt.languages.map((tag) => <option key={tag} value={tag}>{languageName(tag)}</option>)}
          </NativeSelect>
        </label>
      </fieldset>
      <fieldset className="voice-stage">
        <legend>Voz</legend>
        <label>Modelo<ModelSelect id="tts-model" value={draft.tts.model} options={choices.tts.options} onChange={(model) => edit({ tts: { model } })} /></label>
        {note(choices.tts.options, draft.tts.model) ? <p className="muted">{note(choices.tts.options, draft.tts.model)}</p> : null}
        <BuildSelect id="tts-build" value={draft.tts.build} builds={choices.tts.builds} recommended={choices.tts.recommendedBuild} onChange={(build) => edit({ tts: { build } })} />
        {choices.tts.voices.length ? (
          <label>Voz
            <NativeSelect id="tts-voice" value={draft.tts.voice ?? ""} onChange={(event) => edit({ tts: { voice: event.target.value || null } })}>
              <option value="">La primera del modelo</option>
              {choices.tts.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.id}{voice.languages.length ? " · " + voice.languages.map(languageName).join(", ") : ""}</option>)}
            </NativeSelect>
          </label>
        ) : <p className="muted" id="tts-voice-note">{choices.tts.voiceNote}</p>}
        <label>Velocidad <output id="tts-speed-value">{draft.tts.speed.toFixed(2)}×</output>
          <input id="tts-speed" type="range" min={SPEED.min} max={SPEED.max} step={SPEED.step} value={draft.tts.speed} onChange={(event) => edit({ tts: { speed: Number(event.target.value) } })} />
        </label>
      </fieldset>
      <fieldset className="voice-stage">
        <legend>Turnos</legend>
        <label>Paciencia
          <NativeSelect id="voice-patience" value={draft.patience} onChange={(event) => edit({ patience: event.target.value as Settings["patience"] })}>
            {PATIENCE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        </label>
        <label>Fin del turno
          <NativeSelect id="voice-end-of-turn" value={draft.end_of_turn} onChange={(event) => edit({ end_of_turn: event.target.value as Settings["end_of_turn"] })}>
            <option value="silence">Silencio</option>
            <option value="smart-turn" disabled={!choices.endOfTurn.smartTurn && draft.end_of_turn !== "smart-turn"}>Inteligente (Smart Turn)</option>
          </NativeSelect>
        </label>
        {choices.endOfTurn.note ? <p className="muted" id="end-of-turn-note">{choices.endOfTurn.note}</p> : null}
      </fieldset>
    </>
  );
}

export function VoiceSettings() {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  return (
    <section id="pane-voice" aria-labelledby="settings-voice" hidden>
      <h3>Voz de la llamada</h3>
      <p className="muted">Se guarda en este dispositivo y se aplica en él: la sala solo recibe texto.</p>
      {catalogue.state === "loading" || catalogue.state === "idle" ? <p className="muted" role="status">Cargando los modelos de la voz…</p> : null}
      {catalogue.state === "failed" ? (
        <p role="alert" className="voice-catalogue-error">{catalogue.error} <Button id="voice-catalogue-retry" variant="ghost" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>Reintentar</Button></p>
      ) : null}
      {catalogue.state === "ready" && draft ? <VoiceChoices draft={draft} /> : null}
      <p className="muted">Durante una llamada, cambiar un modelo, su compilación o el fin del turno reinicia la voz un momento: lo que estés diciendo se descarta y la respuesta que suena se corta. El idioma, la voz, la velocidad y la paciencia se aplican sin cortar.</p>
    </section>
  );
}
