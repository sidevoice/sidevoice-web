export type OnboardingPath = "agents" | "remote";
export type OnboardingStep = "W1" | "W2" | "W2r" | "W3" | "W4" | "W4v" | "W6";
export type OnboardingTask = "stt" | "tts";

export interface OnboardingRecord {
  version: 1;
  choice: OnboardingPath | null;
  agents_done: boolean;
  deferred_at: number | null;
  completed_at: number | null;
  trials: Record<string, Partial<Record<OnboardingTask, string>>>;
}

export type OnboardingPatch = Partial<Omit<OnboardingRecord, "version" | "trials">> & {
  trials?: Record<string, Partial<Record<OnboardingTask, string | null>>>;
};

export const ONBOARDING_STORAGE_KEY = "sidevoice.onboarding";

export const emptyOnboardingRecord = (): OnboardingRecord => ({
  version: 1,
  choice: null,
  agents_done: false,
  deferred_at: null,
  completed_at: null,
  trials: {},
});

export class OnboardingStorageError extends Error {
  constructor(readonly key: "onboarding.read_failed" | "onboarding.write_failed" | "onboarding.native_unavailable") {
    super(key);
    this.name = "OnboardingStorageError";
  }
}

export function normalizeOnboardingRecord(value: unknown): OnboardingRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOnboardingRecord();
  const input = value as Record<string, unknown>;
  const choice = input.choice === "agents" || input.choice === "remote" ? input.choice : null;
  const trials: OnboardingRecord["trials"] = {};
  if (input.trials && typeof input.trials === "object" && !Array.isArray(input.trials)) {
    for (const [fp, raw] of Object.entries(input.trials as Record<string, unknown>)) {
      if (!fp || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const candidate = raw as Record<string, unknown>;
      const entry: Partial<Record<OnboardingTask, string>> = {};
      if (typeof candidate.stt === "string") entry.stt = candidate.stt;
      if (typeof candidate.tts === "string") entry.tts = candidate.tts;
      if (Object.keys(entry).length) trials[fp] = entry;
    }
  }
  const timestamp = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry) && entry > 0 ? entry : null;
  return {
    version: 1,
    choice,
    agents_done: input.agents_done === true,
    deferred_at: timestamp(input.deferred_at),
    completed_at: timestamp(input.completed_at),
    trials,
  };
}

export function mergeOnboardingRecord(record: OnboardingRecord, update: OnboardingPatch): OnboardingRecord {
  const trials = { ...record.trials };
  for (const [fp, patch] of Object.entries(update.trials ?? {})) {
    const entry = { ...(trials[fp] ?? {}) };
    for (const task of ["stt", "tts"] as const) {
      if (!(task in patch)) continue;
      const value = patch[task];
      if (value == null) delete entry[task];
      else entry[task] = value;
    }
    if (Object.keys(entry).length) trials[fp] = entry;
    else delete trials[fp];
  }
  return normalizeOnboardingRecord({ ...record, ...update, trials });
}

export function serializeOnboardingRecord(record: OnboardingRecord): string {
  return JSON.stringify(normalizeOnboardingRecord(record));
}

/** A deterministic key for the exact host and effective stage that was tried. */
export function stageTrialKey(fp: string, stage: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stable(entry)]));
  };
  return JSON.stringify([fp, stable(stage)]);
}

export function hasMatchingTrial(record: OnboardingRecord, fp: string | null, task: OnboardingTask, stageKey: string | null): boolean {
  return !!fp && !!stageKey && record.trials[fp]?.[task] === stageKey;
}

export interface ResumeFacts {
  record: OnboardingRecord;
  canHostAgents: boolean;
  localReady: boolean;
  localInstallStarted: boolean;
  remoteReady: boolean;
  hostFp: string | null;
  sttStageKey: string | null;
  ttsStageKey: string | null;
}

export function resumeOnboarding(facts: ResumeFacts): OnboardingStep {
  const { record } = facts;
  if (!record.choice) return "W1";
  const path = !facts.canHostAgents ? "remote" : record.choice;
  if (path === "agents" && !facts.localReady) return "W2";
  if (path === "remote" && !facts.remoteReady) return "W2r";
  if (!record.agents_done) return "W3";
  if (!hasMatchingTrial(record, facts.hostFp, "stt", facts.sttStageKey)) return "W4";
  if (!hasMatchingTrial(record, facts.hostFp, "tts", facts.ttsStageKey)) return "W4v";
  return "W6";
}

export interface OnboardingPort {
  read(): Promise<unknown>;
  /** Resolves after the native app durably applies the patch. */
  patch(update: OnboardingPatch): Promise<unknown>;
}

export interface OnboardingRepository {
  readonly native: boolean;
  read(): Promise<OnboardingRecord>;
  patch(current: OnboardingRecord, update: OnboardingPatch): Promise<OnboardingRecord>;
}

function samePatch(actual: OnboardingRecord, expected: OnboardingRecord, update: OnboardingPatch): boolean {
  for (const key of Object.keys(update) as (keyof OnboardingPatch)[]) {
    if (key === "trials") {
      for (const [fp, stages] of Object.entries(update.trials ?? {})) {
        for (const task of ["stt", "tts"] as const) {
          if (task in stages && actual.trials[fp]?.[task] !== expected.trials[fp]?.[task]) return false;
        }
      }
    } else if (actual[key as keyof OnboardingRecord] !== expected[key as keyof OnboardingRecord]) return false;
  }
  return true;
}

/** Browser storage is the owner on the web. A native app supplies its own durable read/patch port. */
export function createOnboardingRepository(options: {
  storage?: Pick<Storage, "getItem" | "setItem">;
  nativePort?: OnboardingPort | null;
  nativeExpected?: boolean;
} = {}): OnboardingRepository {
  const storage = options.storage ?? globalThis.localStorage;
  const nativePort = options.nativePort ?? null;
  const native = options.nativeExpected === true || !!nativePort;

  return {
    native,
    async read() {
      if (native) {
        if (!nativePort) throw new OnboardingStorageError("onboarding.native_unavailable");
        try { return normalizeOnboardingRecord(await nativePort.read()); }
        catch { throw new OnboardingStorageError("onboarding.read_failed"); }
      }
      try { return normalizeOnboardingRecord(JSON.parse(storage?.getItem(ONBOARDING_STORAGE_KEY) || "null")); }
      catch { throw new OnboardingStorageError("onboarding.read_failed"); }
    },
    async patch(current, update) {
      const expected = mergeOnboardingRecord(current, update);
      if (native) {
        if (!nativePort) throw new OnboardingStorageError("onboarding.native_unavailable");
        try {
          const answer = await nativePort.patch(update);
          const returned = normalizeOnboardingRecord(answer && typeof answer === "object" && "record" in answer
            ? (answer as { record: unknown }).record : answer);
          if (samePatch(returned, expected, update)) return returned;
        } catch {
          // A timed-out acknowledgement is ambiguous. Read back before deciding that the write failed.
        }
        try {
          const confirmed = normalizeOnboardingRecord(await nativePort.read());
          if (samePatch(confirmed, expected, update)) return confirmed;
        } catch { /* Keep completion pending if the durable state cannot be confirmed. */ }
        throw new OnboardingStorageError("onboarding.write_failed");
      }
      try {
        if (!storage) throw new Error("storage-unavailable");
        storage.setItem(ONBOARDING_STORAGE_KEY, serializeOnboardingRecord(expected));
        const confirmed = normalizeOnboardingRecord(JSON.parse(storage.getItem(ONBOARDING_STORAGE_KEY) || "null"));
        if (!samePatch(confirmed, expected, update)) throw new Error("write-not-confirmed");
        return confirmed;
      } catch { throw new OnboardingStorageError("onboarding.write_failed"); }
    },
  };
}
