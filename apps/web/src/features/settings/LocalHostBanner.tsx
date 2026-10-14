import { useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { RefreshIcon } from "../../components/ui/Icons";
import type { LocalHostAction } from "./local-host-status";
import { canRunLocalHostAction, hostStatusText, knownLocalHostState, runLocalHostAction } from "./local-host-status";
import { translator } from "../../i18n/translator";
import { useRoomStore } from "../../state/room-store";
import "./banners.css";

export function LocalHostBanner() {
  const t = translator();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Every machine is live at once: this computer not answering is worth a banner when nothing else answers either.
  const onlyLocalMachine = !!local && machines.every((machine) => machine.local);
  const otherAnswering = machines.some((machine) => !machine.local && machine.state === "connected");
  if (!local || status.reachable === true || (!onlyLocalMachine && otherAnswering)) return null;
  // A state this app does not know (sidevoice-core#112) is offered nothing: restarting is not known to be what it needs.
  const action: LocalHostAction | null = !knownLocalHostState(status.state) || status.state === "incompatible" ? null
    : status.state === "stopped-by-person" ? "start"
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
    <aside className="room-banner local-host-banner" role="status">
      <Alert tone="danger" title={t("noMachine.retryBanner", { cause })}
        action={available ? <Button size="sm" loading={busy} onClick={() => void retry()}><RefreshIcon />{t("hosts.retry")}</Button> : undefined}>
        {error ? t("hosts.actionFailed") : undefined}
      </Alert>
    </aside>
  );
}
