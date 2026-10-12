import { useContext, type ReactNode } from "react";
import { EndOfTurnIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import { Popover } from "../../components/ui/Popover";
import { Button } from "../../components/ui/Button";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { voiceSettingsHere } from "../../services/voice-settings.js";
import { useModelState } from "../settings/ModelSetup";
import { openSettings } from "../settings/open-settings";
import { callTranslator, type CallTranslate } from "./call-i18n";
import type { CallMessageKey } from "./messages/en";

/* The models this device's voice runs the call with: what turns the person's speech into text, and what speaks the
 * agent's replies — each its model's id as its catalogue names it, and in a tooltip where it runs (this device, or a
 * provider) and whether it is ready. They sit in the stage tile's top-right corner, one under the other, across from
 * the conversation's name; the agent's badge keeps the tile's foot. They are the settings the voice is given
 * (voiceSettingsHere); the voice reports no model of its own. */

/** A model's slot as the badge says it; `attention` when something must be done or waited for before it works. */
type Slot = { id: string; where: string; state: string; attention: boolean; task: "stt" | "tts" | "end-of-turn"; status: string; catalog: string };

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
      task, status, catalog: chosen.catalog,
      id: chosen.model,
      where: chosen.catalog === "local" ? t("voiceModels.here") : t("voiceModels.provider", { provider }),
      state: t(("voiceModels.state." + status) as CallMessageKey),
      attention: status !== "ready" && status !== "unknown",
    };
  };
  // The smart end of turn has a model of its own; the silence one has none, and no badge.
  const turnId = settings?.end_of_turn === "smart-turn" ? turn.model?.id ?? settings.turn_model ?? null : null;
  const turnStatus = !known ? "unknown" : turn.status ?? "unavailable";
  const turnSlot: Slot | null = turnId ? { task: "end-of-turn", status: turnStatus, catalog: "local", id: turnId, where: t("voiceModels.here"), state: t(("voiceModels.state." + turnStatus) as CallMessageKey),
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

/** What a model that needs something can have done about it, from the call: download it (again), add the provider's
 *  key, or its settings. None while it downloads. */
function SlotAction({ slot, t }: { slot: Slot; t: CallTranslate }) {
  const section = slot.task === "stt" ? "transcription" : slot.task === "tts" ? "voice" : "call";
  const store = useContext(RoomStoreContext);
  const settings = (where: string) => openSettings({ section: where }, store);
  if (slot.status === "downloading" || slot.status === "verifying" || slot.status === "loading") return null;
  if (slot.status === "needsKey") return <Button size="sm" onClick={() => settings("providers")}>{t("voiceModels.addKey")}</Button>;
  if (slot.status === "absent" || slot.status === "failed") return <Button size="sm" onClick={() => void window.sidevoiceActions?.installVoiceModel?.(slot.task as never)}>
    {t(slot.status === "failed" ? "voiceModels.retry" : "voiceModels.download")}</Button>;
  return <Button size="sm" variant="secondary" onClick={() => settings(section)}>{t("voiceModels.openSettings")}</Button>;
}

/** A phone's corner has no room for the badges: nothing while every model is ready, and a dot when one needs
 *  something; a tap on it says which, and what can be done. */
function AttentionDot({ slots, t }: { slots: { slot: Slot; label: string }[]; t: CallTranslate }) {
  const needs = slots.filter(({ slot }) => slot.attention);
  if (!needs.length) return null;
  return (
    <Popover label={t("voiceModels.attention")} side="bottom" align="end"
      trigger={<button type="button" className="voice-attention" aria-label={t("voiceModels.attention")}><span aria-hidden="true" /></button>}>
      <ul className="voice-attention-list">
        {needs.map(({ slot, label }) => <li key={slot.task}>
          <span><strong>{label}</strong><span translate="no">{slot.id} · {slot.state}</span></span>
          <SlotAction slot={slot} t={t} />
        </li>)}
      </ul>
    </Popover>
  );
}

/** The models, stacked: speech to text, text to speech, and the end of turn's when it is the smart one; nothing before
 *  any is chosen. A phone shows only a dot, and only when one needs something (AttentionDot). */
export function VoiceModels() {
  const t = callTranslator();
  const { stt, tts, turn } = useSlots(t);
  const narrow = useMedia(NARROW_QUERY);
  if (!stt && !tts) return null;
  if (narrow) return <AttentionDot t={t} slots={[
    ...(stt ? [{ slot: stt, label: t("voiceModels.stt") }] : []), ...(tts ? [{ slot: tts, label: t("voiceModels.tts") }] : []),
    ...(turn ? [{ slot: turn, label: t("voiceModels.turn") }] : [])]} />;
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
