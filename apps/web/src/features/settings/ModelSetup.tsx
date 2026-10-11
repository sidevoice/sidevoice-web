import { useEffect, useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import type { DeviceVoiceSettings as Settings } from "../../services/voice-settings.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";

/* A voice slot's chosen model made ready, the same in Settings → Voice and in the first-run setup (prototype B): one
 * of this device's catalogue is downloaded first when it is not on disk (its size said, with progress and cancel); a
 * provider's needs no download, only its key. Once ready, its options show (its voices, language, speed) and it can be
 * tried for real. */

export type Task = "stt" | "tts";

/** Where the slot's model stands: not on this device yet (with its download size), being installed, failed, ready. */
export function useModelState(task: Task, draft: Settings | null) {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const install = useRoomStore((state) => state.facts.voiceInstall);
  const slot = draft?.[task];
  const model = slot ? catalogs.find((catalog) => catalog.id === slot.catalog)?.models.find((candidate) => candidate.id === slot.model) ?? null : null;
  const local = slot?.catalog === "local";
  const installed = !!model && (!local || model.installed === true || !!model.builds?.some((build) => build.installed));
  const build = model?.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model?.builds?.find((candidate) => candidate.available);
  const mine = install && install.task === task && install.model === slot?.model ? install : null;
  return {
    model,
    local,
    /** Ready to use: a provider's listed model, or one of this device's that is on disk. */
    ready: !!model && installed,
    size: build?.downloadBytes ?? null,
    installing: mine?.state === "running",
    fraction: mine?.state === "running" ? mine.fraction : null,
    failure: mine?.state === "failed" ? mine.error : "",
  };
}

export type ModelState = ReturnType<typeof useModelState>;

/** Bytes as people read them: MB below a gigabyte, else GB. */
export function sizeText(bytes: number | null, language = document.documentElement.lang || "en") {
  if (!bytes) return "";
  const format = (value: number, unit: string) => value.toLocaleString(language, { maximumFractionDigits: value < 10 ? 1 : 0 }) + " " + unit;
  return bytes >= 1e9 ? format(bytes / 1e9, "GB") : format(Math.max(1, bytes / 1e6), "MB");
}

/** The download of the slot's model: started, cancelled. */
export const downloadModel = (task: Task) => void window.sidevoiceActions?.installVoiceModel?.(task);
export const cancelDownload = () => window.sidevoiceActions?.cancelVoiceInstall?.();

/** The card under the model: what it takes to be ready and how far that has got. With \`actionsInFooter\` (the setup),
 *  its main action is the dialog's; otherwise it carries its own. */
export function ModelCard({ task, state, actionsInFooter = false }: { task: Task; state: ModelState; actionsInFooter?: boolean }) {
  const t = hostTranslator();
  if (!state.model || !state.local) return null;
  const percent = state.fraction == null ? null : Math.round(state.fraction * 100);
  return (
    <div className="model-card" id={task + "-model-card"} data-state={state.installing ? "installing" : state.failure ? "failed" : state.ready ? "ready" : "absent"}>
      {state.installing ? <>
        <p className="muted" role="status">{percent == null ? t("voice.model.downloading") : t("voice.model.downloadingAt", { percent })}</p>
        <progress max={1} value={state.fraction ?? undefined} aria-label={t("voice.model.downloading")} />
        <Button type="button" variant="ghost" size="compact" id={task + "-model-cancel"} onClick={cancelDownload}>{t("voice.model.cancelDownload")}</Button>
      </> : state.failure ? <>
        <p className="stage-try-error" role="alert">{state.failure}</p>
        {!actionsInFooter && <Button type="button" size="compact" onClick={() => downloadModel(task)}>{t("voice.retry")}</Button>}
      </> : state.ready ? <p className="muted">{t("voice.model.here")}</p> : <>
        <p className="muted">{state.size ? t("voice.model.notHere", { size: sizeText(state.size) }) : t("voice.model.notHereUnknown")}</p>
        {!actionsInFooter && <Button type="button" variant="primary" size="compact" id={task + "-model-download"} onClick={() => downloadModel(task)}>
          {state.size ? t("voice.model.download", { size: sizeText(state.size) }) : t("voice.model.downloadUnknown")}</Button>}
      </>}
    </div>
  );
}

type TryState = { phase: "idle" | "running" | "done" | "failed"; text: string; error: string };

/** A real try of the settings being edited for \`task\` (the controller's \`tryVoiceSettings\`): \`keep\` makes settings that
 *  work this device's (the setup); \`onTried\` hears each success. A changed setting clears it; leaving stops it. */
export function useVoiceTry(task: Task | null, { keep = true, onTried }: { keep?: boolean; onTried?: (task: Task) => void } = {}) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [trial, setTrial] = useState<TryState>({ phase: "idle", text: "", error: "" });
  const slot = JSON.stringify(task && draft ? draft[task] : null);
  useEffect(() => { setTrial({ phase: "idle", text: "", error: "" }); }, [slot, task]);
  useEffect(() => () => window.sidevoiceActions?.cancelVoiceTry?.(), [task]);
  async function run(options: { text?: string; language?: string | null } = {}) {
    if (!task) return;
    setTrial({ phase: "running", text: "", error: "" });
    try {
      const result = await window.sidevoiceActions!.tryVoiceSettings!(task, { ...options, keep });
      setTrial({ phase: "done", text: result.text ?? "", error: "" });
      onTried?.(task);
    } catch (error) {
      setTrial({ phase: (error as { code?: string }).code === "trial-cancelled" ? "idle" : "failed", text: "", error: (error as Error).message });
    }
  }
  return { trial, run, cancel: () => window.sidevoiceActions?.cancelVoiceTry?.() };
}

/** What a try shows: listening or playing, the words heard, why it failed. */
export function TryResult({ task, trial, t }: { task: Task; trial: TryState; t: HostTranslate }) {
  return <div className="voice-try-result" aria-live="polite">
    {trial.phase === "running" && <p className="muted" role="status">{t(task === "stt" ? "wizard.listening" : "wizard.playing")}</p>}
    {trial.phase === "done" && task === "stt" && <div className="wizard-heard"><span className="muted">{t("wizard.transcript")}</span><p className="speech-bubble" id={task + "-heard"}>{trial.text}</p></div>}
    {trial.phase === "failed" && <p className="stage-try-error" role="alert">{trial.error}</p>}
  </div>;
}

/** The try in Settings: its own button, the sample sentence for the voice, and what came of it. Nothing is kept: the
 *  pane's Save does that. */
export function VoiceTry({ task, draft, ready }: { task: Task; draft: Settings; ready: boolean }) {
  const t = hostTranslator();
  const speechLanguage = useRoomStore((state) => state.facts.speechLanguage);
  const { trial, run, cancel } = useVoiceTry(task, { keep: false });
  const language = draft.stt.language || speechLanguage;
  const start = () => void run(task === "stt" ? {} : { text: t("wizard.sampleText"), language });
  return <div className="voice-try">
    <Button type="button" size="compact" id={task + "-try"} disabled={!ready && trial.phase !== "running"} onClick={trial.phase === "running" ? cancel : start}>
      {trial.phase === "running" ? t("wizard.cancelTrial") : t(task === "stt" ? "voice.try.speak" : "voice.try.listen")}
    </Button>
    <TryResult task={task} trial={trial} t={t} />
  </div>;
}
