import { ModelPicker } from "../../components/models/ModelPicker";
import { OptionsForm } from "../../components/options/OptionFields";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import type { StageTask } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";

const WHERE_NOTES = {
  page: "Se ejecuta en este navegador; la primera vez se descarga y después se reutiliza su caché.",
  app: "Se ejecuta en este dispositivo, con su propio motor; cada modelo se descarga una vez.",
  provider: "",
};

/** One stage — transcription or voice — as #124 §5 draws it: where, which model, its options, and under
 *  Avanzado the build it runs on. Everything shown is the store's; every change is an action. */
export function StageSettings({ task }: { task: StageTask }) {
  const view = useRoomStore((state) => state.stages?.[task] ?? null);
  const tools = useRoomStore((state) => state.voiceTools);
  const actions = () => window.sidevoiceActions;
  if (!view) return <p className="muted" role="status">Cargando…</p>;
  const locked = !view.editable;
  return (
    <div className="stage-settings" data-task={task}>
      {view.integrations === "failed" && (
        <p className="missing-integration muted" role="alert">
          <span>No se pudieron leer las integraciones de esta máquina; se mantiene lo guardado.</span>
          <Button variant="ghost" size="compact" onClick={() => void actions()?.retryIntegrations()}>Reintentar</Button>
        </p>
      )}
      {view.unconfigured && <p className="muted" role="alert">Este dispositivo no puede ejecutar ningún modelo: elige un proveedor.</p>}
      <div className="ui-field">
        <span className="ui-field-label" id={`${task}-place-label`}>Dónde</span>
        <div className="segmented" role="group" aria-labelledby={`${task}-place-label`}>
          {view.places.map((place) => (
            <Button key={place.id} id={`${task}-place-${place.id}`} variant="ghost" size="compact" className="segment"
              aria-pressed={view.place === place.id} data-state={place.state}
              disabled={locked && view.place !== place.id}
              onClick={() => place.state === "missing" ? actions()?.openIntegration(place.id) : actions()?.chooseStagePlace(task, place.id)}>
              {place.label}{place.state === "missing" ? " · Configurar" : ""}
            </Button>
          ))}
        </div>
      </div>
      <ModelPicker label="Modelo" id={`${task}-model`} value={view.model} disabled={locked || view.modelsLoading || !view.models.length}
        description={view.models.find((model) => model.id === view.model)?.description}
        onChange={(event) => actions()?.chooseStageModel(task, event.target.value)}>
        {view.modelsLoading && !view.models.length && <option value="">Cargando modelos…</option>}
        {view.models.map((model) => <option key={model.id} value={model.id}>{model.label}{model.detail ? ` · ${model.detail}` : ""}</option>)}
      </ModelPicker>
      {view.modelsError && <p className="muted" role="status">{view.modelsError}</p>}
      {WHERE_NOTES[view.where] && <p className="muted">{WHERE_NOTES[view.where]}</p>}
      <OptionsForm task={task} options={view.options} disabled={locked}
        onChange={(id, value, language) => actions()?.setStageOption(task, id, value, language)}
        onPreview={task === "tts" ? (language) => void actions()?.previewVoice(language) : undefined}
        previewing={task === "tts" ? tools.previewing : null} />
      {task === "tts" && <p className="muted" role="status">{tools.previewNote}</p>}
      {view.advanced && (
        <details className="stage-advanced">
          <summary>Avanzado</summary>
          <label className="ui-field">Motor
            <NativeSelect id={`${task}-build`} value={view.advanced.value} disabled={locked} onChange={(event) => actions()?.chooseStageBuild(task, event.target.value)}>
              {view.advanced.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </NativeSelect>
          </label>
          <p className="muted">{view.advanced.reason}</p>
          {tools.gpuSetAside && view.where === "page" && (
            <p className="missing-integration muted">
              <span>La GPU no pudo cargar un modelo en este navegador; lo que la necesita no se ofrece.</span>
              <Button variant="ghost" size="compact" onClick={() => void actions()?.retryGpu()}>Volver a probar la GPU</Button>
            </p>
          )}
        </details>
      )}
      {task === "tts" && view.place === "device" && (
        <>
          <Button id="prepare-model" onClick={() => void actions()?.prepareVoice()}>Precargar modelo (opcional)</Button>
          <p className="muted" role="status">{tools.prepareNote}</p>
        </>
      )}
    </div>
  );
}
