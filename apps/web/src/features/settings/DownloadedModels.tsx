import { useRef, useState, type ReactNode } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { InfoTip } from "../../components/ui/InfoTip";
import { CallIcon, EndOfTurnIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Row } from "../../components/ui/Card";
import { ErrorText } from "../../components/ui/ErrorText";
import { LOCAL_CATALOG } from "../../services/model-catalogs.js";
import { DELETE_UNUSED_DAYS, modelPurposes, staleModels, type ModelPurpose } from "../../services/model-housekeeping.js";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { sizeText } from "./ModelSetup";
import { voiceFailure, type ErrorMessage } from "./error-message";

/* The models on this device's storage, each with the space it takes and what it is for — a purpose chip: Transcription,
 * Voice, End of turn, Every call (the voice activity detector) — so a person knows Kokoro is a voice. Those in use come
 * first, marked In use, and are never offered for deletion; the others have Delete where the engine takes a model off the
 * device (`modelsRemovable`), asking first, with when they were last used where the engine says, and Remove all. How
 * the list is organised is a design to compare (VARIANTS `models-list`): grouped in use / not in use, one plain list,
 * by purpose, or cards. Beside it, how long a model not used is kept (DeleteUnusedChoice). Freeing memory is another
 * thing (IdleUnloadChoice): it never deletes. */

/** A model on this device: its size, its last use, and what it is for (by what it can do). */
type Downloaded = { id: string; bytes: number; lastUsedAt: number | null; purpose: ModelPurpose };

/** What a model is for, by what it can do: the purpose chip. */
function purposeOf(capabilities: readonly string[] | undefined): ModelPurpose {
  const can = capabilities ?? [];
  return can.includes("stt") ? "transcription" : can.includes("tts") ? "voice" : can.includes("end-of-turn") ? "end-of-turn" : "every-call";
}

const PURPOSE_ICON: Record<ModelPurpose, ReactNode> = {
  transcription: <TranscriptionIcon size={13} />, voice: <VoicesIcon size={13} />, "end-of-turn": <EndOfTurnIcon size={13} />, "every-call": <CallIcon size={13} />,
};

function PurposeChip({ purpose, t }: { purpose: ModelPurpose; t: Translate }) {
  const label = PURPOSES.find((item) => item.purpose === purpose)!.chip;
  return <span className="model-purpose" data-purpose={purpose}>{PURPOSE_ICON[purpose]}{t(label)}</span>;
}

const PURPOSES: { purpose: ModelPurpose; label: MessageKey; chip: MessageKey }[] = [
  { purpose: "transcription", label: "settings.section.transcription", chip: "settings.section.transcription" },
  { purpose: "voice", label: "settings.section.voice", chip: "settings.section.voice" },
  { purpose: "end-of-turn", label: "voice.endOfTurn", chip: "voice.endOfTurn" },
  { purpose: "every-call", label: "settings.advanced.everyCall", chip: "settings.advanced.everyCallChip" },
];

function useDownloaded(): Downloaded[] {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  return (local?.models ?? []).flatMap((model) => {
    const builds = (model.builds ?? []).filter((build) => build.installed);
    return builds.length ? [{ id: model.id, bytes: builds.reduce((sum, build) => sum + (build.downloadBytes || 0), 0), lastUsedAt: model.lastUsedAt ?? null, purpose: purposeOf(model.capabilities) }] : [];
  });
}

/** "12 days ago", in the interface's language. */
function ago(at: number, t: Translate) {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days < 1 ? t("settings.advanced.usedToday") : days === 1 ? t("settings.advanced.usedYesterday") : t("settings.advanced.usedDaysAgo", { n: days });
}

/** What uses a model: what the saved settings use it for, and what the ones being edited do — while editing, the model
 *  in use is still in use. */
function usePurposes() {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const draft = useRoomStore((state) => state.facts.voiceDraft);
  const now = modelPurposes(catalogs, saved), editing = modelPurposes(catalogs, draft ?? saved);
  return (model: string) => [...new Set([...editing(model), ...now(model)])];
}

/** Deletes `ids` one by one: how many went, and the first that stayed with why (running now, or why in words). */
async function deleteAll(ids: string[]) {
  let done = 0, kept: { id: string; running: boolean; why: ErrorMessage } | null = null;
  for (const id of ids) {
    try { await window.sidevoiceActions?.uninstallVoiceModel?.(id); done++; }
    catch (failure) {
      kept ??= { id, running: (failure as { code?: string } | null)?.code === "model-in-use", why: voiceFailure(failure, { what: "delete" }) };
    }
  }
  return { done, kept };
}

function DownloadedModel({ model, inUse, removable, chip = true, t }: { model: Downloaded; inUse: boolean; removable: boolean; chip?: boolean; t: Translate }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const size = sizeText(model.bytes);
  async function remove() {
    setBusy(true); setError(null);
    try {
      await window.sidevoiceActions?.uninstallVoiceModel?.(model.id);
      // Its row goes: the focus goes to the list's heading rather than to the page.
      document.getElementById("downloaded-unused")?.focus();
    }
    catch (failure) {
      const code = (failure as { code?: string } | null)?.code;
      setError(code === "model-in-use" ? { text: t("settings.advanced.deleteBusy", { model: model.id }) } : voiceFailure(failure, { what: "delete" }));
      setAsking(false);
    } finally { setBusy(false); }
  }
  return (
    <div className="downloaded-model" data-model={model.id}>
      <div className="downloaded-model-main">
        <span className="downloaded-model-copy">
          <span className="downloaded-model-title"><code className="downloaded-model-name">{model.id}</code>
            {chip && <PurposeChip purpose={model.purpose} t={t} />}
            {inUse && <Badge tone="accent">{t("settings.advanced.inUse")}</Badge>}
            {/* The voice detector: every call needs it, so it is never offered for deletion — said why, after the tags. */}
            {inUse && model.purpose === "every-call" && <InfoTip label={t("settings.advanced.vadInfoLabel")}>{t("settings.advanced.vadInfo")}</InfoTip>}</span>
          <span className="downloaded-model-size">{size}{!inUse && model.lastUsedAt ? " · " + ago(model.lastUsedAt, t) : ""}</span>
        </span>
        {removable && !inUse && !asking && <Button ref={deleteButton} variant="ghost" tone="danger" size="sm" aria-label={t("settings.advanced.deleteNamed", { model: model.id })} onClick={() => setAsking(true)}>{t("settings.advanced.delete")}</Button>}
      </div>
      {asking && <div className="provider-remove" role="group" aria-label={t("settings.advanced.deleteNamed", { model: model.id })}>
        <p>{t("settings.advanced.deleteConfirm", { model: model.id, size })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => { setAsking(false); requestAnimationFrame(() => deleteButton.current?.focus()); }} disabled={busy}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>{t("settings.advanced.delete")}</Button>
        </div>
      </div>}
      {error && <ErrorText className="downloaded-model-error" role="alert" message={error} />}
    </div>
  );
}

export function DownloadedModels() {
  const t = translator();
  const models = useDownloaded();
  const purposes = usePurposes();
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  const total = sizeText(models.reduce((sum, model) => sum + model.bytes, 0));
  const [askingAll, setAskingAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [allNote, setAllNote] = useState<ErrorMessage | null>(null);
  const inUse = (model: Downloaded) => purposes(model.id).length > 0;
  // One plain list: the voice detector first (every call needs it), then the rest in use by purpose, then those not in
  // use, the largest first, as storage lists are.
  const rank = (model: Downloaded) => model.purpose === "every-call" && inUse(model) ? 0 : inUse(model) ? 1 : 2;
  const order = (list: Downloaded[]) => [...list].sort((x, y) => rank(x) - rank(y)
    || (inUse(x) ? PURPOSES.findIndex((p) => p.purpose === x.purpose) - PURPOSES.findIndex((p) => p.purpose === y.purpose) : y.bytes - x.bytes));
  const sorted = order(models);
  const unused = sorted.filter((model) => !inUse(model));
  const freed = sizeText(unused.reduce((sum, model) => sum + model.bytes, 0));
  async function removeAll() {
    setBusyAll(true); setAllNote(null);
    const { done, kept } = await deleteAll(unused.map((model) => model.id));
    setBusyAll(false); setAskingAll(false);
    if (kept) setAllNote(kept.running ? { text: t("settings.advanced.deleteAllPartial", { done, count: unused.length, model: kept.id }) }
      : { text: t("settings.advanced.deleteAllFailed", { done, count: unused.length, model: kept.id, reason: kept.why.text }), details: kept.why.details });
    document.getElementById("downloaded-models")?.focus();
  }
  const row = (model: Downloaded, chip = true) => <DownloadedModel key={model.id} model={model} inUse={inUse(model)} removable={removable} chip={chip} t={t} />;
  // Remove all, and its question: with the models not in use, wherever the design puts them.
  const removeAllControl = removable && unused.length > 1 && <div className="downloaded-remove-all">
    {!askingAll ? <Button variant="ghost" tone="danger" size="sm" id="downloaded-remove-all" onClick={() => setAskingAll(true)}>{t("settings.advanced.deleteAllUnusedSized", { size: freed })}</Button>
      : <div className="provider-remove" role="group" aria-label={t("settings.advanced.deleteAllUnused")}>
        <p>{t("settings.advanced.deleteAllConfirm", { count: unused.length, size: freed })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus disabled={busyAll} onClick={() => { setAskingAll(false); requestAnimationFrame(() => document.getElementById("downloaded-remove-all")?.focus()); }}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" loading={busyAll} onClick={() => void removeAll()}>{t("settings.advanced.deleteAllYes", { count: unused.length })}</Button>
        </div>
      </div>}
    {allNote && <ErrorText className="downloaded-model-error" role="status" message={allNote} />}
  </div>;
  return (
    <Row block label={t("settings.advanced.downloaded")}
      description={models.length ? <>{t("settings.advanced.downloadedHint", { total })}{!removable && <> {t("settings.advanced.cantDelete")}</>}</> : t("settings.advanced.downloadedNone")}>
      {models.length > 0 && <div id="downloaded-models" className="downloaded-models" tabIndex={-1}>
        {sorted.map((model) => row(model))}
        {removeAllControl}
      </div>}
    </Row>
  );
}

/** How long a downloaded model nobody uses is kept before it is deleted: never by default — downloads are costly. */
export function DeleteUnusedChoice() {
  const t = translator();
  const days = useRoomStore((state) => state.facts.deleteUnusedDays);
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const saved = useRoomStore((state) => state.facts.voiceSettings);
  const models = useDownloaded();
  // Turning it on deletes at once what is already past it: that is asked first, with what it frees.
  const [pending, setPending] = useState<{ days: number; ids: string[] } | null>(null);
  if (!removable) return null;
  const choose = (next: number | null) => {
    const ids = next == null ? [] : staleModels(catalogs, saved, next, Date.now());
    if (ids.length) setPending({ days: next!, ids });
    else void window.sidevoiceActions?.setDeleteUnusedModels?.(next);
  };
  // The question goes: the focus goes back to the choice it came from.
  const backToChoice = () => requestAnimationFrame(() => document.getElementById("delete-unused-models")?.focus());
  const size = pending ? sizeText(models.filter((model) => pending.ids.includes(model.id)).reduce((sum, model) => sum + model.bytes, 0)) : "";
  return (<>
    <Row label={t("settings.advanced.deleteUnused")} description={t("settings.advanced.deleteUnusedHint")} htmlFor="delete-unused-models">
      <Select id="delete-unused-models" value={days == null ? "" : String(days)}
        onValueChange={(value) => choose(value ? Number(value) : null)}
        options={DELETE_UNUSED_DAYS.map((value) => ({ value: value == null ? "" : String(value),
          label: value == null ? t("settings.advanced.never") : t("settings.advanced.days", { n: value }) }))} />
    </Row>
    {pending && <div className="provider-remove downloaded-unused-confirm" role="group" aria-label={t("settings.advanced.deleteUnused")}>
      <p>{pending.ids.length === 1 ? t("settings.advanced.deleteUnusedNowOne", { size }) : t("settings.advanced.deleteUnusedNow", { count: pending.ids.length, size })}</p>
      <div className="provider-key-actions">
        <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => { setPending(null); backToChoice(); }}>{t("hosts.cancel")}</Button>
        <Button variant="danger" size="sm" onClick={() => { void window.sidevoiceActions?.setDeleteUnusedModels?.(pending.days); setPending(null); backToChoice(); }}>{t("settings.advanced.deleteUnusedYes")}</Button>
      </div>
    </div>}
  </>);
}
