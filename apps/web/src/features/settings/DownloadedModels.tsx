import { useState, type ReactNode } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { CallIcon, EndOfTurnIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { Row } from "../../components/ui/Card";
import { LOCAL_CATALOG } from "../../services/model-catalogs.js";
import { DELETE_UNUSED_DAYS, modelPurposes, staleModels, type ModelPurpose } from "../../services/model-housekeeping.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { sizeText } from "./ModelSetup";

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

function PurposeChip({ purpose, t }: { purpose: ModelPurpose; t: HostTranslate }) {
  const label = PURPOSES.find((item) => item.purpose === purpose)!.chip;
  return <span className="model-purpose" data-purpose={purpose}>{PURPOSE_ICON[purpose]}{t(label)}</span>;
}

const PURPOSES: { purpose: ModelPurpose; label: HostMessageKey; chip: HostMessageKey }[] = [
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
function ago(at: number, t: HostTranslate) {
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

/** Deletes `ids` one by one: how many went, and the first that was running and stayed. */
async function deleteAll(ids: string[]) {
  let done = 0, kept: string | null = null;
  for (const id of ids) {
    try { await window.sidevoiceActions?.uninstallVoiceModel?.(id); done++; }
    catch { kept ??= id; }
  }
  return { done, kept };
}

function DownloadedModel({ model, inUse, removable, chip = true, t }: { model: Downloaded; inUse: boolean; removable: boolean; chip?: boolean; t: HostTranslate }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const size = sizeText(model.bytes);
  async function remove() {
    setBusy(true); setError("");
    try {
      await window.sidevoiceActions?.uninstallVoiceModel?.(model.id);
      // Its row goes: the focus goes to the list's heading rather than to the page.
      document.getElementById("downloaded-unused")?.focus();
    }
    catch (failure) {
      const code = (failure as { code?: string } | null)?.code;
      setError(code === "model-in-use" ? t("settings.advanced.deleteBusy", { model: model.id }) : (failure as Error).message);
      setAsking(false);
    } finally { setBusy(false); }
  }
  return (
    <div className="downloaded-model" data-model={model.id}>
      <div className="downloaded-model-main">
        <span className="downloaded-model-copy">
          <span className="downloaded-model-title"><code className="downloaded-model-name">{model.id}</code>
            {inUse && <Badge tone="accent">{t("settings.advanced.inUse")}</Badge>}</span>
          <span className="downloaded-model-meta">{chip && <PurposeChip purpose={model.purpose} t={t} />}
            <span className="downloaded-model-size">{size}{!inUse && model.lastUsedAt ? " · " + ago(model.lastUsedAt, t) : ""}</span></span>
        </span>
        {removable && !inUse && !asking && <Button variant="ghost" tone="danger" size="sm" aria-label={t("settings.advanced.deleteNamed", { model: model.id })} onClick={() => setAsking(true)}>{t("settings.advanced.delete")}</Button>}
      </div>
      {asking && <div className="provider-remove" role="group" aria-label={t("settings.advanced.deleteNamed", { model: model.id })}>
        <p>{t("settings.advanced.deleteConfirm", { model: model.id, size })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => setAsking(false)} disabled={busy}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>{t("settings.advanced.delete")}</Button>
        </div>
      </div>}
      {error && <p className="downloaded-model-error" role="alert">{error}</p>}
    </div>
  );
}

export function DownloadedModels() {
  const t = hostTranslator();
  const layout = useVariant("models-list", ["grouped", "plain", "purpose", "cards"] as const);
  const models = useDownloaded();
  const purposes = usePurposes();
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  const total = sizeText(models.reduce((sum, model) => sum + model.bytes, 0));
  const [askingAll, setAskingAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [allNote, setAllNote] = useState("");
  const inUse = (model: Downloaded) => purposes(model.id).length > 0;
  // In use first (by purpose), then the rest, the largest first, as storage lists are.
  const order = (list: Downloaded[]) => [...list].sort((x, y) => Number(inUse(y)) - Number(inUse(x))
    || (inUse(x) ? PURPOSES.findIndex((p) => p.purpose === x.purpose) - PURPOSES.findIndex((p) => p.purpose === y.purpose) : y.bytes - x.bytes));
  const sorted = order(models);
  const unused = sorted.filter((model) => !inUse(model));
  const freed = sizeText(unused.reduce((sum, model) => sum + model.bytes, 0));
  async function removeAll() {
    setBusyAll(true); setAllNote("");
    const { done, kept } = await deleteAll(unused.map((model) => model.id));
    setBusyAll(false); setAskingAll(false);
    if (kept) setAllNote(t("settings.advanced.deleteAllPartial", { done, count: unused.length, model: kept }));
    document.getElementById("downloaded-models")?.focus();
  }
  const row = (model: Downloaded, chip = true) => <DownloadedModel key={model.id} model={model} inUse={inUse(model)} removable={removable} chip={chip} t={t} />;
  // Remove all, and its question: with the models not in use, wherever the design puts them.
  const removeAllControl = removable && unused.length > 1 && <div className="downloaded-remove-all">
    {!askingAll ? <Button variant="ghost" tone="danger" size="sm" id="downloaded-remove-all" onClick={() => setAskingAll(true)}>{t("settings.advanced.deleteAllUnusedSized", { size: freed })}</Button>
      : <div className="provider-remove" role="group" aria-label={t("settings.advanced.deleteAllUnused")}>
        <p>{t("settings.advanced.deleteAllConfirm", { count: unused.length, size: freed })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus disabled={busyAll} onClick={() => setAskingAll(false)}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" loading={busyAll} onClick={() => void removeAll()}>{t("settings.advanced.deleteAllYes", { count: unused.length })}</Button>
        </div>
      </div>}
    {allNote && <p className="downloaded-model-error" role="status">{allNote}</p>}
  </div>;
  return (
    <Row block label={t("settings.advanced.downloaded")}
      description={models.length ? <>{t("settings.advanced.downloadedHint", { total })}{!removable && <> {t("settings.advanced.cantDelete")}</>}</> : t("settings.advanced.downloadedNone")}>
      {models.length > 0 && <div id="downloaded-models" className="downloaded-models" data-layout={layout} tabIndex={-1}>
        {layout === "grouped" && <>
          <section className="downloaded-group" aria-labelledby="downloaded-in-use">
            <h4 id="downloaded-in-use" className="downloaded-group-title">{t("settings.advanced.inUse")}</h4>
            {sorted.filter(inUse).map((model) => row(model))}
          </section>
          <section className="downloaded-group" aria-labelledby="downloaded-unused">
            <h4 id="downloaded-unused" className="downloaded-group-title">{unused.length ? t("settings.advanced.notInUseTotal", { size: freed }) : t("settings.advanced.notInUse")}</h4>
            {unused.length ? unused.map((model) => row(model)) : <p className="downloaded-purpose-label">{t("settings.advanced.allInUse")}</p>}
            {removeAllControl}
          </section>
        </>}
        {layout === "plain" && <>{sorted.map((model) => row(model))}{removeAllControl}</>}
        {layout === "purpose" && <>
          {PURPOSES.map(({ purpose, label }) => {
            const list = sorted.filter((model) => model.purpose === purpose);
            return list.length > 0 && <section key={purpose} className="downloaded-group" aria-labelledby={"downloaded-" + purpose}>
              <h4 id={"downloaded-" + purpose} className="downloaded-group-title downloaded-purpose-title"><PurposeChip purpose={purpose} t={t} /></h4>
              {list.map((model) => row(model, false))}
            </section>;
          })}
          {removeAllControl}
        </>}
        {layout === "cards" && <>
          <div className="downloaded-cards">{sorted.map((model) => <div key={model.id} className="downloaded-card" data-in-use={inUse(model) || undefined}>{row(model)}</div>)}</div>
          {removeAllControl}
        </>}
      </div>}
    </Row>
  );
}

/** How long a downloaded model nobody uses is kept before it is deleted: never by default — downloads are costly. */
export function DeleteUnusedChoice() {
  const t = hostTranslator();
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
  const size = pending ? sizeText(models.filter((model) => pending.ids.includes(model.id)).reduce((sum, model) => sum + model.bytes, 0)) : "";
  return (<>
    <Row label={t("settings.advanced.deleteUnused")} description={t("settings.advanced.deleteUnusedHint")} htmlFor="delete-unused-models">
      <Select id="delete-unused-models" value={days == null ? "" : String(days)}
        onValueChange={(value) => choose(value ? Number(value) : null)}
        options={DELETE_UNUSED_DAYS.map((value) => ({ value: value == null ? "" : String(value),
          label: value == null ? t("settings.advanced.never") : t("settings.advanced.days", { n: value }) }))} />
    </Row>
    {pending && <div className="provider-remove downloaded-unused-confirm" role="group" aria-label={t("settings.advanced.deleteUnused")}>
      <p>{t("settings.advanced.deleteUnusedNow", { count: pending.ids.length, size })}</p>
      <div className="provider-key-actions">
        <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => setPending(null)}>{t("hosts.cancel")}</Button>
        <Button variant="danger" size="sm" onClick={() => { void window.sidevoiceActions?.setDeleteUnusedModels?.(pending.days); setPending(null); }}>{t("settings.advanced.deleteUnusedYes")}</Button>
      </div>
    </div>}
  </>);
}
