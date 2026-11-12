// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0

//: mycurrencycollection.com's two lookups. The site fills its results in with
//: JavaScript; the software only opens the page for the owner to read and
//: never fetches or stores what it shows.
const FANCY_CHECKER =
  'https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/'
const STAR_LOOKUP = 'https://www.mycurrencycollection.com/reference/star-notes/lookup/'

/**
 * The fancy-serial checker's page for a serial, or null unless the serial has
 * exactly eight digits (letters, spaces and a star are not passed).
 */
export function fancyCheckerUrl(serial) {
  const digits = String(serial ?? '').replace(/\D/g, '')
  return digits.length === 8 ? FANCY_CHECKER + digits : null
}

/**
 * The star-note lookup's page, or null unless the serial has a star and the
 * face value and series year are known.
 *
 * `face` is the whole-dollar face value, `seriesYear` the year's digits alone
 * (2017 for a 2017A note), and the serial is passed as recorded with its
 * spaces removed.
 */
export function starLookupUrl({ face, seriesYear, serial }) {
  const text = String(serial ?? '').replace(/\s+/g, '')
  const dollars = Number.parseInt(face, 10)
  const year = String(seriesYear ?? '').replace(/\D/g, '')
  if (!text.includes('*') || !Number.isInteger(dollars) || dollars < 1 || !year) {
    return null
  }
  return `${STAR_LOOKUP}${dollars}/${year}/${text}`
}

/**
 * The whole-dollar face value a US note's denomination code names
 * (`usd_note_5_00` is 5), or null for anything else.
 */
export function faceFromDenomination(code) {
  const match = /^usd_note_(\d+)_\d{2}$/.exec(String(code ?? ''))
  return match ? Number.parseInt(match[1], 10) : null
}
