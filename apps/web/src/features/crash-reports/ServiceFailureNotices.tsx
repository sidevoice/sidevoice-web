import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { uiLocale } from "../../i18n/locale";
import { translator, type MessageKey, type Translate } from "../../i18n/translator";
import { useRoomStore } from "../../state/room-store";
import { machineName } from "../room/MachineList";
import { PIECE_KEY } from "./LogFilters";
import { MAX_FAILURE_STRIPS, dismissServiceFailure, groupFailures, useServiceFailures, type ServiceFailure } from "./service-failures";
import "../settings/banners.css";
import "./crash-reports.css";

/* A service that failed and restarted, told as the app tells any failure: the room's danger strip under the header, live, its
 * raw facts behind "Details" (the code, the time, the version, how the process ended) and a × to put it away. The sentence
 * names the piece and where it ran: this device, or the machine by the name the person gave it. A service that keeps failing is
 * one strip with its count, and no more than MAX_FAILURE_STRIPS strips show at once: the room under them keeps its room. */

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
  const shown = groupFailures(failures.filter((failure) => failure.machine === null || machines.some((machine) => machine.id === failure.machine))).slice(0, MAX_FAILURE_STRIPS);
  if (!shown.length) return null;
  return <div className="room-banner service-failure-notices">
    {shown.map(({ latest: failure, count, ids }) => {
      const machine = failure.machine === null ? null : machines.find((entry) => entry.id === failure.machine) ?? null;
      const sentence = machine ? t(SENTENCE[failure.piece].machine, { name: machineName(machine, t) }) : t(SENTENCE[failure.piece].here);
      return <Alert key={ids[ids.length - 1]} tone="danger" live className="crash-notice" details={failureDetails(failure, t)}
        title={count > 1 ? <>{sentence} <span className="crash-count">{t("serviceFailure.repeat", { n: count })}</span></> : sentence}
        action={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("crashReports.notice.close")} onClick={() => ids.forEach(dismissServiceFailure)}><CloseIcon size={16} /></Button>} />;
    })}
  </div>;
}
