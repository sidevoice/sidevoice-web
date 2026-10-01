import { useState } from "react";
import { Button } from "../../components/ui/Button";
import type { StageTask, StageView } from "../../state/room-types";

/** Diagnóstico (#90): where this stage's model runs and on what, the resolver's reason, and what its last check
 *  measured. Copiar resultados copies the same rows as text (#123). */
export function StageDiagnostics({ task, diagnostics }: { task: StageTask; diagnostics: NonNullable<StageView["diagnostics"]> }) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const actions = () => window.sidevoiceActions;
  return (
    <div className="stage-diagnostics" data-task={task}>
      <h4>Diagnóstico</h4>
      <dl className="stage-check-rows">
        {diagnostics.rows.map((row) => (
          <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
        ))}
      </dl>
      <div className="stage-check-actions">
        <Button variant="ghost" size="compact" disabled={diagnostics.busy} onClick={() => actions()?.recheckStage(task)}>Comprobar ahora</Button>
        <Button variant="ghost" size="compact" onClick={async () => setCopied((await actions()?.copyDiagnostics(task)) ? "yes" : "no")}>Copiar resultados</Button>
      </div>
      <p className="muted" role="status">{copied === "yes" ? "Copiado" : copied === "no" ? "No se pudo copiar" : ""}</p>
    </div>
  );
}
