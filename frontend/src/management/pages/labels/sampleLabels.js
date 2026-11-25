// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Made-up labels for a test page, one per cell, so the printed page shows
 * where real text lands and how large it prints, and gives a label to scan.
 *
 * They are numbered from 900001 -- far above any item -- so a sample never
 * reads as a real item's number, and looking one up finds nothing.
 *
 * Each sample carries a color bar, the colors taken in turn from the
 * vocabularies (`barPalette`), so a test page shows the bars as real labels
 * print them. `swatchLabels` is the swatch page: one label per color, named.
 */
import { barLine } from './layout'

/** The number the first cell's sample carries. */
export const FIRST_SAMPLE_NUMBER = 900001

/** Lines after the number, as each sheet's real labels print them. */
const SAMPLE_LINES = {
  SL597: (number) => [number, '1964 D', '40% Silver'],
  SL564: (number) => [
    `${number}  Fr 1621*  Cool 72.5%`,
    'Series 1957 $1 Silver Certificate',
    'Star · Radar · Fancy Serial',
    'Insufficient Inking',
  ],
}

/** A color the bar can draw: `#` and six hexadecimal digits. */
const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/**
 * The bar's colors from the vocabularies, as the test and swatch pages use
 * them: `metals`, one entry per color and pattern with the names of the
 * metals that carry it ("Silver, 40% Silver"; a striped one has `pattern`),
 * and `costs`, one per bracket, cheapest
 * first. Retired values and values with no color are left out; either
 * vocabulary not yet loaded gives an empty list.
 */
export function barPalette(metals, bands) {
  const byColor = new Map()
  for (const metal of metals ?? []) {
    const color = metal.extra?.label_color
    if (!isColor(color)) continue
    const pattern = metal.extra?.label_pattern || null
    const key = `${color.toLowerCase()}/${pattern ?? ''}`
    const entry = byColor.get(key) ?? { color, pattern, names: [] }
    entry.names.push(metal.extra?.label_name || metal.label)
    byColor.set(key, entry)
  }
  const costs = (bands ?? [])
    .filter((band) => isColor(band.extra?.color))
    .map((band) => ({
      color: band.extra.color,
      name: band.label,
      bound: Number(band.extra.lower_bound),
    }))
    .sort((a, b) => a.bound - b.bound)
  return {
    metals: [...byColor.values()].map(({ color, pattern, names }) => ({
      color,
      ...(pattern ? { pattern } : {}),
      name: [...new Set(names)].join(', '),
    })),
    costs,
  }
}

/**
 * The bar of the sample in cell `i`: costs change cell to cell and metals
 * every full turn of the costs, a blank metal block among them, so a sheet
 * shows each pairing. No bar at all while the palette is empty.
 */
function sampleBar(i, palette) {
  const costs = palette?.costs ?? []
  const metals = [...(palette?.metals ?? []), null]
  if (costs.length === 0 && metals.length === 1) return null
  const cost = costs.length ? costs[i % costs.length].color : null
  const turn = costs.length ? Math.floor(i / costs.length) : i
  const metal = metals[turn % metals.length]
  return barLine(metal?.color ?? null, cost, metal?.pattern)
}

/**
 * One sample label for every cell of `sheet`, in the shape `LabelSheets`
 * prints: an id of its own and the label's lines, the bar line last.
 */
export function sampleLabels(sheet, palette) {
  const lines = SAMPLE_LINES[sheet.code] ?? ((number) => [number])
  return Array.from({ length: sheet.cells }, (_, i) => {
    const number = String(FIRST_SAMPLE_NUMBER + i)
    const bar = sampleBar(i, palette)
    return {
      item_id: `sample-${number}`,
      lines: bar ? [...lines(number), bar] : lines(number),
    }
  })
}

/**
 * The swatch page: a label for each metal color and each cost bracket, in
 * that order, named, with only its own block filled -- so each color can
 * be checked on the label stock, and told from its neighbors, before it is
 * relied on. As many as there are colors; the rest of the sheet is blank.
 */
export function swatchLabels(palette) {
  const metals = (palette?.metals ?? []).map((m, i) => ({
    item_id: `swatch-metal-${i}`,
    lines: [
      'Metal',
      m.name,
      m.pattern ? `${m.color} ${m.pattern}` : m.color,
      barLine(m.color, null, m.pattern),
    ],
  }))
  const costs = (palette?.costs ?? []).map((c, i) => ({
    item_id: `swatch-cost-${i}`,
    lines: ['Cost', c.name, c.color, barLine(null, c.color)],
  }))
  return [...metals, ...costs]
}
