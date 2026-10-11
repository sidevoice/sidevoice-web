import { useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { Row } from "../../components/ui/Card";
import { LOCAL_CATALOG } from "../../services/model-catalogs.js";
import { DELETE_UNUSED_DAYS, modelPurposes, type ModelPurpose } from "../../services/model-housekeeping.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { sizeText } from "./ModelSetup";

/* The models on this device's storage, each with the space it takes. Those in use come first, by what they are for —
 * transcription, the voice, the end of turn, and what every call needs (the voice activity detector) — and are not
 * offered for deletion; then those not in use, each with Delete where the engine takes a model off the device
 * (`modelsRemovable`), asking first, and when it was last used where the engine says. Beside it, how long a model not
 * used is kept (DeleteUnusedChoice). Freeing memory is another thing (IdleUnloadChoice): it never deletes. */

type Downloaded = { id: string; bytes: number; lastUsedAt: number | null };

const PURPOSES: { purpose: ModelPurpose; label: HostMessageKey }[] = [
  { purpose: "transcription", label: "settings.section.transcription" },
  { purpose: "voice", label: "settings.section.voice" },
  { purpose: "end-of-turn", label: "voice.endOfTurn" },
  { purpose: "every-call", label: "settings.advanced.everyCall" },
];

function useDownloaded(): Downloaded[] {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  return (local?.models ?? []).flatMap((model) => {
    const builds = (model.builds ?? []).filter((build) => build.installed);
    return builds.length ? [{ id: model.id, bytes: builds.reduce((sum, build) => sum + (build.downloadBytes || 0), 0), lastUsedAt: model.lastUsedAt ?? null }] : [];
  });
}

/** "12 days ago", in the interface's language. */
function ago(at: number, t: HostTranslate) {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days < 1 ? t("settings.advanced.usedToday") : t("settings.advanced.usedDaysAgo", { n: days });
}

function DownloadedModel({ model, removable, t }: { model: Downloaded; removable: boolean; t: HostTranslate }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const size = sizeText(model.bytes);
  async function remove() {
    setBusy(true); setError("");
    try { await window.sidevoiceActions?.uninstallVoiceModel?.(model.id); }
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
          <code className="downloaded-model-name">{model.id}</code>
          <span className="downloaded-model-size">{size}{model.lastUsedAt ? " · " + ago(model.lastUsedAt, t) : ""}</span>
        </span>
        {removable && !asking && <Button variant="ghost" tone="danger" size="sm" aria-label={t("settings.advanced.deleteNamed", { model: model.id })} onClick={() => setAsking(true)}>{t("settings.advanced.delete")}</Button>}
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
  const models = useDownloaded();
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const purposes = modelPurposes(catalogs, draft);
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  const total = sizeText(models.reduce((sum, model) => sum + model.bytes, 0));
  // Each model in use under the first thing it is for; the rest after them.
  const inUse = PURPOSES.map(({ purpose, label }) => ({ purpose, label, models: models.filter((model) => purposes(model.id)[0] === purpose) })).filter((group) => group.models.length);
  const unused = models.filter((model) => !purposes(model.id).length);
  return (
    <Row block label={t("settings.advanced.downloaded")}
      description={models.length ? <>{t("settings.advanced.downloadedHint", { total })}{!removable && <> {t("settings.advanced.cantDelete")}</>}</> : t("settings.advanced.downloadedNone")}>
      {models.length > 0 && <div id="downloaded-models" className="downloaded-models">
        {inUse.length > 0 && <section className="downloaded-group" aria-labelledby="downloaded-in-use">
          <h4 id="downloaded-in-use" className="downloaded-group-title">{t("settings.advanced.inUse")}</h4>
          {inUse.map((group) => <div key={group.purpose} className="downloaded-purpose" data-purpose={group.purpose}>
            <p className="downloaded-purpose-label">{t(group.label)}</p>
            {group.models.map((model) => <DownloadedModel key={model.id} model={model} removable={false} t={t} />)}
          </div>)}
        </section>}
        {unused.length > 0 && <section className="downloaded-group" aria-labelledby="downloaded-unused">
          <h4 id="downloaded-unused" className="downloaded-group-title">{t("settings.advanced.notInUse")}</h4>
          {unused.map((model) => <DownloadedModel key={model.id} model={model} removable={removable} t={t} />)}
        </section>}
      </div>}
    </Row>
  );
}

/** How long a downloaded model nobody uses is kept before it is deleted: never by default — downloads are costly. */
export function DeleteUnusedChoice() {
  const t = hostTranslator();
  const days = useRoomStore((state) => state.facts.deleteUnusedDays);
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  if (!removable) return null;
  return (
    <Row label={t("settings.advanced.deleteUnused")} description={t("settings.advanced.deleteUnusedHint")} htmlFor="delete-unused-models">
      <NativeSelect id="delete-unused-models" value={days == null ? "" : String(days)}
        onChange={(event) => void window.sidevoiceActions?.setDeleteUnusedModels?.(event.target.value ? Number(event.target.value) : null)}>
        {DELETE_UNUSED_DAYS.map((value) => <option key={String(value)} value={value == null ? "" : String(value)}>
          {value == null ? t("settings.advanced.never") : t("settings.advanced.days", { n: value })}</option>)}
      </NativeSelect>
    </Row>
  );
}
