import { Button } from "../../components/ui/Button";
import { JoinStatus } from "./JoinStatus";
import { CallButton, MicControl, MuteButton } from "./CallIndicators";
import { CapabilityColumn, EngineColumn, LightsSummary } from "../conversation/StatusColumns";

/* The bar's three parts: what this call has switched on at the left edge, the controls island in the
 * middle, what listens, speaks and thinks at the right edge. Facts at the sides, actions in the middle. */
export function CallToolbar() {
  return (
    <footer className="call-bar">
      <CapabilityColumn />
      <LightsSummary />
      <div className="controls" id="call-controls">
        <JoinStatus />
        <div className="call-actions">
          <MicControl>
            <span id="mic-level-meter" className="sr-only" role="meter" aria-label="Nivel de micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
                        <MuteButton />
          </MicControl>
          <CallButton />
          <details id="call-menu" className="call-menu"><summary aria-label="Más opciones" title="Más opciones"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></summary><div className="call-menu-panel"><Button id="stats-open" variant="ghost" size="compact">Estadísticas de conexión</Button><Button id="call-settings-open" variant="ghost" size="compact">Configuración</Button></div></details>
        </div>
      </div>
      <EngineColumn />
    </footer>
  );
}
