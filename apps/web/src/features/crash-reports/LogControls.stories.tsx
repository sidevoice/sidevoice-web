import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FiltersPanel, LogControls, PIECE_KEY, piecesOf } from "./LogFilters";
import { NO_FILTERS, filterEvents, type LogFilters } from "./log-model";
import { drawn } from "../../journeys/catalogue-kit";
import { fixtureEvents } from "../../journeys/log-fixtures";
import { translator } from "../../i18n/translator";
import "./crash-reports.css";

/* The viewer's controls: a search field (magnifier, clear ×), Filters opening a popover, and under them what is on, as chips
 * that come off. The popover has a head with Reset, the level as cards with counts (All, Warnings and errors, Errors only: one
 * radio group, the arrows move the choice), the pieces as toggle chips with counts (only those the place has lines of), and the
 * foot says how many lines are left in sight; every change applies at once. The counts are of what each choice would leave under
 * the others. Specimens are the real LogControls and FiltersPanel over the sample lines (200 of this device's), the filters kept
 * as the viewer keeps them. */

const EVENTS = fixtureEvents({ kind: "device" }, 200);
const label = (piece: keyof typeof PIECE_KEY) => translator()(PIECE_KEY[piece]);

/** The controls with their state, as the viewer holds it. */
function Controls({ initial }: { initial: LogFilters }) {
  const [filters, setFilters] = useState(initial);
  const shown = filterEvents(EVENTS, filters, label).length;
  return <LogControls filters={filters} onChange={setFilters} events={EVENTS} shown={shown} />;
}

/** The popover's content on its own, drawn in the popover's frame where it stands, so it can be read in either theme without
 *  the popover's portal (which draws in the page's theme). */
function Panel({ initial }: { initial: LogFilters }) {
  const [filters, setFilters] = useState(initial);
  const shown = filterEvents(EVENTS, filters, label).length;
  return <div className="ui-popover logs-pop" style={{ position: "static" }}>
    <FiltersPanel filters={filters} onChange={setFilters} events={EVENTS} shown={shown} pieces={piecesOf(EVENTS, filters.pieces)} />
  </div>;
}

const meta = {
  title: "Product/Crash reports/LogControls",
  tags: ["!autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing on: the search and Filters. */
export const Default: Story = { render: () => <Controls initial={NO_FILTERS} /> };

/** A search, the level and a piece on: the search with its clear ×, Filters with how many are on, and the chips that come off. */
export const WithFiltersOn: Story = { render: () => <Controls initial={{ query: "room", level: "warn", pieces: ["connector", "core"] }} /> };

/** Filters pressed: the popover as it opens over the page (in the page's theme: pick Light or Dark in the toolbar). */
export const PopoverOpen: Story = {
  render: () => <Controls initial={NO_FILTERS} />,
  decorators: [(Story) => <div style={{ minHeight: 360 }}><Story /></div>],
  play: async () => {
    await drawn();
    document.querySelectorAll<HTMLElement>(".logs-row > button").forEach((button) => button.click());
  },
};

/** The popover's content, nothing chosen: every level with its count, every piece with its count, and how many lines are in sight. */
export const FiltersPanelAtRest: Story = { name: "Filters panel", render: () => <Panel initial={NO_FILTERS} /> };

/** Warnings and errors with the Connector chosen: the card with a check and its count in the accent, the chip pressed with a check, the
 *  other counts re-made under the choice, Reset enabled. */
export const FiltersPanelChosen: Story = { name: "Filters panel, chosen", render: () => <Panel initial={{ query: "", level: "warn", pieces: ["connector"] }} /> };
