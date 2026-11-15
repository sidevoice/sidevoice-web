import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { uiLocale } from "../../i18n/locale";
import { translator, type MessageKey, type Translate } from "../../i18n/translator";
import { useRoomStore } from "../../state/room-store";
import { machineName } from "../room/MachineList";
import { PIECE_KEY } from "./LogFilters";
import { dismissServiceFailure, useServiceFailures, type ServiceFailure } from "./service-failures";
import "../settings/banners.css";
import "./crash-reports.css";

/* A service that failed and restarted, told as the app tells any failure: the room's danger strip under the header, live, its
 * raw facts behind "Details" (the code, the time, the version, how the process ended) and a × to put it away. The sentence
 * names the piece and where it ran: this device, or the machine by the name the person gave it. */

const SENTENCE: Record<ServiceFailure["piece"], { here: MessageKey; machine: MessageKey }> = {
  connector: { here: "serviceFailure.connector.here", machine: "serviceFailure.connector.machine" },
  core: { here: "serviceFailure.core.here", machine: "serviceFailure.core.machine" },
};

const timeOf = (at: number) => new Intl.DateTimeFormat(uiLocale(), { timeStyle: "medium" }).format(at);

/** The failure's facts, a line each: what was raw about it, for whoever has to find out what happened. */
export function failureDetails(failure: ServiceFailure, t: Translate): string {
  return [
    `${t("serviceFailure.detail.code")}: ${failure.code}`,
    `${t("serviceFailure.detail.time")}: ${timeOf(failure.at)}`,
    `${t("serviceFailure.detail.version")}: ${t(PIECE_KEY[failure.piece])} ${failure.version}`,
    ...(failure.exit ? [`${t("serviceFailure.detail.exit")}: ${t("serviceFailure.exitCode", { code: failure.exit.code })}`] : []),
  ].join("\n");
}

export function ServiceFailureNotices() {
  const t = translator();
  const failures = useServiceFailures();
  const machines = useRoomStore((state) => state.machines);
  // A machine forgotten since has nothing left to say it by: its notice goes with it.
  const shown = failures.filter((failure) => failure.machine === null || machines.some((machine) => machine.id === failure.machine));
  if (!shown.length) return null;
  return <div className="room-banner service-failure-notices">
    {shown.map((failure) => {
      const machine = failure.machine === null ? null : machines.find((entry) => entry.id === failure.machine) ?? null;
      const sentence = machine ? t(SENTENCE[failure.piece].machine, { name: machineName(machine, t) }) : t(SENTENCE[failure.piece].here);
      return <Alert key={failure.id} tone="danger" live className="crash-notice" title={sentence} details={failureDetails(failure, t)}
        action={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("crashReports.notice.close")} onClick={() => dismissServiceFailure(failure.id)}><CloseIcon size={16} /></Button>} />;
    })}
  </div>;
}
