// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import { serialDistrict, serialStar } from './serialDistrict'

const frn = (serial_number) => ({ note_type: 'frn', serial_number })

describe('serialDistrict', () => {
  it('reads the letter next to the digits: the only one, or the second of two', () => {
    expect(serialDistrict(frn('G28888882E'))).toBe('G')
    expect(serialDistrict(frn('MK12345678A'))).toBe('K')
    expect(serialDistrict(frn('B12345678*'))).toBe('B')
  })

  it('reads it as typed: any case, spaces, and a digit too few or too many', () => {
    expect(serialDistrict(frn(' g 2888 8882 e '))).toBe('G')
    expect(serialDistrict(frn('K4888444D'))).toBe('K')
    expect(serialDistrict(frn('G288888882E'))).toBe('G')
  })

  it('reads none where the serial names no Bank', () => {
    // A star for the prefix, a letter past L, three letters, no serial.
    expect(serialDistrict(frn('*12345678A'))).toBe('')
    expect(serialDistrict(frn('M12345678A'))).toBe('')
    expect(serialDistrict(frn('GOLD999999'))).toBe('')
    expect(serialDistrict(frn('323256EL'))).toBe('')
    expect(serialDistrict(frn(''))).toBe('')
    expect(serialDistrict(frn(null))).toBe('')
    expect(serialDistrict(undefined)).toBe('')
  })

  it('reads none from a note that is not a Federal Reserve Note', () => {
    // A silver certificate's first letter is a block, not a Bank.
    expect(
      serialDistrict({ note_type: 'silver_certificate', serial_number: 'B12345678A' }),
    ).toBe('')
    expect(serialDistrict({ note_type: null, serial_number: 'B12345678A' })).toBe('')
  })
})

describe('serialStar', () => {
  it('reads a star wherever the serial carries it, of any class', () => {
    expect(serialStar(frn('B12345678*'))).toBe(true)
    expect(serialStar(frn('B 1234 5678 *'))).toBe(true)
    expect(
      serialStar({ note_type: 'silver_certificate', serial_number: '*12345678A' }),
    ).toBe(true)
  })

  it('reads no star from a serial without one, however far it is typed', () => {
    expect(serialStar(frn('B06966906D'))).toBe(false)
    expect(serialStar(frn('B65945203'))).toBe(false)
  })

  it('reads nothing from a note with no serial', () => {
    expect(serialStar(frn(''))).toBe(null)
    expect(serialStar(frn('  '))).toBe(null)
    expect(serialStar(frn(null))).toBe(null)
    expect(serialStar(undefined)).toBe(null)
  })
})
