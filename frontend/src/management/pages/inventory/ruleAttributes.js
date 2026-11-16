// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0

/**
 * The attributes the editor shows and Save sends, as codes.
 *
 * `ruled` is the set as the rules leave it: the preview's answer while the
 * item is being edited (`POST /inventory/{id}/preview` runs Save's rules, so
 * a serial typed as a radar already holds Radar there), the saved set
 * otherwise. Until the person touches the attributes, that set is what is
 * shown -- and nothing is sent, since Save derives the same set itself.
 *
 * Once they have, `chosen` is their set and `against` is the ruled set they
 * chose it beside. What the rules have done since carries over: a code they
 * have added since joins it, and one they have taken back since leaves it.
 * Anything else the person decided stays decided -- a code they took off is
 * in `against`, so the rules adding it again is no news and it stays off.
 */
export function shownAttributes(chosen, against, ruled) {
  if (chosen === undefined) return ruled
  const added = ruled.filter(
    (code) => !against.includes(code) && !chosen.includes(code),
  )
  const takenBack = new Set(against.filter((code) => !ruled.includes(code)))
  return [...chosen.filter((code) => !takenBack.has(code)), ...added]
}
