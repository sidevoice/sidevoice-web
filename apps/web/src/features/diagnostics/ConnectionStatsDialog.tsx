import { useRef } from "react";
import { Button } from "../../components/ui/Button";
import { DialogSurface } from "../../components/ui/Dialog";
import { CopyIcon, RefreshIcon } from "../../components/ui/Icons";
import { useDialogFocusReturn } from "../../lib/focus-return";
import { translator } from "../../i18n/translator";
import "./diagnostics.css";

/* The call's diagnostics. The runtime (room-session-controller.js) opens it with showModal on #connection-stats, owns
 * the clicks of its close, refresh and copy buttons, and writes every figure, fact, stage, row and status line into the
 * elements below by id; this draws the frame and names each part. So none of those buttons takes a React click. */
export function ConnectionStatsDialog() {
  const t = translator();
  // Opened from ⋮'s menu, which shuts as it opens: closed, focus goes back to ⋮ (focus-return.ts).
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogFocusReturn(dialog);
  return (
    <dialog ref={dialog} id="connection-stats" className="ui-dialog stats-dialog" data-layout="dialog" aria-labelledby="stats-title">
      <DialogSurface titleId="stats-title" eyebrow={t("stats.eyebrow")} title={t("stats.title")} closeId="stats-close" closeable closeLabel={t("stats.close")}
        footer={<>
          <p className="ui-dialog-reason stats-updated"><span>{t("stats.updated")}</span> <span id="stats-updated" /></p>
          <Button id="stats-refresh"><RefreshIcon />{t("stats.refresh")}</Button>
        </>}>
        <p id="stats-status" className="stats-status" role="status">{t("stats.collecting")}</p>
        <div className="stats-metrics">
          <div className="stats-metric"><span>{t("stats.recognition")}</span><strong id="stats-recognition">—</strong><small>{t("stats.recognitionNote")}</small></div>
          <div className="stats-metric"><span>{t("stats.response")}</span><strong id="stats-response">—</strong><small>{t("stats.responseNote")}</small></div>
        </div>
        <section className="stats-section" aria-labelledby="stats-connection-title">
          <h3 id="stats-connection-title">{t("stats.connection")}</h3>
          <dl className="stats-facts" id="stats-connection" />
        </section>
        <section className="stats-section" aria-labelledby="stats-stages-title">
          <h3 id="stats-stages-title">{t("stats.stages")}</h3>
          <p className="stats-note" id="stats-stages-note">{t("stats.stagesNote")}</p>
          <ol id="stats-stages" className="stats-stages" aria-label={t("stats.stages")} />
        </section>
        <section className="stats-section" aria-labelledby="stats-aggregates-title">
          <h3 id="stats-aggregates-title">{t("stats.aggregates")}</h3>
          <p className="stats-note" id="stats-aggregates-note">{t("stats.aggregatesNote")}</p>
          <div id="stats-aggregates" className="stats-aggregates" />
          <div className="stats-aggregates-actions">
            <Button id="stats-aggregates-copy" size="sm"><CopyIcon />{t("stats.copyAggregates")}</Button>
            <span id="stats-aggregates-copied" className="stats-note" role="status" />
          </div>
        </section>
        <section className="stats-section" aria-labelledby="stats-turns-title">
          <h3 id="stats-turns-title">{t("stats.turns")}</h3>
          <p className="stats-note">{t("stats.turnsNote")}</p>
          <div className="stats-table-wrap" role="region" tabIndex={0} aria-label={t("stats.turnsTable")}>
            <table className="stats-table">
              <thead><tr>
                <th scope="col">{t("stats.column.turn")}</th><th scope="col">{t("stats.column.silence")}</th><th scope="col">{t("stats.column.recognition")}</th>
                <th scope="col">{t("stats.column.agent")}</th><th scope="col">{t("stats.column.dispatch")}</th><th scope="col">{t("stats.column.state")}</th>
              </tr></thead>
              <tbody id="stats-rows" />
            </table>
          </div>
          <p id="stats-empty" className="stats-note" />
        </section>
        <p className="stats-limitations">{t("stats.limitations")}</p>
      </DialogSurface>
    </dialog>
  );
}
