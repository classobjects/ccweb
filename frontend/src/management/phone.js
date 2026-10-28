/**
 * The country code a phone box starts with. Numbers are kept whole in E.164
 * so they are dialable from anywhere; the box is prefilled with the code
 * rather than storing it separately, since two columns could disagree.
 */
export const PHONE_DEFAULT_CC = '+1'

/**
 * A phone box's text as it is sent: '' when nothing was typed after the
 * country code it started with, else the text trimmed -- the server checks
 * it is E.164 and drops spaces, brackets, dashes and dots.
 */
export function phoneTyped(text) {
  const typed = (text ?? '').trim()
  return typed === PHONE_DEFAULT_CC ? '' : typed
}
