// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'

import { SteadyReading, labelNumber, lookupAddress, openAddress } from './readLabel'

describe('labelNumber', () => {
  it("takes a coin label's first line", () => {
    expect(labelNumber('002427\n1964 D\n40\n')).toBe('002427')
  })

  it("takes the number from a note label's first line, past Fr and Coolness", () => {
    // Digits only: "Fr 1621*  Cool 72.5%" is read as stray digits.
    expect(labelNumber('002427  1621  725\n1957 1\n')).toBe('002427')
  })

  it("takes a split piece's number whole", () => {
    expect(labelNumber('000412_02\n1921\n')).toBe('000412_02')
  })

  it('prefers a line that opens with a number over one found later in a line', () => {
    expect(labelNumber('4 4 3\n000184\n1\n')).toBe('000184')
    expect(labelNumber('17 123456\n009901 2\n')).toBe('009901')
  })

  it('falls back to a number standing anywhere', () => {
    expect(labelNumber('7 002427 1\n')).toBe('002427')
  })

  it('never takes part of a longer run of digits, or a short one', () => {
    expect(labelNumber('12345678\n')).toBeNull()
    expect(labelNumber('1621 725\n')).toBeNull()
    expect(labelNumber('0024 27\n')).toBeNull()
    expect(labelNumber('')).toBeNull()
  })
})

describe('lookupAddress', () => {
  it('fills in the item code and view, escaped', () => {
    expect(
      lookupAddress(
        '/management/inventory/{view}?item_code={item_code}',
        'CC-002427',
        'currency',
      ),
    ).toBe('/management/inventory/currency?item_code=CC-002427')
    expect(
      lookupAddress('https://x.example/{item_code}/{item_code}', 'A B', 'coins'),
    ).toBe('https://x.example/A%20B/A%20B')
  })
})

describe('openAddress', () => {
  it("opens one of the console's addresses in the console", () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    openAddress('/management/inventory/coins?item_code=CC-1', navigate, assign)
    openAddress('/management', navigate, assign)
    expect(navigate.mock.calls).toEqual([['/inventory/coins?item_code=CC-1'], ['/']])
    expect(assign).not.toHaveBeenCalled()
  })

  it('opens any other address as a page of its own', () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    openAddress('https://example.org/find?code=CC-1', navigate, assign)
    openAddress('/managementx/1', navigate, assign)
    expect(assign.mock.calls).toEqual([
      ['https://example.org/find?code=CC-1'],
      ['/managementx/1'],
    ])
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('SteadyReading', () => {
  it('takes a number only once two frames in a row agree', () => {
    const steady = new SteadyReading()
    expect(steady.see('002427')).toBeNull()
    expect(steady.see('002428')).toBeNull()
    expect(steady.see('002428')).toBe('002428')
    expect(steady.see('002428')).toBe('002428')
  })

  it('starts over after a frame with no number, and after reset', () => {
    const steady = new SteadyReading()
    steady.see('002427')
    expect(steady.see(null)).toBeNull()
    expect(steady.see('002427')).toBeNull()
    steady.reset()
    expect(steady.see('002427')).toBeNull()
    expect(steady.see('002427')).toBe('002427')
  })
})
