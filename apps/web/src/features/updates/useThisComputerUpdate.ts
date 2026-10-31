import { host } from "../../host";
import { useRoomStore } from "../../state/room-store";
import { safeLocalHostStatusDetails } from "../settings/local-host-status";
import { useLocalHostUpdate } from "./LocalHostUpdate";
import { UPDATE_PLACE, useAppUpdate } from "./useUpdates";

type PartState = "pending" | "current" | "unknown" | "none";

/** This computer's Sidevoice as This device and its row in Updates say it: one version — the
 *  app's, the Sidevoice the person installed, else its service's — and whether anything of it has an update (`state`):
 *  "pending" when the app's update shows in Updates (`pending`: what the person's check found; else manual's as soon as
 *  found, automatic's once ready — a download the app runs by itself is neither pending nor current) or the service is
 *  behind the one the app bundles (where the app updates it); "current" when each part that can say says it is current (the app's updater idle, its last check
 *  not failed; the service as the app bundles it); null where that is not known. `place`: where its update is acted on
 *  in Settings › Updates. The service's own number and update are its row's to say (`service`). */
export function useThisComputerUpdate() {
  const build = host().identity.build;
  const app = useAppUpdate();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const service = local && status ? status : null;
  // The app updates its service where it updates itself (a release; a nightly with its updater): one updated by hand
  // (a nightly without, a development build) has the service updated with it.
  const updatable = service && (!build || build.channel === "release" || app.updater !== null) ? service : null;
  const serviceUpdate = useLocalHostUpdate(updatable);
  const serviceVersion = service ? safeLocalHostStatusDetails(service).product_version : null;

  // Current only once a check has been seen to find nothing: never "Up to date" before any check.
  const appState: PartState = !app.updater ? "none" : !app.status ? "unknown" : app.status.state !== "idle" ? app.pending ? "pending" : "unknown"
    : app.status.error || !app.checkedAt ? "unknown" : "current";
  const serviceState: PartState = !updatable ? "none" : !serviceUpdate.report ? "unknown"
    : serviceUpdate.report.update === "available" ? "pending" : serviceUpdate.report.update === "current" ? "current" : "unknown";
  const parts = [appState, serviceState];
  const state = parts.includes("pending") ? "pending" as const
    : parts.includes("current") && parts.every((part) => part === "current" || part === "none") ? "current" as const : null;
  return {
    version: build?.version || serviceVersion || null,
    state,
    place: appState === "pending" ? UPDATE_PLACE.app : UPDATE_PLACE.thisComputer,
    app: { ...app, state: appState },
    service: { status: updatable, update: serviceUpdate, version: serviceVersion, state: serviceState, shown: service },
  };
}
