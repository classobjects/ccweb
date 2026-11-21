// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import {
  cellBox,
  correctedBox,
  endOf,
  fittedSize,
  keyedLines,
  normalCorrection,
  placeLabels,
  sheetLayout,
} from './layout'
import { SL564, SL597 } from './sheets.fixture'

describe('placeLabels', () => {
  it('fills the first sheet from the start cell and later sheets from cell 1', () => {
    expect(placeLabels(3, 159, 160)).toEqual([
      { sheet: 0, cell: 159 },
      { sheet: 0, cell: 160 },
      { sheet: 1, cell: 1 },
    ])
  })

  it('takes the last cell', () => {
    expect(placeLabels(1, 160, 160)).toEqual([{ sheet: 0, cell: 160 }])
  })

  it('refuses a start cell the sheet does not have', () => {
    expect(() => placeLabels(1, 161, 160)).toThrow(RangeError)
    expect(() => placeLabels(1, 0, 160)).toThrow(RangeError)
  })

  it('places nothing for no labels', () => {
    expect(placeLabels(0, 5, 160)).toEqual([])
  })
})

describe('endOf', () => {
  it('says how many sheets a run takes and the cell it ends at', () => {
    expect(endOf(23, 37, 160)).toEqual({ sheets: 1, cell: 59, first: 23 })
    expect(endOf(23, 150, 160)).toEqual({ sheets: 2, cell: 12, first: 11 })
    expect(endOf(400, 1, 160)).toEqual({ sheets: 3, cell: 80, first: 160 })
  })
})

describe('cellBox', () => {
  it('places a cell in inches from the margins, labels and gaps', () => {
    const box = cellBox(sheetLayout(SL597), 37)
    expect(box.left).toBeCloseTo(0.333 + 6 * (0.625 + 0.176), 6)
    expect(box.top).toBeCloseTo(0.3345 + 3 * (0.5 + 0.1556), 6)
    expect(box.width).toBe(0.625)
    expect(box.height).toBe(0.5)
  })

  // The products' published measures are rounded -- SL564's 1.333in is
  // 4/3in -- so they sum to within 0.003in of the sheet, not to it exactly:
  // SL597 is 11.003in down, SL564 8.498in across and 11.001in down. Under a
  // tenth of a millimeter, inside the 0.06in safe border.
  it('ends the grid at the sheet edge less its margin, to the products’ rounding', () => {
    const box = cellBox(sheetLayout(SL597), 160)
    expect(box.left + box.width).toBeCloseTo(8.5 - 0.333, 2)
    expect(box.top + box.height).toBeCloseTo(11 - 0.3345, 2)
    const note = cellBox(sheetLayout(SL564), 102)
    expect(note.left + note.width).toBeCloseTo(8.5 - 0.25, 2)
    expect(note.top + note.height).toBeCloseTo(11 - 0.188, 2)
  })
})

describe('correctedBox', () => {
  const printed = (value, scale, center) => center + (value - center) * scale

  it('leaves a box alone at 100%', () => {
    const box = cellBox(sheetLayout(SL564), 1)
    expect(correctedBox(box, { across: 100, down: 100 })).toEqual(box)
  })

  it('lays a box out larger about the page center, so the printer lands it on its cell', () => {
    const box = cellBox(sheetLayout(SL564), 102)
    const laid = correctedBox(box, { across: 97, down: 97.5 })
    // What the printer makes of the corrected box is the box itself.
    expect(printed(laid.left, 0.97, 4.25)).toBeCloseTo(box.left, 6)
    expect(printed(laid.top, 0.975, 5.5)).toBeCloseTo(box.top, 6)
    expect(laid.width * 0.97).toBeCloseTo(box.width, 6)
    expect(laid.height * 0.975).toBeCloseTo(box.height, 6)
  })

  it('keeps the corner cells on the page at a 95% printer', () => {
    const layout = sheetLayout(SL597)
    const first = correctedBox(cellBox(layout, 1), { across: 95, down: 95 })
    const last = correctedBox(cellBox(layout, 160), { across: 95, down: 95 })
    expect(first.left).toBeGreaterThan(0)
    expect(first.top).toBeGreaterThan(0)
    expect(last.left + last.width).toBeLessThan(8.5)
    expect(last.top + last.height).toBeLessThan(11)
  })
})

describe('normalCorrection', () => {
  it('keeps a percent from 90 to 110', () => {
    expect(normalCorrection({ across: 97.5, down: '102' })).toEqual({
      across: 97.5,
      down: 102,
    })
  })

  it('takes 100% for anything missing, not a number, or out of range', () => {
    expect(normalCorrection(null)).toEqual({ across: 100, down: 100 })
    expect(normalCorrection({ across: 'x', down: 89.9 })).toEqual({
      across: 100,
      down: 100,
    })
    expect(normalCorrection({ across: 110.1 })).toEqual({ across: 100, down: 100 })
  })
})

describe('fittedSize', () => {
  it('keeps the size of a line that fits', () => {
    expect(fittedSize(7, 5, 100, 80)).toBe(7)
  })

  it('sets a long line smaller, in quarter points, by how far it overflows', () => {
    // 7pt * 100/120 = 5.83pt, down to the quarter: 5.75pt.
    expect(fittedSize(7, 5, 100, 120)).toBe(5.75)
  })

  it('stops at the minimum, leaving the rest to the ellipsis', () => {
    expect(fittedSize(7, 5, 100, 300)).toBe(5)
  })

  it('leaves a line it cannot measure alone', () => {
    expect(fittedSize(7, 5, 0, 0)).toBe(7)
    expect(fittedSize(7, 5, Number.NaN, 120)).toBe(7)
    expect(fittedSize(7, 5, 100, undefined)).toBe(7)
  })
})

describe('keyedLines', () => {
  it('keys each line by its text, telling equal lines apart', () => {
    expect(keyedLines(['004521', 'Silver', 'Silver'])).toEqual([
      { line: '004521', key: '0:004521' },
      { line: 'Silver', key: '0:Silver' },
      { line: 'Silver', key: '1:Silver' },
    ])
  })
})
