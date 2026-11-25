// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useLayoutEffect, useRef } from 'react'

import {
  NO_CORRECTION,
  cellBox,
  correctedBox,
  fittedSize,
  keyedLines,
  placeLabels,
  sheetLayout,
  splitBar,
} from './layout'
import LabelBar from './LabelBar'

/** Inches as a CSS length, rounded past anything a printer can place. */
const inch = (value) => `${+value.toFixed(4)}in`

/** A computed CSS length in points; NaN for anything but px or pt. */
function points(length) {
  const value = Number.parseFloat(length)
  if (length.endsWith('px')) return value * 0.75
  if (length.endsWith('pt')) return value
  return Number.NaN
}

/**
 * Set every line too wide for its label smaller, down to the minimum its
 * sheet allows; past that its ellipsis cuts it.
 *
 * Measured, not estimated: each line's laid-out width against the width it
 * has, in the font it prints in. Text width scales with its size, so one
 * measurement says the size that fits. Every width is read before any size
 * is written, so a run of thousands of lines is laid out twice, not once a
 * line. The sizes are set in labels.css, per sheet.
 */
function fitLines(container) {
  const overflowing = [...container.querySelectorAll('.label-line')]
    .map((line) => ({ line, available: line.clientWidth, needed: line.scrollWidth }))
    .filter(({ available, needed }) => needed > available && available > 0)
  const sized = overflowing.map(({ line, available, needed }) => {
    const style = getComputedStyle(line)
    const size = points(style.fontSize)
    const minimum = points(style.getPropertyValue('--label-min-size').trim())
    return { line, size: fittedSize(size, minimum, available, needed), base: size }
  })
  for (const { line, size, base } of sized) {
    if (Number.isFinite(size) && size < base) line.style.fontSize = `${size}pt`
  }
}

/**
 * A run's labels laid out for printing: one `.label-page` per sheet, US
 * Letter, each label placed in inches where its cell is on the product.
 *
 * The first sheet is filled from `start`, every further one from cell 1.
 * Each line of a label is a `.label-line` of its own that never wraps: a
 * line too long is set smaller (`fitLines`), then cut with an ellipsis.
 * A label's closing `bar:` line is drawn as the color bar at its left edge
 * (`LabelBar`), not printed as text; the text moves right to clear it.
 * `outline` draws every cell's border on every page, for the test page
 * printed on plain paper and held against a sheet; with no labels it is
 * one blank page of outlines. `correction` is how large the printer prints
 * the page, percent across and down: every cell, outlines included, is laid
 * out larger by its inverse about the page's center (`correctedBox`), so
 * the printer's shrink lands it on its label.
 *
 * Shown only under `@media print` (labels.css); on the screen it is laid
 * out out of sight, so the lines can be measured before printing.
 */
export default function LabelSheets({
  sheet,
  labels,
  start,
  outline = false,
  correction = NO_CORRECTION,
}) {
  const layout = sheetLayout(sheet)
  const container = useRef(null)
  const places = placeLabels(labels.length, start, layout.cells)
  // An outlined layout has a page even with no labels: the blank test page.
  const lastSheet = places.at(-1)?.sheet ?? (outline ? 0 : -1)
  const pages = Array.from({ length: lastSheet + 1 }, (_, n) => ({
    number: n + 1,
    placed: [],
  }))
  places.forEach((place, i) =>
    pages[place.sheet].placed.push({ ...place, label: labels[i] }),
  )

  useLayoutEffect(() => fitLines(container.current))

  const pageClass = [
    'label-page',
    `label-sheet-${layout.code}`,
    layout.rounded ? 'rounded' : '',
    outline ? 'outlined' : '',
  ]
    .filter(Boolean)
    .join(' ')

  function placed(cell) {
    const box = correctedBox(cellBox(layout, cell), correction)
    return {
      left: inch(box.left),
      top: inch(box.top),
      width: inch(box.width),
      height: inch(box.height),
    }
  }

  return (
    <div ref={container} className="label-sheets">
      {pages.map((page) => (
        <section key={page.number} className={pageClass}>
          {outline &&
            Array.from({ length: layout.cells }, (_, i) => (
              <div key={`cell-${i + 1}`} className="label-cell" style={placed(i + 1)} />
            ))}
          {page.placed.map(({ cell, label }) => {
            const { text, bar } = splitBar(label.lines)
            return (
              <div
                key={label.item_id}
                className={bar ? 'label has-bar' : 'label'}
                style={placed(cell)}
              >
                {bar && <LabelBar bar={bar} />}
                {keyedLines(text).map(({ line, key }) => (
                  <div key={key} className="label-line">
                    {line}
                  </div>
                ))}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
