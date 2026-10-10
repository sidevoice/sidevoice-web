import { useEffect, useRef, useSyncExternalStore } from "react";
import { RoomProvider } from "./RoomProvider";
import type { RoomStore } from "../state/room-store";
import { localHostInstallController } from "../services/local-host-install";
import { ErrorBoundary } from "./ErrorBoundary";
import { RoomHeader } from "../features/room/RoomHeader";
import { ConversationSidebar } from "../features/room/ConversationSidebar";
import { TranscriptPanel } from "../features/conversation/TranscriptPanel";
import { CallStage } from "../features/call/CallStage";
import { CallToolbar } from "../features/call/CallToolbar";
import { ConnectionStatsDialog } from "../features/diagnostics/ConnectionStatsDialog";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { PairingDialog } from "../features/pairing/PairingDialog";
import { TooltipProvider } from "../components/ui/Tooltip";
import { NoMachineScreen } from "../features/pairing/NoMachineScreen";
import { LocalHostInstallEntry } from "../features/pairing/LocalHostInstallEntry";
import { LocalHostBanner } from "../features/settings/LocalHostBanner";
import { StorageBlockedBanner } from "../features/settings/StorageBlockedBanner";
import { useRoomStore } from "../state/room-store";

function RoomContent() {
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const pendingLocalSelection = useRef(false);
  const noMachine = ready && machines.length === 0;

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
      <RoomHeader />
      <StorageBlockedBanner />
      <LocalHostBanner />
      {!noMachine && install.phase !== "idle" && install.source === "no-machine" &&
        <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess className="local-install-entry--room" />}
      {/* The call: the conversations, the stage, and the transcript when it is open (2026-10-10). */}
      <main className={noMachine ? undefined : "call-layout"}>
        {noMachine ? <NoMachineScreen source="no-machine" /> : <>
          <ErrorBoundary area="participants"><ConversationSidebar /></ErrorBoundary>
          <ErrorBoundary area="stage"><CallStage /></ErrorBoundary>
          <ErrorBoundary area="transcript"><TranscriptPanel /></ErrorBoundary>
        </>}
      </main>
      {!noMachine && <ErrorBoundary area="toolbar"><CallToolbar /></ErrorBoundary>}
      <ConnectionStatsDialog />
      <SettingsDialog />
      <PairingDialog />
    </>
  );
}

export function App({ store }: { store?: RoomStore } = {}) {
  return (
    <RoomProvider store={store}>
      <TooltipProvider>
        <RoomContent />
      </TooltipProvider>
    </RoomProvider>
  );
}
