import { translator } from "../../i18n/translator";

/** The one spoken announcement of the person's open turn: visually hidden text in a live region that is there from the moment
 *  the turn opens, empty while they speak and saying "Transcribing" once, when that starts (a live region announces text that
 *  changes, not an attribute: an `aria-label` that changes on a region already there is not reliably spoken). The bars drawn
 *  for the same turn, wherever they show (the stage, the transcript), are labelled but are not live regions, so one turn is
 *  heard once however many places show it. */
export function TurnAnnouncer({ phase }: { phase: "" | "listening" | "transcribing" | undefined }) {
  const t = translator();
  return <span className="sr-only" role="status" data-turn-announcer="">{phase === "transcribing" ? t("wave.transcribing") : ""}</span>;
}
