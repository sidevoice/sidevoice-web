import type { ReactNode, Ref } from "react";
import { CheckIcon, ConnectorIcon, EndOfTurnIcon, MachinesIcon, SidevoiceMark, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import { ConnectYourAgent } from "../room/ConnectYourAgent";
import { useModelState } from "../settings/ModelSetup";
import type { HostTranslate } from "../settings/host-i18n";

/* The setup's last step, a small celebration to click through: the mark arriving, "You're all set — talk to your
 * agents", what was set up (read from what the steps wrote: the machine, the device's voice settings), what to tell an
 * agent to connect, and Enter Sidevoice in the footer. Two designs for the operator to compare (variant "ready"):
 * A keeps the setup's frame, its last bar mustard; B steps the frame back onto the stage. Under reduced motion it
 * shows its final state at once. */

export type ReadyVariant = "a" | "b";

function RecapRow({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <div className="wizard-recap-row">
    <span className="wizard-recap-icon" aria-hidden>{icon}</span>
    <dt>{label}</dt>
    <dd>{value}{detail && <span className="wizard-recap-detail"> · {detail}</span>}</dd>
    <span className="wizard-recap-check" aria-hidden><CheckIcon size={12} /></span>
  </div>;
}

export function ReadyStep({ variant, path, machineName, title, t }: {
  variant: ReadyVariant; path: "agents" | "remote" | null; machineName: string; title: Ref<HTMLHeadingElement>; t: HostTranslate;
}) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const stt = useModelState("stt", draft);
  const tts = useModelState("tts", draft);
  // Smart only where it runs: otherwise a turn ends with silence, whatever was asked for.
  const turn = useModelState("end-of-turn", draft);
  const catalogName = (task: "stt" | "tts") => catalogs.find((catalog) => catalog.id === draft?.[task].catalog)?.name ?? undefined;
  const here = path !== "remote";
  return <section className="wizard-ready" data-variant={variant}>
    <div className="wizard-ready-hero">
      <span className="wizard-ready-mark" aria-hidden><SidevoiceMark size={variant === "a" ? 64 : 48} /></span>
      <h2 id="wizard-title" className="wizard-title wizard-ready-title" ref={title} tabIndex={-1}>
        {t("wizard.ready.titleLead")} <span className="wizard-ready-talk">{t("wizard.ready.titleTalk")}</span>
      </h2>
    </div>
    <div className="wizard-recap">
      <h3 className={variant === "a" ? "sr-only" : "wizard-recap-title"}>{t("wizard.recap.title")}</h3>
      <dl className="wizard-recap-list">
        <RecapRow icon={here ? <MachinesIcon size={16} /> : <ConnectorIcon size={16} />} label={t("wizard.group.where")}
          value={here ? t("wizard.recap.here") : machineName || t("wizard.choice.remote")} />
        <RecapRow icon={<TranscriptionIcon size={16} />} label={t("wizard.group.transcription")} value={draft?.stt.model ?? ""} detail={stt.local ? undefined : catalogName("stt")} />
        <RecapRow icon={<VoicesIcon size={16} />} label={t("wizard.group.voice")} value={draft?.tts.model ?? ""} detail={tts.local ? undefined : catalogName("tts")} />
        <RecapRow icon={<EndOfTurnIcon size={16} />} label={t("voice.endOfTurn")}
          value={draft?.end_of_turn === "smart-turn" && turn.model ? t("wizard.recap.smart") : t("voice.endOfTurn.silence")} />
      </dl>
      <p className="wizard-recap-note">{t("wizard.recap.note")}</p>
    </div>
    <div className="wizard-ready-connect"><ConnectYourAgent titleAs="h3" /></div>
  </section>;
}
