// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ api: { searchInventory: vi.fn() } }))

import { api } from './api'
import { findItemByNumber, sameItemNumber } from './item-search'

beforeEach(() => vi.resetAllMocks())

describe('sameItemNumber', () => {
  it('takes the whole code or the number a label prints', () => {
    const row = { item_code: 'CC-004521' }
    expect(sameItemNumber(row, 'CC-004521')).toBe(true)
    expect(sameItemNumber(row, 'cc-004521')).toBe(true)
    expect(sameItemNumber(row, '004521')).toBe(true)
    expect(sameItemNumber({ item_code: 'CC-000412_02' }, '000412_02')).toBe(true)
  })

  it('never takes part of a number', () => {
    expect(sameItemNumber({ item_code: 'CC-004521_02' }, '004521')).toBe(false)
    expect(sameItemNumber({ item_code: 'CC-004521' }, '4521')).toBe(false)
  })
})

describe('findItemByNumber', () => {
  it('answers the one item named, from either inventory view', async () => {
    api.searchInventory.mockImplementation((view) =>
      Promise.resolve({
        rows:
          view === 'currency'
            ? [
                { id: 8, item_code: 'CC-000412_02' },
                { id: 7, item_code: 'CC-000412' },
              ]
            : [],
      }),
    )
    expect(await findItemByNumber('000412')).toEqual({ id: 7, item_code: 'CC-000412' })
    expect(api.searchInventory).toHaveBeenCalledWith('coins', { item_code: '000412' })
  })

  it('answers null when no item has the number', async () => {
    api.searchInventory.mockResolvedValue({
      rows: [{ id: 8, item_code: 'CC-000412_02' }],
    })
    expect(await findItemByNumber('000412')).toBeNull()
  })
})
