import { useState } from "react";
import { Button } from "../../components/ui/Button";
import type { LocalHostAction } from "./local-host-status";
import { canRunLocalHostAction, hostStatusText, runLocalHostAction } from "./local-host-status";
import { hostTranslator } from "./host-i18n";
import { useRoomStore } from "../../state/room-store";

export function LocalHostBanner() {
  const t = hostTranslator();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!local?.inUse || status.state === "running") return null;
  const action: LocalHostAction = status.state === "stopped-by-person" ? "start"
    : status.state === "not-installed" ? "serviceInstall"
      : status.state === "refused" ? "reconnect" : "restart";
  const available = canRunLocalHostAction(action);
  const cause = hostStatusText(status, t);
  async function retry() {
    if (busy) return;
    setBusy(true);setError(false);
    try { await runLocalHostAction(action); } catch { setError(true); }
    finally { setBusy(false); }
  }
  return (
    <aside className="local-host-banner" role="status">
      <span>{t("noMachine.retryBanner", { cause })}{error ? ` ${t("hosts.actionFailed")}` : ""}</span>
      {available && <Button variant="ghost" size="compact" disabled={busy} onClick={() => void retry()}>{t("hosts.retry")}</Button>}
    </aside>
  );
}
