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

/**
 * The font size, in points, of a line `needed` wide in a space `available`
 * wide at `size` points: unchanged when it fits, else smaller in proportion
 * (text width scales with its size), down to the quarter point, and never
 * below `minimum` -- past that the line's ellipsis cuts it. A line not laid
 * out (both widths 0) is left at `size`.
 */
export function fittedSize(size, minimum, available, needed) {
  if (!(needed > available) || !(available > 0)) return size
  const scaled = Math.floor(((size * available) / needed) * 4) / 4
  return Math.max(minimum, scaled)
}
