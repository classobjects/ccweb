// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import { identifyChanges, identifyKeys, identifyValues, isYearRange } from './identify'

describe('isYearRange', () => {
  // The server's rule, `app/years.py` `is_single`: no end, or an end equal
  // to the start, is one year.
  it('takes no end, or an end equal to the start, as one year', () => {
    expect(isYearRange(1881, null)).toBe(false)
    expect(isYearRange(1881, undefined)).toBe(false)
    expect(isYearRange(1878, 1878)).toBe(false)
    expect(isYearRange(null, null)).toBe(false)
  })

  it('compares as numbers: a typed year is text', () => {
    expect(isYearRange('1878', 1878)).toBe(false)
    expect(isYearRange('1878', 1885)).toBe(true)
  })

  it('takes an end that differs, or an end with no start, as a range', () => {
    expect(isYearRange(1999, 2008)).toBe(true)
    expect(isYearRange(null, 1900)).toBe(true)
  })
})

describe('identifyKeys', () => {
  it('asks a note for its series, face value and serial, then its plates', () => {
    expect(identifyKeys('currency')).toEqual([
      'series_year',
      'series_letter',
      'denomination',
      'serial_number',
      'face_plate_number',
      'back_plate_number',
    ])
  })

  it('asks anything else for its year, mint and face value', () => {
    for (const kind of ['coin', 'bullion', 'medal', 'set']) {
      expect(identifyKeys(kind)).toEqual(['year_start', 'mint', 'denomination'])
    }
  })

  it('asks which kinds have a mint, rather than knowing', async () => {
    // One list decides which fields are a coin's (shared/kinds.js); a kind
    // without a mint must lose the box here as everywhere else.
    const kinds = await import('../shared/kinds')
    kinds.COIN_ONLY_FIELDS.delete('mint')
    kinds.CURRENCY_ONLY_FIELDS.add('mint')
    try {
      expect(identifyKeys('coin')).toEqual(['year_start', 'denomination'])
    } finally {
      kinds.CURRENCY_ONLY_FIELDS.delete('mint')
      kinds.COIN_ONLY_FIELDS.add('mint')
    }
  })
})

const NOTE = {
  item_kind: 'currency',
  denomination: 'usd_note_1',
  series_year: 1957,
  series_letter: 'B',
  serial_number: 'A1B',
  face_plate_number: null,
  back_plate_number: null,
}

const COIN = {
  item_kind: 'coin',
  year_start: 1921,
  year_end: 1921,
  mint: 'D',
  denomination: 'usd_coin_1_00',
}

describe('identifyValues', () => {
  it("fills a note's facts as the form's text, blank for what is unknown", () => {
    expect(identifyValues(NOTE)).toEqual({
      series_year: '1957',
      series_letter: 'B',
      denomination: 'usd_note_1',
      serial_number: 'A1B',
      face_plate_number: '',
      back_plate_number: '',
    })
  })
})

describe('identifyChanges', () => {
  it('is empty when nothing moved, spaces included', () => {
    const values = { ...identifyValues(NOTE), serial_number: ' A1B ' }
    expect(identifyChanges(NOTE, values)).toEqual({ changes: {}, base: {} })
  })

  it('sends each changed fact with what it was, a year as a number', () => {
    const values = {
      ...identifyValues(NOTE),
      series_year: '1963',
      back_plate_number: '12',
    }
    expect(identifyChanges(NOTE, values)).toEqual({
      changes: { series_year: 1963, back_plate_number: '12' },
      base: { series_year: 1957, back_plate_number: null },
    })
  })

  it('sends a cleared fact as null', () => {
    const values = { ...identifyValues(NOTE), series_letter: '' }
    expect(identifyChanges(NOTE, values).changes).toEqual({ series_letter: null })
  })

  it("moves a coin's single year as both ends", () => {
    const values = { ...identifyValues(COIN), year_start: '1922' }
    expect(identifyChanges(COIN, values)).toEqual({
      changes: { year_start: 1922, year_end: 1922 },
      base: { year_start: 1921, year_end: 1921 },
    })
  })
})
