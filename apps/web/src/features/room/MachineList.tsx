import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { MachinesIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";

/** The machines this device is paired with (docs/DEVICE_PAIRING.md), and the only place to change which one
 *  it talks to or to forget one.
 *
 *  A row says the machine's name, whether it is the one in use, and where this device reaches it — directly or
 *  through the room. "Usar" acts at once — it is not a setting the Save button waits for — and in a call it hangs
 *  up and joins that machine's, which the note under the list says before anybody taps. Forgetting is not
 *  undoable (coming back takes a new code from the machine), so it asks first, in the row: a browser `confirm()`
 *  would take the whole page hostage for a question about one line of it. Pairing another machine starts here,
 *  since this is where the result appears. */
export function MachineList() {
  const machines = useRoomStore((state) => state.machines);
  const [asking, setAsking] = useState<string | null>(null);

  return (
    <div className="machines" id="machines">
      <h3><MachinesIcon /> Máquinas</h3>
      {machines.length === 0 && <p className="muted">Este dispositivo no está emparejado con ninguna máquina todavía.</p>}
      {machines.map((machine) => (
        <div className="machine-row" key={machine.id} data-state={machine.state} data-in-use={machine.inUse || undefined}>
          <div className="machine-summary">
            <span className="machine-state" data-state={machine.state} title={machine.reachLabel}><span className="dot" /></span>
            <span className="machine-copy">
              <span className="machine-name" title={machine.host}>{machine.host}</span>
              <span className="machine-brief muted">{[machine.inUse ? "En uso" : "", machine.reachLabel, machine.pairedLabel].filter(Boolean).join(" · ")}</span>
            </span>
            {asking === machine.id ? (
              <span className="machine-confirm" role="group" aria-label={`Confirmar para ${machine.host}`}>
                <span className="muted">¿Olvidar esta máquina? Para volver a usarla hará falta un código nuevo.</span>
                <Button variant="danger" size="compact" onClick={() => { setAsking(null); void window.sidevoiceActions?.forgetMachine(machine.id); }}>Sí, olvidar</Button>
                <Button variant="ghost" size="compact" onClick={() => setAsking(null)}>Cancelar</Button>
              </span>
            ) : (
              <span className="machine-actions">
                {!machine.inUse && (
                  <Button variant="ghost" size="compact" className="machine-action" aria-label={`Usar ${machine.host}`}
                    onClick={() => window.sidevoiceActions?.chooseMachine(machine.id)}>Usar</Button>
                )}
                <Button variant="ghost" size="compact" className="machine-action" aria-label={`Olvidar ${machine.host}`}
                  onClick={() => setAsking(machine.id)}>Olvidar</Button>
              </span>
            )}
          </div>
        </div>
      ))}
      {machines.length > 1 && (
        <p className="muted">Las conversaciones y la llamada son las de la máquina en uso. Cambiar de máquina cuelga la llamada y entra en la de la otra.</p>
      )}
      {machines.some((machine) => machine.revoked) && (
        <p className="muted">Una máquina revocada ya no acepta este dispositivo. Para volver a usarla, emparéjalo de nuevo con un código.</p>
      )}
      <div className="pairing">
        <Button id="pair-device-open" variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.openPairing()}>Emparejar una máquina</Button>
      </div>
    </div>
  );
}
