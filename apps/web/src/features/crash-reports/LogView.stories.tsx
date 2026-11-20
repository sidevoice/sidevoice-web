import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogView } from "./LogsViewer";
import type { LogEvent } from "./log-model";
import { drawn } from "../../journeys/catalogue-kit";
import { fixtureEvents } from "../../journeys/log-fixtures";
import "../conversation/transcript.css";
import "./crash-reports.css";

/* The lines of a log, in a box that follows the end while the reader is at it (LogView, drawing one LogRow per event). A line is
 * the event as the file has it, in monospace: its first line (time, level, target, a sentence, fields) and under it the lines of
 * its backtrace; only the piece that wrote it sits outside the text, as a small pill (App, Connector, Core: the file does not say
 * it). WARN and ERROR lines are tinted, a search's hits are marked, and what the log's redaction left in place of a value shows
 * as a chip. Scrolled up, the box keeps its place and the way back to the latest floats over it (`.latest-jump`, the chat's own
 * button). Each state is the real LogView on the lines it is given; the box is shortened here so a page shows several. */

const line = (time: string, level: string, target: string, message: string, fields = "") => `${time} ${level.padStart(5)} ${target}: ${message}${fields ? "  " + fields : ""}`;
const event = (id: string, piece: LogEvent["piece"], text: string): LogEvent => ({ id, piece, text });

const BACKTRACE = [
  "   0: sidevoice_core::audio::input::Capture::open", "             at ./shared/core/src/audio/input.rs:212:14",
  "   1: sidevoice_core::voice::host::start", "             at ./shared/core/src/voice/host.rs:345:22",
  "   2: tokio::runtime::task::core::Core<T,S>::poll", "             at ~/.cargo/registry/src/index.crates.io/tokio-1.41.1/src/runtime/task/core.rs:331:17",
].join("\n");

const LINES: LogEvent[] = [
  event("1", "app", line("14:41:09.240", "INFO", "audio", "Microphone opened and listening", "stream=microphone sample_rate=48000")),
  event("2", "connector", line("14:41:10.012", "INFO", "delivery{conversation=h:64b0598f2d9d harness=claude}", "Received a message from you; its text is not logged", "text=<redacted> chars=84")),
  event("3", "core", line("14:41:11.377", "WARN", "room", "The network delay is high; voice may stutter", "ms=180")),
  event("4", "app", line("14:41:12.950", "ERROR", "room", "Could not join the room after 3 attempts; the call did not start", "error.type=desktop.room-unreachable attempt=3 duration_ms=7234 url=wss://room.sidevoice.example/ws close_code=1006 resolver=system network=wifi last_status=timeout")),
  event("5", "app", line("14:41:13.404", "ERROR", "panic{thread=tokio-runtime-worker}", "Sidevoice crashed while opening the microphone; it restarted", "event=crash_backtrace code.filepath=shared/core/src/audio/input.rs code.lineno=212") + "\n" + BACKTRACE),
  event("6", "connector", line("14:41:14.100", "INFO", "pairing", "The app connected", "device=d-3a91")),
  event("7", "core", line("14:41:15.280", "INFO", "call{call=c-91b2}", "The app joined the call", "kind=app")),
];

/** A shorter box than the app's 540 px, so several states fit a page. */
function Short({ children }: { children: React.ReactNode }) {
  return <div className="logs-viewer catalogue-log-short" style={{ maxWidth: 760 }}><div className="logs-wrap">{children}</div></div>;
}

const meta = {
  title: "Product/Crash reports/LogView",
  component: LogView,
  tags: ["!autodocs"],
  args: { rows: LINES, query: "", name: "This device", arrived: 0, none: false, onClear: () => undefined },
  argTypes: { query: { control: "text" }, none: { control: "boolean" }, rows: { control: false }, onClear: { control: false } },
  decorators: [(Story) => <Short><Story /></Short>],
} satisfies Meta<typeof LogView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Lines of the three pieces: an INFO with a redacted value, a WARN, an ERROR with many fields, and a panic with its backtrace in full. */
export const Default: Story = {};

/** A search's hits marked in the lines (and in the piece's name: searching "core" finds the Core's lines too). */
export const SearchHits: Story = { args: { query: "room" } };

/** A search or a filter that leaves nothing: the box says so and offers Clear filters. */
export const NothingMatches: Story = { args: { rows: [] } };

/** A place whose log has no line yet. */
export const EmptyLog: Story = { args: { rows: [], none: true } };

/** Two hundred lines, scrolled up from the end: the box keeps its place and the way back to the latest floats over it. */
export const ScrolledUp: Story = {
  args: { rows: fixtureEvents({ kind: "device" }, 200) },
  play: async () => {
    await drawn(300);
    document.querySelectorAll<HTMLElement>(".logview").forEach((log) => { log.scrollTop = log.scrollHeight / 2; log.dispatchEvent(new Event("scroll")); });
    await drawn();
  },
};
