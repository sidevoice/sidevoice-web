/* A device's name as the machines take it (sidevoice-core pairing.rs `new_name`): its whitespace collapsed to single
 * spaces, 1 to 60 characters (Unicode scalar values, as Rust counts them — not UTF-16 units), no control character or
 * bidirectional override, and something visible in it. Cut short, a name is cut between graphemes, never inside an
 * emoji or a letter with its marks, so what is sent is always one a machine accepts. */

export const MAX_DEVICE_NAME = 60;

const BIDI_OVERRIDE = /[‪-‮⁦-⁩]/u;
const CONTROL = /\p{Cc}/u;
/** Characters that draw nothing (zero-width, joiners, fillers, variation selectors…): allowed in a name, not as all of it. */
const INVISIBLE = /^[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯⠀ㅤ︀-️﻿ﾠ￹-￻\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}\s]*$/u;

/** `text` with its whitespace collapsed, as the machine will keep it. */
export function normalizeDeviceName(text) {
  return String(text ?? '').split(/\s+/u).filter(Boolean).join(' ');
}

/** The scalar values of `text`, as a machine counts its length. */
const length = (text) => [...text].length;

/** `text` normalized and cut to `max` characters at a grapheme boundary (Intl.Segmenter where there is one, else by
 *  scalar value — never inside a surrogate pair). */
export function clampDeviceName(text, max = MAX_DEVICE_NAME) {
  const name = normalizeDeviceName(text);
  if (length(name) <= max) return name;
  const pieces = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)].map((piece) => piece.segment)
    : [...name];
  let kept = '';
  for (const piece of pieces) {
    if (length(kept + piece) > max) break;
    kept += piece;
  }
  return kept.trimEnd();
}

/**
 * What a machine would refuse in `text`, or null: `empty` (nothing visible), `tooLong` (over 60 characters), `invalid`
 * (a control character or a bidirectional override).
 * @param {string} text @returns {'empty' | 'tooLong' | 'invalid' | null}
 */
export function deviceNameProblem(text) {
  const name = normalizeDeviceName(text);
  if (CONTROL.test(name) || BIDI_OVERRIDE.test(name)) return 'invalid';
  if (!name || INVISIBLE.test(name)) return 'empty';
  if (length(name) > MAX_DEVICE_NAME) return 'tooLong';
  return null;
}
