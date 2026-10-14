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
import { PairingDialog } from "../features/pairing/PairingDialog";
import { TooltipProvider } from "../components/ui/Tooltip";
import { NoMachineScreen } from "../features/pairing/NoMachineScreen";
import { LocalHostInstallEntry } from "../features/pairing/LocalHostInstallEntry";
import { LocalHostBanner } from "../features/settings/LocalHostBanner";
import { UpdateNotice } from "../features/updates/UpdateNotice";
import { StorageBlockedBanner } from "../features/settings/StorageBlockedBanner";
import { OnboardingProvider, useOnboarding } from "../features/onboarding/onboarding-context";
import { SetupPending, Wizard } from "../features/onboarding/Wizard";
import { useRoomStore } from "../state/room-store";
import type { OnboardingRepository, OnboardingStep } from "../services/onboarding-state";
import { useUiLanguage } from "../i18n/use-ui-language";
import { useBubbleVariant, bubbleVariantMetadata } from "../lib/bubble-variants";
import "../features/conversation/bubble-variants.css";

function RoomContent() {
  const bubblesStyle = useBubbleVariant();
  const bubblesMetadata = bubbleVariantMetadata();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(localHostInstallController.subscribe, localHostInstallController.getSnapshot, localHostInstallController.getSnapshot);
  const pendingLocalSelection = useRef(false);
  const noMachine = ready && machines.length === 0;
  const onboarding = useOnboarding();
  // Until the first setup is finished the room stays out of reach: no header, call bar or settings behind the wizard.
  const setupPending = !onboarding.ready || !onboarding.record.completed_at;

  useEffect(() => {
    if (install.phase === "installing") {
      pendingLocalSelection.current = true;
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
  }, [install.phase, machines]);

  return (
    <>
      <StorageBlockedBanner />
      <div className="room-shell" hidden={setupPending} aria-hidden={setupPending || undefined} data-bubbles-variants={JSON.stringify(bubblesMetadata)}>
        <RoomHeader />
        <LocalHostBanner />
        {!noMachine && install.phase !== "idle" && install.source === "no-machine" &&
          <LocalHostInstallEntry showCta={false} source="no-machine" holdSuccess className="local-install-entry--room" />}
        {/* The call: the conversations, the stage over its bar, and the transcript when it is open (2026-10-10). */}
        <main className={noMachine ? undefined : "call-layout"} data-bubbles-style={noMachine ? undefined : bubblesStyle}
          data-bubbles-variants={noMachine ? undefined : JSON.stringify(bubblesMetadata)}>
          {noMachine ? <NoMachineScreen source="no-machine" /> : <>
            <ErrorBoundary area="participants"><ConversationSidebar /></ErrorBoundary>
            {/* The stage and its call bar share a column, so the bar centres under the stage and the conversations and
                the transcript run the screen's whole height beside them. */}
            <div className="call-column">
              {/* An update waiting, said over the stage: a pill at its top, a desktop's only, never moving it. */}
              <ErrorBoundary area="stage"><CallStage notice={<UpdateNotice />} /></ErrorBoundary>
              <ErrorBoundary area="toolbar"><CallToolbar /></ErrorBoundary>
            </div>
            <ErrorBoundary area="transcript"><TranscriptPanel /></ErrorBoundary>
          </>}
        </main>
        {!noMachine && <PresenceSound />}
        <ConnectionStatsDialog />
        <SettingsDialog />
      </div>
      {setupPending && onboarding.ready && !onboarding.open && <main className="setup-main"><SetupPending /></main>}
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
