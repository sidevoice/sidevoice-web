/* Which languages a model supports, as the transcription and voice blocks say them (ModelLanguages.tsx): the engine's
 * list, with the interface language and the one chosen brought to the front, and whether the language in use is in it.
 * Languages are compared by their primary subtag ("en-GB" is English, "zh-Hans" is Chinese). */

/** A language's primary subtag, lower-case: "en-US" → "en", "zh_Hans" → "zh". */
export function languagePrimary(tag: string) {
  return tag.split(/[-_]/)[0].toLowerCase();
}

/** `tags` with those of `front`'s languages first, in `front`'s order (the interface's, then the chosen one), then the
 *  rest. The engine's order is kept within each group: it carries meaning (Whisper's is by training data), so it is
 *  never sorted. An empty or repeated entry of `front` moves nothing. */
export function orderLanguages(tags: readonly string[], front: readonly (string | null | undefined)[]) {
  const primaries = [...new Set(front.filter((language): language is string => !!language).map(languagePrimary))];
  const first = primaries.flatMap((primary) => tags.filter((tag) => languagePrimary(tag) === primary));
  return [...first, ...tags.filter((tag) => !primaries.includes(languagePrimary(tag)))];
}

/** Whether `wanted` is one of `tags`' languages; an empty list is an unknown one, and says nothing against it. */
export function languageSupported(tags: readonly string[], wanted: string) {
  return !tags.length || tags.some((tag) => languagePrimary(tag) === languagePrimary(wanted));
}

/** Whether `tag` is one of `languages` (empty entries are none). */
export function languageAmong(tag: string, languages: readonly (string | null | undefined)[]) {
  return languages.some((language) => !!language && languagePrimary(language) === languagePrimary(tag));
}

/** A language's name in the interface's language (the page's `lang`), as the panes list it. */
export function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
