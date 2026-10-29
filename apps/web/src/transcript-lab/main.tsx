import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/bichos.css";
import "../styles/theme.css";
import "../components/ui/ui.css";
import "../styles/app.css";
import "./transcript-lab.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MessageList } from "../features/conversation/MessageList";
import { CUT_MARKERS, CUT_MARKER_VARIANT, UNHEARD_MARKS, UNHEARD_MARK_VARIANT } from "../features/conversation/UnheardReply";
import { VARIANTS_KEY, useVariant } from "../lib/variants";
import type { ChatMessage, ConversationView } from "../state/room-types";

/* The transcript lab (transcript-lab.html, served by the dev server only): the real transcript on mock replies, one
 * panel to switch between the states a reply can settle into and between the variants of each open visual choice
 * (sidevoice-web#182). The variants are the ones the playground preview's VARIANTS panel writes too. */

const NOW = Date.now();
const LONG = "I went through the failing tests and found the cause: the fixture builds the clock before the timezone is set, so every run after midnight UTC drifts by a day. I fixed the order, added a test that pins the clock, and the whole suite passes locally. Tell me if you want it in its own commit.";
const MID = "The migration is ready. It adds the column, backfills it in batches of a thousand and drops the old index afterwards. It takes about four minutes on the biggest table.";
let n = 0;
const reply = (text: string, extra: Partial<ChatMessage> = {}, minutes = 0): ChatMessage =>
  ({ segment: `lab-${n++}`, thread: "lab", session: "call", role: "assistant", name: "Agent", text, time: NOW - 60_000 * (30 - minutes), ...extra });
const person = (text: string, minutes: number): ChatMessage => ({ ...reply(text, {}, minutes), role: "user", name: "You" });
const heardOf = (text: string, chars: number) => ({ hearing: "partial" as const, heard_chars: chars, interrupted: true, audio: "interrupted", audio_reason: "user_interrupted" as const, text });

const STATES = [
  ["never", "Never played"], ["cut", "Cut part-way"], ["whole", "Fully heard"], ["playing", "Playing (karaoke)"], ["several", "Several in a row"],
] as const;
type StateId = (typeof STATES)[number][0];

function scenario(id: StateId, at: number, settled: "playing" | "heard" | "cut"): ChatMessage[] {
  n = 0;
  switch (id) {
    case "never": return [
      person("Can you check why the nightly failed?", 1),
      reply(LONG, { hearing: "not_heard", heard_chars: 0, audio: "text_only", audio_reason: "voice_off" }, 2),
      person("And the migration?", 3),
      reply(MID, { hearing: "heard", heard_chars: [...MID].length }, 4),
    ];
    case "cut": return [
      person("Can you check why the nightly failed?", 1),
      reply(LONG, { ...heardOf(LONG, 118) }, 2),
    ];
    case "whole": return [
      person("Can you check why the nightly failed?", 1),
      reply(LONG, { hearing: "heard", heard_chars: [...LONG].length }, 2),
    ];
    case "playing": {
      const playing = settled === "playing";
      return [
        person("Can you check why the nightly failed?", 1),
        reply(LONG, playing ? { playback: "playing", karaoke: { from: at, to: at } }
          : settled === "heard" ? { hearing: "heard", heard_chars: [...LONG].length }
            : { ...heardOf(LONG, at) }, 2),
      ];
    }
    case "several": return [
      person("Start with the nightly, then the migration.", 1),
      reply("On it.", { hearing: "heard", heard_chars: 6 }, 2),
      reply("The nightly failed on a clock fixture.", { hearing: "not_heard", heard_chars: 0, audio: "text_only", audio_reason: "newer_turn" }, 3),
      reply(MID, { ...heardOf(MID, 71) }, 4),
      person("Skip that, just the tests.", 5),
      reply("Checking the tests now.", { hearing: "not_heard", heard_chars: 0 }, 6),
      reply("Two tests were flaky; I pinned the clock.", { hearing: "not_heard", heard_chars: 0 }, 7),
      reply(LONG, { hearing: "heard", heard_chars: [...LONG].length }, 8),
    ];
  }
}

const params = new URLSearchParams(location.search);
const WIDTHS = [["phone", 380], ["panel", 420], ["wide", 560]] as const;

function setVariant(name: string, value: string) {
  let all: Record<string, string> = {};
  try { all = JSON.parse(localStorage.getItem(VARIANTS_KEY) || "{}"); } catch { /* start over */ }
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ ...all, [name]: value }));
  window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
}

function Choice<Value extends string>({ name, title, values }: { name: string; title: string; values: readonly Value[] }) {
  const current = useVariant(name, values);
  return <fieldset><legend>{title}</legend>
    {values.map((value) => <label key={value}><input type="radio" name={name} checked={value === current} onChange={() => setVariant(name, value)} /> {value}</label>)}
  </fieldset>;
}

function Lab() {
  const [state, setState] = useState<StateId>((params.get("state") as StateId) || "several");
  const [theme, setTheme] = useState(params.get("theme") === "dark" ? "dark" : "light");
  const [width, setWidth] = useState<number>(Number(params.get("width")) || 420);
  const [run, setRun] = useState(0);
  const [at, setAt] = useState(0);
  const [settled, setSettled] = useState<"playing" | "heard" | "cut">("playing");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const next = new URLSearchParams(location.search);
    next.set("state", state); next.set("theme", theme); next.set("width", String(width));
    history.replaceState(null, "", `?${next}`);
  }, [state, theme, width]);

  // The karaoke: a word at a time over the whole reply; at its end the reply settles as heard, or where "Cut now" stopped it.
  useEffect(() => {
    if (state !== "playing") return;
    setAt(0); setSettled("playing");
  }, [state, run]);
  useEffect(() => {
    if (state !== "playing" || settled !== "playing") return;
    const timer = setInterval(() => setAt((value) => {
      if (value + 3 >= LONG.length) { clearInterval(timer); setSettled("heard"); return LONG.length; }
      return value + 3;
    }), 70);
    return () => clearInterval(timer);
  }, [state, settled, run]);

  const conversation: ConversationView = { thread: "lab", messages: scenario(state, at, settled), pendingText: "", pendingCancellable: false };
  return <div className="lab">
    <aside className="lab-panel">
      <h1>Transcript lab</h1>
      <p>Replies that did not play whole (#182). Changes show live.</p>
      <fieldset><legend>State</legend>
        {STATES.map(([id, label]) => <label key={id}><input type="radio" name="state" checked={state === id} onChange={() => setState(id)} /> {label}</label>)}
        {state === "playing" && <div className="lab-row">
          <button type="button" onClick={() => setRun(run + 1)}>Restart</button>
          <button type="button" disabled={settled !== "playing"} onClick={() => setSettled("cut")}>Cut now</button>
          <span>{settled === "playing" ? "playing…" : settled === "heard" ? "settled: heard" : "settled: cut"}</span>
        </div>}
      </fieldset>
      <Choice name={UNHEARD_MARK_VARIANT} title="Never played: the mark" values={UNHEARD_MARKS} />
      <Choice name={CUT_MARKER_VARIANT} title="Cut part-way: the marker" values={CUT_MARKERS} />
      <fieldset><legend>Theme</legend>
        {(["light", "dark"] as const).map((value) => <label key={value}><input type="radio" name="theme" checked={theme === value} onChange={() => setTheme(value)} /> {value}</label>)}
      </fieldset>
      <fieldset><legend>Width</legend>
        {WIDTHS.map(([label, px]) => <label key={label}><input type="radio" name="width" checked={width === px} onChange={() => setWidth(px)} /> {label} · {px}px</label>)}
      </fieldset>
    </aside>
    <main className="lab-stage"><section className="lab-transcript transcript" style={{ width }}><MessageList conversation={conversation} /></section></main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Lab />);
