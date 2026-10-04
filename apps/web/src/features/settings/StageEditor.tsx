import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { StageSettings } from "./StageSettings";
import { useOnboarding } from "../onboarding/onboarding-context";
import { hostTranslator } from "./host-i18n";
import { effectiveStage } from "../../state/stage-settings.js";
import { stageContext } from "../../state/room-session-state.js";
import { stageTrialKey } from "../../services/onboarding-state";
import { useRoomStore } from "../../state/room-store";
import type { TranscriptionTrialHandle } from "../../services/transcription-trial";

const TEXT_MAX = 200;

function errorMessage(reason: unknown, t: ReturnType<typeof hostTranslator>) {
  const error = reason && typeof reason === "object" ? reason as { key?: string; message?: string } : null;
  const key = error?.key || error?.message || "trial.stt_failed";
  return key.startsWith("trial.") ? t(key as Parameters<typeof t>[0]) : t("trial.stt_failed");
}

export function StageEditor({ task, setup = false, onConfigureProvider }: {
  task: "stt" | "tts";
  setup?: boolean;
  onConfigureProvider?: (provider: string) => void;
}) {
  const t = hostTranslator();
  const view = useRoomStore((state) => state.stages?.[task] ?? null);
  const facts = useRoomStore((state) => state.facts);
  const onboarding = useOnboarding();
  const hostFp = facts.pairingInUse;
  const stage = useMemo(() => effectiveStage(stageContext(facts), task,
    facts.stageDraft?.[task] ?? facts.voicePreferences?.[task]), [facts, task]);
  const signature = hostFp && stage?.model ? onboarding.stageKey(task) : null;
  const [phase, setPhase] = useState<"idle" | "listening" | "transcribing" | "playing" | "done" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  const [voiceText, setVoiceText] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState(facts.speechLanguage);
  const voiceLanguagePicked = useRef(false);
  const trialRef = useRef<TranscriptionTrialHandle | null>(null);
  const generation = useRef(0);
  const voiceRows = view?.options.find((option) => option.kind === "voice" && option.perLanguage);
  const voiceLanguages = voiceRows?.kind === "voice" && voiceRows.perLanguage ? voiceRows.rows : [];
  const needsVoiceLanguage = view?.options.some((option) => option.kind === "voice" && option.perLanguage) ?? false;
  const voiceLanguageAvailable = !needsVoiceLanguage || voiceLanguages.some((row) => row.language === voiceLanguage);
  const trialLanguage = task === "tts" ? voiceLanguage
    : stage?.options?.language && stage.options.language !== "auto" ? String(stage.options.language) : facts.speechLanguage;
  const trialSignature = hostFp && stage?.model ? stageTrialKey(hostFp, { stage, language: trialLanguage }) : null;
  const sample = facts.voiceLanguages.find((language) => language.id === voiceLanguage)?.sample ?? t("wizard.samplePlaceholder");
  const successful = setup ? onboarding.trialled(task, trialSignature) : phase === "done" && signature !== null;
  const ready = !!view && !!stage?.model && view.editable && !view.modelsLoading;

  useEffect(() => {
    generation.current++;
    trialRef.current?.cancel();
    trialRef.current = null;
    setPhase("idle");
    setFailure("");
    setTranscript("");
    setLevel(0);
    if (task === "tts") void window.sidevoiceActions?.previewVoice(voiceLanguage, "");
    // The selected host or its effective stage changed; a previous result no longer applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => () => {
    generation.current++;
    trialRef.current?.cancel();
    trialRef.current = null;
  }, []);

  useEffect(() => {
    if (voiceLanguages.length && !voiceLanguages.some((row) => row.language === voiceLanguage)) setVoiceLanguage(voiceLanguages[0]!.language);
  }, [voiceLanguages, voiceLanguage]);

  useEffect(() => {
    if (!voiceLanguagePicked.current) setVoiceLanguage(facts.speechLanguage);
  }, [facts.speechLanguage]);

  async function startTranscription() {
    if (!hostFp || !stage || !ready) return;
    trialRef.current?.cancel();
    const run = ++generation.current;
    setPhase("listening");
    setFailure("");
    setTranscript("");
    try {
      const handle = window.sidevoiceActions?.transcriptionTrial?.({
        hostFp,
        stage,
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
        if (setup && trialSignature) await onboarding.markTrial(task, trialSignature);
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
    trialRef.current = null;
    if (discard) {
      generation.current++;
      handle?.cancel();
      setPhase("idle");
      setLevel(0);
      return;
    }
    handle?.finish();
  }

  async function playVoice() {
    if (!signature || !ready || !voiceLanguage) return;
    const text = voiceText.trim() || sample;
    const run = ++generation.current;
    setPhase("playing");
    setFailure("");
    const played = await window.sidevoiceActions?.previewVoice(voiceLanguage, text);
    if (generation.current !== run) return;
    if (played) {
      setPhase("done");
      if (setup && trialSignature) await onboarding.markTrial(task, trialSignature);
    } else {
      setFailure(t("trial.tts_failed"));
      setPhase("failed");
    }
  }

  const tryAgain = () => {
    setPhase("idle");
    setFailure("");
    setTranscript("");
  };

  if (!view) return <p className="muted" role="status">{t("wizard.stageLoading")}</p>;

  return (
    <section className="stage-editor" data-task={task}>
      <StageSettings task={task} onConfigureProvider={onConfigureProvider} />
      <section className="stage-try-card" aria-labelledby={`stage-try-${task}`} data-state={phase}>
        <header className="stage-try-header">
          <h4 id={`stage-try-${task}`}>{task === "stt" ? t("wizard.speak") : t("wizard.listen")}</h4>
          <span className="stage-try-status" role="status">
            {phase === "listening" ? t("wizard.listening") : phase === "transcribing" ? t("wizard.transcribing")
              : phase === "done" ? t("wizard.trialDone") : ""}
          </span>
        </header>
        {!ready && <p className="muted" role="status">{t("wizard.stageUnavailable")}</p>}
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
            {(phase === "idle" || phase === "failed" || phase === "done") && <Button type="button" variant="primary" disabled={!ready}
              onClick={() => void startTranscription()}>{phase === "idle" ? t("wizard.speak") : t("wizard.trialAgain")}</Button>}
            {phase === "listening" && <>
              <Button type="button" variant="primary" onClick={() => stopTranscription()}>{t("wizard.finishSpeaking")}</Button>
              <Button type="button" variant="ghost" onClick={() => stopTranscription(true)}>{t("wizard.cancelTrial")}</Button>
            </>}
            {phase === "transcribing" && <Button type="button" variant="ghost" onClick={() => stopTranscription(true)}>{t("wizard.cancelTrial")}</Button>}
          </div>
        </> : <>
          <p className="muted">{t("wizard.ttsIntro")}</p>
          {!voiceLanguageAvailable && <p className="stage-try-error" role="alert">{t("wizard.voiceLanguagesUnavailable")}</p>}
          {voiceLanguages.length > 0 && <label className="ui-field stage-voice-language">
            <span className="ui-field-label">{t("wizard.voiceLanguage")}</span>
            <select value={voiceLanguage} onChange={(event) => { voiceLanguagePicked.current = true; setVoiceLanguage(event.currentTarget.value); tryAgain(); }}>
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
            <Button type="button" variant="primary" disabled={!ready || phase === "playing" || !voiceLanguageAvailable}
              onClick={() => void playVoice()}>{phase === "playing" ? t("wizard.listen") : phase === "done" ? t("wizard.trialAgain") : t("wizard.listen")}</Button>
          </div>
        </>}
      </section>
      {setup && successful && <p className="stage-try-success" role="status">{t("wizard.trialDone")}</p>}
    </section>
  );
}
