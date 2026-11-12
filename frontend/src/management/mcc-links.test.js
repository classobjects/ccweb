// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import { fancyCheckerUrl, faceFromDenomination, starLookupUrl } from './mcc-links'

describe('fancyCheckerUrl', () => {
  it('takes the eight digits of the serial', () => {
    expect(fancyCheckerUrl('F 0000 3333 A')).toBe(
      'https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/00003333',
    )
  })

  it('is null unless the serial has eight digits', () => {
    expect(fancyCheckerUrl('F1234A')).toBeNull()
    expect(fancyCheckerUrl('F123456789A')).toBeNull()
    expect(fancyCheckerUrl('')).toBeNull()
    expect(fancyCheckerUrl(null)).toBeNull()
  })
})

describe('starLookupUrl', () => {
  const star = { face: 1, seriesYear: 2021, serial: 'F01011010*' }

  it('passes the face, the year and the serial as recorded', () => {
    expect(starLookupUrl(star)).toBe(
      'https://www.mycurrencycollection.com/reference/star-notes/lookup/1/2021/F01011010*',
    )
  })

  it('removes spaces from the serial and passes a star-first serial as it is', () => {
    expect(starLookupUrl({ ...star, serial: '*1234 5678 A' })).toBe(
      'https://www.mycurrencycollection.com/reference/star-notes/lookup/1/2021/*12345678A',
    )
  })

  it('passes the digits of a lettered series year alone', () => {
    expect(starLookupUrl({ ...star, seriesYear: '2017A' })).toContain('/1/2017/')
  })

  it('is null without a star, a face value or a year', () => {
    expect(starLookupUrl({ ...star, serial: 'F01011010A' })).toBeNull()
    expect(starLookupUrl({ ...star, face: null })).toBeNull()
    expect(starLookupUrl({ ...star, seriesYear: null })).toBeNull()
  })
})

describe('faceFromDenomination', () => {
  it('reads the whole dollars from a note denomination code', () => {
    expect(faceFromDenomination('usd_note_1')).toBe(1)
    expect(faceFromDenomination('usd_note_5')).toBe(5)
    expect(faceFromDenomination('usd_note_100')).toBe(100)
  })

  it('is null for a fractional note, a coin or nothing', () => {
    expect(faceFromDenomination('usd_note_0_50')).toBeNull()
    expect(faceFromDenomination('usd_note_0_03')).toBeNull()
    expect(faceFromDenomination('usd_coin_0_25')).toBeNull()
    expect(faceFromDenomination(null)).toBeNull()
  })
})
