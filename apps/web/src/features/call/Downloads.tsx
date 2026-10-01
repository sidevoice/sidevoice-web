import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { DownloadsIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";

/* The models and engines this device is downloading, in the room and not only in Configuración (#124 §6): a small
 * indicator beside the model indicators while any download runs — or just ended — that opens a panel with a row
 * per download: its bar, bytes, speed, time left and Cancelar; an ended one says how it ended for a few seconds.
 * The same for this page's downloads and the desktop app's. */
export function Downloads() {
  const view = useRoomStore((state) => state.downloads);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  if (!view.rows.length) return null;
  const percent = view.fraction == null ? "" : Math.floor(view.fraction * 100) + " %";
  return (
    <div className="downloads" ref={box} data-open={open || undefined} data-state={view.running ? "running" : view.failed ? "failed" : "ended"}>
      <Button id="downloads-open" variant="ghost" size="compact" className="downloads-toggle" aria-expanded={open} aria-controls="downloads-panel"
        aria-label="Descargas" title="Descargas" onClick={() => setOpen(!open)}>
        <DownloadsIcon />{view.running ? <span className="downloads-count">{view.running}</span> : null}{percent && <span>{percent}</span>}
      </Button>
      {open && (
        <section id="downloads-panel" className="downloads-panel" aria-label="Descargas">
          <h3>Descargas</h3>
          <ul>
            {view.rows.map((row) => (
              <li key={row.id} data-state={row.state}>
                <div className="downloads-row-head">
                  <strong>{row.label}</strong>{row.task && <span className="muted">{row.task}</span>}
                  <span className="downloads-status">{row.status}</span>
                </div>
                <progress max={1} value={row.fraction ?? undefined} aria-label={row.label} />
                <div className="downloads-row-facts muted">
                  {row.amount && <span>{row.amount}</span>}
                  {row.speed && <span>{row.speed}</span>}
                  {row.left && <span><span>Quedan</span> <span>{row.left}</span></span>}
                  {row.error && <span>{row.error}</span>}
                </div>
                {row.cancellable && (
                  <Button variant="ghost" size="compact" onClick={() => window.sidevoiceActions?.cancelDownload(row.id)}>Cancelar</Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
