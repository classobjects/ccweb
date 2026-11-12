// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useLayoutEffect, useRef } from 'react'

import { cellBox, fittedSize, placeLabels, sheetLayout } from './layout'

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
 * `outline` draws every cell's border on every page, for the test page
 * printed on plain paper and held against a sheet.
 *
 * Shown only under `@media print` (labels.css); on the screen it is laid
 * out out of sight, so the lines can be measured before printing.
 */
export default function LabelSheets({ sheet, labels, start, outline = false }) {
  const layout = sheetLayout(sheet)
  const container = useRef(null)
  const places = placeLabels(labels.length, start, layout.cells)
  const pages = Array.from(
    { length: places.length ? places[places.length - 1].sheet + 1 : 0 },
    () => [],
  )
  places.forEach((place, i) => pages[place.sheet].push({ ...place, label: labels[i] }))

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
    const box = cellBox(layout, cell)
    return {
      left: inch(box.left),
      top: inch(box.top),
      width: inch(box.width),
      height: inch(box.height),
    }
  }

  return (
    <div ref={container} className="label-sheets">
      {pages.map((page, number) => (
        <section key={number} className={pageClass}>
          {outline &&
            Array.from({ length: layout.cells }, (_, i) => (
              <div key={`cell-${i + 1}`} className="label-cell" style={placed(i + 1)} />
            ))}
          {page.map(({ cell, label }) => (
            <div key={label.item_id} className="label" style={placed(cell)}>
              {label.lines.map((line, i) => (
                <div key={i} className="label-line">
                  {line}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
