import { useState, useSyncExternalStore } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { RefreshIcon } from "../../components/ui/Icons";
import type { LocalHostAction } from "./local-host-status";
import { canRunLocalHostAction, hostStatusText, knownLocalHostState, runLocalHostAction } from "./local-host-status";
import { translator } from "../../i18n/translator";
import { useRoomStore } from "../../state/room-store";
import { localHostInstallController } from "../../services/local-host-install";
import "./banners.css";

export function LocalHostBanner() {
  const t = translator();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const install = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Every machine is live at once: this computer not answering is worth a banner when nothing else answers either.
  const onlyLocalMachine = !!local && machines.every((machine) => machine.local);
  const otherAnswering = machines.some((machine) => !machine.local && machine.state === "connected");
  // Preparation reports its own progress. An absent host belongs to the setup entry; starting is still in progress.
  if (!local || status.reachable === true || ["absent", "starting", "installing"].includes(status.state)
    || install.phase === "installing" || (install.phase === "failed" && !local.pairingId)
    || (!onlyLocalMachine && otherAnswering)) return null;
  // A state this app does not know (sidevoice-core#112) is offered nothing: restarting is not known to be what it needs.
  const action: LocalHostAction | null = !knownLocalHostState(status.state) || status.state === "incompatible" ? null
    : status.state === "stopped-by-person" ? "start"
      : status.state === "not-installed" ? "serviceInstall"
        : status.state === "refused" ? "reconnect" : "restart";
  const available = action ? canRunLocalHostAction(action) : false;
  // Stopped (or its service not set up, which setting up starts), what brings it back is Start, as on its card; else Retry.
  const starts = action === "start" || action === "serviceInstall";
  // No install command follows a banner's line: incompatible is said without "Update it:".
  const cause = hostStatusText(status, t, { command: false });
  async function retry() {
    if (busy || !action) return;
    setBusy(true);setError(false);
    try { await runLocalHostAction(action); } catch { setError(true); }
    finally { setBusy(false); }
  }
  return (
    <aside className="room-banner local-host-banner" role="status">
      <Alert tone="danger" title={t("noMachine.retryBanner", { cause })}
        action={available ? <Button size="sm" loading={busy} onClick={() => void retry()}>{starts ? t("hosts.start") : <><RefreshIcon />{t("hosts.retry")}</>}</Button> : undefined}>
        {error ? t("hosts.actionFailed") : undefined}
      </Alert>
    </aside>
  );
}
