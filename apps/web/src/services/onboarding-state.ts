/* The first-run setup's progress on this device: the basics (appearance, languages) seen, which way it went (agents
 * here, or another machine), whether the agents step was answered, the transcription and voice chosen (and, apart, the
 * ones the person tried: trying is optional), the end of turn chosen, and when it was put off or finished. It lives on
 * the device, like the voice settings it tries; the machine, its agents and its pairing keep their own state, and the
 * setup only reads them. Completion is written fail-closed: it counts only once it reads back. */

export type OnboardingPath = "agents" | "remote";
export type OnboardingStep = "W0" | "W1" | "W2" | "W2r" | "W3" | "W4" | "W4v" | "W5" | "W6";
export type OnboardingTask = "stt" | "tts";

export interface OnboardingRecord {
  version: 1;
  /** The basics step (appearance, the interface's and the person's languages) was answered. */
  basics_done: boolean;
  choice: OnboardingPath | null;
  agents_done: boolean;
  /** The end of turn step was answered. */
  turn_done: boolean;
  deferred_at: number | null;
  completed_at: number | null;
  /** Per voice slot, the key of the settings the person tried (`trialKey`): a changed setting is an untried one. */
  trials: Partial<Record<OnboardingTask, string>>;
  /** Per voice slot, the key of the settings the person went on with, tried or not: a changed one is asked again. */
  chosen: Partial<Record<OnboardingTask, string>>;
  /** The release this device was set up on (`RELEASE`, features/whats-new): what came after it is new to the person. */
  baseline_release: number;
  /** What's new, per feature: seen (Got it), done (Set up), or put off (Later), and when. */
  features: Record<string, { state: "seen" | "done" | "later"; at: number }>;
}

export type OnboardingPatch = Partial<Omit<OnboardingRecord, "version" | "trials" | "chosen" | "features">> & {
  features?: Record<string, { state: "seen" | "done" | "later"; at: number }>;
  trials?: Partial<Record<OnboardingTask, string | null>>;
  chosen?: Partial<Record<OnboardingTask, string | null>>;
};

export const ONBOARDING_STORAGE_KEY = "sidevoice.onboarding";

export const emptyOnboardingRecord = (): OnboardingRecord => ({
  version: 1, basics_done: false, choice: null, agents_done: false, turn_done: false, deferred_at: null, completed_at: null, trials: {}, chosen: {}, baseline_release: 0, features: {},
});

export class OnboardingStorageError extends Error {
  constructor(readonly key: "onboarding.read_failed" | "onboarding.write_failed") {
    super(key);
    this.name = "OnboardingStorageError";
  }
}

const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

function features(value: unknown): OnboardingRecord["features"] {
  const kept: OnboardingRecord["features"] = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return kept;
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const item = entry as { state?: unknown; at?: unknown } | null;
    if (item && (item.state === "seen" || item.state === "done" || item.state === "later") && typeof item.at === "number") kept[id] = { state: item.state, at: item.at };
  }
  return kept;
}

/** `value` as a record, field by field; anything else is the empty record. */
export function normalizeOnboardingRecord(value: unknown): OnboardingRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOnboardingRecord();
  const input = value as Record<string, unknown>;
  const keys = (field: unknown) => {
    const kept: Partial<Record<OnboardingTask, string>> = {};
    const raw = field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
    for (const task of ["stt", "tts"] as const) if (typeof raw[task] === "string" && raw[task]) kept[task] = raw[task] as string;
    return kept;
  };
  const trials = keys(input.trials);
  return {
    version: 1,
    basics_done: input.basics_done === true,
    choice: input.choice === "agents" || input.choice === "remote" ? input.choice : null,
    agents_done: input.agents_done === true,
    turn_done: input.turn_done === true,
    deferred_at: timestamp(input.deferred_at),
    completed_at: timestamp(input.completed_at),
    trials,
    chosen: keys(input.chosen),
    baseline_release: typeof input.baseline_release === "number" && input.baseline_release > 0 ? input.baseline_release : 0,
    features: features(input.features),
  };
}

export function mergeOnboardingRecord(record: OnboardingRecord, update: OnboardingPatch): OnboardingRecord {
  const merged = (kept: Partial<Record<OnboardingTask, string>>, changes?: Partial<Record<OnboardingTask, string | null>>) => {
    const next = { ...kept };
    for (const task of ["stt", "tts"] as const) {
      if (!changes || !(task in changes)) continue;
      const value = changes[task];
      if (value == null) delete next[task];
      else next[task] = value;
    }
    return next;
  };
  return normalizeOnboardingRecord({ ...record, ...update, trials: merged(record.trials, update.trials), chosen: merged(record.chosen, update.chosen),
    features: { ...record.features, ...update.features } });
}

/** The key of a voice slot's settings as tried: its fields in a fixed order, so the same choice keys the same. */
export function trialKey(slot: unknown): string | null {
  if (!slot || typeof slot !== "object") return null;
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]))
    : value;
  return JSON.stringify(stable(slot));
}

/** What the setup's next step depends on, read live: the record, and the machine and voice settings as they are. */
export interface ResumeFacts {
  record: OnboardingRecord;
  /** This app can install and run a machine here (the desktop app on a supported platform). */
  canHostAgents: boolean;
  /** The machine on this computer is paired, in use and answering. */
  localReady: boolean;
  /** Another machine is paired, in use and answering. */
  remoteReady: boolean;
  /** The keys of this device's transcription and voice settings now (`trialKey`). */
  sttKey: string | null;
  ttsKey: string | null;
}

/** The first step not yet done, from the record and the live facts: a step already achieved (an install, a pairing)
 *  is never asked for again, and a changed setting is tried again. */
export function resumeOnboarding(facts: ResumeFacts): OnboardingStep {
  const { record } = facts;
  if (!record.basics_done) return "W0";
  const path = !facts.canHostAgents ? "remote" : record.choice ?? (facts.localReady ? "agents" : null);
  if (!path) return "W1";
  if (path === "agents" && !facts.localReady) return "W2";
  if (path === "remote" && !facts.remoteReady) return "W2r";
  if (path === "agents" && !record.agents_done) return "W3";
  // Chosen, tried or not: trying is the setup's suggestion, not a condition.
  const settled = (task: OnboardingTask, key: string | null) => !!key && (record.chosen[task] === key || record.trials[task] === key);
  if (!settled("stt", facts.sttKey)) return "W4";
  if (!settled("tts", facts.ttsKey)) return "W4v";
  if (!record.turn_done) return "W5";
  return "W6";
}

export interface OnboardingRepository {
  /** The record as stored now (this device's storage answers at once). Throws `onboarding.read_failed`. */
  read(): OnboardingRecord;
  /** Resolves with the record as stored, only once what was written reads back the same. */
  patch(current: OnboardingRecord, update: OnboardingPatch): Promise<OnboardingRecord>;
}

/** The record in this device's storage. A storage that refuses or does not keep a write is a keyed failure, never an
 *  optimistic success. */
export function createOnboardingRepository(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined = (() => {
  try { return globalThis.localStorage; } catch { return null; }
})()): OnboardingRepository {
  const stored = () => normalizeOnboardingRecord(JSON.parse(storage?.getItem(ONBOARDING_STORAGE_KEY) || "null"));
  return {
    read() {
      try { return stored(); } catch { throw new OnboardingStorageError("onboarding.read_failed"); }
    },
    async patch(current, update) {
      const expected = mergeOnboardingRecord(current, update);
      try {
        if (!storage) throw new Error("no storage");
        storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(expected));
        const confirmed = stored();
        if (JSON.stringify(confirmed) !== JSON.stringify(expected)) throw new Error("not kept");
        return confirmed;
      } catch { throw new OnboardingStorageError("onboarding.write_failed"); }
    },
  };
}
