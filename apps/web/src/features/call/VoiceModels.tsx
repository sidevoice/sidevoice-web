import { TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import { useRoomStore } from "../../state/room-store";
import { voiceSettingsHere } from "../../services/voice-settings.js";
import { useModelState } from "../settings/ModelSetup";
import { callTranslator, type CallTranslate } from "./call-i18n";
import type { CallMessageKey } from "./messages/en";

/* The models this device's voice runs the call with: what turns the person's speech into text, and what speaks the
 * agent's replies — each its model's id as its catalogue names it, and in a tooltip where it runs (this device, or a
 * provider) and whether it is ready. They sit in the stage tile's top-right corner, one under the other, across from
 * the conversation's name; the agent's badge keeps the tile's foot. They are the settings the voice is given
 * (voiceSettingsHere); the voice reports no model of its own. */

type Slot = { id: string; where: string; state: string };

function useSlots(t: CallTranslate): { stt: Slot | null; tts: Slot | null } {
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const settings = saved ? voiceSettingsHere(saved, catalogs) : null;
  const stt = useModelState("stt", settings);
  const tts = useModelState("tts", settings);
  const slot = (task: "stt" | "tts", model: typeof stt): Slot | null => {
    const chosen = settings?.[task];
    if (!chosen?.model) return null;
    const provider = catalogs.find((catalog) => catalog.id === chosen.catalog)?.name ?? chosen.catalog;
    return {
      id: chosen.model,
      where: chosen.catalog === "local" ? t("voiceModels.here") : t("voiceModels.provider", { provider }),
      state: t(("voiceModels.state." + (model.status ?? "unavailable")) as CallMessageKey),
    };
  };
  return { stt: slot("stt", stt), tts: slot("tts", tts) };
}

function Details({ stt, tts, t }: { stt: Slot | null; tts: Slot | null; t: CallTranslate }) {
  const line = (label: string, slot: Slot | null) =>
    <span className="voice-models-line"><b>{label}</b> {slot ? `${slot.id} · ${slot.where} · ${slot.state}` : t("voiceModels.none")}</span>;
  return <span className="voice-models-details">{line(t("voiceModels.stt"), stt)}{line(t("voiceModels.tts"), tts)}</span>;
}

/** The two models, stacked; nothing before any is chosen. */
export function VoiceModels() {
  const t = callTranslator();
  const { stt, tts } = useSlots(t);
  if (!stt && !tts) return null;
  const label = t("voiceModels.label", { stt: stt?.id ?? t("voiceModels.none"), tts: tts?.id ?? t("voiceModels.none") });
  const details = <Details stt={stt} tts={tts} t={t} />;
  return (
    <div className="voice-models" role="group" aria-label={label} translate="no">
      {stt && <Tooltip content={details}><span className="voice-chip" tabIndex={0} aria-label={t("voiceModels.stt") + ": " + stt.id}><TranscriptionIcon size={12} /><span>{stt.id}</span></span></Tooltip>}
      {tts && <Tooltip content={details}><span className="voice-chip" tabIndex={0} aria-label={t("voiceModels.tts") + ": " + tts.id}><VoicesIcon size={12} /><span>{tts.id}</span></span></Tooltip>}
    </div>
  );
}
