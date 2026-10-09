import { useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { PROVIDERS, PROVIDER_NAMES } from "../../services/voice-settings.js";

/* The remote providers' keys, kept by the call's voice on this device: the desktop app in the system keychain, a
 * browser in this page's storage. A key typed here goes to the voice and nowhere else; the page never reads it back. */

function keyError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code ? "No se pudo guardar la clave (" + code + ")." : (error as Error | null)?.message || "No se pudo guardar la clave.";
}

function ProviderKey({ provider }: { provider: string }) {
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const name = PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES] ?? provider;
  const keep = async (key: string | null) => {
    setBusy(true);
    setNote("");
    try {
      await window.sidevoiceActions?.saveProviderKey(provider, key);
      setValue("");
      setNote(key ? "Clave guardada." : "Clave quitada.");
    } catch (error) {
      setNote(keyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="provider-key" data-provider={provider}>
      <div className="provider-key-head"><strong>{name}</strong><span className="muted">{kept === true ? "Clave guardada" : kept === false ? "Sin clave" : "—"}</span></div>
      <label>Clave de API de {name}
        <input id={"provider-key-" + provider} type="password" autoComplete="off" spellCheck={false} value={value} placeholder={kept ? "Escribe otra para cambiarla" : "Pega la clave"} onChange={(event) => setValue(event.target.value)} />
      </label>
      <div className="provider-key-actions">
        <Button id={"provider-key-save-" + provider} disabled={busy || !value.trim()} onClick={() => void keep(value.trim())}>Guardar clave</Button>
        <Button id={"provider-key-remove-" + provider} variant="ghost" disabled={busy || kept !== true} onClick={() => void keep(null)}>Quitar</Button>
      </div>
      <p className="muted" role="status">{note}</p>
    </div>
  );
}

export function ProviderKeys() {
  const inApp = useRoomStore((state) => state.facts.inApp);
  return (
    <section id="pane-providers" aria-labelledby="settings-providers" hidden>
      <h3>Proveedores</h3>
      <p className="muted">Los modelos de OpenAI y ElevenLabs se usan con tu propia clave. La clave nunca se envía a la sala ni a tu máquina: la voz de este dispositivo llama al proveedor directamente.</p>
      {inApp
        ? <p className="muted" id="provider-keys-where">Las claves se guardan en el llavero del sistema. Esta página no puede leerlas.</p>
        : <p className="provider-keys-warning" id="provider-keys-where" role="note">La clave se guarda en este navegador, sin cifrar: cualquier script de esta página puede leerla, y queda en este navegador hasta que la quites. Ponle un límite de gasto en la web del proveedor.</p>}
      {PROVIDERS.map((provider) => <ProviderKey key={provider} provider={provider} />)}
    </section>
  );
}
