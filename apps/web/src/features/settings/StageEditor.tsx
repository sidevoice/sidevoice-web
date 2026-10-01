/* Choosing a stage — transcription or voice — the same way in the first-run wizard and in Configuración (operator,
 * 2026-10-01): the stage's own pane (where, model, options), and under the model one card that takes the chosen model
 * through three phases, always in the same order and with the same look for both stages:
 *
 *   1 Descargar (only when it is not on disk)  ·  2 Preparar (load and check)  ·  3 Probar (the person tries it)
 *
 * Choosing only selects (a draft). The card's one button prepares it; once prepared it is kept, and the person tries it
 * for real — says a sentence and reads it back, or listens to it — and says whether it works. «Funciona» is what the
 * wizard waits for; in Configuración the same answer only closes the card. A provider without a key asks for it in one
 * line under «Dónde». Every change — place,
 * model, engine, voice, language — is tried again: what was said to work is that exact configuration, on that machine.
 *
 * Two flows are compared in the prototype (StageFlow, below); this is "try".
 *
 * In the wizard the next step is the footer's primary button (operator, 2026-10-01): «Descargar y preparar», «Probar»,
 * «Sí, funciona» — whatever this model still needs — and «Continuar» only once nothing is pending; the card then keeps
 * only what goes beside it (Cancelar, No, Elegir otro modelo). */
import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Button } from "../../components/ui/Button";
import { MicrophoneIcon, SidevoiceMark, SpeakerIcon } from "../../components/ui/Icons";
import { currentLanguage, useT } from "../../i18n";
import { stageContext } from "../../state/room-session-state.js";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { effectiveStage, type Stage, type Task } from "../../state/hosts/stage-scope";
import { effectiveStage as effectiveStageOf, placeModels, withBuild, withModel, withOption, withPlace } from "../../state/stage-settings.js";
import { ProviderIcon } from "../../components/ui/Icons";
import { bytesText } from "../hosts/common";
import { StageSettings } from "./StageSettings";
import { offeredSentence, saySample } from "./try-samples";
import checks from "../../../../../packages/browser-audio/checks/checks.json";
import { LiveDraftBubble } from "../conversation/LiveDraftBubble";
import { MessageGroup } from "../conversation/MessageGroup";
import type { ChatMessage, StageOptionView, StageView } from "../../state/room-types";

/** What the person said works, per stage, for this session: the whole configuration on one machine. A wizard step
 *  resumed after a restart is past it already (resumeStep skips a stage that is set), so this does not need to outlive
 *  the page; going back to it in the same session finds it. */
const verified = new Map<Task, string>();
const keyOf = (fp: string | null, stage: Stage | null | undefined) =>
  stage ? (fp ?? "") + "|" + JSON.stringify([stage.place, stage.model, stage.options ?? {}, stage.build ?? null]) : "";
const same = (a: Stage | null | undefined, b: Stage | null | undefined) => keyOf(null, a) === keyOf(null, b);

function useStageContext() {
  const store = useContext(RoomStoreContext);
  useRoomStore((s) => s.stages);
  return store ? stageContext(store.facts) : null;
}

/** How a model is taken through its step. The prototype compares two (operator, 2026-10-01), undecided:
 *  - "try": prepare it, the person tries it and says whether it works («¿Es lo que has dicho?» → «Sí, funciona»);
 *  - "configure": the app checks it by itself (download, load, audio comes out), then the person configures it and
 *    listens to their own text as often as they like, and keeps it («Usar esta voz» / «Usar este modelo»);
 *  - "list": every model in one list of cards, by place (as Handy and Vowen do — design/RESEARCH-HANDY.md); touching
 *    one downloads, loads and checks it, with what it measured on the card; the app's check is the only gate, and the
 *    person's own test is the wizard's last step, a real conversation. */
export type StageFlow = "try" | "configure" | "list";
export const StageFlowContext = createContext<StageFlow>("try");

/** The longest text the voice test plays. */
const TEXT_MAX = 200;

/** A provider's key, in one line: required, checked with the provider, kept on the machine. Its state — required,
 *  checking, valid, refused — is said inside the field, beside the masked last characters of the key kept (operator,
 *  2026-10-01); a refused replacement leaves the previous key in place. */
interface KeyHandle { submit(): void }

/** `ownSubmit`: its own «Validar» while a typed key is unchecked; in the wizard that is the footer's button. */
function KeyLine({ fp, provider, label, configured, hint, onCancel, ownSubmit, ref }: { fp: string; provider: string; label: string; configured: boolean; hint: string | null; onCancel?: () => void; ownSubmit: boolean; ref?: Ref<KeyHandle> }) {
  const t = useT();
  const hosts = useHostsController();
  const [key, setKey] = useState("");
  const [checked, setChecked] = useState("");
  const [state, setState] = useState<"" | "checking" | "refused">("");
  // What was sent: a result is about that value, and a key typed while it was checked is checked on its own.
  const sent = useRef("");
  async function check(typed = key) {
    const value = typed.trim();
    if (!value || value === checked || state === "checking") return;
    sent.current = value;
    setState("checking");
    try { await hosts.putKey(fp, provider, value); } catch { if (sent.current === value) setState("refused"); return; }
    setChecked(value);
    setKey("");
    setState("");
  }
  const input = useRef<HTMLInputElement>(null);
  // A key is checked as soon as it is in (operator, 2026-10-01): pasted, or a moment after typing stops.
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(idle.current), []);
  // From the footer: an empty field is where to start; a typed key is checked.
  useImperativeHandle(ref, () => ({ submit() { if (!key.trim()) input.current?.focus(); else void check(); } }));
  const typed = key.trim();
  const valid = configured && state !== "refused" && !typed;
  const unsent = !!typed && state === "";
  const said = state === "checking" ? t("stagecard.key.checking")
    : state === "refused" ? t(configured ? "stagecard.key.refusedKept" : "stagecard.key.refused")
    : unsent ? "" : valid ? t("stagecard.key.valid") : t("stagecard.key.required");
  return (
    <div className="key-line" data-state={state || (valid ? "valid" : undefined)}>
      <span className="key-field">
        <input ref={input} id={"key-" + provider} type="password" autoComplete="off" spellCheck={false} required aria-required="true" value={key}
          placeholder={configured && hint ? "" : t("wizard.w4.keyPlaceholder", { provider: label })} aria-label={t("wizard.w4.keyPlaceholder", { provider: label })}
          aria-describedby={"key-state-" + provider}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setKey(value); if (state === "refused") setState("");
            clearTimeout(idle.current);
            if (value.trim().length >= 8) idle.current = setTimeout(() => void check(value), 900);
          }}
          onPaste={(event) => { const value = event.clipboardData.getData("text"); if (value.trim()) { clearTimeout(idle.current); setTimeout(() => void check(value), 0); } }}
          onBlur={() => void check()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void check(); } }} autoFocus={!configured} />
        {configured && hint && !key && <span className="key-mask" aria-hidden="true"><span className="key-dots" /><span className="key-last">{hint}</span></span>}
        <span className="key-state" id={"key-state-" + provider} role="status"
          title={state === "refused" ? t(configured ? "wizard.w4.keyRefusedKept" : "wizard.w4.keyRefused", { provider: label }) : undefined}>{said}</span>
      </span>
      {unsent && ownSubmit && <Button size="compact" onMouseDown={(event) => event.preventDefault()} onClick={() => void check()}>{t("stagecard.keyCheck")}</Button>}
      {onCancel && <Button variant="ghost" size="compact" onClick={onCancel}>{t("common.cancel")}</Button>}
    </div>
  );
}

type TrialState = "idle" | "listening" | "transcribing" | "heard" | "playing" | "played" | "failed";
type Trial = ReturnType<typeof useTrial>;
/** What a try says or plays: the language, and the text (the sentence offered to say, or the person's own to hear). */
interface TryInput { language: string; text: string }

/** Trying a prepared stage: listening to the person (stt) or playing the text (tts). A newer try or a reset makes a
 *  late result of the previous one count for nothing. */
function useTrial(task: Task) {
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const [state, setState] = useState<TrialState>("idle");
  const [failure, setFailure] = useState("");
  const [heard, setHeard] = useState("");
  const [played, setPlayed] = useState("");
  const [no, setNo] = useState(false);
  // Heard or played at least once since the configuration changed.
  const [tried, setTried] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; abort.current?.abort(); }, []);
  function begin() { abort.current?.abort(); setHeard(""); setNo(false); setFailure(""); return ++run.current; }
  const fail = (key: string) => { setFailure(key); setState("failed"); };
  function listen(input: TryInput) {
    const id = begin();
    const controller = new AbortController();
    abort.current = controller;
    setState("listening");
    offeredSentence.current = input.text;
    const live = () => run.current === id && !controller.signal.aborted;
    void hosts.echoTest(inUse, {
      level: () => undefined,
      transcribing: () => { if (live()) setState("transcribing"); },
      heard: (text) => { if (live()) { setHeard(text); setState("heard"); setTried(true); controller.abort(); } },
      replied: () => undefined,
      failed: (key) => { if (live()) fail(key); },
      silent: () => { if (live()) fail("silent"); },
    }, controller.signal);
  }
  // Answered once it has been heard: when playback ends, not after a guess at how long it takes.
  async function play(input: TryInput) {
    const id = begin();
    setPlayed(input.text);
    setState("playing");
    try { await window.sidevoiceActions?.previewVoice(input.language, input.text); if (run.current === id) { setState("played"); setTried(true); } }
    catch { if (run.current === id) fail("play"); }
  }
  return {
    state, failure, heard, played, no, setNo, tried,
    start(input: TryInput) { if (task === "stt") listen(input); else void play(input); },
    reset() { begin(); setState("idle"); setTried(false); },
  };
}

/** The step a model still needs, as the wizard's primary button; `null` once it works. */
export interface PendingStep { label: string; disabled?: boolean; run?: () => void; secondary?: { label: string; run: () => void } }

/** `footer`: the wizard's, given the step still pending. Without one (Configuración) the card carries its own buttons,
 *  and a model prepared there is in use at once, which the card says until it is tried. `bodyClassName`: the
 *  scrolling box the editor sits in, above the footer. */
export function StageEditor({ task, footer, bodyClassName }: { task: Task; footer?: (pending: PendingStep | null) => ReactNode; bodyClassName?: string }) {
  const t = useT();
  const flow = useContext(StageFlowContext);
  const hosts = useHostsController();
  const room = useContext(RoomStoreContext);
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const saved = useHosts((s) => effectiveStage(s.scope, s.inUse, task));
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const rawDraft = useRoomStore((s) => (s.facts.stageDraft?.[task] ?? null) as Stage | null);
  const speechLanguage = useRoomStore((s) => s.facts.speechLanguage);
  const voiceLanguages = useRoomStore((s) => s.facts.voiceLanguages);
  // The draft holds both stages; this one's is a draft only when it differs from what is kept.
  const draft = rawDraft && !same(rawDraft, saved) ? rawDraft : null;
  const ctx = useStageContext();
  const [keyFor, setKeyFor] = useState<string | null>(null);
  // Prepared from this card: in Configuración it is in use from then on, which the card says until it is tried.
  const [preparedHere, setPreparedHere] = useState(false);
  const [works, setWorks] = useState(() => !!saved && verified.get(task) === keyOf(inUse, saved));
  // The voice is configured and heard one language at a time (its voices are that language's); the test text starts
  // as a sentence in it, and is the person's to change — in any language — up to TEXT_MAX characters.
  const [voiceLanguage, setVoiceLanguage] = useState(speechLanguage);
  const sampleIn = (language: string) => voiceLanguages?.find((l) => l.id === language)?.sample ?? "";
  const [text, setText] = useState(() => sampleIn(speechLanguage));
  useEffect(() => { setText(sampleIn(voiceLanguage).slice(0, TEXT_MAX)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceLanguage]);
  const trial = useTrial(task);
  const keyLine = useRef<KeyHandle>(null);
  // The language the person chose themselves; until then every model starts on «Detectar automáticamente» where it
  // can (operator, 2026-10-01: for every transcription that detects, detecting is the default).
  const chosenLanguage = useRef(false);
  // A try is about the configuration it tried.
  const tried = keyOf(inUse, draft ?? saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => trial.reset(), [tried]);
  useEffect(() => { if (inUse && (!integrations || integrations.status === "idle")) void hosts.loadIntegrations(inUse); }, [inUse, integrations, hosts]);
  // What was said to work is that configuration: any other one has to be tried again.
  useEffect(() => { setWorks(!!saved && !draft && verified.get(task) === keyOf(inUse, saved)); }, [saved, draft, task, inUse]);
  const keyed = useHosts((s) => !!keyFor && !!s.inUse && !!s.integrations[s.inUse]?.value?.providers.find((p) => p.id === keyFor)?.configured);
  useEffect(() => {
    if (!keyed || !keyFor || !ctx) return;
    select(detecting(withPlace(ctx, task, null, keyFor, null)));
    setKeyFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyed, keyFor, task]);
  // With nothing kept yet, the language starts on «Detectar automáticamente» (operator, 2026-10-01), whatever the
  // system language is.
  const autoLanguage = !saved && !rawDraft && !!ctx && !!view?.options.some((o) => o.kind === "language" && o.choices.some((c) => c.value === "auto"));
  useEffect(() => {
    if (!autoLanguage || !ctx) return;
    select(withOption(ctx, task, effectiveStageOf(ctx, task, null), "language", "auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLanguage]);
  if (!view || !ctx || !room) return <><p className="muted" role="status">{t("wizard.w4.measuring")}</p>{footer?.({ label: t("wizard.continue"), disabled: true })}</>;

  /** A model newly chosen: its language detected, unless the person chose one. */
  function detecting(stage: unknown) {
    return chosenLanguage.current || !ctx ? stage : withOption(ctx, task, stage, "language", "auto");
  }
  function select(stage: unknown) {
    // The panes read both stages from the draft while there is one: the other one is what is kept.
    const kept = room!.facts.voicePreferences as Record<string, unknown> | null;
    room!.patch({ stageDraft: { stt: kept?.stt, tts: kept?.tts, ...(room!.facts.stageDraft ?? {}), [task]: stage as Record<string, unknown> } as never });
  }
  const current = (draft ?? saved ?? effectiveStageOf(ctx, task, null)) as Stage | null;
  const check = view.check;
  const rawCheck = (ctx.checks as Record<string, { phase: string; progress?: { step?: string } } | null> | null)?.[task] ?? null;
  const prepared = !draft && !!saved && saved.place === view.place && saved.model === view.model && (!check || check.phase === "done");
  const offer = (ctx.offers as { model: string; engine: string; download_size: number }[] | null)?.find((o) => o.model === view.model);
  const installed = !!offer && (ctx.installed as { model: string; engine: string }[]).some((b) => b.model === offer.model && b.engine === offer.engine);
  const needsDownload = view.place === "device" && !!offer && !installed;
  function prepare() {
    setPreparedHere(true);
    window.sidevoiceActions?.testStage?.(task, { place: view!.place, model: view!.model, options: current?.options ?? {}, build: current?.build ?? null });
  }
  function answer(ok: boolean) {
    if (ok && saved) { verified.set(task, keyOf(inUse, saved)); setWorks(true); }
  }
  function retry() { verified.delete(task); setWorks(false); trial.reset(); }
  function placeChosen(place: string) { setKeyFor(null); select(detecting(withPlace(ctx!, task, current, place, null))); }
  // An option of the kept model takes effect at once (and asks to be tried again); one of a model still being chosen
  // stays in the draft with it.
  function optionChosen(id: string, value: unknown, language?: string) {
    if (id === "language") chosenLanguage.current = value !== "auto";
    if (draft || !saved) select(withOption(ctx!, task, current, id, value, language));
    else window.sidevoiceActions?.setStageOption(task, id, value, language);
  }
  // Transcription: the sentence offered is in the stage's language, or the person's when it detects it.
  const sttLanguage = view.options.find((o) => o.kind === "language");
  const sayLanguage = sttLanguage && sttLanguage.value !== "auto" ? sttLanguage.value : speechLanguage;
  const input: TryInput = task === "stt" ? { language: sayLanguage, text: saySample(sayLanguage) } : { language: voiceLanguage, text };
  const start = () => trial.start(input);
  // The voice is configured per language, every language in view (operator, 2026-10-01), each with only its own
  // voices (sidevoice-core#23 filters a provider's by language) and its ▶: hearing a language makes it the test's.
  const voiceOption = view.options.find((o) => o.kind === "voice" && o.perLanguage) as Extract<StageOptionView, { kind: "voice" }> | undefined;
  const voiceRows = voiceOption && voiceOption.perLanguage ? voiceOption.rows : [];
  const optionsView = (options: StageOptionView[]) => options.map((o) => o.kind === "voice" && o.perLanguage
    ? { ...o, rows: o.rows.map((r) => ({ ...r, choices: r.choices.filter((c) => !c.other) })) } : o);
  function hear(language: string) {
    setVoiceLanguage(language);
    if (prepared) trial.start({ language, text: sampleIn(language).slice(0, TEXT_MAX) });
  }
  const testLanguageLabel = voiceRows.find((r) => r.language === voiceLanguage)?.label ?? "";
  const keyProvider = keyFor ?? (view.place && view.place !== "device" ? view.place : null);
  const listing = integrations?.value?.providers.find((p) => p.id === keyProvider);
  const keyPanel = keyProvider && inUse && listing
    ? <KeyLine ref={keyLine} key={keyProvider} fp={inUse} provider={keyProvider} label={listing.label} configured={!!listing.configured} hint={listing.hint ?? null}
        onCancel={keyFor ? () => setKeyFor(null) : undefined} ownSubmit={!footer} />
    : null;
  const rawStep = rawCheck?.phase === "running" ? rawCheck.progress?.step ?? "load" : null;
  const lang = currentLanguage();
  const keep = t(task === "tts" ? "stagecard.b.useVoice" : "stagecard.b.useModel");
  // A provider has nothing to download or load here: its model is only checked (operator, 2026-10-01).
  const remote = view.place !== "device";
  // What is still to do, in the order the card shows it.
  const pending: PendingStep | null =
    keyFor || (keyProvider && listing && !listing.configured) ? { label: t("stagecard.next.key"), run: () => keyLine.current?.submit() }
    : !view.model ? { label: t("wizard.continue"), disabled: true }
    : rawStep ? { label: t(rawStep === "download" ? "stagecard.next.downloading" : remote ? "stagecard.next.checking" : "stagecard.next.preparing"), disabled: true }
    : check?.phase === "failed" && !prepared ? { label: t("common.retry"), run: prepare }
    : check?.phase === "slow" ? { label: t("check.useAnyway"), run: () => window.sidevoiceActions?.decideStage(task, true) }
    : !prepared ? { label: remote ? t("stagecard.check") : !needsDownload ? t("stagecard.prepare") : offer?.download_size ? t("stagecard.downloadPrepare", { size: bytesText(offer.download_size, lang) }) : t("stagecard.downloadPrepareOnly"), run: prepare }
    : works || flow === "list" ? null
    : trial.state === "listening" ? { label: t("stagecard.listening"), disabled: true }
    : trial.state === "transcribing" ? { label: t("stagecard.transcribing"), disabled: true }
    : trial.state === "playing" ? { label: t("stagecard.playing"), disabled: true }
    // B: checked already; first the person tries it, then keeps it when they like what they heard — and tries again
    // as often as they want (operator, 2026-10-01: «Usar este modelo» must not come before any test).
    : flow === "configure" ? (trial.tried ? { label: keep, run: () => answer(true), secondary: { label: t("stagecard.next.again"), run: start } } : { label: t("stagecard.next.try"), run: start })
    // The answer is the action bar: «No» beside «Sí, funciona».
    : (trial.state === "heard" || trial.state === "played") && !trial.no
      ? { label: t("stagecard.yesWorks"), run: () => answer(true), secondary: { label: t("common.noCap"), run: () => trial.setNo(true) } }
    : trial.state === "idle" ? { label: t("stagecard.next.try"), run: start }
    : { label: t("stagecard.next.again"), run: start };
  const configure = flow === "configure" && prepared && !keyFor;
  const list = flow === "list";
  // List: touching a card selects that model and starts it at once — download, load, check.
  function pick(place: string, model: string) {
    setKeyFor(null);
    const base = place === current?.place ? current : withPlace(ctx!, task, current, place, null);
    const stage = detecting(withModel(ctx!, task, base, model)) as Stage;
    select(stage);
    if (saved && same(saved, stage) && (!check || check.phase === "done")) return;
    setPreparedHere(true);
    window.sidevoiceActions?.testStage?.(task, { place: stage.place, model: stage.model, options: stage.options ?? {}, build: stage.build ?? null });
  }
  if (rawCheck?.phase === "done") remember(task, (rawCheck as unknown as { stage: Stage; result?: Measured }).stage, (rawCheck as unknown as { result?: Measured }).result);
  const settings = (
    <StageSettings task={task} onMissingPlace={setKeyFor} placeExtra={keyPanel} pendingPlace={list ? null : keyFor} hideCheck hidePlaceNote hideVoiceTools
      pickers={list ? <ModelList task={task} ctx={ctx} view={view} current={current} saved={saved} running={rawCheck} rawStep={rawStep} onPick={pick} onRetry={prepare} /> : undefined}
      onPlaceChange={placeChosen}
      onModelChange={(model) => select(detecting(withModel(ctx, task, current, model)))}
      onOptionChange={optionChosen}
      onBuildChange={(value) => select(withBuild(ctx, task, current, value))}
      optionsView={optionsView}
      onVoicePreview={task === "tts" ? hear : undefined} voicePreviewing={trial.state === "playing" ? voiceLanguage : null}
      beforeOptions={<>
        {configure && <h3 className="stage-configure-title">{t(task === "tts" ? "stagecard.b.title.tts" : "stagecard.b.title.stt")}</h3>}
      </>}
      afterOptions={configure ? (
        <ConfigureAndListen task={task} trial={trial} input={input} languageLabel={testLanguageLabel} onText={setText} onStart={start} works={works} inFooter={!!footer}
          onKeep={() => answer(true)} keepLabel={keep} />
      ) : null}
      afterModel={list || keyFor || !view.model ? null : (
        <StageCard task={task} flow={flow} needsDownload={needsDownload} downloadSize={offer?.download_size ?? 0} prepared={prepared} works={works}
          runningStep={rawStep} inUseNote={!footer && preparedHere && flow === "try"} inFooter={!!footer} trial={trial} input={input} languageLabel={testLanguageLabel} onText={setText} onStart={start}
          onPrepare={prepare} onAnswer={answer} onRetry={retry}
          onTry={(model) => select(detecting(withModel(ctx, task, current, model)))} />
      )} />
  );
  const body = <div className="stage-editor">{settings}</div>;
  return <>{bodyClassName ? <div className={bodyClassName}>{body}</div> : body}{footer?.(pending)}</>;
}

function labelOf(ctx: NonNullable<ReturnType<typeof stageContext>>, model: string): string {
  return ((ctx?.catalog as { models?: { id: string; label?: string }[] } | null)?.models?.find((m) => m.id === model)?.label) ?? model;
}

type Phase = "download" | "prepare" | "test" | "check";

/** What a check measured: how long loading took, and how long the model takes to answer. */
interface Measured { load_ms?: number; passes?: { latency_ms?: number; first_audio_ms?: number }[] }
/** What each model measured when it was last checked here, per stage and place/model: shown on its card for good. */
const measuredBy = new Map<string, Measured>();
function remember(task: Task, stage: Stage | undefined, result: Measured | undefined) {
  if (stage && result) measuredBy.set(task + ":" + stage.place + "/" + stage.model, result);
}
const measuredFor = (task: Task, place: string, model: string) => measuredBy.get(task + ":" + place + "/" + model);
/** Past this a turn feels slow (checks.json, the same bound the check calls slow). */
const COMFORT_MS = checks.stt.comfort_ms;

/** What a check measured, said plainly (operator, 2026-10-01/02): how soon it understands you (or starts speaking), how
 *  long it took to get ready, and at the end a word for it against a comfortable conversation — no bar, which would
 *  read as progress. */
function Metrics({ task, result }: { task: Task; result: Measured }) {
  const t = useT();
  const lang = currentLanguage();
  const pass = result.passes?.at(-1);
  const answer = task === "stt" ? pass?.latency_ms : pass?.first_audio_ms;
  const seconds = (ms: number) => (ms / 1000).toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const verdict = answer == null ? null : answer <= COMFORT_MS / 3 ? "fast" : answer <= COMFORT_MS ? "ok" : "slow";
  return (
    <div className="metrics">
      {answer != null && <span className="metric-text">{t(task === "stt" ? "metrics.understands" : "metrics.speaks", { s: seconds(answer) })}</span>}
      {result.load_ms != null && <span className="metric-quiet">{t("metrics.ready", { s: seconds(result.load_ms) })}</span>}
      {verdict && <span className="metric-verdict" data-verdict={verdict}>{t("metrics." + verdict)}</span>}
    </div>
  );
}

/** Flow "list": every model of the stage as a card, this device first, then each provider (one without a key asks for
 *  it in its own group). A card says what the model is, its size and whether it is here, what it measured, and while
 *  it is being made ready, its phases. */
function ModelList({ task, ctx, view, current, saved, running, rawStep, onPick, onRetry }: {
  task: Task; ctx: NonNullable<ReturnType<typeof stageContext>>; view: StageView; current: Stage | null; saved: Stage | null;
  running: { phase: string; stage?: Stage } | null; rawStep: string | null; onPick: (place: string, model: string) => void; onRetry: () => void;
}) {
  const t = useT();
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const lang = currentLanguage();
  const installed = (offer: { model: string; engine: string }) => (ctx.installed as { model: string; engine: string }[]).some((b) => b.model === offer.model && b.engine === offer.engine);
  const groups = view.places.map((place) => {
    const models = (placeModels(ctx, place.id, task) as { id: string; label: string; description?: string; offer?: { model: string; engine: string; download_size: number } }[] | null) ?? null;
    return { place, models };
  });
  const check = view.check;
  return (
    <div className="model-list">
      {groups.map(({ place, models }, index) => {
        const listing = integrations?.value?.providers.find((p) => p.id === place.id);
        return (
          <section key={place.id} className="model-group" aria-label={place.label}>
            <h3 className="model-group-title"><ProviderIcon id={place.id} /> {place.label}</h3>
            {place.state === "missing" ? (
              inUse && listing ? <KeyLine key={place.id} fp={inUse} provider={place.id} label={listing.label} configured={false} hint={null} ownSubmit /> : null
            ) : !models ? <p className="muted small" role="status">{t("stage.modelsLoading")}</p> : (
              <ul className="model-cards">
                {models.map((model, i) => {
                  const selected = current?.place === place.id && current?.model === model.id;
                  const active = !!saved && saved.place === place.id && saved.model === model.id;
                  const mine = (stage?: Stage | null) => !!stage && stage.place === place.id && stage.model === model.id;
                  const busy = running?.phase === "running" && mine(running.stage);
                  const failed = check?.phase === "failed" && mine(running?.stage);
                  const slow = check?.phase === "slow" && mine(running?.stage);
                  const here = model.offer ? installed(model.offer) : false;
                  const size = model.offer?.download_size ? bytesText(model.offer.download_size, lang) : "";
                  const measured = measuredFor(task, place.id, model.id);
                  const phases: Phase[] = place.id === "device" ? ["download", "prepare", "check"] : ["check"];
                  const at: Phase = rawStep === "download" ? "download" : rawStep === "check" || place.id !== "device" ? "check" : "prepare";
                  return (
                    <li key={model.id} className="model-card" data-selected={selected || undefined} data-active={active || undefined} data-busy={busy || undefined}>
                      <button type="button" className="model-card-pick" aria-pressed={selected} onClick={() => onPick(place.id, model.id)} disabled={busy}>
                        <span className="model-card-head">
                          <strong>{model.label}</strong>
                          {index === 0 && i === 0 && place.id === "device" && <span className="badge">{t("list.recommended")}</span>}
                          {active && !busy && <span className="badge badge-active">{t("list.active")}</span>}
                        </span>
                        {model.description && <span className="muted small">{model.description}</span>}
                        <span className="model-card-meta small">{[size, place.id === "device" ? (here ? t("list.here") : t("list.toDownload")) : ""].filter(Boolean).join(" · ")}</span>
                        {measured && !busy && <Metrics task={task} result={measured} />}
                      </button>
                      {busy && (
                        <div className="model-card-progress" role="status">
                          <ol className="stage-card-phases">
                            {phases.map((phase) => {
                              const state = phases.indexOf(phase) < phases.indexOf(at) || (phase === "download" && here) ? "done" : phase === at ? "current" : "next";
                              return <li key={phase} data-state={state} aria-current={state === "current" ? "step" : undefined}>{t("stagecard.phase." + phase)}</li>;
                            })}
                          </ol>
                          {check?.phase === "running" && <><span className="small">{check.step}{check.amount ? " · " + check.amount : ""}</span><progress max={1} value={check.fraction ?? undefined} /></>}
                          <Button variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.cancelStage(task)}>{t("common.cancel")}</Button>
                        </div>
                      )}
                      {failed && (
                        <div className="model-card-progress" role="alert">
                          <span className="row-error small">{t("check.failed", { step: check.step, cause: check.cause })}</span>
                          <Button size="compact" onClick={onRetry}>{t("common.retry")}</Button>
                        </div>
                      )}
                      {slow && (
                        <div className="model-card-progress" role="alert">
                          <span className="warn-line small">{t("check.slow", { seconds: check.latency.replace(/\s*s$/, "") })}</span>
                          <span className="try-row">
                            <Button size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, true)}>{t("check.useAnyway")}</Button>
                            <Button variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, false)}>{t("stagecard.chooseOther")}</Button>
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The card under the model, always the same size whatever its state (operator, 2026-10-02): the name, and at its
 *  right the phases to go through; the model's line; one bar, there from the start and empty until it is made ready,
 *  that fills as it downloads, loads and checks; and one status line — what is happening, what went wrong, or what the
 *  check measured — with its actions at the end. In "try" the person's own try follows, under it. */
function StageCard({ task, flow, needsDownload, downloadSize, prepared, works, runningStep, inUseNote, inFooter, trial, input, languageLabel, onText, onStart, onPrepare, onAnswer, onRetry, onTry }: {
  task: Task; flow: StageFlow; needsDownload: boolean; downloadSize: number; prepared: boolean; works: boolean; runningStep: string | null; inUseNote: boolean;
  /** The next step is the wizard's footer button: the card does not repeat it. */
  inFooter: boolean; trial: Trial; input: TryInput; languageLabel: string; onText: (text: string) => void; onStart: () => void;
  onPrepare: () => void; onAnswer: (ok: boolean) => void; onRetry: () => void; onTry: (model: string) => void;
}) {
  const t = useT();
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  if (!view) return null;
  const check = view.check;
  const model = view.models.find((m) => m.id === view.model);
  const running = check?.phase === "running";
  const failed = check?.phase === "failed" && !prepared;
  const slow = check?.phase === "slow";
  const last: Phase = flow === "configure" ? "check" : "test";
  // A provider's model is only checked: there is nothing to download or load here.
  const phases: Phase[] = view.place === "device" ? ["download", "prepare", last] : flow === "configure" ? ["check"] : ["check", "test"];
  const first: Phase = view.place === "device" ? "prepare" : "check";
  // While it runs, the phases follow the progress: downloading, then loading, then checking.
  const downloading = runningStep === "download";
  const downloaded = !needsDownload || (!!runningStep && !downloading);
  const at: Phase = prepared ? last : !downloaded || downloading ? "download" : flow === "configure" && runningStep === "check" ? "check" : first;
  const lang = currentLanguage();
  const chooseOther = () => document.getElementById(`${task}-model`)?.click();
  const measured = measuredFor(task, view.place, view.model);
  // The bar: empty before, the download's share while downloading, moving while it loads and checks, full once ready.
  const tone = failed ? "failed" : slow ? "slow" : prepared ? "done" : running ? "running" : "idle";
  const fill = prepared || failed || slow ? 1 : downloading && check?.fraction != null ? check.fraction : 0;
  const busyBar = running && !(downloading && check?.fraction != null);
  const prepareLabel = view.place !== "device" ? t("stagecard.check") : !needsDownload ? t("stagecard.prepare")
    : downloadSize ? t("stagecard.downloadPrepare", { size: bytesText(downloadSize, lang) }) : t("stagecard.downloadPrepareOnly");
  const status = running ? <span className="stage-card-line">{check.step}{check.amount ? " · " + check.amount : ""}</span>
    : failed ? <span className="stage-card-line row-error" title={t("check.failed", { step: check.step, cause: check.cause })}>{t("check.failed", { step: check.step, cause: check.cause })}</span>
    : slow ? <span className="stage-card-line warn-line">{t("check.slow", { seconds: check.latency.replace(/\s*s$/, "") })}</span>
    : prepared ? (measured ? <Metrics task={task} result={measured} /> : <span className="stage-card-line ok-line">{t("stagecard.ready")}</span>)
    : <span className="stage-card-line muted">{t(view.place !== "device" ? "stagecard.status.unchecked" : needsDownload ? "stagecard.status.notDownloaded" : "stagecard.status.downloaded")}</span>;
  const actions = running ? <Button variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.cancelStage(task)}>{t("common.cancel")}</Button>
    : failed ? <>{!inFooter && <Button variant="primary" size="compact" onClick={onPrepare}>{t("common.retry")}</Button>}<Button size="compact" onClick={chooseOther}>{t("stagecard.chooseOther")}</Button></>
    : slow ? <>{!inFooter && <Button variant="primary" size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, true)}>{t("check.useAnyway")}</Button>}<Button size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, false)}>{t("stagecard.chooseOther")}</Button></>
    : !prepared ? (!inFooter && <Button variant="primary" size="compact" onClick={onPrepare}>{prepareLabel}</Button>)
    : flow === "try" && works ? <Button variant="ghost" size="compact" onClick={onRetry}>{t("stagecard.tryAgain")}</Button>
    : null;
  return (
    <section className="stage-card" aria-label={t("stagecard.label", { model: model?.label ?? view.model })} data-tone={tone} data-works={works || undefined}>
      <div className="stage-card-head">
        {/* Its size only: whether it is here is the phases' to say. */}
        <span className="stage-card-name"><strong>{model?.label ?? view.model}</strong>{view.place === "device" && downloadSize > 0 && <span className="muted small">{bytesText(downloadSize, lang)}</span>}</span>
        <ol className="stage-card-phases">
          {phases.map((phase) => {
            const done = phase === "download" ? downloaded && !downloading
              : prepared ? phase !== "test" || works : phases.indexOf(phase) < phases.indexOf(at);
            const state = done ? "done" : phase === at && (running || prepared || failed || slow) ? "current" : "next";
            return <li key={phase} data-state={state} aria-current={state === "current" ? "step" : undefined}>{t("stagecard.phase." + phase)}</li>;
          })}
        </ol>
      </div>
      <p className="stage-card-desc muted small" title={model?.description}>{model?.description || " "}</p>
      <div className="stage-card-track" data-tone={tone} data-busy={busyBar || undefined} role={running ? "progressbar" : undefined}
        aria-valuemin={running ? 0 : undefined} aria-valuemax={running ? 100 : undefined} aria-valuenow={running && !busyBar ? Math.round(fill * 100) : undefined}>
        <span style={{ width: Math.round(fill * 100) + "%" }} />
      </div>
      <div className="stage-card-status" role={failed || slow ? "alert" : "status"}>
        {status}
        {actions && <span className="stage-card-actions">{actions}</span>}
      </div>
      {flow === "try" && prepared && !works && <>
        {inUseNote && <p className="muted small" role="status">{t("stagecard.inUse")}</p>}
        <TryIt task={task} trial={trial} input={input} languageLabel={languageLabel} onText={onText} onStart={onStart} inFooter={inFooter} onAnswer={onAnswer} onTry={onTry} />
      </>}
    </section>
  );
}

/** Who speaks in a try: Sidevoice itself, as a conversation of its own («Primeros pasos»), with its mark. */
function useGuide() {
  const t = useT();
  const name = t("try.agent");
  const say = (text: string, extra: Partial<ChatMessage> = {}, id = "guide") => (
    <MessageGroup key={id} icon={<SidevoiceMark size={16} />} group={{ id, role: "assistant", name, messages: [{ segment: null, role: "assistant", text, name, time: 0, draft: true, ...extra }] }} />
  );
  return { name, say };
}

/** The voice test's text: a sentence in the language being heard to begin with, the person's to change. */
function TestText({ value, language, languageLabel, onChange, disabled }: { value: string; language: string; languageLabel: string; onChange: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <label className="try-text">
      <span className="ui-field-label">{languageLabel ? t("stagecard.text.labelIn", { language: languageLabel }) : t("stagecard.text.label")}</span>
      <textarea rows={2} maxLength={TEXT_MAX} lang={language} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
      <span className="try-count">{t("stagecard.text.count", { n: value.length, max: TEXT_MAX })}</span>
    </label>
  );
}

/** What a try shows, in the call's own bubbles (operator, 2026-10-01: the real components, so a change to them shows
 *  here too): the person's live bubble with its waveform while they speak, then what it understood; the agent's
 *  bubble with the text as the voice plays it. Before that: the sentence to say, or the text to hear. */
function TryShow({ task, trial, input, languageLabel, onText }: { task: Task; trial: Trial; input: TryInput; languageLabel: string; onText: (text: string) => void }) {
  const t = useT();
  const { state, failure, heard, played } = trial;
  const busy = state === "listening" || state === "transcribing" || state === "playing";
  const spoken = useSpokenSoFar(played, state === "playing");
  const guide = useGuide();
  // Started from the action bar, the try may be below the fold: it comes into view as it happens.
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state !== "idle") chat.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [state]);
  const message = (role: "user" | "assistant", text: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ segment: null, role, text, name: role === "user" ? t("stagecard.you") : "Sidevoice", time: 0, draft: true, ...extra });
  // The instructions are Sidevoice's own message, as in a real conversation (operator, 2026-10-01).
  return (<>
    <div className="try-chat" ref={chat}>
      {guide.say(task === "stt" ? t("try.guide.stt", { sample: input.text }) : t("try.guide.tts"))}
      {task === "stt" && (state === "listening" || state === "transcribing") && <LiveDraftBubble phase={state} />}
      {task === "stt" && state === "heard" && <MessageGroup group={{ id: "try", role: "user", name: t("stagecard.you"), messages: [message("user", heard)] }} />}
      {task === "tts" && (state === "playing" || state === "played") && (
        guide.say(played, { playback: state === "playing" ? "playing" : "complete", karaoke: state === "playing" && spoken ? { from: 0, to: spoken, mode: "word" } : null }, "played")
      )}
    </div>
    {task === "tts" && !busy && <TestText value={input.text} language={input.language} languageLabel={languageLabel} onChange={onText} />}
    <div role="alert">{state === "failed" && <p className="row-error small">
      {t(failure === "play" ? "stagecard.playFailed" : ["mic-denied", "no-mic", "stt-error"].includes(failure) ? "stagecard.fail." + failure : "stagecard.notHeard")}
    </p>}</div>
  </>);
}

/** Flow "try", phase 3: the person tries it, then «¿Es lo que has dicho?» / «¿Te suena bien?»: yes is what counts;
 *  no offers another model. In the wizard the buttons are the action bar's. */
function TryIt({ task, trial, input, languageLabel, onText, onStart, inFooter, onAnswer, onTry }: { task: Task; trial: Trial; input: TryInput; languageLabel: string; onText: (text: string) => void; onStart: () => void; inFooter: boolean; onAnswer: (ok: boolean) => void; onTry: (model: string) => void }) {
  const t = useT();
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const { state, no, setNo } = trial;
  const others = (view?.models ?? []).filter((m) => m.id !== view?.model);
  const answered = state === "heard" || state === "played";
  const busy = state === "listening" || state === "transcribing" || state === "playing";
  return (
    <div className="stage-card-body try-it">
      <TryShow task={task} trial={trial} input={input} languageLabel={languageLabel} onText={onText} />
      {answered && !no && (
        <div className="try-question">
          <p>{t(task === "stt" ? "stagecard.ask.stt" : "stagecard.ask.tts")}</p>
          {!inFooter && <span className="try-row">
            <Button variant="primary" size="compact" onClick={() => onAnswer(true)}>{t("stagecard.yesWorks")}</Button>
            <Button size="compact" onClick={() => setNo(true)}>{t("common.noCap")}</Button>
          </span>}
        </div>
      )}
      {no && (
        <div className="try-question">
          <p>{others.length ? t("stagecard.tryAnother") : t(task === "stt" ? "wizard.w4.tryProvider" : "wizard.w4.tryVoice")}</p>
          {!!others.length && <span className="try-row">
            {others.map((m) => <Button key={m.id} size="compact" onClick={() => onTry(m.id)}>{m.label}{m.detail && <span className="muted"> · {m.detail}</span>}</Button>)}
          </span>}
        </div>
      )}
      {!inFooter && !busy && (state === "idle" || state === "failed" || no) && (
        <span className="try-row">
          <Button variant={no ? "default" : "primary"} size="compact" onClick={onStart}>
            {task === "stt" ? <MicrophoneIcon size={15} /> : <SpeakerIcon size={15} />} {state === "idle" ? t(task === "stt" ? "stagecard.speak" : "stagecard.listen") : t("stagecard.next.again")}
          </Button>
        </span>
      )}
    </div>
  );
}

/** Flow "configure", second part: under the options, the test — the person's text and «Escuchar» with the settings as
 *  they are now (or a sentence to say and «Hablar»), as often as they like — and keeping it. No question asked. */
function ConfigureAndListen({ task, trial, input, languageLabel, onText, onStart, works, inFooter, onKeep, keepLabel }: {
  task: Task; trial: Trial; input: TryInput; languageLabel: string; onText: (text: string) => void; onStart: () => void; works: boolean; inFooter: boolean; onKeep: () => void; keepLabel: string;
}) {
  const t = useT();
  const busy = trial.state === "listening" || trial.state === "transcribing" || trial.state === "playing";
  return (
    <div className="stage-configure">
      <TryShow task={task} trial={trial} input={input} languageLabel={languageLabel} onText={onText} />
      <span className="try-row">
        {!inFooter && <Button size="compact" variant={trial.tried ? "default" : "primary"} onClick={onStart} disabled={busy || (task === "tts" && !input.text.trim())}>
          {task === "stt" ? <MicrophoneIcon size={15} /> : <SpeakerIcon size={15} />}{" "}
          {trial.state === "listening" ? t("stagecard.listening") : trial.state === "transcribing" ? t("stagecard.transcribing") : trial.state === "playing" ? t("stagecard.playing")
            : t(task === "stt" ? "stagecard.speak" : "stagecard.listen")}
        </Button>}
        {!inFooter && !works && trial.tried && <Button variant="primary" size="compact" onClick={onKeep}>{keepLabel}</Button>}
        {works && <span className="ok-line small" role="status">{t(task === "tts" ? "stagecard.b.inUse.tts" : "stagecard.b.inUse.stt")}</span>}
      </span>
    </div>
  );
}

/** How far the voice has got through the text, word by word, at a speaking pace — for the bubble's karaoke while the
 *  engine gives no word timings of its own. */
function useSpokenSoFar(text: string, playing: boolean): number {
  const [to, setTo] = useState(0);
  useEffect(() => {
    if (!playing) { setTo(0); return; }
    const ends = [...text.matchAll(/\S+/g)].map((m) => m.index! + m[0].length);
    let word = 0;
    const timer = setInterval(() => { word = Math.min(ends.length, word + 1); setTo(ends[word - 1] ?? 0); }, 330);
    return () => clearInterval(timer);
  }, [text, playing]);
  return to;
}
