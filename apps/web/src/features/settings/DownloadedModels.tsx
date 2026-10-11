import { useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Row } from "../../components/ui/Card";
import { LOCAL_CATALOG } from "../../services/model-catalogs.js";
import { endOfTurnModel } from "../../services/voice-settings.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { sizeText } from "./ModelSetup";

/* The models on this device's storage, each with the space it takes and Delete where the engine can take a model off
 * the device (`modelsRemovable`). Deleting asks first, and says what uses the model: it downloads again before it is
 * used. Freeing memory is another thing (IdleUnloadChoice): it never deletes. */

type Downloaded = { id: string; bytes: number };

function useDownloaded(): Downloaded[] {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  return (local?.models ?? []).flatMap((model) => {
    const builds = (model.builds ?? []).filter((build) => build.installed);
    return builds.length ? [{ id: model.id, bytes: builds.reduce((sum, build) => sum + (build.downloadBytes || 0), 0) }] : [];
  });
}

/** What uses `model` in the settings being edited: the slots, by their section's name, and the end of turn. */
function useUses(t: HostTranslate) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const turn = draft?.end_of_turn === "smart-turn" ? endOfTurnModel(catalogs, draft.turn_model)?.id : null;
  return (model: string) => [
    draft?.stt.catalog === LOCAL_CATALOG && draft.stt.model === model ? t("settings.section.transcription") : "",
    draft?.tts.catalog === LOCAL_CATALOG && draft.tts.model === model ? t("settings.section.voice") : "",
    turn === model ? t("settings.section.call") : "",
  ].filter(Boolean);
}

function DownloadedModel({ model, uses, removable, t }: { model: Downloaded; uses: string[]; removable: boolean; t: HostTranslate }) {
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
          <span className="downloaded-model-size">{size}</span>
          {uses.length > 0 && <Badge tone="accent" title={uses.join(", ")}>{t("settings.advanced.inUse")}</Badge>}
        </span>
        {removable && !asking && <Button variant="ghost" tone="danger" size="sm" aria-label={t("settings.advanced.deleteNamed", { model: model.id })} onClick={() => setAsking(true)}>{t("settings.advanced.delete")}</Button>}
      </div>
      {asking && <div className="provider-remove" role="group" aria-label={t("settings.advanced.deleteNamed", { model: model.id })}>
        <p>{uses.length ? t("settings.advanced.deleteInUse", { model: model.id, size, uses: uses.join(", ") }) : t("settings.advanced.deleteConfirm", { model: model.id, size })}</p>
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
  const uses = useUses(t);
  const removable = useRoomStore((state) => state.facts.modelsRemovable);
  const total = sizeText(models.reduce((sum, model) => sum + model.bytes, 0));
  return (
    <Row block label={t("settings.advanced.downloaded")}
      description={models.length ? <>{t("settings.advanced.downloadedHint", { total })}{!removable && <> {t("settings.advanced.cantDelete")}</>}</> : t("settings.advanced.downloadedNone")}>
      {models.length > 0 && <div id="downloaded-models" className="downloaded-models">
        {models.map((model) => <DownloadedModel key={model.id} model={model} uses={uses(model.id)} removable={removable} t={t} />)}
      </div>}
    </Row>
  );
}
