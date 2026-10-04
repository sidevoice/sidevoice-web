import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { StageSettings } from "./StageSettings";
import { useOptionalOnboarding } from "../onboarding/onboarding-context";
import { hostTranslator } from "./host-i18n";
import { effectiveStage, withVoicesChosen } from "../../state/stage-settings.js";
import { stageContext } from "../../state/room-session-state.js";
import { stageTrialKey } from "../../services/onboarding-state";
import { useRoomStore } from "../../state/room-store";
import type { TranscriptionTrialHandle, TranscriptionTrialStage } from "../../services/transcription-trial";

const TEXT_MAX = 200;

export interface StageTrialFooterState {
  key: string | null;
  successful: boolean;
  ready: boolean;
  phase: "idle" | "listening" | "transcribing" | "playing" | "done" | "failed";
}

function errorMessage(reason: unknown, t: ReturnType<typeof hostTranslator>) {
  const error = reason && typeof reason === "object" ? reason as { key?: string; message?: string } : null;
  const key = error?.key || error?.message || "trial.stt_failed";
  return key.startsWith("trial.") ? t(key as Parameters<typeof t>[0]) : t("trial.stt_failed");
}

export function StageEditor({ task, setup = false, onConfigureProvider, trialActionRef, onTrialFooterState }: {
  task: "stt" | "tts";
  setup?: boolean;
  onConfigureProvider?: (provider: string) => void;
  trialActionRef?: MutableRefObject<(() => void) | null>;
  onTrialFooterState?: (state: StageTrialFooterState) => void;
}) {
  const t = hostTranslator();
  const view = useRoomStore((state) => state.stages?.[task] ?? null);
  const facts = useRoomStore((state) => state.facts);
  const onboarding = useOptionalOnboarding();
  const hostFp = facts.pairingInUse;
  const stage = useMemo(() => effectiveStage(stageContext(facts), task,
    facts.stageDraft?.[task] ?? facts.voicePreferences?.[task]), [facts, task]);
  const signature = hostFp && stage?.model ? stageTrialKey(hostFp, { stage }) : null;
  const [phase, setPhase] = useState<"idle" | "listening" | "transcribing" | "playing" | "done" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  const [voiceText, setVoiceText] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareFailure, setPrepareFailure] = useState(false);
  const [checkedSignature, setCheckedSignature] = useState<string | null>(null);
  const [trialInvalidated, setTrialInvalidated] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState(facts.speechLanguage);
  const voiceLanguagePicked = useRef(false);
  const trialRef = useRef<TranscriptionTrialHandle | null>(null);
  const generation = useRef(0);
  const voiceRows = view?.options.find((option) => option.kind === "voice" && option.perLanguage);
  const voiceLanguages = voiceRows?.kind === "voice" && voiceRows.perLanguage ? voiceRows.rows : [];
  const needsVoiceLanguage = view?.options.some((option) => option.kind === "voice" && option.perLanguage) ?? false;
  const voiceLanguageAvailable = !needsVoiceLanguage || voiceLanguages.some((row) => row.language === voiceLanguage);
  const stageLanguage = (stage?.options as Record<string, unknown> | undefined)?.language;
  const trialLanguage = task === "tts" ? voiceLanguage
    : typeof stageLanguage === "string" && stageLanguage !== "auto" ? stageLanguage : facts.speechLanguage;
  const trialSignature = hostFp && stage?.model ? stageTrialKey(hostFp, { stage, language: trialLanguage }) : null;
  const preparedStage = stage ? withVoicesChosen(stageContext(facts), stage) : null;
  const savedStage = effectiveStage(stageContext(facts), task, facts.voicePreferences?.[task]);
  const configurationKey = hostFp && preparedStage ? stageTrialKey(hostFp, { stage: preparedStage }) : null;
  const prepared = !setup || !!hostFp && facts.stagePreparation.host === hostFp && facts.stagePreparation.status === "ready" &&
    !!preparedStage && !!savedStage && checkedSignature === configurationKey &&
    stageTrialKey(hostFp, { stage: preparedStage }) === stageTrialKey(hostFp, { stage: savedStage });
  const sample = facts.voiceLanguages.find((language) => language.id === voiceLanguage)?.sample ?? t("wizard.samplePlaceholder");
  const successful = setup ? !trialInvalidated && !!onboarding?.trialled(task, trialSignature) : phase === "done" && signature !== null;
  const preparationReady = !setup || !!hostFp && facts.stagePreparation.host === hostFp && facts.stagePreparation.status === "ready";
  const ready = !!view && !!stage?.model && view.editable && !view.modelsLoading && !view.modelsError &&
    view.models.some((model) => model.id === stage.model) && preparationReady;

  useEffect(() => {
    generation.current++;
    trialRef.current?.cancel();
    trialRef.current = null;
    window.sidevoiceActions?.stopVoicePreview?.();
    setPhase("idle");
    setFailure("");
    setTranscript("");
    setLevel(0);
    setTrialInvalidated(false);
    // The selected host or its effective stage changed; a previous result no longer applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => () => {
    generation.current++;
    trialRef.current?.cancel();
    trialRef.current = null;
    window.sidevoiceActions?.stopVoicePreview?.();
    if (trialActionRef) trialActionRef.current = null;
  }, []);

  useEffect(() => {
    if (!setup || task !== "tts" || !hostFp || !stage || voiceLanguagePicked.current) return;
    const previous = onboarding?.record.trials[hostFp]?.tts;
    const matched = voiceLanguages.find((row) => previous === stageTrialKey(hostFp, { stage, language: row.language }));
    if (matched) { voiceLanguagePicked.current = true; setVoiceLanguage(matched.language); }
  }, [setup, task, hostFp, stage, voiceLanguages, onboarding?.record.trials]);

  useEffect(() => {
    if (voiceLanguages.length && !voiceLanguages.some((row) => row.language === voiceLanguage)) setVoiceLanguage(voiceLanguages[0]!.language);
  }, [voiceLanguages, voiceLanguage]);

  useEffect(() => {
    if (!voiceLanguagePicked.current) setVoiceLanguage(facts.speechLanguage);
  }, [facts.speechLanguage]);

  useEffect(() => {
    onTrialFooterState?.({ key: trialSignature, successful, ready: ready && prepared, phase });
  }, [onTrialFooterState, trialSignature, successful, ready, prepared, phase]);

  if (trialActionRef) trialActionRef.current = () => {
    if (task === "stt") {
      if (phase === "listening") stopTranscription(false);
      else if (phase === "transcribing") stopTranscription(true);
      else if (ready && prepared) void startTranscription();
    } else if (phase === "playing") {
      generation.current++;
      window.sidevoiceActions?.stopVoicePreview?.();
      setPhase("idle");
    } else if (ready && prepared) void playVoice();
  };

  async function startTranscription() {
    if (!hostFp || !stage || !ready || !prepared) return;
    if (setup && trialSignature && onboarding) { setTrialInvalidated(true); void onboarding.markTrial(task, null); }
    trialRef.current?.cancel();
    const run = ++generation.current;
    setPhase("listening");
    setFailure("");
    setTranscript("");
    try {
      const handle = window.sidevoiceActions?.transcriptionTrial?.({
        hostFp,
        stage: stage as TranscriptionTrialStage,
        onLevel: setLevel,
        onState: (next) => { if (generation.current === run) setPhase(next); },
      });
      if (!handle) throw new Error("trial.stt_failed");
      trialRef.current = handle;
      void handle.result.then(async ({ text }) => {
        if (generation.current !== run) return;
        trialRef.current = null;
        setTranscript(text);
        setPhase("done");
        if (setup && trialSignature && onboarding && await onboarding.markTrial(task, trialSignature)) setTrialInvalidated(false);
      }).catch((reason: unknown) => {
        if (generation.current !== run || (reason as Error)?.name === "AbortError") return;
        trialRef.current = null;
        setFailure(errorMessage(reason, t));
        setPhase("failed");
      });
      await handle.ready;
    } catch (reason) {
      if (generation.current !== run || (reason as Error)?.name === "AbortError") return;
      trialRef.current = null;
      setFailure(errorMessage(reason, t));
      setPhase("failed");
    }
  }

  function stopTranscription(discard = false) {
    const handle = trialRef.current;
    if (discard) {
      trialRef.current = null;
      generation.current++;
      handle?.cancel();
      setPhase("idle");
      setLevel(0);
      return;
    }
    handle?.finish();
  }

  async function playVoice() {
    if (!signature || !ready || !prepared || !voiceLanguage) return;
    if (setup && trialSignature && onboarding) { setTrialInvalidated(true); void onboarding.markTrial(task, null); }
    const text = voiceText.trim() || sample;
    const run = ++generation.current;
    setPhase("playing");
    setFailure("");
    const played = await window.sidevoiceActions?.previewVoice?.(voiceLanguage, text);
    if (generation.current !== run) return;
    if (played) {
      setPhase("done");
      if (setup && trialSignature && onboarding && await onboarding.markTrial(task, trialSignature)) setTrialInvalidated(false);
    } else {
      setFailure(t("trial.tts_failed"));
      setPhase("failed");
    }
  }

  const tryAgain = () => {
    if (phase === "playing") window.sidevoiceActions?.stopVoicePreview?.();
    setPhase("idle");
    setFailure("");
    setTranscript("");
  };

  async function prepareStage() {
    if (!hostFp || !ready || !setup) return;
    setPreparing(true);
    setPrepareFailure(false);
    try {
      if (!await window.sidevoiceActions?.prepareOnboardingStage?.(task, hostFp)) setPrepareFailure(true);
      else if (preparedStage) setCheckedSignature(stageTrialKey(hostFp, { stage: preparedStage }));
    } catch { setPrepareFailure(true); }
    finally { setPreparing(false); }
  }

  const stagePreparation = facts.stagePreparation;
  const stagePreparationFailed = setup && !!hostFp && stagePreparation.host === hostFp && stagePreparation.status === "failed";
  const stagePreparationLoading = setup && !!hostFp && stagePreparation.host === hostFp && stagePreparation.status === "loading";

  if (!view) return <p className="muted" role="status">{t("wizard.stageLoading")}</p>;

  return (
    <section className="stage-editor" data-task={task}>
      {stagePreparationLoading && <p className="muted" role="status">{t("wizard.stagePreparing")}</p>}
      {stagePreparationFailed && <p className="stage-try-error" role="alert">{t("wizard.stagePreparationFailed")}
        <Button type="button" variant="ghost" size="compact" onClick={() => void window.sidevoiceActions?.prepareOnboardingStages?.(hostFp!)}>{t("wizard.retryStagePreparation")}</Button>
      </p>}
      <StageSettings task={task} onConfigureProvider={onConfigureProvider} deferSelection={setup} disabled={setup && (!preparationReady || preparing)} />
      {setup && <div className="stage-prepare-action">
        <Button type="button" variant="default" disabled={!ready || preparing || stagePreparationLoading || stagePreparationFailed}
          onClick={() => void prepareStage()}>{preparing ? t("wizard.stageChecking") : t("wizard.prepareStage")}</Button>
        {prepareFailure && <p className="stage-try-error" role="alert">{t("wizard.stagePrepareFailed")}</p>}
      </div>}
      <section className="stage-try-card" aria-labelledby={`stage-try-${task}`} data-state={phase}>
        <header className="stage-try-header">
          <h4 id={`stage-try-${task}`}>{task === "stt" ? t("wizard.speak") : t("wizard.listen")}</h4>
          <span className="stage-try-status" role="status">
            {phase === "listening" ? t("wizard.listening") : phase === "transcribing" ? t("wizard.transcribing")
              : phase === "done" ? t("wizard.trialDone") : ""}
          </span>
        </header>
        {(!ready || !prepared) && <p className="muted" role="status">{t("wizard.stageUnavailable")}</p>}
        {task === "stt" ? <>
          <p className="muted">{t("wizard.sttIntro")}</p>
          {phase === "listening" && <div className="stage-live-bubble" role="status">
            <span className="stage-live-label">{t("wizard.listening")}</span>
            <progress max={100} value={level} aria-label={t("wizard.micLevel")} />
          </div>}
          {phase === "transcribing" && <p className="muted" role="status">{t("wizard.transcribing")}</p>}
          {transcript && <div className="stage-transcript">
            <p className="ui-field-label">{t("wizard.transcript")}</p>
            <p className="chat-bubble stage-transcript-bubble" lang={facts.speechLanguage}>{transcript}</p>
          </div>}
          {failure && <p className="stage-try-error" role="alert">{failure}</p>}
          <div className="stage-try-actions">
            {(phase === "idle" || phase === "failed") && !setup && <Button type="button" variant="primary" disabled={!ready}
              onClick={() => void startTranscription()}>{phase === "idle" ? t("wizard.speak") : t("wizard.trialAgain")}</Button>}
            {phase === "done" && <Button type="button" variant="primary" disabled={!ready || !prepared}
              onClick={() => void startTranscription()}>{t("wizard.trialAgain")}</Button>}
            {phase === "listening" && <>
              {!setup && <Button type="button" variant="primary" onClick={() => stopTranscription()}>{t("wizard.finishSpeaking")}</Button>}
              <Button type="button" variant="ghost" onClick={() => stopTranscription(true)}>{t("wizard.cancelTrial")}</Button>
            </>}
            {phase === "transcribing" && <Button type="button" variant="ghost" onClick={() => stopTranscription(true)}>{t("wizard.cancelTrial")}</Button>}
          </div>
        </> : <>
          <p className="muted">{t("wizard.ttsIntro")}</p>
          {!voiceLanguageAvailable && <p className="stage-try-error" role="alert">{t("wizard.voiceLanguagesUnavailable")}</p>}
          {voiceLanguages.length > 0 && <label className="ui-field stage-voice-language">
            <span className="ui-field-label">{t("wizard.voiceLanguage")}</span>
            <select value={voiceLanguage} disabled={phase === "playing"} onChange={(event) => { voiceLanguagePicked.current = true; setVoiceLanguage(event.currentTarget.value); tryAgain(); }}>
              {voiceLanguages.map((row) => <option key={row.language} value={row.language}>{row.label}</option>)}
            </select>
          </label>}
          <section className="stage-sample-message" aria-label={t("wizard.sample")}>
            <div className="chat-message-row">
              <Avatar name="Sidevoice" decorative />
              <article className="chat-bubble try-speak" data-role="assistant" data-position="only" data-playback={phase === "playing" ? "playing" : undefined}>
                <span className="chat-sender">{t("wizard.voiceSpeaker")}</span>
                <label>
                  <span className="sr-only">{t("wizard.sample")}</span>
                  <textarea rows={2} maxLength={TEXT_MAX} lang={voiceLanguage} value={voiceText} placeholder={sample}
                    disabled={phase === "playing"} onChange={(event) => setVoiceText(event.currentTarget.value)} />
                </label>
                <span className="try-count">{t("wizard.sampleCount", { count: voiceText.length, max: TEXT_MAX })}</span>
              </article>
            </div>
          </section>
          {phase === "playing" && <p className="muted" role="status">{facts.previewNote}</p>}
          {failure && <p className="stage-try-error" role="alert">{failure}</p>}
          <div className="stage-try-actions">
            {(!setup || phase === "done") && <Button type="button" variant="primary" disabled={!ready || !prepared || phase === "playing" || !voiceLanguageAvailable}
              onClick={() => void playVoice()}>{phase === "done" ? t("wizard.trialAgain") : t("wizard.listen")}</Button>}
          </div>
        </>}
      </section>
      {setup && successful && <p className="stage-try-success" role="status">{t("wizard.trialDone")}</p>}
    </section>
  );
}
