// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { cellBox, runCaption, sheetLayout } from './layout'

//: The sheet the cells are drawn on, US Letter, in inches.
const SHEET_WIDTH = 8.5
const SHEET_HEIGHT = 11

/** A share of the sheet's width or height, as a CSS percentage. */
function percent(inches, of) {
  return `${+((inches / of) * 100).toFixed(4)}%`
}

/**
 * The first sheet of a run drawn to scale, every cell a button that starts
 * the run there.
 *
 * Cells before the start are shown used, the start marked, and the cells
 * the run fills on this sheet shaded; the caption says where it ends,
 * including onto further sheets, which always start at cell 1. Everything
 * is placed in percentages of the sheet, which keeps the shape of a Letter
 * page and takes the width of its container -- never wider, so a phone
 * does not scroll sideways.
 */
export default function SheetPicker({ sheet, count, start, onStart }) {
  const layout = sheetLayout(sheet)
  const lastHere = start + Math.min(count, layout.cells - start + 1) - 1
  const caption = runCaption(count, start, layout.cells)

  function state(cell) {
    if (cell < start) return 'used'
    if (cell === start) return 'start'
    if (cell <= lastHere) return 'fills'
    return ''
  }

  return (
    <figure className="sheet-picker">
      <div
        className={layout.rounded ? 'sheet-picker-sheet rounded' : 'sheet-picker-sheet'}
      >
        {Array.from({ length: layout.cells }, (_, i) => {
          const cell = i + 1
          const box = cellBox(layout, cell)
          return (
            <button
              key={cell}
              type="button"
              className={`sheet-picker-cell ${state(cell)}`.trim()}
              aria-label={`Start at cell ${cell}`}
              aria-pressed={cell === start}
              style={{
                left: percent(box.left, SHEET_WIDTH),
                top: percent(box.top, SHEET_HEIGHT),
                width: percent(box.width, SHEET_WIDTH),
                height: percent(box.height, SHEET_HEIGHT),
              }}
              onClick={() => onStart(cell)}
            >
              {cell}
            </button>
          )
        })}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
