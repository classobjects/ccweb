// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CORRECTION_KEY, saveCorrection, storedCorrection } from './printerCorrection'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('printer correction storage', () => {
  it('is 100% both ways with nothing stored', () => {
    expect(storedCorrection()).toEqual({ across: 100, down: 100 })
  })

  it('reads back what was saved', () => {
    saveCorrection({ across: 97.2, down: 97.6 })
    expect(storedCorrection()).toEqual({ across: 97.2, down: 97.6 })
  })

  it('keeps nothing for 100% both ways', () => {
    saveCorrection({ across: 97, down: 97 })
    saveCorrection({ across: 100, down: 100 })
    expect(window.localStorage.getItem(CORRECTION_KEY)).toBeNull()
  })

  it('reads a damaged value as 100%', () => {
    window.localStorage.setItem(CORRECTION_KEY, '{not json')
    expect(storedCorrection()).toEqual({ across: 100, down: 100 })
  })

  it('works on without storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(saveCorrection({ across: 98, down: 98 })).toEqual({ across: 98, down: 98 })
  })
})
