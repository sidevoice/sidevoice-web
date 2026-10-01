import type { ReactNode } from "react";
import { ChoiceSelect } from "../../components/ui/ChoiceSelect";
import { ProviderIcon } from "../../components/ui/Icons";
import { OptionsForm } from "../../components/options/OptionFields";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import type { StageTask } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { StageCheck } from "./StageCheck";
import { StageDiagnostics } from "./StageDiagnostics";
import { useT } from "../../i18n";

/** What running on this device means, by where it runs; a provider's says its name. */
const WHERE_NOTES: Record<string, string> = { page: "stage.where.page", app: "stage.where.app" };

/** One stage — transcription or voice — as sidevoice/sidevoice-core#21 draws it: where, which model, its options, and under
 *  Avanzado the build it runs on. Everything shown is the store's; every change is an action. */
/** `onMissingPlace`: what choosing a provider with no key does — by default, Integraciones at its row; the wizard
 *  asks for the key in place. */
/** `pendingPlace`: a provider chosen whose key is still being asked for — shown as the place, with the model and its
 *  options waiting until the key is in. */
/** `onPlaceChange` / `onModelChange` / `onOptionChange` / `onBuildChange`: what choosing does — by default the room's
 *  actions (a device model asks to be downloaded and checked); the stage editor only selects, and prepares and tests on
 *  its own card, which is also where the voice is heard (`hideVoiceTools`). */
export function StageSettings({ task, onMissingPlace, placeExtra, pendingPlace, onPlaceChange, onModelChange, onOptionChange, onBuildChange, afterModel, hideCheck, hidePlaceNote, hideVoiceTools }: {
  task: StageTask; onMissingPlace?: (id: string) => void; placeExtra?: ReactNode; pendingPlace?: string | null; onPlaceChange?: (id: string) => void;
  onModelChange?: (model: string) => void; onOptionChange?: (id: string, value: unknown, language?: string) => void; onBuildChange?: (value: string) => void;
  afterModel?: ReactNode; hideCheck?: boolean; hidePlaceNote?: boolean; hideVoiceTools?: boolean;
}) {
  const t = useT();
  const view = useRoomStore((state) => state.stages?.[task] ?? null);
  const tools = useRoomStore((state) => state.voiceTools);
  const inApp = useRoomStore((state) => state.facts.inApp);
  const actions = () => window.sidevoiceActions;
  if (!view) return <p className="muted" role="status">{t("common.loading")}</p>;
  const locked = !view.editable;
  return (
    <div className="stage-settings" data-task={task}>
      {view.integrations === "failed" && (
        <p className="missing-integration muted" role="alert">
          <span>{t("stage.integrationsFailed")}</span>
          <Button variant="ghost" size="compact" onClick={() => void actions()?.retryIntegrations()}>{t("common.retry")}</Button>
        </p>
      )}
      {view.unconfigured && <p className="muted" role="alert">{t("stage.unconfigured")}</p>}
      <div className="ui-field">
        {/* One list, whatever the number of providers (operator, 2026-10-01): this device first, the providers
            under it, a provider with no key said so — choosing it asks for the key. */}
        <span className="ui-field-label" id={`${task}-place-label`}>{t("stage.where")}</span>
        <ChoiceSelect id={`${task}-place`} labelledBy={`${task}-place-label`} value={pendingPlace ?? view.place} disabled={locked}
          choices={view.places.map((place) => ({ value: place.id, label: place.label, kind: place.state, icon: <ProviderIcon id={place.id} />,
            group: place.id === "device" ? undefined : t("stage.place.providers"),
            detail: place.state === "missing" ? t("stage.place.noKey") : undefined,
            // What running there means, said in the list itself rather than under the model.
            description: place.id === "device" ? t(WHERE_NOTES[inApp ? "app" : "page"]) : t("stage.place.providerNote", { provider: place.label }) }))}
          onChange={(id) => {
            const place = view.places.find((p) => p.id === id);
            if (place?.state === "missing") (onMissingPlace ?? ((p: string) => actions()?.openIntegration(p)))(id);
            else if (onPlaceChange) onPlaceChange(id);
            else actions()?.chooseStagePlace(task, id);
          }} />
      </div>
      {placeExtra}
      <div className="ui-field">
        <span className="ui-field-label" id={`${task}-model-label`}>{t("stage.model")}</span>
        <ChoiceSelect id={`${task}-model`} labelledBy={`${task}-model-label`} value={pendingPlace ? "" : view.model}
          disabled={!!pendingPlace || locked || view.modelsLoading || !view.models.length}
          placeholder={pendingPlace ? t("stage.keyFirst") : view.modelsLoading ? t("stage.modelsLoading") : "—"}
          choices={view.models.map((model) => ({ value: model.id, label: model.label, detail: model.detail || undefined, description: model.description }))}
          onChange={(model) => onModelChange ? onModelChange(model) : actions()?.chooseStageModel(task, model)} />
      </div>
      {pendingPlace ? null : <>
      {view.check && !hideCheck && <StageCheck task={task} check={view.check} />}
      {afterModel}
      {view.modelsError && <p className="muted" role="status">{view.modelsError}</p>}
      {!hidePlaceNote && WHERE_NOTES[view.where] && <p className="muted">{t(WHERE_NOTES[view.where])}</p>}
      <OptionsForm task={task} options={view.options} disabled={locked}
        onChange={(id, value, language) => onOptionChange ? onOptionChange(id, value, language) : actions()?.setStageOption(task, id, value, language)}
        onPreview={task === "tts" && !hideVoiceTools ? (language) => void actions()?.previewVoice(language) : undefined}
        previewing={task === "tts" && !hideVoiceTools ? tools.previewing : null} />
      {task === "tts" && !hideVoiceTools && <p className="muted" role="status">{tools.previewNote}</p>}
      {(view.advanced || view.diagnostics) && (
        <details className="stage-advanced">
          <summary>{t("stage.advanced")}</summary>
          {view.advanced && (
            <>
              <label className="ui-field">{t("stage.engine")}
                <NativeSelect id={`${task}-build`} value={view.advanced.value} disabled={locked}
                  onChange={(event) => onBuildChange ? onBuildChange(event.target.value) : actions()?.chooseStageBuild(task, event.target.value)}>
                  {view.advanced.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </NativeSelect>
              </label>
              <p className="muted">{view.advanced.reason}</p>
            </>
          )}
          {tools.gpuSetAside && view.where === "page" && (
            <p className="missing-integration muted">
              <span>{t("stage.gpuSetAside")}</span>
              <Button variant="ghost" size="compact" onClick={() => void actions()?.retryGpu()}>{t("stage.retryGpu")}</Button>
            </p>
          )}
          {view.diagnostics && <StageDiagnostics task={task} diagnostics={view.diagnostics} />}
        </details>
      )}
      {task === "tts" && view.place === "device" && !hideVoiceTools && (
        <>
          <Button id="prepare-model" onClick={() => void actions()?.prepareVoice()}>{t("stage.preload")}</Button>
          <p className="muted" role="status">{tools.prepareNote}</p>
        </>
      )}
      </>}
    </div>
  );
}
