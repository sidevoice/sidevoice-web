/* Choosing a stage — transcription or voice — the same way in the first-run wizard and in Configuración (operator,
 * 2026-10-01): the stage's own pane (where, model, options), and under the model one card that takes the chosen model
 * through three phases, always in the same order and with the same look for both stages:
 *
 *   1 Descargar (only when it is not on disk)  ·  2 Preparar (load and check)  ·  3 Probar (the person tries it)
 *
 * Choosing only selects (a draft). The card's one button prepares it; once prepared it is kept, and the person tries it
 * for real — says a sentence and reads it back, or listens to it — and says whether it works. «Funciona» is what the
 * wizard waits for; in Configuración the same answer only closes the card. A provider without a key asks for it in one
 * line under «Dónde». Switching model releases the previous one from memory; it stays on disk. Every change — place,
 * model, engine, voice, language — is tried again: what was said to work is that exact configuration, on that machine. */
import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { MicrophoneIcon, SpeakerIcon } from "../../components/ui/Icons";
import { currentLanguage, useT } from "../../i18n";
import { stageContext } from "../../state/room-session-state.js";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { effectiveStage, type Stage, type Task } from "../../state/hosts/stage-scope";
import { effectiveStage as effectiveStageOf, withBuild, withModel, withOption, withPlace } from "../../state/stage-settings.js";
import { bytesText } from "../hosts/common";
import { StageSettings } from "./StageSettings";
import { saySample } from "./try-samples";

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

/** A provider's key, in one line: required, checked with the provider, kept on the machine; once accepted it stays in
 *  the field, masked, and can be replaced (a refused replacement leaves the previous key in place). */
function KeyLine({ fp, provider, label, configured, hint, onCancel }: { fp: string; provider: string; label: string; configured: boolean; hint: string | null; onCancel?: () => void }) {
  const t = useT();
  const hosts = useHostsController();
  const [key, setKey] = useState("");
  const [checked, setChecked] = useState("");
  const [state, setState] = useState<"" | "checking" | "refused">("");
  // What was sent: a result is about that value, and a key typed while it was checked is checked on its own.
  const sent = useRef("");
  async function check() {
    const value = key.trim();
    if (!value || value === checked || state === "checking") return;
    sent.current = value;
    setState("checking");
    try { await hosts.putKey(fp, provider, value); } catch { if (sent.current === value) setState("refused"); return; }
    setChecked(value);
    setState("");
  }
  const typed = key.trim();
  const valid = configured && state !== "refused" && (!typed || typed === checked);
  const unsent = !!typed && typed !== checked && state === "";
  return (
    <div className="key-line" data-state={state || (valid ? "valid" : undefined)}>
      <input id={"key-" + provider} type="password" autoComplete="off" spellCheck={false} required aria-required="true" value={key}
        placeholder={configured && hint ? "•••• " + hint : t("wizard.w4.keyPlaceholder", { provider: label })} aria-label={t("wizard.w4.keyPlaceholder", { provider: label })}
        onChange={(event) => { setKey(event.currentTarget.value); if (state === "refused") setState(""); }}
        onBlur={() => void check()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void check(); } }} autoFocus={!configured} />
      {unsent && <Button size="compact" onMouseDown={(event) => event.preventDefault()} onClick={() => void check()}>{t("stagecard.keyCheck")}</Button>}
      <span className="key-line-state" role="status">
        {state === "checking" ? t("integrations.checking")
          : state === "refused" ? (configured ? t("wizard.w4.keyRefusedKept", { provider: label }) : t("wizard.w4.keyRefused", { provider: label }))
          : unsent ? "" : valid ? t("wizard.w4.keyValid") : t("wizard.w4.keyRequired")}
      </span>
      {onCancel && <Button variant="ghost" size="compact" onClick={onCancel}>{t("common.cancel")}</Button>}
    </div>
  );
}

/** `onWorksChange`: the wizard, which waits for «Funciona». Without it (Configuración) a prepared model is in use at
 *  once, and the card says so until it is tried. */
export function StageEditor({ task, onWorksChange }: { task: Task; onWorksChange?: (works: boolean) => void }) {
  const t = useT();
  const hosts = useHostsController();
  const room = useContext(RoomStoreContext);
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const saved = useHosts((s) => effectiveStage(s.scope, s.inUse, task));
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const rawDraft = useRoomStore((s) => (s.facts.stageDraft?.[task] ?? null) as Stage | null);
  // The draft holds both stages; this one's is a draft only when it differs from what is kept.
  const draft = rawDraft && !same(rawDraft, saved) ? rawDraft : null;
  const ctx = useStageContext();
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [freed, setFreed] = useState<string | null>(null);
  // What was kept before the model being tried, to go back to it if it does not convince.
  const [previous, setPrevious] = useState<Stage | null>(null);
  // Prepared from this card: in Configuración it is in use from then on, which the card says until it is tried.
  const [preparedHere, setPreparedHere] = useState(false);
  const [works, setWorks] = useState(() => !!saved && verified.get(task) === keyOf(inUse, saved));
  useEffect(() => { if (inUse && (!integrations || integrations.status === "idle")) void hosts.loadIntegrations(inUse); }, [inUse, integrations, hosts]);
  // What was said to work is that configuration: any other one has to be tried again.
  useEffect(() => { setWorks(!!saved && !draft && verified.get(task) === keyOf(inUse, saved)); }, [saved, draft, task, inUse]);
  useEffect(() => { onWorksChange?.(works); }, [works, onWorksChange]);
  const keyed = useHosts((s) => !!keyFor && !!s.inUse && !!s.integrations[s.inUse]?.value?.providers.find((p) => p.id === keyFor)?.configured);
  useEffect(() => {
    if (!keyed || !keyFor || !ctx) return;
    select(withPlace(ctx, task, null, keyFor, null));
    setKeyFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyed, keyFor, task]);
  if (!view || !ctx || !room) return <p className="muted" role="status">{t("wizard.w4.measuring")}</p>;

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
    if (saved && saved.place === "device" && saved.model !== view!.model) setFreed(labelOf(ctx!, saved.model));
    setPrevious(saved && !same(saved, current) ? saved : null);
    setPreparedHere(true);
    window.sidevoiceActions?.testStage?.(task, { place: view!.place, model: view!.model, options: current?.options ?? {}, build: current?.build ?? null });
  }
  function answer(ok: boolean) {
    if (ok && saved) { verified.set(task, keyOf(inUse, saved)); setWorks(true); setPrevious(null); }
  }
  function retry() { verified.delete(task); setWorks(false); }
  function restore() {
    if (!previous) return;
    hosts.chooseStage(inUse, task, previous);
    setPrevious(null); setFreed(null);
  }
  function placeChosen(place: string) { setKeyFor(null); select(withPlace(ctx!, task, current, place, null)); }
  // An option of the kept model takes effect at once (and asks to be tried again); one of a model still being chosen
  // stays in the draft with it.
  function optionChosen(id: string, value: unknown, language?: string) {
    if (draft || !saved) select(withOption(ctx!, task, current, id, value, language));
    else window.sidevoiceActions?.setStageOption(task, id, value, language);
  }
  const keyProvider = keyFor ?? (view.place && view.place !== "device" ? view.place : null);
  const listing = integrations?.value?.providers.find((p) => p.id === keyProvider);
  const keyPanel = keyProvider && inUse && listing
    ? <KeyLine key={keyProvider} fp={inUse} provider={keyProvider} label={listing.label} configured={!!listing.configured} hint={listing.hint ?? null}
        onCancel={keyFor ? () => setKeyFor(null) : undefined} />
    : null;
  return (
    <StageSettings task={task} onMissingPlace={setKeyFor} placeExtra={keyPanel} pendingPlace={keyFor} hideCheck hidePlaceNote hideVoiceTools
      onPlaceChange={placeChosen}
      onModelChange={(model) => select(withModel(ctx, task, current, model))}
      onOptionChange={optionChosen}
      onBuildChange={(value) => select(withBuild(ctx, task, current, value))}
      afterModel={keyFor || !view.model ? null : (
        <StageCard task={task} needsDownload={needsDownload} downloadSize={offer?.download_size ?? 0} prepared={prepared} works={works}
          runningStep={rawCheck?.phase === "running" ? rawCheck.progress?.step ?? "load" : null} inUseNote={!onWorksChange && preparedHere}
          previous={previous ? labelOf(ctx, previous.model) : null} onRestore={restore}
          freed={freed} onPrepare={prepare} onAnswer={answer} onRetry={retry}
          onTry={(model) => select(withModel(ctx, task, current, model))} />
      )} />
  );
}

function labelOf(ctx: NonNullable<ReturnType<typeof stageContext>>, model: string): string {
  return ((ctx?.catalog as { models?: { id: string; label?: string }[] } | null)?.models?.find((m) => m.id === model)?.label) ?? model;
}

type Phase = "download" | "prepare" | "test";

/** The card under the model: the three phases as a strip, and what the current one needs. */
function StageCard({ task, needsDownload, downloadSize, prepared, works, runningStep, inUseNote, previous, onRestore, freed, onPrepare, onAnswer, onRetry, onTry }: {
  task: Task; needsDownload: boolean; downloadSize: number; prepared: boolean; works: boolean; runningStep: string | null; inUseNote: boolean;
  previous: string | null; onRestore: () => void; freed: string | null;
  onPrepare: () => void; onAnswer: (ok: boolean) => void; onRetry: () => void; onTry: (model: string) => void;
}) {
  const t = useT();
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  if (!view) return null;
  const check = view.check;
  const model = view.models.find((m) => m.id === view.model);
  const running = check?.phase === "running";
  // The same strip every time: a model that runs here is downloaded first (done when it is on disk); a provider has
  // nothing to download.
  const phases: Phase[] = view.place === "device" ? ["download", "prepare", "test"] : ["prepare", "test"];
  // While it runs, the strip follows the progress: downloading, then loading and checking.
  const downloading = runningStep === "download";
  const downloaded = !needsDownload || (!!runningStep && !downloading);
  const at: Phase = prepared ? "test" : !downloaded || downloading ? "download" : "prepare";
  const lang = currentLanguage();
  return (
    <section className="stage-card" aria-label={t("stagecard.label", { model: model?.label ?? view.model })} data-works={works || undefined}>
      <div className="stage-card-head">
        <span className="stage-card-name"><strong>{model?.label ?? view.model}</strong>{model?.detail && <span className="muted small">{model.detail}</span>}</span>
        <ol className="stage-card-phases">
          {phases.map((phase) => {
            const done = phase === "download" ? downloaded && !downloading : prepared ? phase !== "test" || works : phases.indexOf(phase) < phases.indexOf(at);
            const state = done ? "done" : phase === at ? "current" : "next";
            return <li key={phase} data-state={state} aria-current={state === "current" ? "step" : undefined}>{t("stagecard.phase." + phase)}</li>;
          })}
        </ol>
      </div>
      {model?.description && <p className="muted small">{model.description}</p>}

      {running ? (
        <div className="stage-card-body" role="status">
          <span className="small">{check.step}{check.amount ? " · " + check.amount : ""}</span>
          <progress max={1} value={check.fraction ?? undefined} />
          <Button variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.cancelStage(task)}>{t("common.cancel")}</Button>
        </div>
      ) : check?.phase === "failed" && !prepared ? (
        <div className="stage-card-body" role="alert">
          <span className="row-error small">{t("check.failed", { step: check.step, cause: check.cause })}</span>
          <Button variant="primary" size="compact" onClick={onPrepare}>{t("common.retry")}</Button>
        </div>
      ) : check?.phase === "slow" ? (
        <div className="stage-card-body" role="alert">
          <span className="warn-line small">{t("check.slow", { seconds: check.latency.replace(/\s*s$/, "") })}</span>
          <span className="try-row">
            <Button variant="primary" size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, true)}>{t("check.useAnyway")}</Button>
            <Button size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, false)}>{t("stagecard.chooseOther")}</Button>
          </span>
        </div>
      ) : !prepared ? (
        <div className="stage-card-body">
          <span className="muted small">{t(needsDownload ? "stagecard.needsDownload" : "stagecard.needsPrepare")}</span>
          <Button variant="primary" size="compact" onClick={onPrepare}>
            {needsDownload ? t("stagecard.downloadPrepare", { size: bytesText(downloadSize, lang) }) : t("stagecard.prepare")}
          </Button>
        </div>
      ) : works ? (
        <div className="stage-card-body stage-card-works" role="status">
          <span className="ok-line">{t("stagecard.works")}</span>
          <Button variant="ghost" size="compact" onClick={onRetry}>{t("stagecard.tryAgain")}</Button>
        </div>
      ) : (<>
        {inUseNote && <p className="muted small" role="status">{t("stagecard.inUse")}</p>}
        <TryIt task={task} onAnswer={onAnswer} onTry={onTry} previous={previous} onRestore={onRestore} />
      </>)}
      {freed && prepared && <p className="muted small">{t("wizard.w4.freed", { model: freed })}</p>}
    </section>
  );
}

/** Phase 3: the person tries it. Transcription: a sentence to say (any will do), the level while it listens, and what it
 *  understood. Voice: a sentence played in the chosen voice. Then «¿Funciona?»: yes is what counts; no offers what to try. */
function TryIt({ task, onAnswer, onTry, previous, onRestore }: { task: Task; onAnswer: (ok: boolean) => void; onTry: (model: string) => void; previous: string | null; onRestore: () => void }) {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const language = useRoomStore((s) => s.facts.speechLanguage);
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  // What is played is the voice catalogue's sentence for the language, so it is the one shown.
  const hearSample = useRoomStore((s) => s.facts.voiceLanguages?.find((l) => l.id === s.facts.speechLanguage)?.sample ?? "");
  const [state, setState] = useState<"idle" | "listening" | "heard" | "playing" | "played" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const [no, setNo] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  const sample = task === "stt" ? saySample(language) : hearSample;
  const fail = (key: string) => { setFailure(key); setState("failed"); setLevel(0); };
  const models = view?.models ?? [];
  const next = models[models.findIndex((m) => m.id === view?.model) + 1] ?? null;
  // Going back to the model kept before is offered as that, not as another one to try.
  const bigger = next && next.label !== previous ? next : null;

  function listen() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState("listening"); setHeard(""); setNo(false);
    void hosts.echoTest(inUse, {
      level: (value) => { if (!controller.signal.aborted) setLevel(value); },
      heard: (text) => { if (!controller.signal.aborted) { setHeard(text); setState("heard"); setLevel(0); controller.abort(); } },
      replied: () => undefined,
      failed: (key) => { if (!controller.signal.aborted) fail(key); },
      silent: () => { if (!controller.signal.aborted) fail("silent"); },
    }, controller.signal);
  }
  // «¿Te suena bien?» once it has been heard: when playback ends, not after a guess at how long it takes.
  async function play() {
    setState("playing"); setNo(false);
    try { await window.sidevoiceActions?.previewVoice(language); if (alive.current) setState("played"); }
    catch { if (alive.current) fail("play"); }
  }
  const answered = state === "heard" || state === "played";
  return (
    <div className="stage-card-body try-it">
      <p className="small">{t(task === "stt" ? "stagecard.try.stt" : "stagecard.try.tts")}</p>
      {sample && <blockquote className="try-sample">«{sample}»</blockquote>}
      <div className="try-row">
        {task === "stt" ? (
          <Button variant={answered ? "default" : "primary"} size="compact" onClick={listen} disabled={state === "listening"} aria-pressed={state === "listening"}>
            <MicrophoneIcon size={15} /> {state === "listening" ? t("stagecard.listening") : answered ? t("stagecard.again") : t("stagecard.speak")}
          </Button>
        ) : (
          <Button variant={answered ? "default" : "primary"} size="compact" onClick={play} disabled={state === "playing"}>
            <SpeakerIcon size={15} /> {state === "playing" ? t("stagecard.playing") : answered ? t("stagecard.again") : t("stagecard.listen")}
          </Button>
        )}
        {state === "listening" && <span className="try-meter" aria-hidden="true"><span style={{ width: Math.round(level * 100) + "%" }} /></span>}
      </div>
      <div role="status">{state === "heard" && <p className="try-heard">{t("stagecard.heard")} <strong>«{heard}»</strong></p>}</div>
      <div role="alert">{state === "failed" && <p className="row-error small">
        {t(failure === "play" ? "stagecard.playFailed" : ["mic-denied", "no-mic", "stt-error"].includes(failure) ? "stagecard.fail." + failure : "stagecard.notHeard")}
      </p>}</div>
      {answered && (
        <div className="try-row try-answer">
          <span className="small">{t(task === "stt" ? "stagecard.ask.stt" : "stagecard.ask.tts")}</span>
          <Button variant="primary" size="compact" onClick={() => onAnswer(true)}>{t("stagecard.yesWorks")}</Button>
          <Button variant="ghost" size="compact" onClick={() => setNo(true)}>{t("common.noCap")}</Button>
        </div>
      )}
      {no && (
        <div className="try-row">
          {(bigger || !previous) && <span className="muted small">{bigger ? t(task === "stt" ? "wizard.w4.tryBigger" : "stagecard.tryOtherModel", { model: bigger.label }) : t(task === "stt" ? "wizard.w4.tryProvider" : "wizard.w4.tryVoice")}</span>}
          {bigger && <Button size="compact" onClick={() => onTry(bigger.id)}>{t("wizard.w4.useBigger", { model: bigger.label })}</Button>}
          {previous && <Button size="compact" onClick={onRestore}>{t("stagecard.restore", { model: previous })}</Button>}
        </div>
      )}
    </div>
  );
}
