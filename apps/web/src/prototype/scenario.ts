/* PROTOTYPE ONLY. The §6 fixtures (fixtures/scenarios/*.json), the toggles that combine with any of them, and the
 * URL that keeps both, so a link reproduces what was on screen. */
import type { DetectedAgent, LocalHostState, OnboardingState } from "../services/desktop-host";

export interface TimedState extends Partial<LocalHostState> { state: LocalHostState["state"]; after_ms: number }
export interface CallAnswer { ok: boolean; error?: { key: string; detail?: string }; states?: TimedState[]; reach?: "room" | "direct" | "local-only"; delay_ms?: number }
export interface RouteAnswer { status?: number; body?: unknown; delay_ms?: number; default?: boolean }
export interface HostSeed {
  name: string;
  via?: "room" | "direct";
  reachable?: boolean;
  silent_hours?: number;
  connect_ms?: number;
  agents?: DetectedAgent[];
  devices?: { name: string; kind: "local" | "code"; self?: boolean; created_days_ago: number; seen_minutes_ago: number | null }[];
  integrations?: Record<string, "stored" | "environment" | false>;
  routes?: Record<string, RouteAnswer[]>;
}
export interface StageSeed { place: string; model: string; options?: Record<string, unknown> }
export interface Scenario {
  id: string; title: string; title_en: string; walk: string;
  inApp: boolean; platform?: string; view?: View;
  bridge?: {
    localHost?: { states: TimedState[]; agents?: DetectedAgent[]; refused?: boolean; install?: { duration_ms?: number }; calls?: Record<string, CallAnswer[]> };
    app?: { reset?: { fail_once?: string; error?: { key: string; detail?: string }; leaves?: string[]; relaunch?: { app: string; machine: string } } };
  };
  hosts: Record<string, HostSeed>;
  pairings?: { host: string; paired_days_ago?: number }[];
  in_use?: string;
  stages?: { default?: Record<string, StageSeed>; hosts?: Record<string, Record<string, StageSeed>> };
  installed?: string[];
  /** The room shows conversations once a working host is in use, unless this is false. */
  room?: boolean;
  scan_on_start?: boolean;
  open?: { pane: string; host?: string; tab?: string };
  onboarding: OnboardingState | null;
}

const files = import.meta.glob("../../fixtures/scenarios/*.json", { eager: true, import: "default" }) as Record<string, Scenario>;
export const SCENARIOS: Scenario[] = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([, scenario]) => scenario);
export const scenarioById = (id: string | null) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

export type View = "app" | "browser" | "phone";

export interface ToggleDef { id: string; group: string; label: string; options?: string[]; reload?: boolean }
/** The per-model step: A (default) or B, shown on its own in the panel to compare them. */
export const FLOW_TOGGLE = "stageFlow";
export const TOGGLES: ToggleDef[] = [
  { id: FLOW_TOGGLE, group: "Flujo", label: "Paso de cada modelo", options: ["", "A", "C"], reload: true },
  { id: "offline", group: "Entorno", label: "Sin red: hosts remotos y descargas fallan" },
  { id: "noWebgpu", group: "Entorno", label: "Navegador sin WebGPU (solo WASM)", reload: true },
  { id: "slowDownload", group: "Entorno", label: "Descargas lentas (×6)" },
  { id: "coreFailing", group: "Entorno", label: "El núcleo falla al (re)arrancar" },
  { id: "delayedHost", group: "Entorno", label: "Hosts remotos tardan 3 s en contestar" },
  { id: "w1NoAgents", group: "W1–W2", label: "No se encuentran agentes (W1 y W3)" },
  { id: "w2Error", group: "W1–W2", label: "W2: error de instalación", options: ["", "install.network", "install.proxy", "install.disk", "install.checksum", "install.no-bundle", "install.authenticity"] },
  { id: "w2Kept", group: "W1–W2", label: "W2: la instalación anterior sigue intacta" },
  { id: "w2rNoWebCrypto", group: "W2′", label: "W2′: navegador sin WebCrypto" },
  { id: "w2rMismatch", group: "W2′", label: "W2′: contesta otra máquina" },
  { id: "w2rUnreachable", group: "W2′", label: "W2′: la máquina no responde" },
  { id: "w2rStorage", group: "W2′", label: "W2′: no se puede guardar el emparejamiento" },
  { id: "w3Foreign", group: "W3 / Agentes", label: "Codex tiene una entrada «sidevoice» ajena" },
  { id: "w3ManualCodex", group: "W3 / Agentes", label: "Codex solo manual (copiar configuración)" },
  { id: "w3ConnectFails", group: "W3 / Agentes", label: "Conectar un agente falla" },
  { id: "w3ScanTimeout", group: "W3 / Agentes", label: "La búsqueda de agentes no termina" },
  { id: "w3Dismissed", group: "W3 / Agentes", label: "Cursor descartado («Ahora no») y reescaneado", reload: true },
  { id: "w4NoOffer", group: "W4 / Voz", label: "Este dispositivo no ejecuta nada y sin claves", reload: true },
  { id: "w4KeyRefused", group: "W4 / Voz", label: "El proveedor rechaza la clave" },
  { id: "w4IntegrationsFail", group: "W4 / Voz", label: "No se pueden leer las integraciones" },
  { id: "w4Download", group: "W4 / Voz", label: "Fallo al seleccionar un modelo", options: ["", "download", "check"] },
  { id: "w4Slow", group: "W4 / Voz", label: "La transcripción va lenta" },
  { id: "w5", group: "W5 / Prueba", label: "Prueba de eco", options: ["", "mic-denied", "no-mic", "silence", "stt-error", "tts-error"] },
  { id: "localTokenWrite", group: "Host local", label: "La app no puede guardar su credencial local", reload: true },
  { id: "resumeAt", group: "Host local", label: "Onboarding aplazado: reanudar en", options: ["", "W2", "W3", "W4", "W5"], reload: true },
];

export type Toggles = Record<string, string | boolean>;

/** `at`: the wizard step on screen, kept in the URL so a reload lands there again (prototype only). */
export interface Params { scenario: Scenario; view: View; lang: string; toggles: Toggles; at: string | null }

export function readParams(search: string): Params {
  const query = new URLSearchParams(search);
  const scenario = scenarioById(query.get("s"));
  const toggles: Toggles = {};
  for (const def of TOGGLES) {
    const value = query.get(def.id);
    if (value === null) continue;
    toggles[def.id] = def.options ? value : value === "1";
  }
  const view = (query.get("view") as View | null) ?? scenario.view ?? (scenario.inApp ? "app" : "browser");
  return { scenario, view, lang: query.get("lang") ?? "", toggles, at: query.get("at") };
}

export function writeParams(params: { scenario: string; view: View; lang: string; toggles: Toggles; at?: string | null }): string {
  const query = new URLSearchParams();
  query.set("s", params.scenario);
  query.set("view", params.view);
  if (params.lang) query.set("lang", params.lang);
  if (params.at) query.set("at", params.at);
  for (const def of TOGGLES) {
    const value = params.toggles[def.id];
    if (value === true) query.set(def.id, "1");
    else if (typeof value === "string" && value) query.set(def.id, value);
  }
  return "?" + query.toString();
}
