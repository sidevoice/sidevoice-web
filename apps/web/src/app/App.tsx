import { RoomProvider } from "./RoomProvider";
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
import { LocalHostBanner } from "../features/settings/LocalHostBanner";
import { useRoomStore } from "../state/room-store";

function RoomContent() {
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const noMachine = ready && machines.length === 0;
  return (
    <>
      <RoomHeader />
      <LocalHostBanner />
      <main>
        {noMachine ? <NoMachineScreen /> : <>
          <ErrorBoundary area="participants"><ParticipantSidebar /></ErrorBoundary>
          <ErrorBoundary area="transcript"><TranscriptPanel /></ErrorBoundary>
        </>}
      </main>
      {!noMachine && <ErrorBoundary area="toolbar"><CallToolbar /></ErrorBoundary>}
      <ConnectionStatsDialog />
      <SettingsDialog />
      <PairingDialog />
      <PreparationDialog />
      <audio id="preview-audio" />
    </>
  );
}

export function App() {
  return (
    <RoomProvider>
      <TooltipProvider>
        <RoomContent />
      </TooltipProvider>
    </RoomProvider>
  );
}
