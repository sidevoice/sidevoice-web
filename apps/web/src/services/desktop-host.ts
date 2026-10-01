/* The desktop app's bridge as ONBOARDING_AND_HOSTS.md §4.7 adds to it (`window.__sidevoiceDesktop.host`): the
 * local host (this computer's core and its node service), the app's own settings, and the onboarding state.
 *
 * Only the shape lives here. The page discovers each capability by its presence and hides what is missing, so every
 * group and every call is optional: an R1 app has `localHost` without `install` or `agents`, a browser has nothing.
 * Nothing in this file reads a clock, the network or storage. */

/** The local host's state machine (§4.2) as the app projects it, plus the app's own states. */
export type LocalHostStateName =
  | "absent" | "installing" | "not-installed" | "stopped-by-person" | "starting" | "backoff" | "running"
  | "failed" | "service-failed" | "refused" | "incompatible";

/** Why the core or its service is not running: a stable key (§4.2 cause keys) and what it carries. */
export interface LocalHostFailure {
  key: string;
  /** The parameter the key's sentence needs: a module name, a port, an exit code. */
  detail?: string;
  /** Where it happened: install, launch, import, bind, ready. */
  step?: string;
  attempts?: number;
  /** Seconds since the epoch. */
  at?: number;
  log_tail?: string[];
}

export interface LocalHostCore { pid?: number; version: string; api: number; launch_id?: string }

export interface LocalHostState {
  state: LocalHostStateName;
  since?: number;
  failure?: LocalHostFailure | null;
  core?: LocalHostCore | null;
  /** While backing off: the attempt being made and the budget (§4.2: 5 in one window). */
  attempts?: number;
  max_attempts?: number;
  next_retry_at?: number | null;
  service?: "launchd" | "systemd" | "none";
  /** `incompatible`: whether the core is older (the app updates it) or newer (the app must be updated). */
  incompatible?: "core-older" | "core-newer";
  /** A pending update of the machine (§4.3), offered as «Actualizar». */
  update?: { from: string; to: string } | null;
  /** Calls open on the core: an update waits for none unless the person says «Aplicar ahora». */
  calls?: number;
}

/** The local host as the page pairs with it (§4.1): never stored in `sidevoice.pairings`. */
export interface LocalPairing {
  fp: string;
  public_key: string;
  device_id: string;
  token: string;
  urls: string[];
  rv: null;
  host: string;
  local: true;
}

/** One agent as the connector's module detects it (§4.4). */
export interface DetectedAgent {
  id: string;
  label: string;
  present: boolean;
  evidence?: { kind: "config-dir" | "binary" | "app"; path: string }[];
  version: string | null;
  registration: "connected" | "not-connected" | "foreign" | "unknown";
  connect: "auto" | "manual";
  /** Seen and set aside with «Ahora no» (F5): no badge until it changes. */
  dismissed?: boolean;
  /** A manual registration: the file to edit and what to put in it. */
  manual?: { file: string; snippet: string } | null;
}

export interface InstallProgress { step: "download" | "verify" | "service" | "connect"; done: number; total: number }

export interface PairingCodeAnswer { code: string; expires_in: number; reach: "room" | "direct" | "local-only" }

export interface BridgeError { key: string; message?: string; detail?: string }
export type BridgeResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: BridgeError };

export interface LocalHostBridge {
  state(): Promise<LocalHostState>;
  subscribe(listener: (state: LocalHostState) => void): () => void;
  pairing(): Promise<LocalPairing | null>;
  start?(): Promise<BridgeResult>;
  stop?(): Promise<BridgeResult>;
  restart?(): Promise<BridgeResult>;
  serviceInstall?(): Promise<BridgeResult>;
  serviceUninstall?(): Promise<BridgeResult>;
  reconnect?(): Promise<BridgeResult>;
  revealLog?(): Promise<BridgeResult>;
  pairingCode?(): Promise<BridgeResult<PairingCodeAnswer>>;
  pairRoom?(url: string, code: string): Promise<BridgeResult>;
  update?(options?: { now?: boolean }): Promise<BridgeResult>;
  /** R4: the agents found on this computer before any core exists. */
  agents?(): Promise<DetectedAgent[]>;
  /** R4: install the core and the node service (no agent is registered). Resolves when it is over. */
  install?(onProgress: (progress: InstallProgress) => void): Promise<BridgeResult>;
  cancel?(): Promise<void>;
}

export interface AppSettings { muteShortcut: string; callControlsAlways: boolean }

/** «Esta app» › Diagnóstico: what the native settings window shows today (desktop ui/settings.js). */
export interface AppDiagnostics {
  version: string;
  os: string;
  arch: string;
  accelerators: string[];
  memory_mb: number | null;
  webview: { microphone: boolean; secureContext: boolean; webCrypto: boolean };
  engine: { packages: { engine: string; version: string; bytes: number }[]; builds: { model: string; task: "stt" | "tts"; engine: string; bytes: number }[] };
  headset: { supported: boolean; muteGesture: boolean };
}

/** F7: one step of «Borrar datos». */
export interface ResetStep { id: "hang-up" | "machine" | "revoke" | "app"; state: "pending" | "running" | "done" | "failed"; error?: BridgeError; leaves?: string[] }

export interface AppBridge {
  settings(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<BridgeResult<{ warning?: string }>>;
  diagnostics?(): Promise<AppDiagnostics>;
  headsetTest?(): Promise<void>;
  reset?(options: { machine: boolean }, onStep: (steps: ResetStep[]) => void): Promise<BridgeResult>;
}

/** §3: the onboarding state (desktop: `onboarding.json`, written by the app; a browser keeps it in the page). */
export interface OnboardingState {
  choice?: "agents" | "remote" | null;
  deferred_at?: number | null;
  completed_at?: number | null;
  test_passed?: boolean;
  agents_done?: boolean;
}

export interface OnboardingBridge {
  read(): Promise<OnboardingState | null>;
  write(patch: OnboardingState): Promise<OnboardingState>;
}

export interface DesktopHost {
  version?: number;
  platform?: string;
  /** Whether this platform can host agents (O2: macOS arm64 app); «Usar agentes en este ordenador» needs it. */
  hostsAgents?: boolean;
  localHost?: LocalHostBridge;
  app?: AppBridge;
  onboarding?: OnboardingBridge;
  nativeEngine?: unknown;
  mediaKeys?: string;
}

/** The bridge, or null outside the app. `window.__sidevoiceDesktop` is declared by the call controls card
 *  (call-controls/host.ts) as an open record; the host page reads its own groups from it. */
export function desktopHost(): DesktopHost | null {
  return (typeof window !== "undefined" && (window.__sidevoiceDesktop?.host as DesktopHost | undefined)) || null;
}
