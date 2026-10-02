import { useState } from "react";
import { Button } from "../../components/ui/Button";
import type { LocalHostAction } from "./local-host-status";
import { canRunLocalHostAction, hostStatusText, runLocalHostAction } from "./local-host-status";
import { hostTranslator } from "./host-i18n";
import { useRoomStore } from "../../state/room-store";

export function LocalHostBanner() {
  const t = hostTranslator();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const selected = machines.find((machine) => machine.inUse) ?? null;
  const onlyLocalMachine = !!local && machines.every((machine) => machine.local);
  if (!local || status.reachable === true || (!local.inUse && !onlyLocalMachine && selected)) return null;
  const action: LocalHostAction | null = status.state === "incompatible" ? null : status.state === "stopped-by-person" ? "start"
    : status.state === "not-installed" ? "serviceInstall"
      : status.state === "refused" ? "reconnect" : "restart";
  const available = action ? canRunLocalHostAction(action) : false;
  const cause = hostStatusText(status, t);
  async function retry() {
    if (busy || !action) return;
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
