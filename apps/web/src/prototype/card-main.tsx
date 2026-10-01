/* PROTOTYPE ONLY — the desktop app's real call controls card (src/call-controls/CallCard.tsx), collapsed until the
 * pointer is near, with a fake `callControls` host: a call in progress on the scenario's conversation. The prototype
 * does not simulate the call itself; the card's buttons say what they would do. */
import { createRoot } from "react-dom/client";
import "../styles/tokens.css";
import "../call-controls/call-card.css";
import { CallCard } from "../call-controls/CallCard";
import type { CallCommand, CallControlsState } from "../call-controls/host";
import { cardLanguage, translator } from "../call-controls/i18n";
import type { ParticipantView } from "../state/room-types";

const query = new URLSearchParams(location.search);
const language = query.get("lang") || cardLanguage();
const post = (message: Record<string, unknown>) => window.parent.postMessage({ source: "sidevoice-card", ...message }, "*");
const participant = (threadId: string, title: string, harness: string, selected: boolean): ParticipantView => ({
  threadId, title, selected, available: true, switching: false, unread: 0, reach: "listening", stateLabel: "", subtitle: "", working: false,
  machine: query.get("machine") || "MacBook de Ana", harness,
});
let state: CallControlsState = {
  call: {
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: "sidevoice-web · onboarding",
    agent: "idle", youTalking: false, canSkip: false, since: Date.now() - 192_000,
    participants: [participant("t1", "sidevoice-web · onboarding", "claude", true), participant("t2", language === "es" ? "Revisar el informe del sprint" : "Review the sprint report", "codex", false)],
    devices: { inputs: [{ id: "default", label: "" }, { id: "mbp", label: "MacBook Pro" }], outputs: [{ id: "default", label: "" }], inputId: "default", outputId: "default", available: true, outputAvailable: true, busy: false } as never,
  },
  level: 0, pointerInside: null, alwaysExpanded: false, muteShortcut: "⇧⌘M",
};
const listeners = new Set<(s: CallControlsState) => void>();
const set = (patch: Partial<CallControlsState> | ((s: CallControlsState) => CallControlsState)) => {
  state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  for (const listener of listeners) listener(state);
};
// A voice that comes and goes, so the wave is alive.
setInterval(() => set((s) => ({ ...s, level: s.call.micEnabled ? Math.max(0, Math.round(35 + 30 * Math.sin(Date.now() / 300) + Math.random() * 20)) : 0 })), 120);

const host = {
  subscribe(listener: (s: CallControlsState) => void) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
  run(command: CallCommand) {
    if (command.command === "toggle-mute") set((s) => ({ ...s, call: { ...s.call, micEnabled: !s.call.micEnabled } }));
    else if (command.command === "select-participant") set((s) => ({ ...s, call: { ...s.call, title: s.call.participants.find((p) => p.threadId === command.threadId)?.title ?? s.call.title,
      participants: s.call.participants.map((p) => ({ ...p, selected: p.threadId === command.threadId })) } }));
    else post({ type: "command", command: command.command });
  },
  layout(size: { width: number; height: number }) { post({ type: "size", ...size }); },
  drag() {},
};
document.documentElement.lang = language;
createRoot(document.getElementById("root")!).render(<CallCard host={host} t={translator(language)} />);
