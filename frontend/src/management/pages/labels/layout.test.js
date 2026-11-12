// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import { cellBox, endOf, fittedSize, placeLabels, sheetLayout } from './layout'
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
  })
})
