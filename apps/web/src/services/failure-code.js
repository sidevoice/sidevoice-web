/* The stable code of a failure, whatever threw it. The engine, the voice and this page reject with a string `code`;
 * the browser's own exceptions (a DOMException) carry a legacy numeric `code` (18 for a SecurityError) that is no
 * code at all, and say what they are by `name`. */

/**
 * `error`'s code: its string `code`, else the name of a platform exception (`SecurityError`, `NotAllowedError`, …),
 * else `fallback`.
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function failureCode(error, fallback = 'failed') {
  const failure = /** @type {{code?: unknown, name?: unknown} | null | undefined} */ (error);
  if (typeof failure?.code === 'string' && failure.code) return failure.code;
  if (typeof failure?.name === 'string' && failure.name && failure.name !== 'Error') return failure.name;
  return fallback;
}

/**
 * The code of a failure of the engine on this page. It keeps its models in this origin's private storage (OPFS), and
 * a browser that will not let the page store anything (site data blocked, a private window) refuses that with a
 * SecurityError: `storage-blocked`.
 * @param {unknown} error
 * @param {string} [fallback]
 */
export function engineFailureCode(error, fallback = 'engine-unavailable') {
  const code = failureCode(error, fallback);
  return code === 'SecurityError' ? 'storage-blocked' : code;
}
