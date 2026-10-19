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
import { PresenceSound } from "../features/call/PresenceSound";
import { ConnectionStatsDialog } from "../features/diagnostics/ConnectionStatsDialog";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ResetReportNotice } from "../features/settings/DangerZone";
import { PairingDialog } from "../features/pairing/PairingDialog";
import { TooltipProvider } from "../components/ui/Tooltip";
import { NoMachineScreen } from "../features/pairing/NoMachineScreen";
import { LocalHostBanner } from "../features/settings/LocalHostBanner";
import { StorageBlockedBanner } from "../features/settings/StorageBlockedBanner";
import { OnboardingProvider, useOnboarding } from "../features/onboarding/onboarding-context";
import { Wizard } from "../features/onboarding/Wizard";
import { callArea } from "../features/onboarding/onboarding-flow";
import { VoiceSetupCard } from "../features/call/VoiceSetupCard";
import { useRoomStore } from "../state/room-store";
import type { OnboardingRepository, OnboardingStep } from "../services/onboarding-state";
import { useUiLanguage } from "../i18n/use-ui-language";

function RoomContent() {
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const localHostStatus = useRoomStore((state) => state.facts.localHostStatus);
  const install = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const pendingLocalSelection = useRef(false);
  // Native projects an installing service as a local row before it has a pairing; preparation still belongs in the empty state.
  const projectedLocalOnly = machines.length === 1 && machines[0].local && !machines[0].pairingId;
  const preparingWithoutPairing = projectedLocalOnly && install.phase !== "idle" && install.source === "no-machine";
  const noMachine = ready && (machines.length === 0 || preparingWithoutPairing);
  const onboarding = useOnboarding();
  // What the room shows of the setup is decided in onboarding-flow.ts: whether the room waits behind it, and what the
  // call's own space says is missing — one thing at a time.
  const { roomHidden, waiting, blocked } = callArea({ ready: onboarding.ready, done: onboarding.done, noMachine: !!noMachine, voice: onboarding.voice.state });
  const callBlocked = waiting !== null;

  useEffect(() => {
    if (install.phase === "installing") {
      pendingLocalSelection.current = true;
      return;
    }
    const recovered = localHostStatus.state === "running" && localHostStatus.reachable === true
      && machines.some((machine) => machine.local && machine.state === "connected" && machine.pairingId);
    if ((install.phase === "failed" || install.phase === "cancelled") && recovered) {
      pendingLocalSelection.current = false;
      localHostInstallController.clear();
      return;
    }
    if (install.phase === "idle" || install.phase === "failed" || install.phase === "cancelled") {
      pendingLocalSelection.current = false;
      return;
    }
    // Installed, this computer is one more machine, live with the rest once it answers: nothing to choose.
    if (install.phase === "succeeded" && pendingLocalSelection.current) {
      const localMachine = machines.find((machine) => machine.local && machine.state === "connected" && machine.pairingId);
      if (!localMachine?.pairingId) return;
      pendingLocalSelection.current = false;
      localHostInstallController.clear();
    }
  }, [install.phase, machines, localHostStatus.state, localHostStatus.reachable]);

  return (
    <>
      <StorageBlockedBanner />
      <ResetReportNotice />
      <div className="room-shell" hidden={roomHidden} aria-hidden={roomHidden || undefined}>
        <RoomHeader blocked={blocked} />
        <LocalHostBanner />
        {/* The call: the conversations, the stage over its bar, and the transcript when it is open (2026-10-10). One layout
            whatever is set up (operator, 2026-10-16): the conversations' column and Settings always; only the call's own
            space says what is missing — what is missing — one at a time. */}
        <main className="call-layout">
          <ErrorBoundary area="participants"><ConversationSidebar blocked={blocked} /></ErrorBoundary>
          {callBlocked && <div className="call-column call-column--waiting" data-waiting={waiting}>
            {waiting === "machine" ? <NoMachineScreen source="no-machine" />
              : waiting === "voice" ? <VoiceSetupCard rows={onboarding.voice.rows} />
              : null}
          </div>}
          {/* The stage and its call bar share a column, so the bar centres under the stage and the conversations and
              the transcript run the screen's whole height beside them. Kept in the page while the call's space waits (only
              hidden): the runtime binds their controls as it starts. */}
          <div className="call-column" hidden={callBlocked}>
            <ErrorBoundary area="stage"><CallStage /></ErrorBoundary>
            <ErrorBoundary area="toolbar"><CallToolbar /></ErrorBoundary>
          </div>
          <ErrorBoundary area="transcript"><TranscriptPanel /></ErrorBoundary>
        </main>
        {!callBlocked && <PresenceSound />}
        <ConnectionStatsDialog />
        <SettingsDialog />
      </div>
      {onboarding.ready && <Wizard />}
      <PairingDialog />
    </>
  );
}

/** `onboarding`: where the setup keeps its record, and a step to open at — the journeys' storyboard shows each step. */
export function App({ store, onboarding, runtime }: { store?: RoomStore; onboarding?: { repository?: OnboardingRepository; startAt?: OnboardingStep }; runtime?: boolean } = {}) {
  // Every word on the page is drawn in the interface's language: a switch draws the page again.
  useUiLanguage();
  return (
    <RoomProvider store={store} runtime={runtime}>
      <OnboardingProvider repository={onboarding?.repository} startAt={onboarding?.startAt}>
        <TooltipProvider>
          <RoomContent />
        </TooltipProvider>
      </OnboardingProvider>
    </RoomProvider>
  );
}
