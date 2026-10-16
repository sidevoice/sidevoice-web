import type { ReactNode, Ref } from "react";
import { CheckIcon, EndOfTurnIcon, MachinesIcon, MicrophoneIcon, OtherMachineIcon, SidevoiceMark, ThisComputerIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import { currentDeviceName } from "../../state/device-name";
import { ConnectYourAgent } from "../room/ConnectYourAgent";
import { useModelState } from "../settings/ModelSetup";
import { useVoiceModels } from "../call/VoiceModels";
import type { Translate } from "../../i18n/translator";

/* The setup's last step, a small celebration to click through: the mark arriving, "You're all set — talk to your
 * agents", what was set up (read from what the steps wrote: the machine, the device's voice settings), what to tell an
 * agent to connect, and Enter Sidevoice in the footer — in the setup's own frame, its stepper's last bar turning
 * mustard. Under reduced motion it shows its final state at once. */

/** A row as things stand done (its check), downloading (its percentage, no mark) or not there yet (a
 *  neutral dash, never red, never a check). */
type RowState = "done" | "progress" | "missing";

function RecapRow({ icon, label, value, detail, state = "done" }: { icon: ReactNode; label: string; value: string; detail?: string; state?: RowState }) {
  return <div className="wizard-recap-row" data-state={state}>
    <span className="wizard-recap-icon" aria-hidden>{icon}</span>
    <dt>{label}</dt>
    {/* One line always: a long model name ends in an ellipsis, said whole on hover. */}
    <dd title={detail ? `${value} · ${detail}` : value}>{value}{detail && <span className="wizard-recap-detail"> · {detail}</span>}</dd>
    {state === "done" && <span className="wizard-recap-check" aria-hidden><CheckIcon size={12} /></span>}
    {state === "missing" && <span className="wizard-recap-dash" aria-hidden>–</span>}
  </div>;
}

/** The rows read as things stand now — what was passed without shows as not there yet, a
 *  download under way with its percentage — and with anything missing the title is a calmer one. */
export function ReadyStep({ path, machineName, title, t, live, microphoneNone = false }: {
  path: "agents" | "remote" | null; machineName: string; title: Ref<HTMLHeadingElement>; t: Translate; live: { machine: boolean; microphone: boolean }; microphoneNone?: boolean;
}) {
  const models = useVoiceModels().rows;
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const stt = useModelState("stt", draft);
  const tts = useModelState("tts", draft);
  // Smart only where it runs: otherwise a turn ends with silence, whatever was asked for.
  const turn = useModelState("end-of-turn", draft);
  const catalogName = (task: "stt" | "tts") => catalogs.find((catalog) => catalog.id === draft?.[task].catalog)?.name ?? undefined;
  const here = path !== "remote";
  // How the machines list this device, as the basics named it.
  const deviceName = currentDeviceName((_, params) => t("pair.deviceNameBrowser", params));
  const language = document.documentElement.lang || "en";
  // What a voice row says live: ready, its name; downloading, how far; else not there yet, and that the call area offers it.
  const voiceRow = (task: "stt" | "tts", value: string, detail?: string): { value: string; detail?: string; state: RowState } => {
    const slot = models.find((row) => row.slot.task === task)?.slot;
    if (slot?.status === "ready") return { value, detail, state: "done" };
    if (slot?.fraction != null) return { value, detail: t("wizard.recap.downloading", { percent: new Intl.NumberFormat(language, { style: "percent" }).format(slot.fraction) }), state: "progress" };
    return { value: slot?.status === "needsKey" ? t("voiceModels.state.needsKey") : t("wizard.recap.notDownloaded"), detail: t("wizard.recap.later"), state: "missing" };
  };
  const machine = live.machine
    ? { value: here ? t("wizard.recap.here") : machineName || t("wizard.choice.remote"), state: "done" as RowState }
    : { value: t("wizard.recap.notConnected"), detail: t("wizard.recap.later"), state: "missing" as RowState };
  // The microphone, passed without: not allowed yet, and the call area asks for it.
  const micRow = live.microphone ? { value: t(microphoneNone ? "perm.state.none" : "wizard.mic.state.granted"), state: "done" as RowState }
    : { value: t("wizard.mic.state.prompt"), detail: t("wizard.recap.micLater"), state: "missing" as RowState };
  const sttRow = voiceRow("stt", draft?.stt.model ?? "", stt.local ? undefined : catalogName("stt"));
  const ttsRow = voiceRow("tts", draft?.tts.model ?? "", tts.local ? undefined : catalogName("tts"));
  const partial = [micRow, machine, sttRow, ttsRow].some((row) => row.state !== "done");
  return <section className="wizard-ready">
    <div className="wizard-ready-hero">
      <span className="wizard-ready-mark" aria-hidden><SidevoiceMark size={64} /></span>
      <h2 id="wizard-title" className="wizard-title wizard-ready-title" ref={title} tabIndex={-1}>
        {t(partial ? "wizard.title.readyPartial" : "wizard.title.ready")}
      </h2>
    </div>
    <div className="wizard-recap">
      <h3 className="sr-only">{t("wizard.recap.title")}</h3>
      <dl className="wizard-recap-list">
        {/* A row per step of the setup, as its stepper has them — this device (the basics), the microphone, the machine,
            transcription, the voice, the end of turn: six, two by three (operator, 2026-10-16). */}
        <RecapRow icon={<MachinesIcon size={16} />} label={t("settings.deviceName")} value={deviceName} />
        <RecapRow icon={<MicrophoneIcon size={16} />} label={t("wizard.mic.label")} {...micRow} />
        <RecapRow icon={here ? <ThisComputerIcon size={16} /> : <OtherMachineIcon size={16} />} label={t("wizard.group.where")} {...machine} />
        <RecapRow icon={<TranscriptionIcon size={16} />} label={t("wizard.group.transcription")} {...sttRow} />
        <RecapRow icon={<VoicesIcon size={16} />} label={t("wizard.group.voice")} {...ttsRow} />
        <RecapRow icon={<EndOfTurnIcon size={16} />} label={t("voice.endOfTurn")}
          // The model by its name when one ends turns, Silence otherwise: one word or one name, as the other rows.
          value={draft?.end_of_turn === "smart-turn" && turn.model ? turn.model.id : t("voice.endOfTurn.silence")} />
      </dl>
      <p className="wizard-recap-note">{t("wizard.recap.note")}</p>
    </div>
    <div className="wizard-ready-connect"><ConnectYourAgent titleAs="h3" /></div>
  </section>;
}
