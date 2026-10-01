import { Button } from "../../components/ui/Button";
import type { StageCheckView, StageTask } from "../../state/room-types";

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="stage-check-rows">
      {rows.map((row) => (
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
    </dl>
  );
}

/** A model being selected (#124 §6): selecting it downloads it (after asking), loads it and checks it, and only a
 *  check that passed puts it in place of the model in use. Every phrase is a whole text of its own, so the page's
 *  translation (room-i18n.js) finds it; the values beside them are the model's and the numbers. */
export function StageCheck({ task, check }: { task: StageTask; check: StageCheckView }) {
  const actions = () => window.sidevoiceActions;
  const decide = (yes: boolean) => actions()?.decideStage(task, yes);
  if (check.phase === "consent")
    return (
      <div className="stage-check" data-phase="consent" role="group" aria-label="Descarga del modelo">
        <p><strong>{check.model}</strong></p>
        <p><span>Descarga necesaria:</span> <span>{check.size || "—"}</span></p>
        <p className="muted">Se descarga una vez, se carga y se comprueba antes de usarlo. Hasta entonces sigue el modelo actual.</p>
        <div className="stage-check-actions">
          <Button variant="primary" size="compact" onClick={() => decide(true)}>Descargar y probar</Button>
          <Button variant="ghost" size="compact" onClick={() => decide(false)}>Cancelar</Button>
        </div>
      </div>
    );
  if (check.phase === "running")
    return (
      <div className="stage-check" data-phase="running" role="status" aria-live="polite">
        <p><strong>{check.model}</strong> <span>·</span> <span>{check.step}</span>{check.amount && <> <span>·</span> <span>{check.amount}</span></>}</p>
        <progress className="stage-check-progress" max={1} value={check.fraction ?? undefined} aria-label="Progreso de la comprobación" />
        <div className="stage-check-actions">
          <Button variant="ghost" size="compact" onClick={() => actions()?.cancelStage(task)}>Cancelar</Button>
        </div>
      </div>
    );
  if (check.phase === "failed")
    return (
      <div className="stage-check" data-phase="failed" role="alert">
        <p><span>{check.recheck ? "La comprobación falló:" : "No se activó:"}</span> <strong>{check.model}</strong></p>
        <dl className="stage-check-rows">
          <div><dt>Paso</dt><dd>{check.step}</dd></div>
          <div><dt>Causa</dt><dd>{check.cause}</dd></div>
          {check.previous && !check.recheck && <div><dt>Sigue activo</dt><dd>{check.previous}</dd></div>}
        </dl>
      </div>
    );
  if (check.phase === "slow")
    return (
      <div className="stage-check" data-phase="slow" role="alert">
        <p><strong>{check.model}</strong> <span>·</span> <span>Funciona, pero tarda en transcribir.</span></p>
        <dl className="stage-check-rows">
          <div><dt>Latencia al terminar el turno</dt><dd>{check.latency}</dd></div>
          <div><dt>Lo cómodo</dt><dd>{check.comfort}</dd></div>
        </dl>
        <div className="stage-check-actions">
          <Button variant="primary" size="compact" onClick={() => decide(true)}>Usar igualmente</Button>
          <Button variant="ghost" size="compact" onClick={() => decide(false)}>Elegir otro</Button>
        </div>
      </div>
    );
  return (
    <div className="stage-check" data-phase="done" role="status">
      <p><span>{check.recheck ? "Comprobado:" : "Activado:"}</span> <strong>{check.model}</strong></p>
      <Rows rows={check.rows} />
    </div>
  );
}
