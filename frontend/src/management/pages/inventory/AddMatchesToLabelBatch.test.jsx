// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api', () => ({
  api: { addMatchesToLabelBatch: vi.fn() },
}))

import { api } from '../../api'
import { renderWithProviders } from '../../../test/helpers'
import AddMatchesToLabelBatch from './AddMatchesToLabelBatch'

const FILTERS = { item_from: '004500', item_to: '004600', label: 'unlabeled' }

function open(total, filters = FILTERS) {
  renderWithProviders(
    <AddMatchesToLabelBatch view="coins" filters={filters} total={total} />,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AddMatchesToLabelBatch', () => {
  it('adds every match with the search filters and says what it did', async () => {
    api.addMatchesToLabelBatch.mockResolvedValue({
      matched: 40,
      added: 30,
      already: 4,
      not_labelable: 6,
    })
    const user = open(40)
    await user.click(
      screen.getByRole('button', { name: 'Add all 40 matching to label batch' }),
    )
    expect(api.addMatchesToLabelBatch).toHaveBeenCalledWith('coins', FILTERS)
    expect(
      await screen.findByText(
        '30 items added to the label batch; 4 already in it; 6 take no label. ' +
          'Print them from the Labels page.',
      ),
    ).toBeInTheDocument()
  })

  it('asks first when the search matches many', async () => {
    api.addMatchesToLabelBatch.mockResolvedValue({
      matched: 4600,
      added: 1,
      already: 0,
      not_labelable: 4599,
    })
    const user = open(4600)
    await user.click(
      screen.getByRole('button', { name: 'Add all 4,600 matching to label batch' }),
    )
    expect(api.addMatchesToLabelBatch).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', {
      name: 'Add all 4,600 items to the label batch?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.addMatchesToLabelBatch).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Add all 4,600 matching to label batch' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add them' }),
    )
    expect(api.addMatchesToLabelBatch).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(/1 item added to the label batch; 4,599 take no label/),
    ).toBeInTheDocument()
  })

  it('shows the refusal as it came', async () => {
    api.addMatchesToLabelBatch.mockRejectedValue(
      new Error("'x' is not an item number: type it as 004521 or CC-004521."),
    )
    const user = open(3)
    await user.click(screen.getByRole('button', { name: /Add all 3 matching/ }))
    expect(await screen.findByText(/is not an item number/)).toBeInTheDocument()
  })

  it('is not offered when nothing matches', () => {
    open(0)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
