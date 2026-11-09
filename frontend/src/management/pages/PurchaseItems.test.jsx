// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({ api: { searchInventory: vi.fn() } }))

import { api } from '../api'
import { renderWithProviders } from '../../test/helpers'
import PurchaseItems from './PurchaseItems'

const COIN_ROW = {
  id: 501,
  item_code: 'CC-000501',
  status: 'received',
  year_start: 1923,
  mint_mark: 'P',
  denomination_label: 'Dollar',
  series_label: 'Peace Dollar',
  grade: 'MS62',
  item_kind: 'coin',
  metal: 'Silver',
  fine_weight_ozt: '0.77344',
  total_cost: '0.00',
  piece_count: 1,
  order_number: '7025',
  purchase_order_id: 40,
  description: 'MS62 Gift 1923-P Peace Dollar.',
  source_title: 'Summer Sizzler Series - COIN ROLLS & BAGS PT. 12',
}

const NOTE_ROW = {
  id: 502,
  item_code: 'CC-000502',
  status: 'ordered',
  serial_number: 'A38164927B',
  friedberg_number: '1621',
  series_designation: '1957B',
  series_label: 'Silver Certificate',
  denomination_label: '$1 Bill',
  grade_label: 'Choice Uncirculated 64',
  seal_color_label: 'Blue Seal',
  total_cost: '20.00',
  order_number: '7025',
  purchase_order_id: 40,
  description: '',
  source_title: '1957B $1 Silver Certificate',
}

const line = (id, kind) => ({ id, item_kind: kind })

function purchaseOf(lines) {
  return { id: 40, order_number: '7025', lines }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.searchInventory.mockImplementation((view) =>
    Promise.resolve(
      view === 'coins'
        ? { view, rows: [COIN_ROW], total: 1, sortable: ['item_code', 'year_start'] }
        : { view, rows: [NOTE_ROW], total: 1, sortable: ['item_code'] },
    ),
  )
})

describe('PurchaseItems', () => {
  it('lists a coin as Coins does: year, mint, series, grade, metal and description', async () => {
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={vi.fn()} />,
    )
    const table = await screen.findByRole('table')
    for (const text of ['1923', 'P', 'Dollar', 'Peace Dollar', 'MS62', 'Silver']) {
      expect(within(table).getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(
      within(table).getByText('MS62 Gift 1923-P Peace Dollar.'),
    ).toBeInTheDocument()
    expect(api.searchInventory).toHaveBeenCalledTimes(1)
    expect(api.searchInventory).toHaveBeenCalledWith('coins', {
      purchase_order_id: 40,
      sort: 'item_code',
      desc: false,
      limit: 200,
      offset: 0,
    })
  })

  it('leaves out Order and the tick boxes: every item is on this purchase', async () => {
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={vi.fn()} />,
    )
    const table = await screen.findByRole('table')
    expect(within(table).queryByRole('columnheader', { name: 'Order' })).toBeNull()
    expect(within(table).queryByRole('checkbox')).toBeNull()
  })

  it('shows the seller title for an item not yet described', async () => {
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(502, 'currency')])} onOpen={vi.fn()} />,
    )
    const table = await screen.findByRole('table')
    expect(within(table).getByText('1957B $1 Silver Certificate')).toBeInTheDocument()
    expect(within(table).getByText('A38164927B')).toBeInTheDocument()
    expect(api.searchInventory).toHaveBeenCalledWith('currency', expect.anything())
  })

  it('heads a table for each kind on a purchase holding coins and notes', async () => {
    renderWithProviders(
      <PurchaseItems
        purchase={purchaseOf([line(501, 'coin'), line(502, 'currency')])}
        onOpen={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole('heading', { name: 'Coins (1)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Currency (1)' })).toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })

  it('starts in item-code order and sorts by a header clicked, then back', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={vi.fn()} />,
    )
    const code = await screen.findByRole('columnheader', { name: /Code/ })
    expect(code).toHaveAttribute('aria-sort', 'ascending')

    await user.click(screen.getByRole('button', { name: /Year/ }))
    expect(api.searchInventory).toHaveBeenLastCalledWith(
      'coins',
      expect.objectContaining({ sort: 'year_start', desc: false }),
    )
    await user.click(screen.getByRole('button', { name: /Year/ }))
    expect(api.searchInventory).toHaveBeenLastCalledWith(
      'coins',
      expect.objectContaining({ sort: 'year_start', desc: true }),
    )
    expect(await screen.findByRole('columnheader', { name: /Year/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('offers a header as a sort only where the server can sort by it', async () => {
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={vi.fn()} />,
    )
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: /Year/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Metal/ })).toBeNull()
  })

  it('opens an item from its code', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={onOpen} />,
    )
    await user.click(await screen.findByRole('button', { name: 'CC-000501' }))
    expect(onOpen).toHaveBeenCalledWith(501)
  })

  it('reads a purchase bigger than one page in full', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      ...COIN_ROW,
      id: 1000 + i,
      item_code: `CC-00${1000 + i}`,
    }))
    api.searchInventory.mockImplementation((view, { offset, limit }) =>
      Promise.resolve({ view, rows: many.slice(offset, offset + limit), total: 250 }),
    )
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(1000, 'coin')])} onOpen={vi.fn()} />,
    )
    expect(await screen.findByRole('button', { name: 'CC-001249' })).toBeInTheDocument()
    expect(api.searchInventory).toHaveBeenCalledTimes(2)
  })

  it('says so when the items cannot be read', async () => {
    api.searchInventory.mockRejectedValue(new Error('Request failed'))
    renderWithProviders(
      <PurchaseItems purchase={purchaseOf([line(501, 'coin')])} onOpen={vi.fn()} />,
    )
    expect(
      await screen.findByText('The items could not be read: Request failed'),
    ).toBeInTheDocument()
  })
})
