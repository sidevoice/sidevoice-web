import { useContext, type ReactNode, useEffect } from "react";
import { EndOfTurnIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { voiceSettingsHere } from "../../services/voice-settings.js";
import { catalogueShown, useModelState } from "../settings/ModelSetup";
import { openSettings } from "../settings/open-settings";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";

/* The models this device's voice runs the call with: what turns the person's speech into text, what speaks the agent's
 * replies, and the smart end of turn's — each its model's id as its catalogue names it, where it runs (this device, or a
 * provider) and whether it is ready. They are shown in the call's details, opened from the stage's title (CallDetails;
 * 2026-10-15: no chips on the stage), and the title wears a dot while one needs something. They are the settings the
 * voice is given (voiceSettingsHere); the voice reports no model of its own. */

/** A model's slot as the details say it; `attention` when something must be done or waited for before it works. */
export type Slot = { id: string; where: string; state: string; attention: boolean; task: "stt" | "tts" | "end-of-turn"; status: string; catalog: string;
  /** How much of its download is done (0–1) while it downloads; null otherwise. */
  fraction: number | null };

function useSlots(t: Translate): { stt: Slot | null; tts: Slot | null; turn: Slot | null } {
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  // The catalogue is read as the stage first shows (as Settings, the setup and an install read it too): until it is,
  // nothing is known of a model's state, and nothing is claimed of it. The room's actions may come after the stage has
  // mounted (the controller loads on its own): asked again once they are, which the settings the controller hands over
  // say, so the smart end of turn shows before any call too (2026-10-15).
  const catalogueState = useRoomStore((state) => state.facts.voiceCatalogue.state);
  useEffect(() => { if (catalogueState === "idle") void window.sidevoiceActions?.loadVoiceCatalogue?.(); }, [catalogueState, saved]);
  // Read again with the last catalogues still there (after a download) is still known: nothing flickers to unknown.
  const known = catalogueShown({ state: catalogueState, catalogs });
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
      task, status, catalog: chosen.catalog, fraction: model.fraction,
      id: chosen.model,
      where: chosen.catalog === "local" ? t("voiceModels.here") : t("voiceModels.provider", { provider }),
      state: t(("voiceModels.state." + status) as MessageKey),
      attention: status !== "ready" && status !== "unknown",
    };
  };
  // The smart end of turn has a model of its own; the silence one has none, and no row.
  const turnId = settings?.end_of_turn === "smart-turn" ? turn.model?.id ?? settings.turn_model ?? null : null;
  const turnStatus = !known ? "unknown" : turn.status ?? "unavailable";
  const turnSlot: Slot | null = turnId ? { task: "end-of-turn", status: turnStatus, catalog: "local", fraction: turn.fraction, id: turnId, where: t("voiceModels.here"), state: t(("voiceModels.state." + turnStatus) as MessageKey),
    attention: turnStatus !== "ready" && turnStatus !== "unknown" } : null;
  return { stt: slot("stt", stt), tts: slot("tts", tts), turn: turnSlot };
}

/** What a model that needs something can have done about it, from the call: download it (again), add the provider's
 *  key, or its settings. None while it downloads. */
function SlotAction({ slot, t }: { slot: Slot; t: Translate }) {
  const section = slot.task === "stt" ? "transcription" : slot.task === "tts" ? "voice" : "call";
  const store = useContext(RoomStoreContext);
  const settings = (where: string) => openSettings({ section: where }, store);
  if (slot.status === "downloading" || slot.status === "verifying" || slot.status === "loading") return null;
  if (slot.status === "needsKey") return <Button size="sm" onClick={() => settings("providers")}>{t("voiceModels.addKey")}</Button>;
  if (slot.status === "absent" || slot.status === "failed") return <Button size="sm" onClick={() => void window.sidevoiceActions?.installVoiceModel?.(slot.task as never)}>
    {t(slot.status === "failed" ? "voiceModels.retry" : "voiceModels.download")}</Button>;
  return <Button size="sm" variant="secondary" onClick={() => settings(section)}>{t("voiceModels.openSettings")}</Button>;
}

export interface VoiceModelRow { slot: Slot; label: string; icon: ReactNode }

/** The call's voice models, in order — speech to text, text to speech, and the end of turn's when it is the smart one —
 *  and whether any needs something done or waited for: the stage's title shows a dot for that (CallStage StageName). */
export function useVoiceModels(): { rows: VoiceModelRow[]; attention: boolean } {
  const t = translator();
  const { stt, tts, turn } = useSlots(t);
  const rows: VoiceModelRow[] = [];
  if (stt) rows.push({ slot: stt, label: t("voiceModels.stt"), icon: <TranscriptionIcon size={14} /> });
  if (tts) rows.push({ slot: tts, label: t("voiceModels.tts"), icon: <VoicesIcon size={14} /> });
  if (turn) rows.push({ slot: turn, label: t("voiceModels.turn"), icon: <EndOfTurnIcon size={14} /> });
  return { rows, attention: rows.some((row) => row.slot.attention) };
}

/** Whether the call's voice can work: the transcription and the voice each ready — on this device, or a provider's with its key. Unknown until the catalogue and the settings are
 *  read, so nothing is claimed before. `rows`: theirs, for a card that offers what each needs. */
export function useVoiceReadiness(): { state: "ready" | "missing" | "unknown"; rows: VoiceModelRow[]; sttReady: boolean; ttsReady: boolean } {
  const { rows } = useVoiceModels();
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const failed = useRoomStore((state) => state.facts.voiceCatalogue.state === "failed");
  const of = (task: "stt" | "tts") => rows.find((row) => row.slot.task === task);
  const stt = of("stt"), tts = of("tts");
  const required = rows.filter((row) => row.slot.task === "tts" || row.slot.task === "stt");
  const sttReady = stt?.slot.status === "ready", ttsReady = tts?.slot.status === "ready";
  const unknown = !saved || (!failed && required.some((row) => row.slot.status === "unknown"));
  const ready = ttsReady && sttReady;
  return { state: ready ? "ready" : unknown ? "unknown" : "missing", rows: required, sttReady, ttsReady };
}

/** The models in the call's details (CallDetails): one row each — what it is for, its model's id, where it runs, its
 *  state in words, and, when it needs something, what can be done about it. Before the catalogue is read a row claims
 *  nothing of its state. */
export function VoiceModels({ rows, states }: { rows: VoiceModelRow[]; states?: Partial<Record<string, string>> }) {
  const t = translator();
  const stt = rows.find((row) => row.slot.task === "stt")?.slot.id, tts = rows.find((row) => row.slot.task === "tts")?.slot.id;
  return (
    <ul className="voice-models" aria-label={t("voiceModels.label", { stt: stt ?? t("voiceModels.none"), tts: tts ?? t("voiceModels.none") })}>
      {rows.map(({ slot, label, icon }) => (
        <li key={slot.task} className="voice-model" data-attention={slot.attention || undefined}>
          <span className="voice-model-icon" aria-hidden="true">{icon}</span>
          <span className="voice-model-copy">
            <span className="voice-model-task">{label}</span>
            <span className="voice-model-id" translate="no">{slot.id}</span>
            <span className="voice-model-where">{slot.where}{slot.status !== "unknown" && <span className="voice-model-state">{states?.[slot.status] ?? slot.state}</span>}</span>
          </span>
          {states && slot.fraction != null && <progress className="voice-model-progress" value={slot.fraction} max={1} aria-hidden="true" />}
          {slot.attention && <span className="voice-model-action"><SlotAction slot={slot} t={t} /></span>}
        </li>
      ))}
    </ul>
  );
}
