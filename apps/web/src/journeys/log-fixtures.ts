import type { LogEvent, LogPiece } from "../features/crash-reports/log-model";
import type { LogPlace, LogSource, LogSources } from "../features/crash-reports/log-sources";

/* Sample logs for the storyboard and the tests of the logs' viewer: events as a log file has them (time, level, target, a
 * sentence for a person, fields), a panic with its backtrace in full, and an error with many fields. Seeded, so a place reads
 * the same on every visit. Nothing here is real; no machine serves its log lines yet (features/crash-reports/log-sources.ts). */

type Template = [level: "INFO" | "WARN" | "ERROR", target: string, message: string, fields: string];
const DELIVERY = "delivery{conversation=h:64b0598f2d9d harness=claude}";

const TEMPLATES: Record<LogPiece, Template[]> = {
  app: [
    ["INFO", "audio", "Microphone opened and listening", "stream=microphone sample_rate=48000"], ["INFO", "call{call=c-7f3a}", "Connected to the core again after a short drop", "duration_ms=507"],
    ["INFO", "call{call=c-7f3a}", "The agent's reply is ready to play", "turn=t-12 duration_ms=4200"], ["INFO", "call{call=c-7f3a}", "The agent started speaking", "turn=t-31"], ["INFO", "room", "Joining the room", ""],
    ["INFO", "updates", "Checked for updates: this is the latest version", "version=0.21.0 latest=0.21.0"], ["INFO", "audio", "Audio input switched to the new device", "kind=input id=d-04"],
    ["WARN", "call{call=c-7f3a}", "Lost the connection to the core; trying again", "attempt=2"], ["WARN", "room", "The room closed the connection; reconnecting", "close_code=1006 attempt=1"],
    ["WARN", "audio", "The microphone level is very low; the agent may not hear you", "rms_db=-61"], ["WARN", "updates", "Could not check for updates; will try again in 5 minutes", "after_s=300"],
    ["ERROR", "room", "Could not join the room after 3 attempts; the call did not start", "error.type=desktop.room-unreachable attempt=3 duration_ms=7234"],
    ["ERROR", "call{call=c-7f3a}", "The reply could not be played because the speaker stopped answering", "error.type=voice.output-stalled"],
  ],
  connector: [
    ["INFO", DELIVERY, "Connected to Claude Code; ready to relay messages", "harness=claude"], ["INFO", DELIVERY, "Received a message from you; its text is not logged", "text=<redacted> chars=84"],
    ["INFO", DELIVERY, "Delivered the agent's reply to the app", "turn=t-12 duration_ms=212"], ["INFO", "pairing", "The app connected", "device=d-3a91"],
    ["WARN", DELIVERY, "Claude took more than 5 seconds to answer a tool call; still waiting", "duration_ms=5000"], ["WARN", "pairing", "The app disconnected after going silent", "device=d-3a91 reason=timeout"],
    ["ERROR", DELIVERY, "Claude returned a reply the connector couldn't parse; the message was not delivered", "harness=claude error.type=connector.reply-shape"],
  ],
  core: [
    ["INFO", "call{call=c-91b2}", "The app joined the call", "kind=app"], ["INFO", "room", "Started publishing audio", "kind=audio codec=opus"], ["INFO", "call{call=c-91b2}", "The app left the call (it hung up)", "kind=app reason=hangup"],
    ["WARN", "call{call=c-91b2}", "The audio mixer ran out of data; a short gap may be heard", "frames=480"], ["WARN", "room", "The network delay is high; voice may stutter", "ms=180"],
    ["WARN", "room", "Some audio packets were lost; voice may cut out", "percent=4"],
    ["ERROR", "room", "The audio track closed unexpectedly; the app lost the voice", "error.type=core.track-closed"],
  ],
};

const PANIC: Record<LogPiece, { message: string; at: string; first: [string, string][] }> = {
  app: { message: "Sidevoice crashed while opening the microphone; it restarted", at: "code.filepath=shared/core/src/audio/input.rs code.lineno=212",
    first: [["sidevoice_core::audio::input::Capture::open", "./shared/core/src/audio/input.rs:212:14"], ["sidevoice_core::voice::host::start", "./shared/core/src/voice/host.rs:345:22"]] },
  connector: { message: "The connector crashed while forwarding a reply; it restarted", at: "code.filepath=connector/src/adapters/claude.rs code.lineno=418",
    first: [["sidevoice_connector::adapters::claude::forward", "./connector/src/adapters/claude.rs:418:30"], ["sidevoice_connector::delivery::run", "./connector/src/delivery.rs:133:18"]] },
  core: { message: "The core crashed while mixing audio; it restarted", at: "code.filepath=rust/room/mixer.rs code.lineno=97",
    first: [["sidevoice_core::room::mixer::Mixer::push", "./rust/room/mixer.rs:97:13"], ["sidevoice_core::room::call::Call::run::{{closure}}", "./rust/room/call.rs:204:21"]] },
};
const TAIL: [string, string][] = [
  ["<core::future::poll_fn::PollFn<F> as core::future::future::Future>::poll", "/rustc/90b35a6239c3/library/core/src/future/poll_fn.rs:151:9"],
  ["tokio::runtime::task::core::Core<T,S>::poll", "~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tokio-1.41.1/src/runtime/task/core.rs:331:17"],
  ["tokio::runtime::task::harness::Harness<T,S>::poll", "~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tokio-1.41.1/src/runtime/task/harness.rs:155:13"],
  ["tokio::runtime::scheduler::multi_thread::worker::run", "~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tokio-1.41.1/src/runtime/scheduler/multi_thread/worker.rs:432:17"],
  ["std::sys::backtrace::__rust_begin_short_backtrace", "/rustc/90b35a6239c3/library/std/src/sys/backtrace.rs:152:18"],
];

const prng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clock = (ms: number) => {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000) % 24)}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
};
const written = (at: number, level: string, target: string, message: string, fields: string) => `${clock(at)} ${level.padStart(5)} ${target}: ${message}${fields ? "  " + fields : ""}`;
const backtrace = (piece: LogPiece) => [...PANIC[piece].first, ...TAIL].flatMap(([fn, at], i) => [`${String(i).padStart(4)}: ${fn}`, `             at ${at}`]).join("\n");

/** The events of one piece, oldest first: mostly INFO, some WARN, few ERROR, one many-fielded error and one panic near the end. */
function pieceEvents(piece: LogPiece, seed: string, count: number, end: number): LogEvent[] {
  const random = prng([...(seed + piece)].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7));
  const events: { at: number; text: string }[] = [];
  let at = end;
  for (let i = 0; i < count; i++) {
    const roll = random();
    const level = roll < 0.9 ? "INFO" : roll < 0.97 ? "WARN" : "ERROR";
    const options = TEMPLATES[piece].filter((entry) => entry[0] === level);
    const [lvl, target, message, fields] = options[Math.floor(random() * options.length)];
    events.unshift({ at, text: written(at, lvl, target, message, fields) });
    at -= 600 + Math.floor(random() * 9000);
  }
  const panic = events.length - 14;
  events[panic] = { at: events[panic].at, text: written(events[panic].at, "ERROR", "panic{thread=tokio-runtime-worker}", PANIC[piece].message, `event=crash_backtrace ${PANIC[piece].at}`) + "\n" + backtrace(piece) };
  const many = events.length - 40;
  events[many] = { at: events[many].at, text: written(events[many].at, "ERROR", "room", "Could not join the room after 3 attempts; the call did not start",
    "error.type=desktop.room-unreachable attempt=3 duration_ms=7234 url=wss://room.sidevoice.example/ws close_code=1006 resolver=system network=wifi last_status=timeout") };
  return events.map((event, index) => ({ id: `${piece}:${seed}:${index}`, piece, text: event.text }));
}

const AT = 14 * 3600000 + 41 * 60000 + 9240;
const piecesOf = (place: LogPlace): LogPiece[] => place.kind === "device" ? ["app", "connector", "core"] : ["connector", "core"];

/** The latest `lines` events of a place, its pieces' lines merged by time. */
export function fixtureEvents(place: LogPlace, lines: number): LogEvent[] {
  const seed = place.kind === "device" ? "device" : place.id;
  const all = piecesOf(place).flatMap((piece) => pieceEvents(piece, seed, 500, AT));
  all.sort((a, b) => a.text.localeCompare(b.text));
  return all.slice(-lines);
}

export interface FixtureOptions {
  /** A new line every this many ms, in whatever place is shown (the log follows it): none by default. */
  liveEveryMs?: number;
  /** How long a read takes. */
  delayMs?: number;
}

/** Sources for every place, as `installLogSources` takes them. `push` adds a line to the places being followed, as a test or a shot does. */
export function fixtureLogSources(options: FixtureOptions = {}): LogSources & { push(text: string, piece?: LogPiece): void } {
  const followers = new Set<(events: LogEvent[]) => void>();
  let serial = 0;
  const push = (text: string, piece: LogPiece = "connector") => { const event = { id: `live:${++serial}`, piece, text }; for (const follower of followers) follower([event]); };
  return {
    push,
    open(place: LogPlace): LogSource {
      return {
        tail: (lines) => new Promise((resolve) => setTimeout(() => resolve(fixtureEvents(place, lines)), options.delayMs ?? 0)),
        follow: (onEvents) => {
          followers.add(onEvents);
          let timer: ReturnType<typeof setInterval> | undefined;
          if (options.liveEveryMs) {
            let at = AT;
            timer = setInterval(() => { at += options.liveEveryMs!; push(written(at, "INFO", "call{call=c-7f3a}", "The agent started speaking", `turn=t-${serial + 32}`), "app"); }, options.liveEveryMs);
          }
          return () => { followers.delete(onEvents); if (timer) clearInterval(timer); };
        },
      };
    },
  };
}
