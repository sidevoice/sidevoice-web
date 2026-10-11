import type { ReactNode } from "react";
import { EndOfTurnIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
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

/** A model's slot as the badge says it; `attention` when something must be done or waited for before it works. */
type Slot = { id: string; where: string; state: string; attention: boolean };

function useSlots(t: CallTranslate): { stt: Slot | null; tts: Slot | null; turn: Slot | null } {
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  // The catalogue is read when Settings opens or a model installs: until then nothing is known of a model's state,
  // and the badge claims nothing.
  const known = useRoomStore((state) => state.facts.voiceCatalogue.state === "ready");
  const settings = saved ? voiceSettingsHere(saved, catalogs) : null;
  const stt = useModelState("stt", settings);
  const tts = useModelState("tts", settings);
  const turn = useModelState("end-of-turn", settings);
  const slot = (task: "stt" | "tts", model: typeof stt): Slot | null => {
    const chosen = settings?.[task];
    if (!chosen?.model) return null;
    const provider = catalogs.find((catalog) => catalog.id === chosen.catalog)?.name ?? chosen.catalog;
    // A provider's model with no key is the key's to fix, whatever else its catalogue says.
    const status = !known ? "unknown" : chosen.catalog !== "local" && keys[chosen.catalog] === false ? "needsKey" : model.status ?? "unavailable";
    return {
      id: chosen.model,
      where: chosen.catalog === "local" ? t("voiceModels.here") : t("voiceModels.provider", { provider }),
      state: t(("voiceModels.state." + status) as CallMessageKey),
      attention: status !== "ready" && status !== "unknown",
    };
  };
  // The smart end of turn has a model of its own; the silence one has none, and no badge.
  const turnId = settings?.end_of_turn === "smart-turn" ? turn.model?.id ?? settings.turn_model ?? null : null;
  const turnStatus = !known ? "unknown" : turn.status ?? "unavailable";
  const turnSlot: Slot | null = turnId ? { id: turnId, where: t("voiceModels.here"), state: t(("voiceModels.state." + turnStatus) as CallMessageKey),
    attention: turnStatus !== "ready" && turnStatus !== "unknown" } : null;
  return { stt: slot("stt", stt), tts: slot("tts", tts), turn: turnSlot };
}

function Details({ stt, tts, turn, t }: { stt: Slot | null; tts: Slot | null; turn: Slot | null; t: CallTranslate }) {
  const line = (label: string, slot: Slot | null) =>
    <span className="voice-models-line"><b>{label}</b> {slot ? `${slot.id} · ${slot.where} · ${slot.state}` : t("voiceModels.none")}</span>;
  return <span className="voice-models-details">{line(t("voiceModels.stt"), stt)}{line(t("voiceModels.tts"), tts)}{turn && line(t("voiceModels.turn"), turn)}</span>;
}

/** One model: quiet while it is ready (full contrast on hover or focus), and saying its state in words, in the
 *  attention style, while it is not. */
function Chip({ slot, label, icon, details }: { slot: Slot; label: string; icon: ReactNode; details: ReactNode }) {
  return (
    <Tooltip content={details}>
      <span className="voice-chip" data-attention={slot.attention || undefined} tabIndex={0}
        aria-label={label + ": " + slot.id + (slot.attention ? ", " + slot.state : "")}>
        {icon}<span>{slot.id}</span>{slot.attention && <span className="voice-chip-state">{slot.state}</span>}
      </span>
    </Tooltip>
  );
}

/** The models, stacked: speech to text, text to speech, and the end of turn's when it is the smart one; nothing before
 *  any is chosen. */
export function VoiceModels() {
  const t = callTranslator();
  const { stt, tts, turn } = useSlots(t);
  if (!stt && !tts) return null;
  const label = t("voiceModels.label", { stt: stt?.id ?? t("voiceModels.none"), tts: tts?.id ?? t("voiceModels.none") });
  const details = <Details stt={stt} tts={tts} turn={turn} t={t} />;
  return (
    <div className="voice-models" role="group" aria-label={label} translate="no">
      {stt && <Chip slot={stt} label={t("voiceModels.stt")} icon={<TranscriptionIcon size={12} />} details={details} />}
      {tts && <Chip slot={tts} label={t("voiceModels.tts")} icon={<VoicesIcon size={12} />} details={details} />}
      {turn && <Chip slot={turn} label={t("voiceModels.turn")} icon={<EndOfTurnIcon size={12} />} details={details} />}
    </div>
  );
}
