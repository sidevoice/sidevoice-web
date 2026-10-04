import { useEffect, useRef, useSyncExternalStore } from "react";
import { RoomProvider } from "./RoomProvider";
import type { RoomStore } from "../state/room-store";
import { localHostInstallController } from "../services/local-host-install";
import { ErrorBoundary } from "./ErrorBoundary";
import { RoomHeader } from "../features/room/RoomHeader";
import { ParticipantSidebar } from "../features/room/ParticipantSidebar";
import { TranscriptPanel } from "../features/conversation/TranscriptPanel";
import { CallToolbar } from "../features/call/CallToolbar";
import { ConnectionStatsDialog } from "../features/diagnostics/ConnectionStatsDialog";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { PairingDialog } from "../features/pairing/PairingDialog";
import { PreparationDialog } from "../features/call/PreparationDialog";
import { TooltipProvider } from "../components/ui/Tooltip";
import { NoMachineScreen } from "../features/pairing/NoMachineScreen";
import { LocalHostInstallEntry } from "../features/pairing/LocalHostInstallEntry";
import { LocalHostBanner } from "../features/settings/LocalHostBanner";
import { useRoomStore } from "../state/room-store";
import { OnboardingProvider, useOnboarding } from "../features/onboarding/onboarding-context";
import { SetupPending, Wizard } from "../features/onboarding/Wizard";

function RoomContent() {
  const onboarding = useOnboarding();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const pendingLocalSelection = useRef(false);
  const noMachine = ready && machines.length === 0;
  const setupPending = !onboarding.ready || !onboarding.record.completed_at;

  useEffect(() => {
    document.body.dataset.setup = onboarding.ready ? setupPending ? "pending" : "done" : "loading";
    return () => { delete document.body.dataset.setup; };
  }, [onboarding.ready, setupPending]);

  useEffect(() => {
    if (install.phase === "installing") {
      pendingLocalSelection.current = true;
      return;
    }
    if (install.phase === "idle" || install.phase === "failed" || install.phase === "cancelled") {
      pendingLocalSelection.current = false;
      return;
    }
    if (install.phase === "succeeded" && pendingLocalSelection.current) {
      const localMachine = machines.find((machine) => machine.local && machine.selectable && machine.pairingId);
      const chooseMachine = window.sidevoiceActions?.chooseMachine;
      if (!localMachine?.pairingId || typeof chooseMachine !== "function") return;
      chooseMachine(localMachine.pairingId);
      pendingLocalSelection.current = false;
      localHostInstallController.clear();
    }
  }, [install.phase, machines]);

  return (
    <>
      <div className="room-controller-shell" hidden={setupPending} aria-hidden={setupPending || undefined}>
        <RoomHeader />
        <LocalHostBanner />
        {!noMachine && install.phase !== "idle" && install.source === "no-machine" &&
          <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess className="local-install-entry--room" />}
        <main>
          {noMachine ? <NoMachineScreen source="no-machine" /> : <>
            <ErrorBoundary area="participants"><ParticipantSidebar /></ErrorBoundary>
            <ErrorBoundary area="transcript"><TranscriptPanel /></ErrorBoundary>
          </>}
        </main>
        {!noMachine && <ErrorBoundary area="toolbar"><CallToolbar /></ErrorBoundary>}
        <ConnectionStatsDialog />
        <SettingsDialog />
        <PreparationDialog />
      </div>
      {setupPending ? !onboarding.ready || onboarding.open ? <main className="setup-surface" aria-hidden="true" /> : <main className="no-machine-main"><SetupPending /></main> : null}
      {onboarding.ready && <Wizard />}
      <PairingDialog />
      <audio id="preview-audio" />
    </>
  );
}

export function App({ store }: { store?: RoomStore } = {}) {
  return (
    <RoomProvider store={store}>
      <OnboardingProvider>
        <TooltipProvider>
          <RoomContent />
        </TooltipProvider>
      </OnboardingProvider>
    </RoomProvider>
  );
}
