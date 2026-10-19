import type { ErrorMessage } from "../../components/ui/ErrorText";
import { failureCode } from "../../services/failure-code.js";
import { hasTranslation, translator, type Translate, type MessageKey } from "../../i18n/translator";
import { messages as en } from "../../i18n/locales/en";

/* How a failure reaches a person, wherever it happened (AGENTS.md: every text through i18n). Its code — the engine's, the
 * voice's, this page's, a machine's or the room's key, a browser exception's name — is said in the words this bundle
 * gives it; a code with no words here gets a generic line about what failed. Its own text (an engine's, a browser's,
 * a machine's sentence, in whatever language it came) is never the sentence: it goes, with the code, behind "Details"
 * (components/ui/ErrorText.tsx). A provider's own words may follow a known sentence: that is the provider speaking. */

export type { ErrorMessage };

/** What failed, as the generic line names it: "Something went wrong with {what}." */
export type ErrorSubject = "voice" | "call" | "room" | "download" | "models" | "model" | "try" | "key" | "pairing" | "delete" | "devices" | "settings" | "app";

/** A failure as this page receives one. `words`: one already worded for people (`worded`). */
type Failure = { code?: unknown; key?: unknown; name?: unknown; message?: unknown; detail?: unknown; words?: ErrorMessage };

/** The engine's codes for a remote provider's refusal: their `detail` is what the provider said, to show as it is
 *  (@sidevoice/engine's EngineError). Any other code's detail is raw, and goes behind Details. */
const PROVIDER_CODES = new Set(["credential-rejected", "listing-not-permitted", "provider-quota", "rate-limited", "provider-unreachable", "listing-failed", "provider-refused"]);

const hasHostKey = (key: string): key is MessageKey => Object.hasOwn(en, key);

/** The sentence and a provider's words after it, as one line: for what holds a failure as a single string. */
export const errorLine = (message: ErrorMessage) => message.said ? message.text + " " + message.said : message.text;

/** A failure already worded for people (a sentence this page wrote, in the person's language): said as it is. */
export function worded(text: string, details = ""): Error & { words: ErrorMessage } {
  return Object.assign(new Error(text), { words: details ? { text, details } : { text } });
}

/** The parts of a failure: its code (a string `code`, a browser exception's name, a machine's or the room's `key`), its
 *  own text, and its detail. */
export function failureParts(error: unknown) {
  const failure = (error && typeof error === "object" ? error : {}) as Failure;
  const code = failureCode(error, "") || (typeof failure.key === "string" ? failure.key : "");
  const message = typeof error === "string" ? error : typeof failure.message === "string" ? failure.message : "";
  const detail = typeof failure.detail === "string" ? failure.detail : failure.detail == null ? "" : String(failure.detail);
  return { code, message, detail };
}

/** Lines of raw text, each once, the empty ones left out. */
const raw = (...parts: string[]) => [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join("\n");

export interface ErrorOptions {
  /** A known code's sentence, in the caller's words; nothing for a code it does not know. */
  known?: (code: string) => string | null | undefined;
  /** What failed, for the generic line. */
  what?: ErrorSubject;
  /** A generic line of the caller's own, in place of "Something went wrong with {what}.". */
  generic?: string;
  t?: Translate;
}

/**
 * `error` as a person reads it: its code's sentence (`known`), else a generic line — never its raw text, which goes to
 * `details` with its code. A provider's words follow a known sentence (`said`).
 */
export function errorMessage(error: unknown, { known, what = "app", generic, t = translator() }: ErrorOptions = {}): ErrorMessage {
  const words = (error as Failure | null)?.words;
  if (words && typeof words === "object" && typeof words.text === "string" && words.text) return words;
  const { code, message, detail } = failureParts(error);
  const text = code ? known?.(code) : null;
  if (text) {
    const said = PROVIDER_CODES.has(code) ? detail : "";
    const details = raw(message !== code && message !== text ? message : "", said ? "" : detail);
    return { text, ...(said ? { said } : {}), ...(details ? { details } : {}) };
  }
  const details = raw(code, message, detail);
  return { text: generic ?? t("error.generic", { what: t(`error.what.${what}`) }), ...(details ? { details } : {}) };
}

/** A key of this bundle for a code, when it has one: `prefix` + code. */
export const keyFor = (prefix: string, code: string, language?: string): MessageKey | null =>
  (language ? hasTranslation(language, prefix + code) : hasHostKey(prefix + code)) ? (prefix + code) as MessageKey : null;

/**
 * A failure of the voice, its models or their catalogues — the engine's, the voice module's, a try's, the browser's —
 * as a person reads it. `inApp`: the page is in the desktop app (where the microphone is the system's to allow).
 */
export function voiceFailure(error: unknown, { what = "voice", inApp = false, t = translator() }: { what?: ErrorSubject; inApp?: boolean; t?: Translate } = {}): ErrorMessage {
  // A browser's own refusal (a DOMException, by its name: not one of the language's own errors) has a line of its own;
  // which one it was, and what it said, are details.
  const code = failureParts(error).code;
  const generic = /^[A-Z][A-Za-z]*Error$/.test(code) && !BUILT_IN.test(code) ? t("voice.error.browser") : undefined;
  return errorMessage(error, { what, generic, t, known: (known) => voiceFailureKnown(known, inApp, what === "try", t) });
}

/** The language's own errors: a bug or a failed request, not the browser refusing anything. */
const BUILT_IN = /^(Type|Range|Syntax|Reference|Eval|URI|Aggregate|Internal)Error$/;

/** The room's and a machine's refusals this page words itself, by key (sidevoice-core's socket frames and admission,
 *  this page's own `host_unreachable`). A refusal with another key, or none — a machine's HTTP refusal is a sentence
 *  without one — is the generic line, its sentence behind Details. */
const ROOM_FAILURES: Record<string, MessageKey> = {
  host_unreachable: "room.failure.hostUnreachable",
  room_is_full: "room.failure.full", "room.full": "room.failure.full",
  node_offline: "room.failure.machineAway", node_unreachable: "room.failure.machineAway", node_timeout: "room.failure.machineAway",
  choose_node: "room.failure.machineAway",
  "room.replay_unavailable": "room.failure.replayUnavailable",
  "room.input_backlog_full": "room.failure.inputBacklogFull",
};

/** A failure of the room or a machine (a refusal, a request that never got an answer) as a person reads it. */
export function roomFailure(error: unknown, { what = "room", generic, t = translator() }: Omit<ErrorOptions, "known"> = {}): ErrorMessage {
  return errorMessage(error, { what, generic, t, known: (code) => ROOM_FAILURES[code] ? t(ROOM_FAILURES[code]) : null });
}

/** A failure of the desktop app's updater (sidevoice-desktop #56: its status's `error`, or a call it rejected) as a
 *  person reads it: a check, a download or an install that failed, by its code. */
export function updaterFailure(error: unknown, { t = translator() }: { t?: Translate } = {}): ErrorMessage {
  return errorMessage(error, { what: "app", t, known: (code) => { const key = keyFor("updates.failure.", code); return key ? t(key) : null; } });
}

/** Codes said in another code's words: the same failure as the engine, the voice module, the desktop app or this page
 *  names it. */
const VOICE_ALIASES: Record<string, string> = {
  "model-cannot-transcribe": "model-wrong-task", "model-cannot-speak": "model-wrong-task", "model-cannot-end-turns": "model-wrong-task",
  "model-cannot-detect": "model-wrong-task", "model-not-found": "model-unknown", "build-missing": "build-not-found",
  "build-unfit": "model-unfit", "no-build-available": "model-unfit", "model-needs-memory": "memory", "unsupported-accelerator": "no-accelerator",
  "unsupported-model": "model-unfit", "voice-unknown": "unknown-voice", "voice-missing": "unknown-voice", "synthesis-failed": "speech-failed",
  "voice-failed": "speech-failed", "vad-failed": "detection-failed", "models-load-failed": "model-load-failed",
  "file-not-installed": "not-installed", "download-corrupt": "digest-mismatch", "storage-name-invalid": "storage-failed",
  "digest-invalid": "catalog-entry-invalid", "artifact-key-conflict": "catalog-entry-invalid", "file-name-invalid": "catalog-entry-invalid",
  "file-path-conflict": "catalog-entry-invalid", "credentials-unavailable": "credentials-failed", "request-failed": "provider-unreachable",
  "install-cancelled": "cancelled", "library-open-failed": "engine-unavailable", "engine-unsupported": "engine-unavailable",
  "audio-output-failed": "speaker-unavailable", "audio-device-unknown": "audio-device-unavailable",
  "audio-devices-unavailable": "audio-device-unavailable", "audio-capture-failed": "audio-failed", "audio-thread-failed": "audio-failed",
  "audio-format-unsupported": "audio-failed", "io-failed": "audio-failed",
};

function voiceFailureKnown(code: string, inApp: boolean, trying: boolean, t: Translate): string | null {
  if (code === "storage-blocked" || code === "SecurityError") return t("storage.blocked");
  if (code === "microphone-denied" && inApp) return t(trying ? "wizard.trial.microphoneDeniedApp" : "voice.microphoneDeniedApp");
  if (code.startsWith("trial-")) {
    const trial = keyFor("wizard.trial.", code.slice(6));
    return trial ? t(trial) : null;
  }
  const said = code.startsWith("host-capabilities") ? "host-capabilities" : VOICE_ALIASES[code] ?? code;
  // A try is no call: where the call's sentence tells to join again, the try has its own, which tells to try again.
  const own = trying ? keyFor("wizard.trial.", said) : null;
  if (own) return t(own);
  const key = keyFor("voice.failure.", said);
  if (key) return t(key);
  // A build that does not fit this device (the engine's build reasons), with why.
  const unfit = keyFor("voice.unfit.", said);
  if (unfit) return t("voice.unfitFailure", { reason: t(unfit) });
  return null;
}
