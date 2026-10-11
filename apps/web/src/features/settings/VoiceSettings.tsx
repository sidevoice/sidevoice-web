import { useMemo } from "react";
import { useRoomStore } from "../../state/room-store";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { Button } from "../../components/ui/Button";
import { voiceChoices, SPEED, type DeviceVoiceSettings as Settings, type Note } from "../../services/voice-settings.js";
import { SPEECH_LANGUAGES } from "../../services/system-language.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { ProviderKey } from "./ProviderKeys";
import { ModelCard, VoiceTry, useModelState } from "./ModelSetup";

/* The call's voice as the person chooses it: for what transcribes and what speaks, a source first — this device, or a
 * remote provider — then a model of it; then the voice, and when a turn ends. The choices are the engine's catalogues;
 * what cannot be chosen is listed greyed out, with why. Save keeps them. */

function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** What the pane says about a choice, in words: its message, why a model does not run here, a provider's own words. */
function noteText(t: HostTranslate, note: Note | null | undefined) {
  if (!note) return "";
  const reasons = note.reasons?.map((code) => t(("voice.unfit." + code) as HostMessageKey)).join("; ");
  const code = note.key === "voice.catalog.reason" ? note.params?.code : null;
  const text = code === "credential-missing" ? t("voice.catalog.noKey")
    : code === "storage-blocked" ? t("storage.blocked")
    : t(note.key as HostMessageKey, { ...note.params, ...(reasons ? { reasons } : {}) });
  return note.detail ? text + " — " + note.detail : text;
}

type Source = { id: string; local: boolean; name: string | null; disabled: boolean; note: Note | null };
type Option = { id: string; group: string | null; disabled: boolean; note: Note | null };

function SourceSelect({ id, value, sources, onChange, t }: { id: string; value: string; sources: Source[]; onChange: (catalog: string) => void; t: HostTranslate }) {
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {sources.map((source) => (
        <option key={source.id} value={source.id} disabled={source.disabled}>
          {source.local ? t("voice.source.local") : source.name ?? source.id}{source.note ? " — " + noteText(t, source.note) : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

/** A source's models, those of one family together (a remote provider's have none). */
function ModelSelect({ id, value, options, onChange, t }: { id: string; value: string; options: Option[]; onChange: (model: string) => void; t: HostTranslate }) {
  const option = (choice: Option) => (
    <option key={choice.id} value={choice.id} disabled={choice.disabled}>{choice.id}{choice.note ? " — " + noteText(t, choice.note) : ""}</option>
  );
  const groups = [...new Set(options.map((choice) => choice.group))];
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {groups.map((group) => group === null
        ? options.filter((choice) => choice.group === null).map(option)
        : <optgroup key={group} label={group}>{options.filter((choice) => choice.group === group).map(option)}</optgroup>)}
    </NativeSelect>
  );
}

function SlotNote({ id, note, t }: { id: string; note: Note | null | undefined; t: HostTranslate }) {
  return note ? <p className="muted" id={id}>{noteText(t, note)}</p> : null;
}

type Edit = Parameters<NonNullable<typeof window.sidevoiceActions>["editVoice"]>[0];
const edit = (patch: Edit) => window.sidevoiceActions?.editVoice(patch);
const chosen = (options: Option[], value: string) => options.find((option) => option.id === value)?.note;
const sourceNote = (sources: Source[], value: string) => sources.find((source) => source.id === value)?.note;
const keyless = (note: Note | null | undefined) => note?.key === "voice.catalog.reason" && note.params?.code === "credential-missing";

/** What a slot offers, from the engine's catalogues and the settings being edited. */
function useChoices(draft: Settings) {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  return useMemo(() => voiceChoices(catalogs, draft, SPEECH_LANGUAGES), [catalogs, draft]);
}

/** The sources of a slot. With `keysInPlace`, a provider that only lacks its key can be chosen, and asks for it below. */
function SlotSource({ slot, draft, sources, keysInPlace, t }: { slot: "stt" | "tts"; draft: Settings; sources: Source[]; keysInPlace: boolean; t: HostTranslate }) {
  const offered = keysInPlace ? sources.map((source) => keyless(source.note) ? { ...source, disabled: false } : source) : sources;
  const note = sourceNote(sources, draft[slot].catalog);
  const provider = keysInPlace && keyless(note) ? sources.find((source) => source.id === draft[slot].catalog) : null;
  return <>
    <label>{t("voice.source")}<SourceSelect id={slot + "-source"} value={draft[slot].catalog} sources={offered} onChange={(catalog) => edit({ [slot]: { catalog } })} t={t} /></label>
    <SlotNote id={slot + "-source-note"} note={note} t={t} />
    {provider && <ProviderKey provider={provider.id} name={provider.name ?? provider.id} t={t} />}
  </>;
}

/** Where speech is transcribed: source, model, language. */
/** `setup`: as in the first-run setup, a provider's missing key asked for in place, and the model's main action (its
 *  download, its try) left to the dialog's footer; in Settings the card and the try carry their own. */
type SlotProps = { draft: Settings; setup?: boolean };

export function TranscriptionChoices({ draft, setup = false }: SlotProps) {
  const t = hostTranslator();
  const choices = useChoices(draft);
  const model = useModelState("stt", draft);
  return <>
    <SlotSource slot="stt" draft={draft} sources={choices.stt.sources} keysInPlace={setup} t={t} />
    <label>{t("voice.model")}<ModelSelect id="stt-model" value={draft.stt.model} options={choices.stt.options} onChange={(model) => edit({ stt: { model } })} t={t} /></label>
    <SlotNote id="stt-model-note" note={chosen(choices.stt.options, draft.stt.model)} t={t} />
    <ModelCard task="stt" state={model} actionsInFooter={setup} />
    {/* Its options once it is ready to use. */}
    {model.ready && <><label>{t("voice.language")}
      <NativeSelect id="stt-language" value={draft.stt.language ?? ""} onChange={(event) => edit({ stt: { language: event.target.value || null } })}>
        <option value="">{t("voice.language.detect")}</option>
        {choices.stt.languages.map((tag: string) => <option key={tag} value={tag}>{languageName(tag)}</option>)}
      </NativeSelect>
    </label>
    {!setup && <VoiceTry task="stt" draft={draft} ready={model.ready} />}</>}
  </>;
}

/** How replies sound: source, model, voice, speed. */
export function SpeechChoices({ draft, setup = false }: SlotProps) {
  const t = hostTranslator();
  const choices = useChoices(draft);
  const model = useModelState("tts", draft);
  const speed = choices.tts.speed;
  return <>
    <SlotSource slot="tts" draft={draft} sources={choices.tts.sources} keysInPlace={setup} t={t} />
    <label>{t("voice.model")}<ModelSelect id="tts-model" value={draft.tts.model} options={choices.tts.options} onChange={(model) => edit({ tts: { model } })} t={t} /></label>
    <SlotNote id="tts-model-note" note={chosen(choices.tts.options, draft.tts.model)} t={t} />
    <ModelCard task="tts" state={model} actionsInFooter={setup} />
    {/* Its voices and speed once it is ready to use. */}
    {model.ready && <>{choices.tts.voices.length ? (
      <label>{t("voice.voice")}
        <NativeSelect id="tts-voice" value={draft.tts.voice ?? ""} onChange={(event) => edit({ tts: { voice: event.target.value || null } })}>
          <option value="">{t("voice.voice.first")}</option>
          {choices.tts.voices.map((voice: { id: string; name: string | null; languages: string[] }) => <option key={voice.id} value={voice.id}>{voice.name ?? voice.id}{voice.languages.length ? " · " + voice.languages.map(languageName).join(", ") : ""}</option>)}
        </NativeSelect>
      </label>
    ) : <SlotNote id="tts-voice-note" note={choices.tts.voiceNote} t={t} />}
    {speed ? (
      <label>{t("voice.speed")} <output id="tts-speed-value">{draft.tts.speed.toFixed(2)}×</output>
        <input id="tts-speed" type="range" min={speed.min} max={speed.max} step={SPEED.step} value={draft.tts.speed} onChange={(event) => edit({ tts: { speed: Number(event.target.value) } })} />
      </label>
    ) : null}
    {!setup && <VoiceTry task="tts" draft={draft} ready={model.ready} />}</>}
  </>;
}

function TurnChoices({ draft, t }: { draft: Settings; t: HostTranslate }) {
  const choices = useChoices(draft);
  const patience: [Settings["patience"], HostMessageKey][] = [["fast", "voice.patience.fast"], ["normal", "voice.patience.normal"], ["calm", "voice.patience.calm"]];
  return <>
    <label>{t("voice.patience")}
      <NativeSelect id="voice-patience" value={draft.patience} onChange={(event) => edit({ patience: event.target.value as Settings["patience"] })}>
        {patience.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </NativeSelect>
    </label>
    <label>{t("voice.endOfTurn")}
      <NativeSelect id="voice-end-of-turn" value={draft.end_of_turn} onChange={(event) => edit({ end_of_turn: event.target.value as Settings["end_of_turn"] })}>
        <option value="silence">{t("voice.endOfTurn.silence")}</option>
        <option value="smart-turn" disabled={!choices.endOfTurn.smartTurn && draft.end_of_turn !== "smart-turn"}>{t("voice.endOfTurn.smart")}</option>
      </NativeSelect>
    </label>
    <SlotNote id="end-of-turn-note" note={choices.endOfTurn.note} t={t} />
  </>;
}

function VoiceChoices({ draft, t }: { draft: Settings; t: HostTranslate }) {
  return (
    <>
      <fieldset className="voice-stage"><legend>{t("voice.stt")}</legend><TranscriptionChoices draft={draft} /></fieldset>
      <fieldset className="voice-stage"><legend>{t("voice.tts")}</legend><SpeechChoices draft={draft} /></fieldset>
      <fieldset className="voice-stage"><legend>{t("voice.turns")}</legend><TurnChoices draft={draft} t={t} /></fieldset>
    </>
  );
}

export function VoiceSettings() {
  const t = hostTranslator();
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  return (
    <section id="pane-voice" aria-labelledby="settings-voice" hidden>
      <h3>{t("voice.title")}</h3>
      <p className="muted">{t("voice.intro")}</p>
      {catalogue.state === "loading" || catalogue.state === "idle" ? <p className="muted" role="status">{t("voice.loading")}</p> : null}
      {catalogue.state === "failed" ? (
        <p role="alert" className="voice-catalogue-error">{catalogue.error} <Button id="voice-catalogue-retry" variant="ghost" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button></p>
      ) : null}
      {catalogue.state === "ready" && draft ? <VoiceChoices draft={draft} t={t} /> : null}
      <p className="muted">{t("voice.restartNote")}</p>
    </section>
  );
}
