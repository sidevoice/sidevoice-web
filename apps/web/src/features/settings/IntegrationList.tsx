import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { CloseIcon, IntegrationsIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";

/** The machine's integrations (#64): one row per provider it can call, with the one key that serves everything
 *  the provider does — transcription, voice — for every device of the owner's that uses this machine.
 *
 *  A key is written here and never read back: a stored one shows itself masked, with the four characters the
 *  machine returns. It checks itself where it is typed, as the panes' fields did (#72) — leaving the field, a
 *  pause, or Enter sends it, the machine keeps it only once the provider took it, and what that provider
 *  offers arrives in the other panes without saving. A key the provider refuses changes nothing and stays in
 *  the field to be corrected. Removing one is the ✕, and acts at once; a key from the machine's environment
 *  cannot be removed from here, and says so. */
export function IntegrationList() {
  const view = useRoomStore((state) => state.integrations);
  const focused = view.rows.find((row) => row.focused)?.id;
  const fields = useRef<Record<string, HTMLInputElement | null>>({});

  // "Configurar" in a pane lands here, on the row that fixes it.
  useEffect(() => {
    const field = focused ? fields.current[focused] : null;
    if (!field) return;
    field.scrollIntoView?.({ block: "nearest" });
    field.focus();
  }, [focused]);

  return (
    <div className="integrations" id="integrations">
      <h3><IntegrationsIcon /> Integraciones</h3>
      <p className="muted">Las claves de los proveedores que usa esta máquina. Se guardan en la máquina, que es quien llama al proveedor, y sirven a todos tus dispositivos; ninguno puede volver a leerlas. Una clave sirve para todo lo que hace su proveedor.</p>
      {view.error && <p className="muted" role="alert">{view.error}</p>}
      {view.rows.map((row) => (
        <div className="integration-row" key={row.id} data-configured={row.configured || undefined} data-focused={row.focused || undefined}>
          <label htmlFor={`integration-key-${row.id}`}>
            <span className="integration-name">{row.label}</span>
            <span className="integration-uses muted">{row.uses}</span>
          </label>
          <span className="key-field">
            <input
              id={`integration-key-${row.id}`}
              ref={(node) => { fields.current[row.id] = node; }}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={row.placeholder}
              aria-label={`Clave de API de ${row.label}`}
              value={row.draft}
              onChange={(event) => window.sidevoiceActions?.typeIntegrationKey(row.id, event.target.value)}
              onBlur={() => void window.sidevoiceActions?.checkIntegrationKey(row.id)}
              onKeyDown={(event) => {
                // Enter checks this key; it does not submit the rest of the settings.
                if (event.key !== "Enter") return;
                event.preventDefault();
                void window.sidevoiceActions?.checkIntegrationKey(row.id);
              }}
            />
            <Button variant="ghost" size="icon" className="key-clear" disabled={!row.canClear}
              aria-label={`Quitar la clave de ${row.label}`} title="Quitar la clave guardada"
              onClick={() => void window.sidevoiceActions?.clearIntegrationKey(row.id)}><CloseIcon size={15} /></Button>
          </span>
          <p className="muted integration-note" role="status" data-status={row.status || undefined}>{row.note}</p>
        </div>
      ))}
    </div>
  );
}

/** Under a pane's provider choice: each provider of that capability the machine could call but has no key for.
 *  It is greyed out in the list, and this says why and opens the row that fixes it. Only the owner is ever
 *  shown one: anyone else never sees a provider nobody configured. */
export function MissingIntegrations({ capability }: { capability: "transcription" | "voice" }) {
  const missing = useRoomStore((state) => state.integrations.missing[capability]);
  if (!missing.length) return null;
  return (
    <div className="missing-integrations" id={`missing-${capability}`}>
      {missing.map((provider) => (
        <p className="missing-integration muted" key={provider.id}>
          <span>{provider.label} necesita una clave de API.</span>
          <Button variant="ghost" size="compact" aria-label={`Configurar ${provider.label}`}
            onClick={() => window.sidevoiceActions?.openIntegration(provider.id)}>Configurar</Button>
        </p>
      ))}
    </div>
  );
}
