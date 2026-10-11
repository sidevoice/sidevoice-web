import { TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import { useVariant } from "../../lib/variants";
import { useRoomStore } from "../../state/room-store";
import { voiceSettingsHere } from "../../services/voice-settings.js";
import { useModelState } from "../settings/ModelSetup";
import { callTranslator, type CallTranslate } from "./call-i18n";
import type { CallMessageKey } from "./messages/en";

/* The models this device's voice runs the call with: what turns the person's speech into text, and what speaks the
 * agent's replies — each its model's id as its catalogue names it, and where it runs (this device, or a provider). They
 * are the settings the voice is given (voiceSettingsHere); the voice reports no model of its own. Where they show is a
 * design to compare (VARIANTS `voice-models`): in the stage tile's foot across from the agent's badge (A), as chips in
 * the call bar (B), or beside the conversation's name (C). */
export const VOICE_MODELS_PLACE = ["tile", "bar", "title"] as const;
export type VoiceModelsPlace = (typeof VOICE_MODELS_PLACE)[number];

export function useVoiceModelsPlace() {
  return useVariant("voice-models", VOICE_MODELS_PLACE);
}

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

/** The two models where `place` puts them, when that is the place the variant chose; nothing before any is chosen. */
export function VoiceModels({ place }: { place: VoiceModelsPlace }) {
  const t = callTranslator();
  const chosen = useVoiceModelsPlace();
  const { stt, tts } = useSlots(t);
  if (chosen !== place || (!stt && !tts)) return null;
  const label = t("voiceModels.label", { stt: stt?.id ?? t("voiceModels.none"), tts: tts?.id ?? t("voiceModels.none") });
  const details = <Details stt={stt} tts={tts} t={t} />;
  if (place === "bar") return (
    <span className="voice-models voice-models--bar" role="group" aria-label={label}>
      {stt && <Tooltip content={details}><span className="voice-chip" tabIndex={0}><TranscriptionIcon size={14} /><span translate="no">{stt.id}</span></span></Tooltip>}
      {tts && <Tooltip content={details}><span className="voice-chip" tabIndex={0}><VoicesIcon size={14} /><span translate="no">{tts.id}</span></span></Tooltip>}
    </span>
  );
  return (
    <Tooltip content={details}>
      <span className={"voice-models voice-models--" + place + (place === "tile" ? " stage-tag" : "")} tabIndex={0} aria-label={label} translate="no">
        {stt && <><TranscriptionIcon size={12} /><span>{stt.id}</span></>}
        {stt && tts && <span className="voice-models-sep" aria-hidden="true">·</span>}
        {tts && <><VoicesIcon size={12} /><span>{tts.id}</span></>}
      </span>
    </Tooltip>
  );
}
