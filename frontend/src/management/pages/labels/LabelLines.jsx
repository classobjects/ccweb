// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import LabelBar from './LabelBar'
import { keyedLines, splitBar } from './layout'

/** A color as the swatch's tooltip names it. */
const colorName = (color) => color ?? 'blank'

/**
 * A label's lines as a list on the screen shows them -- the print batch, To
 * apply: its color bar as a small swatch beside the lines, the bar line
 * itself not shown as text. Each line scrolls in its cell when too long.
 */
export default function LabelLines({ lines }) {
  const { text, bar } = splitBar(lines)
  return (
    <div className="label-lines">
      {bar && (
        <LabelBar
          bar={bar}
          className="label-bar-inline"
          title={`Color bar: metal ${colorName(bar.metal)}, cost ${colorName(bar.cost)}`}
        />
      )}
      <div className="label-lines-text">
        {keyedLines(text).map(({ line, key }) => (
          <div key={key} className="cell-scroll">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
