import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/bichos.css";
import "../styles/theme.css";
import "../components/ui/ui.css";
import "../styles/app.css";
import "../features/settings/model-prepare.css";
import "./lab.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "../components/ui/Tooltip";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../state/room-store";
import { defaultVoiceSettings, editVoiceSettings } from "../services/voice-settings.js";
import type { SidevoiceActions } from "../state/room-types";
import { SlotPane } from "../features/settings/VoiceSettings";
import { UNRUNNABLE_POLICIES, UNRUNNABLE_VARIANT } from "../features/settings/unrunnable-policy";
import { VARIANTS_KEY } from "../lib/variants";
import { ENVIRONMENTS, catalogueFor, firstRunnable, type EnvironmentId } from "./environments";

/* The model picker lab (model-picker.html, served by the dev server only): Settings' transcription and voice panes on a
 * mocked machine, with a panel to switch the variant for models that cannot run here, the machine, and the main or the
 * advanced view. The choice lives in the URL, so a link shows what was looking at. */

const params = new URLSearchParams(location.search);
const pick = <Value extends string>(name: string, values: readonly Value[], fallback: Value) => (values as readonly string[]).includes(params.get(name) ?? "") ? (params.get(name) as Value) : fallback;

function setVariant(value: string) {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ [UNRUNNABLE_VARIANT]: value }));
  window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
}

function Lab() {
  const [variant, setVariantState] = useState(() => pick("variant", UNRUNNABLE_POLICIES, "disable"));
  const [env, setEnv] = useState<EnvironmentId>(() => pick("env", ENVIRONMENTS.map((entry) => entry.id), "desktop-gpu"));
  const [view, setView] = useState(() => pick("view", ["main", "advanced"] as const, "main"));
  const store = useMemo(() => createRoomStore(), []);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => { setVariant(variant); }, [variant]);
  useEffect(() => {
    const next = new URLSearchParams({ variant, env, view });
    history.replaceState(null, "", "?" + next);
  }, [variant, env, view]);

  // The machine: its catalogue and its kind; a fresh choice on it, as a first run there would make.
  useEffect(() => {
    const catalogs = catalogueFor(env);
    const settings = defaultVoiceSettings();
    settings.stt = { ...settings.stt, catalog: "local", model: firstRunnable(env, "stt") };
    settings.tts = { ...settings.tts, catalog: "local", model: firstRunnable(env, "tts") };
    store.patch({ voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs, error: "" }, inApp: ENVIRONMENTS.find((entry) => entry.id === env)!.inApp, providerKeys: {}, speechLanguage: "en" });
  }, [env, store]);

  useEffect(() => {
    installRoomBridge(store);
    const edit = (patch: never) => { const facts = store.getState().facts; const next = editVoiceSettings((facts.voiceDraft ?? facts.voiceSettings)!, patch, facts.voiceCatalogue.catalogs); store.patch({ voiceSettings: next, voiceDraft: next }); };
    window.sidevoiceActions = { editVoice: edit, installVoiceModel: async () => undefined, cancelVoiceInstall: () => undefined, loadVoiceCatalogue: async () => undefined } as unknown as SidevoiceActions;
  }, [store]);

  // Advanced: the folded panel under each model, opened as a person would; kept so while the panes redraw.
  useEffect(() => {
    const sync = () => {
      for (const toggle of body.current?.querySelectorAll<HTMLButtonElement>(".model-runtime-toggle") ?? []) {
        if ((toggle.getAttribute("aria-expanded") === "true") !== (view === "advanced")) toggle.click();
      }
    };
    sync();
    const timer = setInterval(sync, 250);
    return () => clearInterval(timer);
  }, [view, env]);

  const choices = <Value extends string>(name: string, current: Value, values: readonly { id: Value; label: string }[], set: (value: Value) => void) =>
    <fieldset className="lab-group"><legend>{name}</legend>{values.map((value) =>
      <button key={value.id} type="button" aria-pressed={current === value.id} onClick={() => set(value.id)}>{value.label}</button>)}</fieldset>;

  return <RoomStoreContext.Provider value={store}><TooltipProvider>
    <header className="lab-panel">
      {choices("Variant", variant, [{ id: "hide", label: "A · hide" }, { id: "disable", label: "B · show disabled" }], setVariantState)}
      {choices("Machine", env, ENVIRONMENTS, setEnv)}
      {choices("View", view, [{ id: "main", label: "Main" }, { id: "advanced", label: "Advanced" }], setView)}
    </header>
    <main className="lab-body" ref={body} key={env}>
      <h2>Transcription</h2>
      <SlotPane task="stt" />
      <h2>Voice</h2>
      <SlotPane task="tts" />
    </main>
  </TooltipProvider></RoomStoreContext.Provider>;
}

createRoot(document.getElementById("root")!).render(<Lab />);
