import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/theme.css";
import "../components/ui/ui.css";
import "../styles/app.css";
import "./journeys.css";
import { createRoot } from "react-dom/client";
import { App } from "../app/App";
import { createRoomStore } from "../state/room-store";
import { createOnboardingRepository, emptyOnboardingRecord } from "../services/onboarding-state";
import { BASE_FACTS, JOURNEYS, type Shot } from "./shots";
import "../i18n/room-i18n.js";

/* The journeys' storyboard (journeys.html, served by the dev server only): every screen and state of the app laid out
 * as the person meets them, on a phone and a desktop, light and dark, each captioned. Not interactive: each frame is
 * the real app in one seeded state (?shot=<id>&theme=…), drawn at the device's width and scaled down here. */

const params = new URLSearchParams(location.search);
const shotId = params.get("shot");
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
const root = createRoot(document.getElementById("root")!);

// Set up on this release: no news to show, unless a shot says otherwise.
const DONE = { basics_done: true, choice: "remote" as const, agents_done: true, turn_done: true, completed_at: 1, baseline_release: 2 };
const noop = () => undefined;
const later = () => Promise.resolve(undefined);

/** One shot, the whole page: the room's store seeded, the setup's record kept in memory, the actions doing nothing. */
function renderShot(shot: Shot) {
  document.documentElement.dataset.shot = "";
  const memory = new Map<string, string>();
  const record = shot.setup ? { ...emptyOnboardingRecord(), ...shot.setup.record } : { ...emptyOnboardingRecord(), ...DONE, ...shot.record };
  memory.set("sidevoice.onboarding", JSON.stringify(record));
  const repository = createOnboardingRepository({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value) });
  // The variants this shot shows, read by this frame alone: the frames share one storage, and each shows its own.
  const getItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key: string) {
    return this === localStorage && key === "sidevoice.variants" ? JSON.stringify(shot.variants ?? {}) : getItem.call(this, key);
  };
  if (shot.updater) (window as unknown as { __sidevoiceDesktop: unknown }).__sidevoiceDesktop = { host: { updater: { status: async () => shot.updater, restart: later } } };
  if (shot.desktop) {
    const status = shot.desktop.state as Record<string, unknown>;
    const host = (window as unknown as { __sidevoiceDesktop?: { host: Record<string, unknown> } }).__sidevoiceDesktop?.host ?? {};
    (window as unknown as { __sidevoiceDesktop: unknown }).__sidevoiceDesktop = { host: { ...host, localHost: {
      state: async () => status, subscribe: () => noop, pairing: async () => null, install: () => Object.assign(new Promise(noop), { job: "j" }),
      start: later, stop: later, restart: later, serviceInstall: later, serviceUninstall: later, agents: async () => ({ agents: [
        { id: "claude-code", label: "Claude Code", version: "2.4" }, { id: "codex", label: "Codex", version: "0.157" }] }),
      ...(shot.desktop.pairingCode ? { pairingCode: async () => ({ code: "SV1.7KQ2-M9XA", expires_in: 600, reach: "direct" }) } : {}),
      ...(shot.desktop.version ? { version: async () => shot.desktop!.version, update: later } : {}),
    } } };
  }
  // The actions the runtime would bind: here they do nothing, and a pairing code is refused as the shot says.
  window.sidevoiceActions = new Proxy({}, { get: (_target, name) => name === "pairDevice"
    ? async () => { throw new Error(shot.pairRefusal ?? "unreachable"); }
    : name === "interfaceLanguage" ? () => "" : () => Promise.resolve(undefined) }) as typeof window.sidevoiceActions;
  const store = createRoomStore();
  store.patch({ ...BASE_FACTS, ...shot.facts } as never);
  (window as unknown as { __journeyStore: typeof store }).__journeyStore = store;
  root.render(<App store={store} onboarding={{ repository, startAt: shot.setup?.step }} />);
  setTimeout(async () => {
    await shot.after?.(document);
    if (shot.pairRefusal) {
      const field = document.getElementById("device-pairing-code") as HTMLTextAreaElement | null;
      if (field) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "SV1.EXAMPLE-CODE");
        field.dispatchEvent(new Event("input", { bubbles: true }));
        (field.form?.querySelector("button[type=submit]") as HTMLButtonElement | null)?.click()
          ?? field.form?.requestSubmit();
      }
    }
  }, 300);
}

const VIEWS = { phone: { width: 390, height: 844, scale: 0.42 }, desktop: { width: 1280, height: 800, scale: 0.3 } } as const;

/** The storyboard: each journey a row of its shots, each shot on a phone and a desktop, in the theme chosen. */
function Storyboard() {
  return (
    <main className="journeys">
      <header className="journeys-head">
        <h1>Sidevoice · Journeys</h1>
        <p>Every screen and state, as the person meets them. Each frame is the real app in one state; nothing here is live.</p>
        <nav aria-label="Theme"><a href="?theme=light" aria-current={theme === "light" ? "page" : undefined}>Light</a> · <a href="?theme=dark" aria-current={theme === "dark" ? "page" : undefined}>Dark</a></nav>
      </header>
      {JOURNEYS.map((journey) => (
        <section key={journey.id} className="journey" aria-labelledby={"j-" + journey.id}>
          <h2 id={"j-" + journey.id}>{journey.title}</h2>
          <p className="journey-note">{journey.note}</p>
          <ol className="journey-shots">
            {journey.shots.map((shot) => (
              <li key={shot.id} className="journey-shot">
                <div className="journey-frames">
                  {(shot.views ?? ["phone", "desktop"]).map((view) => {
                    const size = VIEWS[view];
                    return <div key={view} className="journey-frame" data-view={view} style={{ width: size.width * size.scale, height: size.height * size.scale }}>
                      <iframe title={`${shot.caption} (${view})`} loading="lazy" tabIndex={-1} src={`?shot=${shot.id}&theme=${theme}`}
                        style={{ width: size.width, height: size.height, transform: `scale(${size.scale})` }} />
                    </div>;
                  })}
                </div>
                <p className="journey-caption">{shot.caption}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}

const shot = shotId ? JOURNEYS.flatMap((journey) => journey.shots).find((entry) => entry.id === shotId) : null;
if (shot) renderShot(shot);
else root.render(<Storyboard />);
