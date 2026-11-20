import { useId, useMemo, type KeyboardEvent } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CheckIcon, CloseIcon, FiltersIcon, SearchIcon } from "../../components/ui/Icons";
import { Input } from "../../components/ui/Input";
import { Popover } from "../../components/ui/Popover";
import { pluralKey, translator, type MessageKey } from "../../i18n/translator";
import { LEVEL_FILTERS, LOG_PIECES, activeFilterCount, facets, type LevelFilter, type LogEvent, type LogFilters, type LogPiece, NO_FILTERS } from "./log-model";

/* The viewer's controls: the search, "Filters" opening a popover (the level as cards with counts, the pieces as chips with
 * counts, what is left in sight; each change applies at once), and what is on, shown under them as chips that come off. Pieces
 * the device has no lines of are not offered. */

export const LEVEL_KEY: Record<LevelFilter, MessageKey> = { all: "logs.level.all", warn: "logs.level.warn", error: "logs.level.error" };
export const PIECE_KEY: Record<LogPiece, MessageKey> = { app: "logs.piece.app", connector: "logs.piece.connector", core: "logs.piece.core" };

/** The pieces of a place's lines, in their order: those that wrote one of them, and any already chosen. */
export function piecesOf(events: readonly LogEvent[], chosen: readonly LogPiece[]) {
  return LOG_PIECES.filter((piece) => chosen.includes(piece) || events.some((event) => event.piece === piece));
}

interface Props {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
  /** The lines asked for (what the counts are of). */
  events: readonly LogEvent[];
  /** How many of them the filters leave. */
  shown: number;
}

export function LogControls({ filters, onChange, events, shown }: Props) {
  const t = translator();
  const count = activeFilterCount(filters);
  const pieces = piecesOf(events, filters.pieces);
  const chips = [
    ...(filters.level !== "all" ? [{ key: "level", name: t(LEVEL_KEY[filters.level]), remove: () => onChange({ ...filters, level: "all" }) }] : []),
    ...filters.pieces.map((piece) => ({ key: piece, name: t(PIECE_KEY[piece]), remove: () => onChange({ ...filters, pieces: filters.pieces.filter((other) => other !== piece) }) })),
  ];
  return (
    <div className="logs-bar">
      <div className="logs-row">
        <div className="logs-search">
          <SearchIcon size={16} />
          <Input size="sm" type="text" role="searchbox" value={filters.query} placeholder={t("logs.search")} aria-label={t("logs.search")} autoComplete="off" spellCheck={false}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Escape" && filters.query) { event.preventDefault(); event.stopPropagation(); onChange({ ...filters, query: "" }); } }} />
          {filters.query && <Button variant="ghost" tone="neutral" size="icon-sm" className="logs-clear" aria-label={t("logs.search.clear")} onClick={() => onChange({ ...filters, query: "" })}><CloseIcon size={16} /></Button>}
        </div>
        <Popover side="bottom" align="end" label={t("logs.filters.label")} className="logs-pop"
          trigger={<Button variant="secondary" size="sm"><FiltersIcon size={16} />{t("logs.filters")}{count > 0 && <Badge tone="accent">{count}</Badge>}</Button>}>
          <FiltersPanel filters={filters} onChange={onChange} events={events} shown={shown} pieces={pieces} />
        </Popover>
      </div>
      {chips.length > 0 && <div className="logs-row logs-chips" role="group" aria-label={t("logs.filters.active")}>
        {chips.map((chip) => <span key={chip.key} className="logs-chip logs-chip--on"><span>{chip.name}</span>
          <Button variant="ghost" tone="neutral" size="icon-sm" className="logs-chip-x" aria-label={t("logs.filters.remove", { name: chip.name })} onClick={chip.remove}><CloseIcon size={12} /></Button></span>)}
        <Button variant="ghost" tone="neutral" size="sm" onClick={() => onChange(NO_FILTERS)}>{t("logs.filters.clear")}</Button>
      </div>}
    </div>
  );
}

/** The popover's content: drawn only while it is open, so the counts are made only then. */
export function FiltersPanel({ filters, onChange, events, shown, pieces }: Props & { pieces: LogPiece[] }) {
  const t = translator();
  const levelLabel = useId();
  const piecesLabel = useId();
  const pieceName = (piece: LogPiece) => t(PIECE_KEY[piece]);
  const counts = useMemo(() => facets(events, filters, pieceName), [events, filters.query, filters.level, filters.pieces]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = activeFilterCount(filters);
  const total = events.length;
  // Arrows move the choice among the cards and take it as they go, as a radio group does.
  const arrows = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const group = event.currentTarget;
    const next = LEVEL_FILTERS[(LEVEL_FILTERS.indexOf(filters.level) + step + LEVEL_FILTERS.length) % LEVEL_FILTERS.length];
    onChange({ ...filters, level: next });
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-level="${next}"]`)?.focus());
  };
  const toggle = (piece: LogPiece) => onChange({ ...filters, pieces: filters.pieces.includes(piece) ? filters.pieces.filter((other) => other !== piece) : [...filters.pieces, piece] });
  return <>
    <div className="logs-pop-head">
      <span className="logs-pop-title">{t("logs.filters")}</span>
      <Button variant="ghost" size="sm" disabled={!count} onClick={() => onChange({ ...filters, level: "all", pieces: [] })}>{t("logs.filters.reset")}</Button>
    </div>
    <div className="logs-pop-group" role="radiogroup" aria-labelledby={levelLabel} onKeyDown={arrows}>
      <span className="logs-pop-label" id={levelLabel}>{t("logs.level")}</span>
      {LEVEL_FILTERS.map((value) => <button key={value} type="button" role="radio" className="ui-card ui-card--interactive logs-level-card" aria-checked={filters.level === value}
        tabIndex={filters.level === value ? 0 : -1} data-selected={filters.level === value || undefined} data-level={value} onClick={() => onChange({ ...filters, level: value })}>
        <span className="logs-level-check" aria-hidden="true">{filters.level === value && <CheckIcon size={14} />}</span>
        <span className="logs-level-name">{t(LEVEL_KEY[value])}</span>
        <span className="logs-level-count">{counts.level[value]}</span>
      </button>)}
    </div>
    {pieces.length > 1 && <div className="logs-pop-group" role="group" aria-labelledby={piecesLabel}>
      <span className="logs-pop-label" id={piecesLabel}>{t("logs.pieces")}</span>
      <div className="logs-pop-chips">
        {pieces.map((piece) => <button key={piece} type="button" className="logs-chip" aria-pressed={filters.pieces.includes(piece)} onClick={() => toggle(piece)}>
          {filters.pieces.includes(piece) && <CheckIcon size={12} />}{pieceName(piece)}<span className="logs-chip-n">{counts.piece[piece]}</span>
        </button>)}
      </div>
      <p className="logs-pop-hint">{t("logs.pieces.hint")}</p>
    </div>}
    <p className="logs-pop-foot" aria-live="polite">{t(pluralKey("logs.showing", total), { shown, n: total })}</p>
  </>;
}
