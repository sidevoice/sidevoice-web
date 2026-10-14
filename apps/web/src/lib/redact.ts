/* Free text a native piece wrote (the installer's last log lines) before it leaves the app in copied details: the person
 * pastes it where they choose, so it carries neither their home path nor anything that works as a credential (operator,
 * 2026-10-14). One helper for every copy of such text: a home path reads ~, whatever is masked reads •••. It errs towards
 * masking: a diagnostic lost costs less than a secret pasted into an issue. */

export const MASK = "•••";

/** /Users/<name>, /home/<name>, C:\Users\<name>: either slash, any drive, backslashes doubled as JSON escapes them. */
const HOME = /(?:\b[A-Za-z]:)?(?:\\{1,2}|\/)(?:Users|home)(?:\\{1,2}|\/)[^\\/\s"'`<>|:;,()[\]{}]+/gi;
/** A Windows name may hold spaces (C:\Users\Ada Lovelace): up to the next separator, a quote or the end, first. */
const WINDOWS_HOME = /\b[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)[^\\/\r\n"'`<>|:*?]+?(?=\\|\/|["']|$)/gi;
/** A URL's user and password: scheme://user:password@host. */
const URL_CREDENTIALS = /(\b[a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi;
/** Everything after an Authorization header's name. */
const AUTHORIZATION = /\b(authorization["']?\s*[:=]\s*)[^\r\n]+/gi;
const BEARER = /\b(bearer\s+)[^\s"',;]+/gi;
/** token=…, secret=…, key=… (api_key, X-Api-Key, "client_secret": "…", a password, a credential): the value. */
const NAMED_SECRET = /\b([\w.-]*?(?:token|secret|key|password|passwd|credential)s?)(["']?\s*[=:]\s*["']?)[^\s"'&,;}\]]+/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;
/** A pairing code: what follows SV1. is the code; the prefix stays, to say what was there. */
const PAIRING_CODE = /\b(SV1\.)[\w-]+/g;
/** A run of 20 or more base64url characters, matched whole: masked only when it reads as a token (tokenLike). */
const LONG_RUN = /[\w-]{20,}/g;

/** Whether a long run reads as a token rather than words: hex (a checksum, a UUID); letters and digits in one unbroken run,
 *  or with more digits than names carry; or both cases with more capitals than camelCase words have. A target triple
 *  (x86_64-unknown-linux-gnu), a package name, a long word or an identifier stay. */
function tokenLike(run: string) {
  const digits = run.replace(/\D/g, "").length;
  const letters = run.replace(/[^A-Za-z]/g, "").length;
  const capitals = run.replace(/[^A-Z]/g, "").length;
  if (/^[\da-f-]+$/i.test(run)) return digits > 0;
  if (digits && letters && (!/[-_]/.test(run) || digits * 4 > run.length)) return true;
  return capitals > 0 && capitals < letters && capitals * 4 > letters;
}

/** `text` with the person's home path as ~ and token-like strings as •••; the rest as it came. */
export function redactFreeText(text: string): string {
  return text
    .replace(WINDOWS_HOME, "~")
    .replace(HOME, "~")
    .replace(URL_CREDENTIALS, `$1${MASK}@`)
    .replace(AUTHORIZATION, `$1${MASK}`)
    .replace(BEARER, `$1${MASK}`)
    .replace(NAMED_SECRET, `$1$2${MASK}`)
    .replace(JWT, MASK)
    .replace(PAIRING_CODE, `$1${MASK}`)
    .replace(LONG_RUN, (run) => tokenLike(run) ? MASK : run);
}
