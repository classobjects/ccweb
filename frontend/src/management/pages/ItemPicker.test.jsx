// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: { searchInventory: vi.fn() },
}))

import { api } from '../api'
import ItemPicker from './ItemPicker'

const ROW = { id: 7, item_code: 'C-100', description: '1881-S Morgan Dollar' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ItemPicker', () => {
  it('lists what both views find for the code', async () => {
    const user = userEvent.setup()
    api.searchInventory.mockImplementation(async (view) => ({
      rows: view === 'coins' ? [ROW] : [],
    }))
    render(<ItemPicker onPick={vi.fn()} />)

    await user.type(screen.getByLabelText('Item code'), 'C-100')
    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(await screen.findByRole('button', { name: /1881-S Morgan/ })).toBeVisible()
    expect(api.searchInventory).toHaveBeenCalledWith('coins', { item_code: 'C-100' })
    expect(api.searchInventory).toHaveBeenCalledWith('currency', { item_code: 'C-100' })
  })

  it('drops an answer for a code no longer in the box', async () => {
    const user = userEvent.setup()
    const answers = []
    api.searchInventory.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    )
    render(<ItemPicker onPick={vi.fn()} />)

    const box = screen.getByLabelText('Item code')
    await user.type(box, 'C-100')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    await user.type(box, '9')

    await act(async () => {
      for (const answer of answers) answer({ rows: [ROW] })
    })

    expect(screen.queryByRole('button', { name: /1881-S Morgan/ })).toBeNull()
    expect(box).toHaveValue('C-1009')
    expect(screen.getByRole('button', { name: 'Find' })).toBeEnabled()
  })
})
