// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LabelSheets from './LabelSheets'
import { SL564, SL597 } from './sheets.fixture'

function coins(count) {
  return Array.from({ length: count }, (_, i) => ({
    item_id: i + 1,
    item_code: `CC-${String(9900 + i).padStart(6, '0')}`,
    lines: [String(9900 + i).padStart(6, '0'), '1921-S', 'Silver'],
  }))
}

const inches = (value) => Number.parseFloat(value)

/**
 * The real labels.css in the document, where the sizes are set. Read from
 * disk: Vitest replaces CSS imports with empty strings.
 */
function withStylesheet() {
  const here = dirname(expect.getState().testPath)
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(here, 'labels.css'), 'utf8')
  document.head.append(style)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.head.innerHTML = ''
})

describe('LabelSheets', () => {
  it('puts 23 labels from cell 37 on one page, the first in cell 37', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(23)} start={37} />,
    )
    expect(container.querySelectorAll('.label-page')).toHaveLength(1)
    const labels = container.querySelectorAll('.label')
    expect(labels).toHaveLength(23)
    const first = labels[0]
    expect(first.style.left).toMatch(/in$/)
    expect(inches(first.style.left)).toBeCloseTo(0.333 + 6 * (0.625 + 0.176), 4)
    expect(inches(first.style.top)).toBeCloseTo(0.3345 + 3 * (0.5 + 0.1556), 4)
    expect(inches(first.style.width)).toBeCloseTo(0.625, 4)
    expect(inches(first.style.height)).toBeCloseTo(0.5, 4)
  })

  it('sets every line in a line of its own that never wraps', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(2)} start={1} />,
    )
    const lines = [...container.querySelectorAll('.label > *')]
    expect(lines).toHaveLength(6)
    for (const line of lines) expect(line).toHaveClass('label-line')
    expect(lines.slice(0, 3).map((line) => line.textContent)).toEqual([
      '009900',
      '1921-S',
      'Silver',
    ])
  })

  it('starts a new page, from cell 1, when the sheet is full', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(3)} start={159} />,
    )
    const pages = container.querySelectorAll('.label-page')
    expect(pages).toHaveLength(2)
    const onSecond = pages[1].querySelector('.label')
    expect(inches(onSecond.style.left)).toBeCloseTo(0.333, 4)
    expect(inches(onSecond.style.top)).toBeCloseTo(0.3345, 4)
  })

  it('marks each sheet for its product, so the type sets its sizes', () => {
    const { container } = render(
      <LabelSheets sheet={SL564} labels={coins(1)} start={1} />,
    )
    expect(container.querySelector('.label-page')).toHaveClass('label-sheet-SL564')
  })

  it('draws no outlines on labels', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(2)} start={1} />,
    )
    expect(container.querySelectorAll('.label-cell')).toHaveLength(0)
    expect(container.querySelector('.label-page')).not.toHaveClass('outlined')
  })

  it('outlines every cell of every page for the test page', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(3)} start={159} outline />,
    )
    expect(container.querySelectorAll('.label-cell')).toHaveLength(320)
    expect(container.querySelector('.label-page')).toHaveClass('outlined')
  })

  it('sets a line too long for the label smaller, down to the minimum', () => {
    withStylesheet()
    // jsdom does no layout: every line reports more width than it has.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(110)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    const { container } = render(
      <LabelSheets sheet={SL564} labels={coins(1)} start={1} />,
    )
    const line = container.querySelector('.label-line')
    // 10% too wide: 7.5pt * 100/110 = 6.82pt, to the quarter below.
    expect(line.style.fontSize).toBe('6.75pt')
  })

  it('stops at the minimum size, leaving the rest to the ellipsis', () => {
    withStylesheet()
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    const { container } = render(
      <LabelSheets sheet={SL564} labels={coins(1)} start={1} />,
    )
    expect(container.querySelector('.label-line').style.fontSize).toBe('5pt')
  })

  it('leaves a line that fits at the size its sheet sets', () => {
    const { container } = render(
      <LabelSheets sheet={SL597} labels={coins(1)} start={1} />,
    )
    expect(container.querySelector('.label-line').style.fontSize).toBe('')
  })
})
