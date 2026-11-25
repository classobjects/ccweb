// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LabelLines from './LabelLines'
import LabelSheets from './LabelSheets'
import { barLine, splitBar } from './layout'
import { barPalette, sampleLabels, swatchLabels } from './sampleLabels'
import { SL564, SL597 } from './sheets.fixture'

const SILVER = '#8c8c8c'
const RED = '#e02020'

/** Vocabulary values as `GET /api/reference/<table>` sends them. */
const METALS = [
  { code: 'silver', label: 'Silver', extra: { label_color: SILVER } },
  {
    code: 'silver_copper_clad',
    label: 'Silver-Copper Clad',
    extra: { label_color: SILVER, label_name: '40% Silver' },
  },
  { code: 'clad', label: 'Copper-Nickel Clad', extra: { label_color: '#ffffff' } },
  { code: 'zinc', label: 'Zinc', extra: {} },
]
const BANDS = [
  {
    code: '25_to_50',
    label: '$25 to $50',
    extra: { lower_bound: '25.00', color: RED },
  },
  {
    code: 'under_10',
    label: 'Under $10',
    extra: { lower_bound: '0.00', color: '#000000' },
  },
]

describe('splitBar', () => {
  it('takes the closing bar line off the text and reads its two colors', () => {
    const lines = ['004521', '1921-S', 'Silver', barLine(SILVER, RED)]
    expect(splitBar(lines)).toEqual({
      text: ['004521', '1921-S', 'Silver'],
      bar: { metal: SILVER, cost: RED },
    })
  })

  it('reads a dash as a blank block', () => {
    expect(splitBar(['1', 'bar: - #000000']).bar).toEqual({
      metal: null,
      cost: '#000000',
    })
    expect(barLine(null, null)).toBe('bar: - -')
  })

  it('leaves a label printed before the bar existed as it is', () => {
    expect(splitBar(['004521', 'Silver'])).toEqual({
      text: ['004521', 'Silver'],
      bar: null,
    })
  })
})

describe('the bar on a printed label', () => {
  it('draws both blocks in their colors and prints no bar text', () => {
    const { container } = render(
      <LabelSheets
        sheet={SL597}
        start={1}
        labels={[
          { item_id: 1, lines: ['004521', '1921-S', 'Silver', barLine(SILVER, RED)] },
        ]}
      />,
    )
    const label = container.querySelector('.label')
    expect(label).toHaveClass('has-bar')
    const blocks = label.querySelectorAll('.label-bar-block')
    expect([...blocks].map((b) => b.dataset.block)).toEqual(['metal', 'cost'])
    expect(blocks[0].style.backgroundColor).toBe('rgb(140, 140, 140)')
    expect(blocks[1].style.backgroundColor).toBe('rgb(224, 32, 32)')
    expect(label.textContent).not.toContain('bar:')
    expect(label.querySelectorAll('.label-line')).toHaveLength(3)
  })

  it('keeps a blank block in its place, unfilled', () => {
    const { container } = render(
      <LabelSheets
        sheet={SL564}
        start={1}
        labels={[{ item_id: 1, lines: ['000412', barLine(null, RED)] }]}
      />,
    )
    const [metal, cost] = container.querySelectorAll('.label-bar-block')
    expect(metal).not.toHaveClass('filled')
    expect(metal.style.backgroundColor).toBe('')
    expect(cost).toHaveClass('filled')
  })

  it('shows a waiting label its bar as a swatch beside its lines', () => {
    render(<LabelLines lines={['004521', 'Silver', barLine(SILVER, null)]} />)
    expect(
      screen.getByTitle(`Color bar: metal ${SILVER}, cost blank`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/bar:/)).not.toBeInTheDocument()
    expect(screen.getByText('004521')).toBeInTheDocument()
  })
})

describe('a striped metal', () => {
  it('reads its pattern from the bar line, and writes it back', () => {
    const line = barLine(SILVER, RED, 'striped')
    expect(line).toBe(`bar: ${SILVER}/striped ${RED}`)
    expect(splitBar(['1', line]).bar).toEqual({
      metal: SILVER,
      metalPattern: 'striped',
      cost: RED,
    })
    // An unknown pattern is drawn solid; a pattern on no color is blank.
    expect(splitBar(['1', `bar: ${SILVER}/dotted -`]).bar.metalPattern).toBeUndefined()
    expect(barLine(null, RED, 'striped')).toBe(`bar: - ${RED}`)
  })

  it('draws the stripes on the metal block only', () => {
    const { container } = render(
      <LabelSheets
        sheet={SL597}
        start={1}
        labels={[{ item_id: 1, lines: ['1', barLine(SILVER, RED, 'striped')] }]}
      />,
    )
    const [metal, cost] = container.querySelectorAll('.label-bar-block')
    expect(metal).toHaveClass('filled', 'striped')
    expect(cost).not.toHaveClass('striped')
  })

  it('is a swatch of its own beside the solid metal of its color', () => {
    const palette = barPalette(
      [
        ...METALS,
        {
          code: 'colorized_silver',
          label: 'Colorized Silver',
          extra: {
            label_color: SILVER,
            label_pattern: 'striped',
            label_name: 'Color Ag',
          },
        },
      ],
      BANDS,
    )
    expect(palette.metals).toEqual([
      { color: SILVER, name: 'Silver, 40% Silver' },
      { color: '#ffffff', name: 'Copper-Nickel Clad' },
      { color: SILVER, pattern: 'striped', name: 'Color Ag' },
    ])
    const striped = swatchLabels(palette)[2]
    expect(striped.lines.slice(0, 3)).toEqual([
      'Metal',
      'Color Ag',
      `${SILVER} striped`,
    ])
    expect(splitBar(striped.lines).bar.metalPattern).toBe('striped')
  })
})

describe('barPalette', () => {
  it('groups metals by color, leaves out the uncolored, and orders brackets', () => {
    expect(barPalette(METALS, BANDS)).toEqual({
      metals: [
        { color: SILVER, name: 'Silver, 40% Silver' },
        { color: '#ffffff', name: 'Copper-Nickel Clad' },
      ],
      costs: [
        { color: '#000000', name: 'Under $10', bound: 0 },
        { color: RED, name: '$25 to $50', bound: 25 },
      ],
    })
  })

  it('is empty until the vocabularies load', () => {
    expect(barPalette(undefined, undefined)).toEqual({ metals: [], costs: [] })
  })
})

describe('the test pages', () => {
  const palette = barPalette(METALS, BANDS)

  it('give every sample a bar, taking each pairing in turn', () => {
    const samples = sampleLabels(SL597, palette)
    const bars = samples.map((s) => splitBar(s.lines).bar)
    expect(bars.every(Boolean)).toBe(true)
    // Costs change cell to cell, metals each full turn of the costs, and a
    // blank metal block comes round too.
    expect(bars.slice(0, 6)).toEqual([
      { metal: SILVER, cost: '#000000' },
      { metal: SILVER, cost: RED },
      { metal: '#ffffff', cost: '#000000' },
      { metal: '#ffffff', cost: RED },
      { metal: null, cost: '#000000' },
      { metal: null, cost: RED },
    ])
    expect(splitBar(samples[0].lines).text).toEqual(['900001', '1964 D', '40% Silver'])
  })

  it('print samples without a bar while there are no colors', () => {
    const [first] = sampleLabels(SL597, barPalette([], []))
    expect(first.lines).toEqual(['900001', '1964 D', '40% Silver'])
  })

  it('print a named swatch for each color, only its own block filled', () => {
    const swatches = swatchLabels(palette)
    expect(swatches.map((s) => s.lines.slice(0, 2))).toEqual([
      ['Metal', 'Silver, 40% Silver'],
      ['Metal', 'Copper-Nickel Clad'],
      ['Cost', 'Under $10'],
      ['Cost', '$25 to $50'],
    ])
    expect(splitBar(swatches[0].lines).bar).toEqual({ metal: SILVER, cost: null })
    expect(splitBar(swatches[3].lines).bar).toEqual({ metal: null, cost: RED })
    expect(new Set(swatches.map((s) => s.item_id)).size).toBe(4)
  })
})
