import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Select, type SelectOption } from "../../components/ui/Select";
import { LanguagePicker } from "../../components/ui/LanguagePicker";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Group, Row } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { Segmented } from "../../components/ui/Tabs";
import { voiceChoices, voiceSettingsToLoad, endOfTurnModel, endOfTurnModels, IDLE_UNLOAD_MINUTES, SPEED, type DeviceVoiceSettings as Settings, type Note } from "../../services/voice-settings.js";
import { SPEECH_LANGUAGES } from "../../services/system-language.js";
import { voicePreview } from "../../services/voice-preview";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { PROVIDER_SAYS, ProviderKeyNeeded, reasonState } from "./ProviderConnect";
import { NewMark } from "../highlights/highlights";
import { ModelPrepare } from "./ModelPrepare";
import { ModelRuntime } from "./ModelRuntime";
import { InfoTip } from "../../components/ui/InfoTip";
import { cancelDownload, catalogueShown, downloadModel, TryButton, TryPanel, useModelState, useVoiceTry, type ModelState, type SetupTry, type VoiceTry } from "./ModelSetup";
import { TurnTry, type TurnTryHandle } from "./TurnTry";
import { useMedia } from "../../state/call-layout";
import { SETTINGS_PHONE_QUERY, useSectionShown } from "./settings-levels";
import { VoicePicker } from "./VoicePicker";

/* The call's voice as the person chooses it, for what transcribes and for what speaks: where it runs — this device, or
 * a remote provider — then, on this device, a family of models and one of them, made ready here (ModelPrepare); then
 * its own options once it is ready (the language heard; the voice and its speed). When a turn ends is Advanced's. The
 * choices are the engine's catalogues; what cannot be chosen is listed greyed out, with why. Each choice applies as it is
 * made; a model not ready yet waits while the one in use stays (`useVoiceReadiness` says which wait). The first-run
 * setup shows the same, with `setup`, and its Continue waits for them. */

function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** A family as people read it: its id with a capital ("whisper" → "Whisper"); families are products' own names. */
const familyName = (family: string) => family.charAt(0).toUpperCase() + family.slice(1);

/** What the pane says about a choice, in words: its message, why a model does not run here, a catalogue's reason by its
 *  code, and a provider's own words after a reason that is the provider answering. */
function noteText(t: Translate, note: Note | null | undefined) {
  if (!note) return "";
  const reasons = note.reasons?.map((code) => t(("voice.unfit." + code) as MessageKey)).join("; ");
  const code = note.key === "voice.catalog.reason" ? String(note.params?.code ?? "") : "";
  const state = code ? reasonState(code) : null;
  const text = code === "credential-missing" ? t("voice.catalog.noKey")
    : code === "storage-blocked" ? t("storage.blocked")
    : state && state !== "problem" && state !== "connected" ? t(("voice.catalog.why." + state) as MessageKey)
    : t(note.key as MessageKey, { ...note.params, ...(reasons ? { reasons } : {}) });
  return note.detail && state && PROVIDER_SAYS.has(state) ? text + " — " + note.detail : text;
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

/** What the pane says about a choice, in its list: under it, or as why it cannot be chosen when it cannot. */
function noted(t: Translate, option: { disabled: boolean; note: Note | null }): Pick<SelectOption, "description" | "reason"> {
  const text = noteText(t, option.note);
  if (!text) return {};
  return option.disabled ? { reason: text } : { description: text };
}

function SourceSelect({ id, value, sources, onChange, t }: { id: string; value: string; sources: Source[]; onChange: (catalog: string) => void; t: Translate }) {
  return (
    <Select id={id} value={value} onValueChange={onChange} options={sources.map((source) => ({
      value: source.id, label: source.local ? t("voice.source.local") : source.name ?? source.id, disabled: source.disabled, ...noted(t, source),
    }))} />
  );
}

/** The family first, then a model of it: a family changed picks its first model that runs here. A provider's models
 *  have no family, and are one list. */
function ModelPickers({ task, draft, options, locked, needsKey, t }: { task: Task; draft: Settings; options: Option[]; locked: boolean; needsKey: boolean; t: Translate }) {
  const families = [...new Set(options.map((option) => option.group).filter((group): group is string => !!group))];
  const current = options.find((option) => option.id === draft[task].model);
  const family = current?.group ?? null;
  const shown = families.length ? options.filter((option) => option.group === family || (!option.group && option.id === draft[task].model)) : options;
  const pickFamily = (next: string) => {
    const first = options.find((option) => option.group === next && !option.disabled) ?? options.find((option) => option.group === next);
    if (first) edit({ [task]: { model: first.id } });
  };
  return <>
    {families.length > 0 && <Field label={t("voice.family")}>
      <Select id={task + "-family"} value={family ?? ""} disabled={locked || needsKey} onValueChange={pickFamily} placeholder={t("voice.family.none")}
        options={families.map((name) => ({ value: name, label: familyName(name) }))} />
    </Field>}
    <Field label={t("voice.model")}>
      <Select id={task + "-model"} value={needsKey ? "" : draft[task].model} disabled={locked || needsKey} placeholder={needsKey ? t("voice.prepare.badge.needsKey") : undefined}
        onValueChange={(model) => edit({ [task]: { model } })} options={shown.map((option) => ({ value: option.id, label: option.id, disabled: option.disabled, ...noted(t, option) }))} />
    </Field>
  </>;
}

/** A slot chosen with no model (a provider whose key just came) takes its catalogue's first runnable one. */
function useFirstModel(task: "stt" | "tts") {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  useEffect(() => {
    const slot = draft?.[task];
    if (!slot || slot.model) return;
    const first = catalogs.find((catalog) => catalog.id === slot.catalog)?.models
      .find((model) => model.capabilities.includes(task) && (!model.builds || model.builds.some((build) => build.available)));
    if (first) window.sidevoiceActions?.editVoice({ [task]: { model: first.id } });
  }, [draft, catalogs, task]);
}

/** One slot: where it runs, its model made ready and tried in its block, then its options. A provider that only lacks
 *  its key can be chosen, and a row under it says so, with Connect: the key's entry, as Providers opens it, saved where
 *  Providers keeps it; once kept, the row goes and its source takes the focus. `setup`: the first-run setup's, whose
 *  try is its own (`trial`), shown in the block all the same. */
function SlotSettings({ task, draft, setup, trial: setupTry }: { task: Task; draft: Settings; setup: boolean; trial?: SetupTry }) {
  useFirstModel(task);
  const t = translator();
  const choices = useChoices(draft);
  const slot = choices[task];
  const model = useModelState(task, draft);
  // A model chosen that is not here yet waits; the one in use stays until it is ready, then it switches.
  const inUse = useRoomStore((state) => state.facts.voiceSettings?.[task]);
  const pending = !setup && inUse && (inUse.catalog !== draft[task].catalog || inUse.model !== draft[task].model)
    ? t("voice.prepare.willSwitch", { model: inUse.model }) : undefined;
  const speechLanguage = useRoomStore((state) => state.facts.speechLanguage);
  const own = useVoiceTry(setup ? null : task, { keep: false });
  // On a phone, Settings' section left for the list of them, or Settings closed, stops its try: it is out of sight.
  const phone = useMedia(SETTINGS_PHONE_QUERY);
  const shown = useSectionShown(task === "stt" ? "transcription" : "voice");
  const away = phone && !shown;
  useEffect(() => { if (!setup && away && own.trial.phase === "running") own.cancel(); }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  // A provider that only lacks its key can be chosen, and asks for it below.
  const sources = slot.sources.map((source) => keyless(source.note) ? { ...source, disabled: false } : source);
  const sourceNote = slot.sources.find((source) => source.id === draft[task].catalog)?.note;
  const current = slot.sources.find((source) => source.id === draft[task].catalog);
  const remote = current && !current.local ? current : null;
  const provider = model.needsKey ? current : null;
  const optionNote = slot.options.find((option: Option) => option.id === draft[task].model)?.note;
  const languages = model.model?.languages ?? [];
  const meta = [optionNote ? noteText(t, optionNote) : "", languages.length ? languages.slice(0, 4).map(languageName).join(", ") + (languages.length > 4 ? " " + t("voice.languages.more", { n: languages.length - 4 }) : "") : ""].filter(Boolean).join(" · ");
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const preview = voicePreview(draft, catalogs, speechLanguage);
  // Settings' try says its sentence (the sample, editable once it is shown); the first-run setup's is the setup's,
  // started from its footer too.
  const [sentence, setSentence] = useState(() => preview.sample);
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setSentence(preview.sample); }, [preview.sample]);
  const editSentence = (text: string) => { edited.current = true; setSentence(text); };
  const handle: VoiceTry | null = setupTry ?? (setup ? null : { ...own, start: () => void own.run(task === "stt" ? {} : { text: sentence.trim(), language: preview.language }),
    ...(task === "tts" ? { sentence, setSentence: editSentence } : {}) });
  // Why the try cannot run now, in the words the setup's footer uses: its model not ready, no sentence to say. Said in
  // the try's block, which the setup shows whether or not the model is ready (Settings, once it is).
  const reasonId = useId();
  const tryReason = !model.model || !model.ready ? t(task === "stt" ? "settings.save.waitTranscription" : "settings.save.waitVoice")
    : task === "tts" && !(setupTry?.sentence ?? sentence).trim() ? t("wizard.wait.sentence") : "";
  const tryButton = handle && <TryButton task={task} handle={handle} id={setupTry ? "wizard-card-try" : task + "-try"} again={setupTry?.tried}
    reason={tryReason} reasonId={reasonId} stopsElsewhere={!!setupTry} t={t} />;
  const tryPanel = handle && <TryPanel task={task} handle={handle} model={draft[task].model} hint={setupTry?.hint} sample={setupTry?.sample} button={tryButton} t={t} />;
  const voices = task === "tts" ? choices.tts.voices : [];
  const speed = task === "tts" ? choices.tts.speed : null;
  // A key kept from here: said, and the focus on the slot's source (its box, found in this slot's group: the setup and
  // Settings may both be drawn, each with its own).
  const announce = useRef<HTMLParagraphElement>(null);
  const [keyNote, setKeyNote] = useState("");
  const keyKept = (name: string) => {
    setKeyNote(t("keys.connected", { provider: name }));
    announce.current?.closest(".ui-group")?.querySelector<HTMLElement>(`#${task}-source`)?.focus();
  };
  // The model's own settings (language; voice and speed), in a card of their own under the model once it can take them.
  const modelSettings = model.ready ? <>
    {model.ready && task === "stt" && <Row label={<>{t("voice.language")}<NewMark id="feature:speech-language" /></>} description={t("voice.language.hint")} htmlFor="stt-language">
      <LanguagePicker id="stt-language" value={draft.stt.language ?? ""} label={t("voice.language")} onValueChange={(language) => edit({ stt: { language: language || null } })}
        options={[{ value: "", label: t("voice.language.detect") }, ...choices.stt.languages.map((tag: string) => ({ value: tag, label: languageName(tag) }))]} />
    </Row>}
    {/* Always a list, even with the automatic voice alone in it: what the voice is, and that it is a choice. */}
    {model.ready && task === "tts" && <Row label={t("voice.voice")} htmlFor="tts-voice">
      <VoicePicker id="tts-voice" value={draft.tts.voice ?? ""} automatic={t(choices.tts.automaticVoice as MessageKey)}
        voices={voices} onValueChange={(voice) => edit({ tts: { voice: voice || null } })} />
    </Row>}
    {model.ready && speed && <Row label={t("voice.speed")} htmlFor="tts-speed">
      <span className="voice-speed">
        <input id="tts-speed" type="range" min={speed.min} max={speed.max} step={SPEED.step} value={draft.tts.speed} onChange={(event) => edit({ tts: { speed: Number(event.target.value) } })} />
        <output id="tts-speed-value" htmlFor="tts-speed">{draft.tts.speed.toFixed(2)}×</output>
      </span>
    </Row>}
  </> : null;
  return (
    <Group>
      <Row label={t("voice.source")} description={sourceNote && !provider ? noteText(t, sourceNote) : undefined} htmlFor={task + "-source"}>
        <SourceSelect id={task + "-source"} value={draft[task].catalog} sources={sources} onChange={(catalog) => edit({ [task]: { catalog } })} t={t} />
      </Row>
      {remote && <ProviderKeyNeeded key={remote.id} provider={remote.id} name={remote.name ?? remote.id} needed={!!provider} onDone={() => keyKept(remote.name ?? remote.id)} />}
      <Row label={t("voice.model")} block>
        <ModelPrepare id={task + "-model-card"} actionIds={task + "-model"} pending={pending} status={model.status} model={draft[task].model} size={model.local ? model.size : null} fraction={model.fraction} error={model.failure} errorDetails={model.failureDetails}
          meta={!model.needsKey && meta || undefined} pickers={(locked) => <ModelPickers task={task} draft={draft} options={slot.options} locked={locked} needsKey={model.needsKey} t={t} />}
          runtime={<ModelRuntime task={task} state={model} locked={model.installing} />}
          onDownload={() => downloadModel(task)} onCancel={cancelDownload} onRetry={() => downloadModel(task)} />
      </Row>
      {modelSettings && <Row label={t("voice.modelSettings")} block>
        <div className="turn-try-card model-settings-card" id={task + "-model-settings"}>{modelSettings}</div>
      </Row>}
      {/* The try, last, after all of the slot's settings: the same place and the same block as End of turn's. In the
          setup there before its model is, its button waiting for it and saying why, so the step looks the same. */}
      {handle && (model.ready || setup) && <Row label={t(task === "stt" ? "try.title.stt" : "try.title.tts")} block>
        <div className="turn-try turn-try-card" id={task + "-try-block"}>
          {/* Each try lays out its own button, beside its level (SttTry, TtsTry). */}
          {tryPanel}
          {tryReason && handle.trial.phase !== "running" && <p className="turn-try-reason" id={reasonId}>{tryReason}</p>}
        </div>
      </Row>}
      <p ref={announce} className="sr-only" role="status">{keyNote}</p>
    </Group>
  );
}

type SlotProps = { draft: Settings; setup?: boolean; trial?: SetupTry };

/** Where speech is transcribed: source, model, language. */
export function TranscriptionChoices({ draft, setup = false, trial }: SlotProps) {
  return <SlotSettings task="stt" draft={draft} setup={setup} trial={trial} />;
}

/** How replies sound: source, model, voice, speed. */
export function SpeechChoices({ draft, setup = false, trial }: SlotProps) {
  return <SlotSettings task="tts" draft={draft} setup={setup} trial={trial} />;
}

/** When the person's turn ends: how long a pause may be (fast, normal, calm), and what decides it — silence, or the
 *  smart model when it runs here (else why not); and a try of both together (TurnTry), in a card of its own after
 *  the choices. `setup`: the first-run setup's;
 *  `active`: in sight (Settings' section on show), a try that runs stopping when it is not. */
export function TurnChoices({ draft, setup = false, active = true, turnTry }: { draft: Settings; setup?: boolean; active?: boolean; turnTry?: TurnTryHandle }) {
  const t = translator();
  const choices = useChoices(draft);
  const patience: { value: Settings["patience"]; label: MessageKey; hint: MessageKey }[] = [
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
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  // What ends turns until the chosen model is ready: the smart model in use when it is on disk, else silence — Smart
  // kept without its model too (voiceSettingsToLoad). As the slots say it, outside the setup (nothing is in use there).
  const inUse = saved ? voiceSettingsToLoad(saved, catalogs) : null;
  const inUseModel = inUse?.end_of_turn === "smart-turn" ? endOfTurnModel(catalogs, inUse.turn_model)?.id ?? null : null;
  const turnPending = !setup && inUse && inUseModel !== turn.model?.id
    ? t(inUseModel ? "voice.prepare.willSwitch" : "voice.prepare.willSwitchSilence", { model: inUseModel ?? "" }) : undefined;
  // In the same place whichever end of turn is chosen, so switching keeps a try that runs, and the focus.
  const tryIt = <TurnTry draft={draft} smart={smart} smartReady={turn.ready} setup={setup} active={active} handle={turnTry} />;
  return (
    <Group title={t("settings.call.turn")}>
      <Row label={<>{t("voice.patience")}<InfoTip label={t("voice.patience.infoLabel")}>{t("voice.patience.info")}</InfoTip></>} description={t(current.hint)}>
        <Segmented size="sm" label={t("voice.patience")} value={draft.patience} onChange={(value) => edit({ patience: value })}
          items={patience.map((option) => ({ value: option.value, label: t(option.label) }))} />
      </Row>
      <Row label={<>{t("voice.endOfTurn")}<InfoTip label={t("voice.endOfTurn.infoLabel")}>{t("voice.endOfTurn.info")}</InfoTip><NewMark id="feature:end-of-turn-smart" /></>}
        description={choices.endOfTurn.note ? noteText(t, choices.endOfTurn.note) : t(smart ? "voice.endOfTurn.smartHint" : "voice.endOfTurn.silenceHint")}>
        <Select id="voice-end-of-turn" aria-label={t("voice.endOfTurn")} value={smart ? "smart-turn" : "silence"} onValueChange={(value) => edit({ end_of_turn: value as Settings["end_of_turn"] })}
          options={[{ value: "smart-turn", label: t("voice.endOfTurn.smart"), disabled: !choices.endOfTurn.smartTurn }, { value: "silence", label: t("voice.endOfTurn.silence") }]} />
      </Row>
      {smart && turn.model && <Row label={t("voice.endOfTurn.model")} description={t("voice.endOfTurn.modelHint")} block>
        <ModelPrepare id="turn-model-card" actionIds="turn-model" pending={turnPending} status={turn.status} model={turn.model.id} size={turn.size} fraction={turn.fraction} error={turn.failure} errorDetails={turn.failureDetails}
          pickers={(locked) => <Field label={t("voice.model")}>
            {/* Just the models: one today, more later; no families, sizes or runtime here. */}
            <Select id="turn-model" value={turn.model!.id} disabled={locked} onValueChange={(model) => edit({ turn_model: model })}
              options={turnModels.map((model: { id: string; builds?: { available: boolean }[] }) => ({ value: model.id, label: model.id, disabled: !model.builds?.some((build) => build.available) }))} />
          </Field>}
          onDownload={() => downloadModel("end-of-turn")} onCancel={cancelDownload} onRetry={() => downloadModel("end-of-turn")} />
      </Row>}
      {tryIt}
    </Group>
  );
}

/** How long this device keeps its models loaded with nothing to do, before freeing their memory. */
export function IdleUnloadChoice({ draft }: { draft: Settings }) {
  const t = translator();
  return (
    <Row label={t("settings.advanced.idleUnload")} description={t("settings.advanced.idleUnloadHint")} htmlFor="voice-idle-unload">
      <Select id="voice-idle-unload" value={String(draft.idle_unload_minutes)} onValueChange={(minutes) => edit({ idle_unload_minutes: Number(minutes) })}
        options={IDLE_UNLOAD_MINUTES.map((minutes: number) => ({ value: String(minutes), label: t("settings.advanced.minutes", { n: minutes }) }))} />
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
  const t = translator();
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  return <>
    {!catalogueShown(catalogue) && (catalogue.state === "loading" || catalogue.state === "idle") ? <p className="muted" role="status">{t("voice.loading")}</p> : null}
    {catalogue.state === "failed" ? <Alert tone="danger" title={catalogue.error} details={catalogue.details} action={<Button id={task + "-catalogue-retry"} size="sm" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button>} /> : null}
    {catalogueShown(catalogue) && draft ? (task === "stt" ? <TranscriptionChoices draft={draft} /> : <SpeechChoices draft={draft} />) : null}
  </>;
}
