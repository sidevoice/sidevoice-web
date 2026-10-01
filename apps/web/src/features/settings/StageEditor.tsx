/* Choosing a stage — transcription or voice — the same way in the first-run wizard and in Configuración (operator,
 * 2026-10-01): the stage's own pane (where, model, options), and under the model one card that takes the chosen model
 * through three phases, always in the same order and with the same look for both stages:
 *
 *   1 Descargar (only when it is not on disk)  ·  2 Preparar (load and check)  ·  3 Probar (the person tries it)
 *
 * Choosing only selects (a draft). The card's one button prepares it; once prepared it is kept, and the person tries it
 * for real — says a sentence and reads it back, or listens to it — and says whether it works. «Funciona» is what the
 * wizard waits for; in Configuración the same answer only closes the card. A provider without a key asks for it in one
 * line under «Dónde». Switching model releases the previous one from memory; it stays on disk. */
import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { MicrophoneIcon, SpeakerIcon } from "../../components/ui/Icons";
import { currentLanguage, useT } from "../../i18n";
import { stageContext } from "../../state/room-session-state.js";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { effectiveStage, type Stage, type Task } from "../../state/hosts/stage-scope";
import { effectiveStage as effectiveStageOf, withModel, withPlace } from "../../state/stage-settings.js";
import { bytesText } from "../hosts/common";
import { StageSettings } from "./StageSettings";

/** What the person said works, per stage, for this session: «place/model». */
const verified = new Map<Task, string>();
const keyOf = (stage: { place: string; model: string } | null | undefined) => (stage ? stage.place + "/" + stage.model : "");

/** The sentence offered to say (stt) or played (tts), in the speech language. */
const SAMPLES: Record<string, { say: string; hear: string }> = {
  es: { say: "Mañana repasamos el diseño con calma.", hear: "Hola. Soy tu agente: te iré contando lo que hago." },
  en: { say: "Let's go over the design tomorrow.", hear: "Hi. I'm your agent: I'll tell you what I'm doing as I go." },
};

function useStageContext() {
  const store = useContext(RoomStoreContext);
  useRoomStore((s) => s.stages);
  return store ? stageContext(store.facts) : null;
}

/** A provider's key, in one line: required, checked with the provider, kept on the machine; once accepted it stays in
 *  the field, masked, and can be replaced (a refused replacement leaves the previous key in place). */
function KeyLine({ fp, provider, label, configured, hint }: { fp: string; provider: string; label: string; configured: boolean; hint: string | null }) {
  const t = useT();
  const hosts = useHostsController();
  const [key, setKey] = useState("");
  const [checked, setChecked] = useState("");
  const [state, setState] = useState<"" | "checking" | "refused">("");
  async function check() {
    const value = key.trim();
    if (!value || value === checked || state === "checking") return;
    setState("checking");
    try { await hosts.putKey(fp, provider, value); } catch { setState("refused"); return; }
    setChecked(value);
    setState("");
  }
  const valid = configured && state !== "refused" && (!key.trim() || key.trim() === checked);
  return (
    <div className="key-line" data-state={state || (valid ? "valid" : undefined)}>
      <input id={"key-" + provider} type="password" autoComplete="off" spellCheck={false} required aria-required="true" value={key}
        placeholder={configured && hint ? "•••• " + hint : t("wizard.w4.keyPlaceholder", { provider: label })} aria-label={t("wizard.w4.keyPlaceholder", { provider: label })}
        onChange={(event) => { setKey(event.currentTarget.value); if (state === "refused") setState(""); }}
        onBlur={() => void check()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void check(); } }} autoFocus={!configured} />
      <span className="key-line-state" role="status">
        {state === "checking" ? t("integrations.checking")
          : state === "refused" ? (configured ? t("wizard.w4.keyRefusedKept", { provider: label }) : t("wizard.w4.keyRefused", { provider: label }))
          : valid ? t("wizard.w4.keyValid") : t("wizard.w4.keyRequired")}
      </span>
    </div>
  );
}

export function StageEditor({ task, onWorksChange }: { task: Task; onWorksChange?: (works: boolean) => void }) {
  const t = useT();
  const hosts = useHostsController();
  const room = useContext(RoomStoreContext);
  const inUse = useHosts((s) => s.inUse);
  const integrations = useHosts((s) => (s.inUse ? s.integrations[s.inUse] : undefined));
  const saved = useHosts((s) => effectiveStage(s.scope, s.inUse, task));
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const draft = useRoomStore((s) => s.facts.stageDraft?.[task] ?? null);
  const ctx = useStageContext();
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [freed, setFreed] = useState<string | null>(null);
  const [works, setWorks] = useState(() => !!saved && verified.get(task) === keyOf(saved));
  useEffect(() => { if (inUse && (!integrations || integrations.status === "idle")) void hosts.loadIntegrations(inUse); }, [inUse, integrations, hosts]);
  // What was said to work is about the model kept: another one has to be tried again.
  useEffect(() => { setWorks(!!saved && !draft && verified.get(task) === keyOf(saved)); }, [saved, draft, task]);
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
    room!.patch({ stageDraft: { ...(room!.facts.stageDraft ?? {}), [task]: stage as Record<string, unknown> } });
  }
  const current = (draft ?? saved ?? effectiveStageOf(ctx, task, null)) as Stage | null;
  const check = view.check;
  const prepared = !draft && !!saved && keyOf(saved) === view.place + "/" + view.model && (!check || check.phase === "done");
  const offer = (ctx.offers as { model: string; engine: string; download_size: number }[] | null)?.find((o) => o.model === view.model);
  const installed = !!offer && (ctx.installed as { model: string; engine: string }[]).some((b) => b.model === offer.model && b.engine === offer.engine);
  const needsDownload = view.place === "device" && !!offer && !installed;
  function prepare() {
    if (saved && saved.place === "device" && saved.model !== view!.model) setFreed(labelOf(ctx!, saved.model));
    window.sidevoiceActions?.testStage?.(task, { place: view!.place, model: view!.model, options: current?.options ?? {}, build: null });
  }
  function answer(ok: boolean) {
    if (ok && saved) { verified.set(task, keyOf(saved)); setWorks(true); }
  }
  const keyProvider = keyFor ?? (view.place && view.place !== "device" ? view.place : null);
  const listing = integrations?.value?.providers.find((p) => p.id === keyProvider);
  const keyPanel = keyProvider && inUse && listing
    ? <KeyLine key={keyProvider} fp={inUse} provider={keyProvider} label={listing.label} configured={!!listing.configured} hint={listing.hint ?? null} />
    : null;
  return (
    <StageSettings task={task} onMissingPlace={setKeyFor} placeExtra={keyPanel} pendingPlace={keyFor} hideCheck hidePlaceNote
      onPlaceChange={(place) => select(withPlace(ctx, task, current, place, null))}
      onModelChange={(model) => select(withModel(ctx, task, current, model))}
      afterModel={keyFor || !view.model ? null : (
        <StageCard task={task} needsDownload={needsDownload} downloadSize={offer?.download_size ?? 0} prepared={prepared} works={works}
          freed={freed} onPrepare={prepare} onAnswer={answer} onRetry={() => setWorks(false)}
          onTry={(model) => select(withModel(ctx, task, current, model))} />
      )} />
  );
}

function labelOf(ctx: NonNullable<ReturnType<typeof stageContext>>, model: string): string {
  return ((ctx?.catalog as { models?: { id: string; label?: string }[] } | null)?.models?.find((m) => m.id === model)?.label) ?? model;
}

type Phase = "download" | "prepare" | "test";

/** The card under the model: the three phases as a strip, and what the current one needs. */
function StageCard({ task, needsDownload, downloadSize, prepared, works, freed, onPrepare, onAnswer, onRetry, onTry }: {
  task: Task; needsDownload: boolean; downloadSize: number; prepared: boolean; works: boolean; freed: string | null;
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
  const at: Phase = prepared ? "test" : needsDownload ? "download" : "prepare";
  const lang = currentLanguage();
  return (
    <section className="stage-card" aria-label={t("stagecard.label", { model: model?.label ?? view.model })} data-works={works || undefined}>
      <div className="stage-card-head">
        <span className="stage-card-name"><strong>{model?.label ?? view.model}</strong>{model?.detail && <span className="muted small">{model.detail}</span>}</span>
        <ol className="stage-card-phases">
          {phases.map((phase) => {
            const done = phase === "download" ? !needsDownload : prepared ? phase !== "test" || works : phases.indexOf(phase) < phases.indexOf(at);
            return <li key={phase} data-state={done ? "done" : phase === at ? "current" : "next"}>{t("stagecard.phase." + phase)}</li>;
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
          <Button variant="primary" size="compact" onClick={() => window.sidevoiceActions?.decideStage(task, true)}>{t("check.useAnyway")}</Button>
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
      ) : (
        <TryIt task={task} onAnswer={onAnswer} onTry={onTry} />
      )}
      {freed && prepared && <p className="muted small">{t("wizard.w4.freed", { model: freed })}</p>}
    </section>
  );
}

/** Phase 3: the person tries it. Transcription: a sentence to say (any will do), the level while it listens, and what it
 *  understood. Voice: a sentence played in the chosen voice. Then «¿Funciona?»: yes is what counts; no offers what to try. */
function TryIt({ task, onAnswer, onTry }: { task: Task; onAnswer: (ok: boolean) => void; onTry: (model: string) => void }) {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const language = useRoomStore((s) => s.facts.speechLanguage);
  const view = useRoomStore((s) => s.stages?.[task] ?? null);
  const [state, setState] = useState<"idle" | "listening" | "heard" | "playing" | "played" | "failed">("idle");
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const [no, setNo] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const sample = SAMPLES[language] ?? SAMPLES.en;
  const models = view?.models ?? [];
  const bigger = models[models.findIndex((m) => m.id === view?.model) + 1] ?? null;

  function listen() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState("listening"); setHeard(""); setNo(false);
    void hosts.echoTest(inUse, {
      level: (value) => { if (!controller.signal.aborted) setLevel(value); },
      heard: (text) => { if (!controller.signal.aborted) { setHeard(text); setState("heard"); setLevel(0); controller.abort(); } },
      replied: () => undefined,
      failed: () => { if (!controller.signal.aborted) setState("failed"); },
      silent: () => { if (!controller.signal.aborted) setState("failed"); },
    }, controller.signal);
  }
  function play() {
    setState("playing"); setNo(false);
    void window.sidevoiceActions?.previewVoice(language);
    setTimeout(() => setState("played"), 2200);
  }
  const answered = state === "heard" || state === "played";
  return (
    <div className="stage-card-body try-it">
      <p className="small">{t(task === "stt" ? "stagecard.try.stt" : "stagecard.try.tts")}</p>
      <blockquote className="try-sample">«{task === "stt" ? sample.say : sample.hear}»</blockquote>
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
      {state === "heard" && <p className="try-heard">{t("stagecard.heard")} <strong>«{heard}»</strong></p>}
      {state === "failed" && <p className="row-error small">{t("stagecard.notHeard")}</p>}
      {answered && (
        <div className="try-row try-answer">
          <span className="small">{t(task === "stt" ? "stagecard.ask.stt" : "stagecard.ask.tts")}</span>
          <Button variant="primary" size="compact" onClick={() => onAnswer(true)}>{t("stagecard.yesWorks")}</Button>
          <Button variant="ghost" size="compact" onClick={() => setNo(true)}>{t("common.noCap")}</Button>
        </div>
      )}
      {no && (
        <div className="try-row">
          <span className="muted small">{bigger ? t(task === "stt" ? "wizard.w4.tryBigger" : "stagecard.tryOtherModel", { model: bigger.label }) : t(task === "stt" ? "wizard.w4.tryProvider" : "wizard.w4.tryVoice")}</span>
          {bigger && <Button size="compact" onClick={() => onTry(bigger.id)}>{t("wizard.w4.useBigger", { model: bigger.label })}</Button>}
        </div>
      )}
    </div>
  );
}
