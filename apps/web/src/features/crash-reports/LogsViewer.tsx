import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { CheckIcon, CopyIcon, FolderIcon, InfoIcon, OtherMachineIcon, ThisComputerIcon, ToLatestArrowIcon } from "../../components/ui/Icons";
import { Select } from "../../components/ui/Select";
import { COPY_FEEDBACK_MS } from "../../components/ui/Snippet";
import { Tabs } from "../../components/ui/Tabs";
import { uiLocale } from "../../i18n/locale";
import { pluralKey, translator, type Translate } from "../../i18n/translator";
import type { MachineView } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { machineName } from "../room/MachineList";
import { canRunLocalHostAction, runLocalHostAction } from "../settings/local-host-status";
import { machineStatus } from "../settings/machine-status";
import { StateOnIcon } from "../settings/MachineState";
import { LogControls, PIECE_KEY } from "./LogFilters";
import { DEFAULT_LINES, LINE_CHOICES, NO_FILTERS, copyText, filterEvents, tokens, type LogEvent, type LogFilters, type LogPiece } from "./log-model";
import { LogCursorExpired, logSourceFor, logSourcesVersion, onLogSources, placeKey, type LogCursor, type LogPlace, type LogSource } from "./log-sources";

/* The logs, in the settings' own panel under "See logs": one tab per place (this device, then each paired machine), the
 * lines of the place chosen as its file has them — monospace, a backtrace in full, the piece beside the line because the file
 * does not say it — and, under them, how many, how many to ask for, Copy and, on this device where the app can, Open
 * folder. The log follows its end while the reader is there, and keeps its place when the reader has scrolled up, with the
 * chat's way back to the latest.
 *
 * The lines are read from the place, once, when its tab opens (the latest MAX_LINES): the number to show is a cut of those,
 * so changing it asks nothing. Logs live on each machine and are kept nowhere else: a machine that is not connected shows
 * none (the app caches nothing), and a place nothing can read from yet says so (log-sources.ts). */

/** What a place is asked for: the most the viewer can show; "last N" is a cut of it. */
const MAX_LINES = LINE_CHOICES[LINE_CHOICES.length - 1];
/** The most events held while following the end: the oldest go. */
const MAX_KEPT = 2 * MAX_LINES;
/** At the foot: within this of the end (as the chat's list reads it). */
const FOOT_PX = 24;

type Reach = "here" | "connected" | "checking" | "offline";
const reachOf = (machine: MachineView): Reach => machine.state === "connected" ? "connected" : machine.state === "checking" ? "checking" : "offline";

interface Place { key: string; place: LogPlace; name: string; reach: Reach; machine: MachineView | null }

/** The places there are logs for: this device (the app's own, and its machine's when it hosts one), then each paired machine. */
function usePlaces(t: Translate): Place[] {
  const machines = useRoomStore((state) => state.machines);
  const thisDevice = t("settings.section.thisDevice");
  return useMemo(() => [
    { key: "device", place: { kind: "device" } as LogPlace, name: thisDevice, reach: "here" as Reach, machine: machines.find((machine) => machine.local) ?? null },
    ...machines.filter((machine) => !machine.local).map((machine) => ({ key: placeKey({ kind: "machine", id: machine.id }), place: { kind: "machine", id: machine.id } as LogPlace,
      name: machineName(machine, t), reach: reachOf(machine), machine })),
  ], [machines, thisDevice]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function LogsViewer() {
  const t = translator();
  const places = usePlaces(t);
  const localStatus = useRoomStore((state) => state.facts.localHostStatus);
  const [chosen, setChosen] = useState("device");
  // A machine forgotten while its tab shows: back to this device's.
  const current = places.find((place) => place.key === chosen) ?? places[0];
  return (
    <div className="logs-viewer">
      <Tabs className="logs-tabs" idPrefix="logs" label={t("logs.devices")} value={current.key} onChange={setChosen}
        items={places.map((place) => {
          const status = place.key === "device" ? (place.machine ? machineStatus(place.machine, localStatus, true, t) : null) : place.machine ? machineStatus(place.machine, localStatus, false, t) : null;
          return { value: place.key, icon: <StateOnIcon icon={place.key === "device" ? <ThisComputerIcon size={16} /> : <OtherMachineIcon size={16} />} status={status} />,
            label: <>{place.name}{place.reach === "offline" && <span className="sr-only"> ({t("hosts.machineState.unreachable")})</span>}</> };
        })} />
      <div role="tabpanel" id={`logs-panel-${current.key}`} aria-labelledby={`logs-tab-${current.key}`} className="logs-panel">
        <PlaceLogs key={current.key} place={current.place} name={current.name} reach={current.reach} />
      </div>
    </div>
  );
}

/** A place's logs, or why there are none: not connected, still being reached, or not readable from here yet. */
function PlaceLogs({ place, name, reach }: { place: LogPlace; name: string; reach: Reach }) {
  const t = translator();
  const version = useSyncExternalStore(onLogSources, logSourcesVersion);
  const key = placeKey(place);
  const source = useMemo(() => reach === "offline" || reach === "checking" ? null : logSourceFor(place), [key, reach, version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (reach === "offline") return <Note><span><strong>{t("logs.offline.title", { name })}</strong> {t("logs.offline.body")}</span></Note>;
  if (reach === "checking") return <p className="logs-status-box" role="status">{t("logs.loading")}</p>;
  if (!source) return <Note><span>{t("logs.unavailable")}</span></Note>;
  return <LogReader source={source} place={place} name={name} />;
}

/** A line of its own, an icon and a quiet sentence, asking for nothing. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="logs-note logs-offline"><InfoIcon size={16} />{children}</p>;
}

type Read = { status: "loading" | "ready" | "failed"; events: LogEvent[]; arrived: number; stalled: boolean };
const LOADING: Read = { status: "loading", events: [], arrived: 0, stalled: false };
/** How long to wait before following again from the last cursor, after the follow broke: each wait is one more try. */
const RESUME_AFTER_MS = [1000, 3000, 9000];

/** Reads a place's latest lines once, then follows what is written after them (log-sources.ts: the cursor of the read is where
 *  the follow starts, so nothing between the two is lost or told twice): events that come together are drawn together, once a
 *  frame. A follow that breaks is taken up again from its last cursor a few times, then the log is said to have stopped (and
 *  can be read again with `retry`, as can a read that failed). */
function useLogEvents(source: LogSource) {
  const [read, setRead] = useState<Read>(LOADING);
  const [attempt, setAttempt] = useState(0);
  // Cursors the log refused in a row, with no batch between: what holds a restart to the same 1/3/9 s schedule as a broken follow.
  const expiries = useRef({ source, n: 0 });
  useEffect(() => {
    if (expiries.current.source !== source) expiries.current = { source, n: 0 };
    const controller = new AbortController();
    let alive = true;
    let stop: (() => void) | undefined;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    let cursor: LogCursor;
    let resumed = 0;
    let pending: LogEvent[] = [];
    let scheduled = false;
    setRead(LOADING);
    const flush = () => {
      scheduled = false;
      if (!alive || !pending.length) return;
      const more = pending;
      pending = [];
      setRead((before) => {
        const events = [...before.events, ...more];
        return { ...before, status: "ready", events: events.length > MAX_KEPT ? events.slice(-MAX_KEPT) : events, arrived: before.arrived + 1 };
      });
    };
    const follow = () => {
      resumeTimer = undefined;
      stop = source.follow?.({ sinceCursor: cursor }, (batch) => {
        cursor = batch.cursor;
        resumed = 0;
        expiries.current.n = 0;
        for (const line of batch.lines) pending.push(line);
        if (pending.length && !scheduled) { scheduled = true; (globalThis.requestAnimationFrame ?? ((run: () => void) => setTimeout(run, 16)))(flush); }
      }, (error) => {
        stop = undefined;
        if (!alive) return;
        // The cursor is gone from the log: what came after it cannot be told, so read the log again. The first time at once; a log
        // that keeps refusing its cursor is not asked again in a loop, but a little later each time, and at last not at all.
        if (error instanceof LogCursorExpired) {
          const run = expiries.current.n++;
          if (run === 0) setAttempt((n) => n + 1);
          else if (run <= RESUME_AFTER_MS.length) resumeTimer = setTimeout(() => setAttempt((n) => n + 1), RESUME_AFTER_MS[run - 1]);
          else setRead((before) => ({ ...before, stalled: true }));
        } else if (resumed < RESUME_AFTER_MS.length) resumeTimer = setTimeout(follow, RESUME_AFTER_MS[resumed++]);
        else setRead((before) => ({ ...before, stalled: true }));
      }, () => { stop = undefined; });
    };
    source.tail({ limit: MAX_LINES }, controller.signal).then((batch) => {
      if (!alive) return;
      cursor = batch.cursor;
      setRead({ ...LOADING, status: "ready", events: batch.lines });
      follow();
    }, () => { if (alive) setRead({ ...LOADING, status: "failed" }); });
    return () => { alive = false; controller.abort(); stop?.(); clearTimeout(resumeTimer); };
  }, [source, attempt]);
  return { read, retry: () => { expiries.current.n = 0; setAttempt((n) => n + 1); } };
}

function LogReader({ source, place, name }: { source: LogSource; place: LogPlace; name: string }) {
  const t = translator();
  const { read, retry } = useLogEvents(source);
  const [filters, setFilters] = useState<LogFilters>(NO_FILTERS);
  const [lines, setLines] = useState(DEFAULT_LINES);
  const pieceLabel = (piece: LogPiece) => t(PIECE_KEY[piece]);
  // Typing is never held up by filtering the lines: the search is applied a beat behind what is typed.
  const query = useDeferredValue(filters.query);
  const applied = useMemo(() => ({ ...filters, query }), [filters.level, filters.pieces, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const windowed = useMemo(() => read.events.slice(-lines), [read.events, lines]);
  const rows = useMemo(() => filterEvents(windowed, applied, pieceLabel), [windowed, applied]); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState("");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copyLines() {
    if (!rows.length) { setStatus(t("logs.copy.none")); return; }
    let ok = true;
    // Each line led by its piece, as the viewer shows it beside the line: pasted into a chat, a merged log stays attributable.
    try { await navigator.clipboard.writeText(copyText(rows, (piece) => pieceLabel(piece).toLocaleLowerCase(uiLocale()))); } catch { ok = false; }
    setCopy(ok ? "copied" : "failed");
    setStatus(ok ? t(pluralKey("logs.copy.done", rows.length), { n: rows.length }) : t("logs.copy.failedStatus"));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), COPY_FEEDBACK_MS);
  }
  const reveal = place.kind === "device" && canRunLocalHostAction("revealLog");
  async function openFolder() {
    try { await runLocalHostAction("revealLog"); setStatus(""); } catch { setStatus(t("logs.folder.failed")); }
  }

  const count = rows.length === windowed.length
    ? t(pluralKey("logs.count", windowed.length), { n: windowed.length })
    : t(pluralKey("logs.countOf", windowed.length), { shown: rows.length, n: windowed.length });
  const ready = read.status === "ready";
  return (
    <>
      {ready && <LogControls filters={filters} onChange={setFilters} events={windowed} shown={rows.length} />}
      <div className="logs-wrap">
        {read.status === "loading" ? <p className="logs-status-box" role="status">{t("logs.loading")}</p>
          : read.status === "failed" ? <div className="logs-status-box" role="alert"><p>{t("logs.failed")}</p><Button variant="secondary" size="sm" onClick={retry}>{t("hosts.retry")}</Button></div>
          : <LogView rows={rows} query={query} name={name} arrived={read.arrived} none={read.events.length === 0} onClear={() => setFilters(NO_FILTERS)} />}
      </div>
      {ready && <div className="logs-foot">
        <span className="logs-count">{count}</span>
        <span className="logs-actions">
          <span className="logs-select">
            <Select size="sm" value={String(lines)} aria-label={t("logs.howMany")} onValueChange={(value) => setLines(Number(value))}
              options={LINE_CHOICES.map((n) => ({ value: String(n), label: t("logs.last", { n }) }))} />
          </span>
          <Button variant="ghost" tone="neutral" size="sm" onClick={() => void copyLines()}>
            {copy === "copied" ? <><CheckIcon size={16} />{t("ui.copied")}</> : copy === "failed" ? t("logs.copy.failed") : <><CopyIcon size={16} />{t("ui.copy")}</>}
          </Button>
          {reveal && <Button variant="ghost" tone="neutral" size="sm" onClick={() => void openFolder()}><FolderIcon size={16} />{t("logs.folder")}</Button>}
        </span>
      </div>}
      <span className="logs-status" role="status" aria-live="polite">{status}</span>
      {ready && read.stalled && <p className="logs-note logs-stalled" role="status"><InfoIcon size={16} /><span>{t("logs.failed")}</span>
        <Button variant="secondary" size="sm" onClick={retry}>{t("hosts.retry")}</Button></p>}
      {ready && <p className="logs-note"><InfoIcon size={16} /><span>{t("logs.redacted")}</span></p>}
    </>
  );
}

/** One event as the file has it, in monospace: its first line and, under it, the lines of its backtrace. Only the piece sits
 *  outside the text. Drawn again only when what it shows changes. */
const LogRow = memo(function LogRow({ event, query, label }: { event: LogEvent; query: string; label: string }) {
  const level = /^\s*\S+\s+(WARN|ERROR)\s/.exec(event.text)?.[1];
  return (
    <div className="logs-line" data-level={level}>
      <span className="logs-piece">{label}</span>
      <div className="logs-line-text">{tokens(event.text, query).map((token, index) => {
        const tone = token.tone ? `logs-tone-${token.tone}` : undefined;
        return token.kind === "hit" ? <mark key={index} className={tone}>{token.text}</mark>
          : token.kind === "redacted" ? <span key={index} className="logs-redacted">{token.text}</span>
            : tone ? <span key={index} className={tone}>{token.text}</span> : token.text;
      })}</div>
    </div>
  );
});

/** The lines, in a box that follows the end while the reader is at it; scrolled up, it keeps its place and the way back to the
 *  end shows, with a dot once something new has come. */
function LogView({ rows, query, name, arrived, none, onClear }: { rows: LogEvent[]; query: string; name: string; arrived: number; none: boolean; onClear: () => void }) {
  const t = translator();
  const view = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = useRef<{ id: string | null; arrived: number }>({ id: null, arrived: 0 });
  const [away, setAway] = useState(false);
  const [fresh, setFresh] = useState(false);
  const toFoot = () => { const node = view.current; if (node) node.scrollTop = node.scrollHeight; };
  // Lines off screen are not laid out (`content-visibility: auto`, .logs-line): a line's height is an estimate until it comes into
  // view, so the foot moves as the last ones are drawn. While the reader is at the end the foot is held as the lines' size changes
  // (it runs after layout and before paint: nothing is seen to slip).
  const lines = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = lines.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => { if (following.current) toFoot(); });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  // Something new: at the foot it is followed before it is painted; above it, the place is kept and the way back gets its dot.
  useLayoutEffect(() => {
    const id = rows[rows.length - 1]?.id ?? null;
    const grew = arrived !== last.current.arrived && id !== last.current.id;
    last.current = { id, arrived };
    if (following.current) toFoot();
    else if (grew) setFresh(true);
  }, [rows, arrived]);

  const readScroll = () => {
    const node = view.current;
    if (!node) return;
    const foot = node.scrollHeight - node.scrollTop - node.clientHeight < FOOT_PX;
    following.current = foot;
    setAway(!foot);
    if (foot) setFresh(false);
  };
  const jump = () => { following.current = true; setAway(false); setFresh(false); toFoot(); };

  const label = (piece: LogPiece) => t(PIECE_KEY[piece]);
  return <>
    <div className="logview" ref={view} tabIndex={0} role="region" aria-label={t("logs.region", { name })} onScroll={readScroll}>
      <div ref={lines}>
        {none ? <p className="logs-empty">{t("logs.noLines")}</p>
          : rows.length === 0 ? <div className="logs-empty"><p>{t("logs.empty")}</p><Button variant="secondary" size="sm" onClick={onClear}>{t("logs.filters.clear")}</Button></div>
            : rows.map((row) => <LogRow key={row.id} event={row} query={query} label={label(row.piece)} />)}
      </div>
    </div>
    <button type="button" className="latest-jump" data-show={away || undefined} data-new={away && fresh || undefined} aria-hidden={!away || undefined}
      tabIndex={away ? undefined : -1} aria-label={t("logs.toEnd")} title={t("logs.toEnd")} onClick={jump}><ToLatestArrowIcon /></button>
  </>;
}
