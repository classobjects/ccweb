// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * What a scanned label says, from the text the reader saw.
 *
 * A holder label opens with the item's number, its code without the prefix
 * and dash (`labels.printed_number`): `002427`, or `000412_02` for a piece
 * of a split item. On a note's label more follows on that line (Fr,
 * Coolness); a coin's carries the number alone.
 */

//: Six digits, and a split piece's `_NN`, standing on their own.
const NUMBER = String.raw`(\d{6}(?:_\d{2})?)(?![\d_])`

const LINE_START = new RegExp(`^${NUMBER}`)
const ANYWHERE = new RegExp(String.raw`(?<![\d_])${NUMBER}`)

/**
 * The item number in `text`, or null: the first line that opens with one,
 * else the first standing anywhere. Spaces the reader puts inside a word
 * (`0024 27`) are not joined: a guess there could name another item.
 */
export function labelNumber(text) {
  const lines = String(text)
    .split('\n')
    .map((line) => line.trim())
  for (const line of lines) {
    const match = LINE_START.exec(line)
    if (match) return match[1]
  }
  return ANYWHERE.exec(String(text))?.[1] ?? null
}

/**
 * The address a found item opens: `template` with `{item_code}` and
 * `{view}` (`coins` or `currency`, the inventory screen it is listed on)
 * filled in.
 */
export function lookupAddress(template, itemCode, view) {
  return template
    .replaceAll('{item_code}', encodeURIComponent(itemCode))
    .replaceAll('{view}', encodeURIComponent(view))
}

//: The console's own addresses start here (its router's basename).
const CONSOLE = '/management'

/**
 * Open `address`: one of the console's own with `navigate` (its router
 * path, without /management), any other as a page of its own.
 */
export function openAddress(
  address,
  navigate,
  assign = (to) => window.location.assign(to),
) {
  if (address === CONSOLE || address.startsWith(`${CONSOLE}/`)) {
    navigate(address.slice(CONSOLE.length) || '/')
  } else {
    assign(address)
  }
}

/**
 * Counts the same number read on frames in a row: a number is taken only
 * once it has been read `needed` times running, so a single misread frame
 * never opens an item.
 */
export class SteadyReading {
  constructor(needed = 2) {
    this.needed = needed
    this.last = null
    this.count = 0
  }

  /** Note one frame's number (null for none); the number once it is steady. */
  see(number) {
    this.count = number !== null && number === this.last ? this.count + 1 : 1
    this.last = number
    return number !== null && this.count >= this.needed ? number : null
  }

  /** Start over, as for the next label. */
  reset() {
    this.last = null
    this.count = 0
  }
}
