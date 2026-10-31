// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import InventoryTable from './InventoryTable'
import { COIN_VIEW, CURRENCY_VIEW, fieldsOf } from './specs'
import { date } from '../../../shared/format'
import { renderWithProviders } from '../../../test/helpers'

const config = {
  columns: [
    [
      ['Code', 'item_code'],
      ['Description', 'description'],
    ],
    [['Cost', 'item_cost', 'money']],
  ],
}

const rows = [
  { id: 1, item_code: 'C-001', description: 'Morgan Dollar', item_cost: '1234.5' },
  { id: 2, item_code: 'C-002', description: null, item_cost: null },
]

function setup(overrides = {}) {
  const props = {
    config,
    rows,
    current: {},
    apply: vi.fn(),
    selected: [],
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    sortable: ['item_code'],
    ...overrides,
  }
  return { props, ...renderWithProviders(<InventoryTable {...props} />) }
}

describe('InventoryTable', () => {
  it('renders a header per configured column and a row per result', () => {
    setup()
    expect(screen.getByRole('columnheader', { name: /code/i })).toBeInTheDocument()
    expect(screen.getByText('Morgan Dollar')).toBeInTheDocument()
    expect(screen.getByText('C-002')).toBeInTheDocument()
  })

  it('formats a money column and shows a dash for an absent value', () => {
    setup()
    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
    // The empty cells render a dash rather than "$0.00" or a blank, because
    // the table guards null before it reaches money().
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })

  it('sorts ascending on the first click of an unsorted column', async () => {
    const user = userEvent.setup()
    const { props } = setup()
    await user.click(screen.getByRole('button', { name: 'Code' }))
    // Ascending is the empty string, not 'false' -- the value goes straight
    // into the query string.
    expect(props.apply).toHaveBeenCalledWith({ sort: 'item_code', desc: '' })
  })

  it('flips to descending when the column is already the ascending sort', async () => {
    const user = userEvent.setup()
    const { props } = setup({ current: { sort: 'item_code', desc: '' } })
    await user.click(screen.getByRole('button', { name: 'Code' }))
    expect(props.apply).toHaveBeenCalledWith({ sort: 'item_code', desc: 'true' })
  })

  it('sorts from the keyboard', async () => {
    const user = userEvent.setup()
    const { props } = setup()
    screen.getByRole('button', { name: 'Code' }).focus()
    await user.keyboard('{Enter}')
    expect(props.apply).toHaveBeenCalledWith({ sort: 'item_code', desc: '' })
  })

  it('says which way the sorted column is sorted, and no other', () => {
    setup({
      current: { sort: 'item_code', desc: 'true' },
      sortable: ['item_code', 'item_cost'],
    })
    const code = screen.getByRole('columnheader', { name: 'Code' })
    expect(code).toHaveAttribute('aria-sort', 'descending')
    // The marker is seen, not read: aria-sort says it.
    expect(code).toHaveTextContent('Code v')
    expect(screen.getByRole('columnheader', { name: 'Cost' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  it('does not offer a sort the server cannot perform', () => {
    // The server lists what it can sort by; a header outside that list must
    // not be clickable, or a click puts "cannot sort by" on the page.
    setup({ sortable: ['item_code'] })
    const cost = screen.getByRole('columnheader', { name: /cost/i })
    expect(within(cost).queryByRole('button')).not.toBeInTheDocument()
    expect(cost).not.toHaveAttribute('aria-sort')
  })

  it('selects every row on the page from the header checkbox', async () => {
    const user = userEvent.setup()
    const { props } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select this page' }))
    expect(props.onSelect).toHaveBeenCalledWith([1, 2])
  })

  it('names each row checkbox by its item', async () => {
    const user = userEvent.setup()
    const { props } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select C-002' }))
    expect(props.onSelect).toHaveBeenCalledWith([2])
  })
})

describe('three lines per item', () => {
  const threeLine = {
    columns: [
      [
        ['Code', 'item_code'],
        ['Status', 'status'],
      ],
      [['Denomination', 'denomination_label']],
    ],
    detail: 'description',
  }
  const shown = [
    {
      id: 1,
      item_code: 'C-001',
      status: 'received',
      denomination_label: 'One Dollar',
      description: 'Morgan Dollar',
    },
    { id: 2, item_code: 'C-002', status: 'ordered', description: null },
  ]

  it("puts each column's second field on the line under its first", () => {
    setup({ config: threeLine, rows: shown })
    const [first, second] = screen.getAllByRole('row').slice(2)
    expect(within(first).getByText('C-001')).toBeInTheDocument()
    expect(within(first).getByText('One Dollar')).toBeInTheDocument()
    expect(within(second).getByText('received')).toBeInTheDocument()
  })

  it('gives every field its own title and sort, on two lines of titles', async () => {
    const user = userEvent.setup()
    const { props } = setup({
      config: threeLine,
      rows: shown,
      sortable: ['item_code', 'status'],
    })
    const [top, under] = screen.getAllByRole('row')
    expect(within(top).getByRole('columnheader', { name: 'Code' })).toBeInTheDocument()
    expect(
      within(under).getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Status' }))
    expect(props.apply).toHaveBeenCalledWith({ sort: 'status', desc: '' })
  })

  it('puts the description on a third line spanning the columns', () => {
    setup({ config: threeLine, rows: shown })
    const detail = screen.getByText('Morgan Dollar').closest('td')
    expect(detail).toHaveAttribute('colspan', '2')
    expect(
      screen.queryByRole('columnheader', { name: /description/i }),
    ).not.toBeInTheDocument()
  })

  it('adds no third line for an item without a description', () => {
    setup({ config: threeLine, rows: shown })
    // Two title lines, three lines for C-001, two for C-002.
    expect(screen.getAllByRole('row')).toHaveLength(7)
  })

  it('is how both inventories are shown, the description under each item', () => {
    for (const view of [COIN_VIEW, CURRENCY_VIEW]) {
      expect(view.detail, view.view).toBe('description')
      const keys = fieldsOf(view).map(([, key]) => key)
      expect(keys, view.view).toContain('denomination_label')
      expect(keys, view.view).not.toContain('description')
      for (const pair of view.columns) expect(pair.length, view.view).toBeLessThan(3)
    }
  })

  it('leads with what is read first: the code, then the serial or the year', () => {
    const lead = (view) => view.columns.map(([first]) => first[1]).slice(0, 3)
    expect(lead(CURRENCY_VIEW)).toEqual([
      'item_code',
      'serial_number',
      'series_designation',
    ])
    expect(lead(COIN_VIEW)).toEqual(['item_code', 'year_start', 'denomination_label'])
  })

  it('shows a note grade by its label, not its code', () => {
    // A note's grade code is `N64`; "Choice Uncirculated 64" is what is read.
    const keys = fieldsOf(CURRENCY_VIEW).map(([, key]) => key)
    expect(keys).toContain('grade_label')
    expect(keys).not.toContain('grade')
  })
})

describe('the order column', () => {
  const orderConfig = {
    columns: [
      [
        ['Code', 'item_code'],
        ['Order', 'order_number', 'order'],
      ],
    ],
  }

  it('links a numbered order to its purchase, named by its number', () => {
    setup({
      config: orderConfig,
      rows: [
        { id: 1, item_code: 'C-001', purchase_order_id: 7, order_number: '123-456' },
      ],
    })
    const link = screen.getByRole('link', { name: '123-456' })
    expect(link.getAttribute('href')).toMatch(/\/purchases\?order=7$/)
  })

  it('links an unnumbered order by its vendor and date', () => {
    setup({
      config: orderConfig,
      rows: [
        {
          id: 2,
          item_code: 'C-002',
          purchase_order_id: 8,
          order_number: null,
          vendor: 'ebay.com',
          ordered_on: '2025-01-09',
        },
      ],
    })
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('ebay.com')
    expect(link).toHaveTextContent(date('2025-01-09'))
    expect(link.getAttribute('href')).toMatch(/\/purchases\?order=8$/)
  })

  it('shows a dash and no link when the item has no purchase order', () => {
    setup({
      config: orderConfig,
      rows: [{ id: 3, item_code: 'C-003', purchase_order_id: null }],
    })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})
