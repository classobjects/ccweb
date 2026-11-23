// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Made-up labels for a test page, one per cell, so the printed page shows
 * where real text lands and how large it prints, and gives a label to scan.
 *
 * They are numbered from 900001 -- far above any item -- so a sample never
 * reads as a real item's number, and looking one up finds nothing.
 */

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

/**
 * One sample label for every cell of `sheet`, in the shape `LabelSheets`
 * prints: an id of its own and the label's lines.
 */
export function sampleLabels(sheet) {
  const lines = SAMPLE_LINES[sheet.code] ?? ((number) => [number])
  return Array.from({ length: sheet.cells }, (_, i) => {
    const number = String(FIRST_SAMPLE_NUMBER + i)
    return { item_id: `sample-${number}`, lines: lines(number) }
  })
}
