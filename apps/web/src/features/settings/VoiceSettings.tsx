import { useMemo } from "react";
import { useRoomStore } from "../../state/room-store";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Group, Row } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { Segmented } from "../../components/ui/Tabs";
import { voiceChoices, endOfTurnModels, IDLE_UNLOAD_MINUTES, SPEED, type DeviceVoiceSettings as Settings, type Note } from "../../services/voice-settings.js";
import { SPEECH_LANGUAGES } from "../../services/system-language.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { ProviderKey } from "./ProviderKeys";
import { ModelPrepare, type PrepareStatus } from "./ModelPrepare";
import { ModelRuntime } from "./ModelRuntime";
import { cancelDownload, catalogueShown, downloadModel, TryResult, useModelState, useVoiceTry, type ModelState } from "./ModelSetup";

/* The call's voice as the person chooses it, for what transcribes and for what speaks: where it runs — this device, or
 * a remote provider — then, on this device, a family of models and one of them, made ready here (ModelPrepare); then
 * its own options once it is ready (the language heard; the voice and its speed). When a turn ends is Advanced's. The
 * choices are the engine's catalogues; what cannot be chosen is listed greyed out, with why. Save keeps them, and waits
 * until every chosen model is ready (`useVoiceReadiness`). The first-run setup shows the same, with `setup`. */

function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** A family as people read it: its id with a capital ("whisper" → "Whisper"); families are products' own names. */
const familyName = (family: string) => family.charAt(0).toUpperCase() + family.slice(1);

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
type Task = "stt" | "tts";

type Edit = Parameters<NonNullable<typeof window.sidevoiceActions>["editVoice"]>[0];
const edit = (patch: Edit) => window.sidevoiceActions?.editVoice(patch);
const keyless = (note: Note | null | undefined) => note?.key === "voice.catalog.reason" && note.params?.code === "credential-missing";

/** What a slot offers, from the engine's catalogues and the settings being edited. */
function useChoices(draft: Settings) {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  return useMemo(() => voiceChoices(catalogs, draft, SPEECH_LANGUAGES), [catalogs, draft]);
}

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

/** The family first, then a model of it: a family changed picks its first model that runs here. A provider's models
 *  have no family, and are one list. */
function ModelPickers({ task, draft, options, locked, t }: { task: Task; draft: Settings; options: Option[]; locked: boolean; t: HostTranslate }) {
  const families = [...new Set(options.map((option) => option.group).filter((group): group is string => !!group))];
  const current = options.find((option) => option.id === draft[task].model);
  const family = current?.group ?? null;
  const shown = families.length ? options.filter((option) => option.group === family || (!option.group && option.id === draft[task].model)) : options;
  const label = (option: Option) => option.id + (option.note ? " — " + noteText(t, option.note) : "");
  const pickFamily = (next: string) => {
    const first = options.find((option) => option.group === next && !option.disabled) ?? options.find((option) => option.group === next);
    if (first) edit({ [task]: { model: first.id } });
  };
  return <>
    {families.length > 0 && <Field label={t("voice.family")}>
      <NativeSelect id={task + "-family"} value={family ?? ""} disabled={locked} onChange={(event) => pickFamily(event.target.value)}>
        {!family && <option value="" disabled>{t("voice.family.none")}</option>}
        {families.map((name) => <option key={name} value={name}>{familyName(name)}</option>)}
      </NativeSelect>
    </Field>}
    <Field label={t("voice.model")}>
      <NativeSelect id={task + "-model"} value={draft[task].model} disabled={locked} onChange={(event) => edit({ [task]: { model: event.target.value } })}>
        {shown.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{label(option)}</option>)}
      </NativeSelect>
    </Field>
  </>;
}

/** Where the slot's model stands, for ModelPrepare: a provider's without its key needs it; else as the model is here. */
function prepareStatus(model: ModelState, sourceNote: Note | null | undefined): PrepareStatus | null {
  if (!model.local && keyless(sourceNote)) return "needs-key";
  return model.status;
}

/** One slot: where it runs, its model made ready, then its options. `setup`: the first-run setup's — a provider's
 *  missing key is asked for in place, and the try is the setup's own. */
function SlotSettings({ task, draft, setup }: { task: Task; draft: Settings; setup: boolean }) {
  const t = hostTranslator();
  const choices = useChoices(draft);
  const slot = choices[task];
  const model = useModelState(task, draft);
  const speechLanguage = useRoomStore((state) => state.facts.speechLanguage);
  const { trial, run, cancel } = useVoiceTry(setup ? null : task, { keep: false });
  // In the setup a provider that only lacks its key can be chosen, and asks for it below.
  const sources = setup ? slot.sources.map((source) => keyless(source.note) ? { ...source, disabled: false } : source) : slot.sources;
  const sourceNote = slot.sources.find((source) => source.id === draft[task].catalog)?.note;
  const provider = keyless(sourceNote) ? slot.sources.find((source) => source.id === draft[task].catalog) : null;
  const status = prepareStatus(model, sourceNote);
  const optionNote = slot.options.find((option: Option) => option.id === draft[task].model)?.note;
  const languages = model.model?.languages ?? [];
  const meta = [optionNote ? noteText(t, optionNote) : "", languages.length ? languages.slice(0, 4).map(languageName).join(", ") + (languages.length > 4 ? " " + t("voice.languages.more", { n: languages.length - 4 }) : "") : ""].filter(Boolean).join(" · ");
  const tryLanguage = draft.stt.language || speechLanguage;
  const startTry = () => void run(task === "stt" ? {} : { text: t("wizard.sampleText"), language: tryLanguage });
  const tryButton = !setup && <Button size="sm" id={task + "-try"} onClick={trial.phase === "running" ? cancel : startTry}>
    {trial.phase === "running" ? t("wizard.cancelTrial") : t(task === "stt" ? "voice.try.speak" : "voice.try.listen")}
  </Button>;
  const voices = task === "tts" ? choices.tts.voices : [];
  const speed = task === "tts" ? choices.tts.speed : null;
  return (
    <Group>
      <Row label={t("voice.source")} description={sourceNote && !provider ? noteText(t, sourceNote) : undefined} htmlFor={task + "-source"}>
        <SourceSelect id={task + "-source"} value={draft[task].catalog} sources={sources} onChange={(catalog) => edit({ [task]: { catalog } })} t={t} />
      </Row>
      {provider && (setup
        ? <Row label={provider.name ?? provider.id} block><ProviderKey provider={provider.id} name={provider.name ?? provider.id} t={t} /></Row>
        : null)}
      <Row label={t("voice.model")} block>
        <ModelPrepare id={task + "-model-card"} actionIds={task + "-model"} status={status} model={draft[task].model} size={model.local ? model.size : null} fraction={model.fraction} error={model.failure}
          meta={meta || undefined} pickers={(locked) => <ModelPickers task={task} draft={draft} options={slot.options} locked={locked} t={t} />}
          readyAction={tryButton || undefined} onDownload={() => downloadModel(task)} onCancel={cancelDownload} onRetry={() => downloadModel(task)}
          onAddKey={() => window.sidevoiceActions?.showSettingsSection?.("providers")} />
        <ModelRuntime task={task} state={model} locked={model.installing} />
        {!setup && <TryResult task={task} trial={trial} t={t} />}
      </Row>
      {model.ready && task === "stt" && <Row label={t("voice.language")} description={t("voice.language.hint")} htmlFor="stt-language">
        <NativeSelect id="stt-language" value={draft.stt.language ?? ""} onChange={(event) => edit({ stt: { language: event.target.value || null } })}>
          <option value="">{t("voice.language.detect")}</option>
          {choices.stt.languages.map((tag: string) => <option key={tag} value={tag}>{languageName(tag)}</option>)}
        </NativeSelect>
      </Row>}
      {model.ready && task === "tts" && (voices.length ? <Row label={t("voice.voice")} htmlFor="tts-voice">
        <NativeSelect id="tts-voice" value={draft.tts.voice ?? ""} onChange={(event) => edit({ tts: { voice: event.target.value || null } })}>
          <option value="">{t("voice.voice.first")}</option>
          {voices.map((voice: { id: string; name: string | null; languages: string[] }) => <option key={voice.id} value={voice.id}>{voice.name ?? voice.id}{voice.languages.length ? " · " + voice.languages.map(languageName).join(", ") : ""}</option>)}
        </NativeSelect>
      </Row> : <Row label={t("voice.voice")} description={noteText(t, choices.tts.voiceNote)} />)}
      {model.ready && speed && <Row label={t("voice.speed")} htmlFor="tts-speed">
        <span className="voice-speed">
          <input id="tts-speed" type="range" min={speed.min} max={speed.max} step={SPEED.step} value={draft.tts.speed} onChange={(event) => edit({ tts: { speed: Number(event.target.value) } })} />
          <output id="tts-speed-value" htmlFor="tts-speed">{draft.tts.speed.toFixed(2)}×</output>
        </span>
      </Row>}
    </Group>
  );
}

type SlotProps = { draft: Settings; setup?: boolean };

/** Where speech is transcribed: source, model, language. */
export function TranscriptionChoices({ draft, setup = false }: SlotProps) {
  return <SlotSettings task="stt" draft={draft} setup={setup} />;
}

/** How replies sound: source, model, voice, speed. */
export function SpeechChoices({ draft, setup = false }: SlotProps) {
  return <SlotSettings task="tts" draft={draft} setup={setup} />;
}

/** When the person's turn ends: how long a pause may be (fast, normal, calm), and what decides it — silence, or the
 *  smart model when it runs here (else why not). Part of what Save keeps. */
export function TurnChoices({ draft }: { draft: Settings }) {
  const t = hostTranslator();
  const choices = useChoices(draft);
  const patience: { value: Settings["patience"]; label: HostMessageKey; hint: HostMessageKey }[] = [
    { value: "fast", label: "voice.patience.fastShort", hint: "voice.patience.fast" },
    { value: "normal", label: "voice.patience.normal", hint: "voice.patience.normalHint" },
    { value: "calm", label: "voice.patience.calmShort", hint: "voice.patience.calm" },
  ];
  const current = patience.find((option) => option.value === draft.patience) ?? patience[1];
  // Smart where its model runs here; silence where it does not (voiceSettingsHere), whatever was kept.
  const smart = draft.end_of_turn === "smart-turn" && choices.endOfTurn.smartTurn;
  const turn = useModelState("end-of-turn", draft);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const turnModels = useMemo(() => endOfTurnModels(catalogs), [catalogs]);
  return (
    <Group title={t("settings.call.turn")}>
      <Row label={t("voice.patience")} description={t(current.hint)}>
        <Segmented size="sm" label={t("voice.patience")} value={draft.patience} onChange={(value) => edit({ patience: value })}
          items={patience.map((option) => ({ value: option.value, label: t(option.label) }))} />
      </Row>
      <Row label={t("voice.endOfTurn")} description={choices.endOfTurn.note ? noteText(t, choices.endOfTurn.note) : t("voice.endOfTurn.hint")} htmlFor="voice-end-of-turn">
        <NativeSelect id="voice-end-of-turn" value={smart ? "smart-turn" : "silence"} onChange={(event) => edit({ end_of_turn: event.target.value as Settings["end_of_turn"] })}>
          <option value="smart-turn" disabled={!choices.endOfTurn.smartTurn}>{t("voice.endOfTurn.smart")}</option>
          <option value="silence">{t("voice.endOfTurn.silence")}</option>
        </NativeSelect>
      </Row>
      {smart && turn.model && <Row label={t("voice.endOfTurn.model")} description={t("voice.endOfTurn.modelHint")} block>
        <ModelPrepare id="turn-model-card" actionIds="turn-model" status={turn.status} model={turn.model.id} size={turn.size} fraction={turn.fraction} error={turn.failure}
          pickers={(locked) => <Field label={t("voice.model")}>
            {/* Just the models: one today, more later; no families, sizes or runtime here. */}
            <NativeSelect id="turn-model" value={turn.model!.id} disabled={locked} onChange={(event) => edit({ turn_model: event.target.value })}>
              {turnModels.map((model: { id: string; builds?: { available: boolean }[] }) => <option key={model.id} value={model.id} disabled={!model.builds?.some((build) => build.available)}>{model.id}</option>)}
            </NativeSelect>
          </Field>}
          onDownload={() => downloadModel("end-of-turn")} onCancel={cancelDownload} onRetry={() => downloadModel("end-of-turn")} />
      </Row>}
    </Group>
  );
}

/** How long this device keeps its models loaded with nothing to do, before freeing their memory. */
export function IdleUnloadChoice({ draft }: { draft: Settings }) {
  const t = hostTranslator();
  return (
    <Row label={t("settings.advanced.idleUnload")} description={t("settings.advanced.idleUnloadHint")} htmlFor="voice-idle-unload">
      <NativeSelect id="voice-idle-unload" value={String(draft.idle_unload_minutes)} onChange={(event) => edit({ idle_unload_minutes: Number(event.target.value) })}>
        {IDLE_UNLOAD_MINUTES.map((minutes: number) => <option key={minutes} value={minutes}>{t("settings.advanced.minutes", { n: minutes })}</option>)}
      </NativeSelect>
    </Row>
  );
}

/** Whether Save can keep what is being edited: each slot's chosen model ready to use — on this device, or a provider's.
 *  What waits says why, by slot. */
export function useVoiceReadiness() {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const stt = useModelState("stt", draft);
  const tts = useModelState("tts", draft);
  const turn = useModelState("end-of-turn", draft);
  const waits = (model: ModelState) => !!model.model && !model.ready;
  return { stt: waits(stt), tts: waits(tts), turn: waits(turn) };
}

/** A slot's pane in Settings: the catalogue loading or failed, else the slot. */
export function SlotPane({ task }: { task: Task }) {
  const t = hostTranslator();
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  return <>
    {!catalogueShown(catalogue) && (catalogue.state === "loading" || catalogue.state === "idle") ? <p className="muted" role="status">{t("voice.loading")}</p> : null}
    {catalogue.state === "failed" ? <Alert tone="danger" title={catalogue.error} action={<Button id={task + "-catalogue-retry"} size="sm" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button>} /> : null}
    {catalogueShown(catalogue) && draft ? (task === "stt" ? <TranscriptionChoices draft={draft} /> : <SpeechChoices draft={draft} />) : null}
  </>;
}
