// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Where holder labels go on a sheet (holder-labels-design.md, section 4,
 * "The sheets" and "Printing").
 *
 * Cells are numbered left to right, top to bottom, from 1. A run starts at
 * any cell of its first sheet; every further sheet starts at cell 1.
 * Measures are inches, as `GET /api/labels/sheets` gives them.
 */

/**
 * The sheet's measures as numbers: the API sends its Decimals as strings.
 */
export function sheetLayout(sheet) {
  return {
    code: sheet.code,
    name: sheet.name,
    columns: Number(sheet.columns),
    rows: Number(sheet.rows),
    width: Number(sheet.width),
    height: Number(sheet.height),
    top: Number(sheet.top),
    left: Number(sheet.left),
    gapX: Number(sheet.gap_x),
    gapY: Number(sheet.gap_y),
    rounded: Boolean(sheet.rounded),
    cells: Number(sheet.cells),
  }
}

/**
 * The sheet and cell of each of `count` labels started at `startCell`:
 * sheet 0 from `startCell`, each later sheet from cell 1.
 *
 * @throws {RangeError} when the sheet has no cell `startCell`.
 */
export function placeLabels(count, startCell, cells) {
  if (!Number.isInteger(startCell) || startCell < 1 || startCell > cells) {
    throw new RangeError(`Cell ${startCell} is not on a sheet of ${cells}.`)
  }
  return Array.from({ length: count }, (_, i) => {
    const slot = startCell - 1 + i
    return { sheet: Math.floor(slot / cells), cell: (slot % cells) + 1 }
  })
}

/**
 * Where a run of `count` labels from `startCell` ends: how many sheets it
 * takes, the cell of the last sheet its last label is in, and how many
 * labels the first sheet holds.
 */
export function endOf(count, startCell, cells) {
  const last = startCell - 1 + count - 1
  return {
    sheets: Math.floor(last / cells) + 1,
    cell: (last % cells) + 1,
    first: Math.min(count, cells - startCell + 1),
  }
}

/**
 * The line under a run's sheet: how many labels, from which cell, and where
 * the run ends -- on this sheet, the next, or a later one.
 */
export function runCaption(count, start, cells) {
  if (count === 1) return `1 label at cell ${start}.`
  const end = endOf(count, start, cells)
  const from = `${count} labels from cell ${start}`
  if (end.sheets === 1) return `${from}, ending at cell ${end.cell}.`
  if (end.sheets === 2) {
    return (
      `${from}: ${end.first} on this sheet, ${count - end.first} on the next, ` +
      `ending at cell ${end.cell}.`
    )
  }
  return (
    `${from}: ${end.first} on this sheet, then ${end.sheets - 1} more sheets, ` +
    `ending at cell ${end.cell} of the last.`
  )
}

/** A cell's box on the sheet, in inches from its top left corner. */
export function cellBox(layout, cell) {
  const column = (cell - 1) % layout.columns
  const row = Math.floor((cell - 1) / layout.columns)
  return {
    left: layout.left + column * (layout.width + layout.gapX),
    top: layout.top + row * (layout.height + layout.gapY),
    width: layout.width,
    height: layout.height,
  }
}

/** US Letter, the page every sheet is printed on, in inches. */
const PAGE = { width: 8.5, height: 11 }

/** The narrowest and widest a printer correction may say, in percent. */
export const CORRECTION_RANGE = { min: 90, max: 110 }

/** No correction: the printer prints the page at its size. */
export const NO_CORRECTION = { across: 100, down: 100 }

/**
 * A printer correction as numbers: each of `across` and `down` a percent
 * from 90 to 110, and 100 for anything else (nothing stored, a stale or
 * mistyped value).
 */
export function normalCorrection(correction) {
  const percent = (value) => {
    const n = Number(value)
    const inRange =
      value !== null &&
      value !== '' &&
      Number.isFinite(n) &&
      n >= CORRECTION_RANGE.min &&
      n <= CORRECTION_RANGE.max
    return inRange ? n : 100
  }
  return { across: percent(correction?.across), down: percent(correction?.down) }
}

/**
 * Where to lay `box` out so a printer that prints the page at `correction`
 * (percent across and down) puts it where it is on the sheet.
 *
 * A printer that fits the whole Letter page into the part it can print
 * shrinks it about the page's center. The box is moved away from the center
 * and made larger by the inverse, so that shrink brings it back.
 */
export function correctedBox(box, correction) {
  // Untouched, not recomputed: no rounding moves an uncorrected label.
  if (correction.across === 100 && correction.down === 100) return box
  const across = correction.across / 100
  const down = correction.down / 100
  const cx = PAGE.width / 2
  const cy = PAGE.height / 2
  return {
    left: cx + (box.left - cx) / across,
    top: cy + (box.top - cy) / down,
    width: box.width / across,
    height: box.height / down,
  }
}

/** What starts a label's closing line naming its bar colors (`app.labels`). */
export const BAR_PREFIX = 'bar: '

/** A color as the bar line may name one: `#` and six hexadecimal digits. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * A label's lines split into the text it prints and the colors of the bar
 * at its left edge (holder-labels-design.md, "The color bar").
 *
 * The server ends every label with `bar: <metal> <cost>`, each a color or
 * `-` for a block left blank. `bar` is null when the last line is not one --
 * a label printed before the bar existed -- and each color is null when its
 * block is blank or names no color.
 */
export function splitBar(lines) {
  const last = lines.at(-1)
  if (typeof last !== 'string' || !last.startsWith(BAR_PREFIX)) {
    return { text: lines, bar: null }
  }
  const [metal, cost] = last.slice(BAR_PREFIX.length).split(' ')
  const color = (value) => (HEX_COLOR.test(value ?? '') ? value : null)
  return { text: lines.slice(0, -1), bar: { metal: color(metal), cost: color(cost) } }
}

/** The bar line for these two colors, as the server writes it; null is blank. */
export function barLine(metal, cost) {
  return `${BAR_PREFIX}${metal || '-'} ${cost || '-'}`
}

/**
 * A label's lines, each with a key of its own for a list: the text, and
 * which of its repeats it is, so two equal lines are told apart without
 * their place in the list.
 */
export function keyedLines(lines) {
  const seen = new Map()
  return lines.map((line) => {
    const repeat = seen.get(line) ?? 0
    seen.set(line, repeat + 1)
    return { line, key: `${repeat}:${line}` }
  })
}

/**
 * The font size, in points, of a line `needed` wide in a space `available`
 * wide at `size` points: unchanged when it fits, else smaller in proportion
 * (text width scales with its size), down to the quarter point, and never
 * below `minimum` -- past that the line's ellipsis cuts it. A line not laid
 * out (both widths 0) is left at `size`.
 */
export function fittedSize(size, minimum, available, needed) {
  // A width that is not a number leaves the size alone too.
  if (Number.isNaN(needed + available) || needed <= available || available <= 0) {
    return size
  }
  const scaled = Math.floor(((size * available) / needed) * 4) / 4
  return Math.max(minimum, scaled)
}
