// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SubjectCell from './SubjectCell'

function inRow(listing, label) {
  render(
    <table>
      <tbody>
        <tr>
          <SubjectCell listing={listing} label={label} />
        </tr>
      </tbody>
    </table>,
  )
}

describe('SubjectCell', () => {
  it("shows an item's code whole, never in a scrolling box", () => {
    inRow({ item_code: 'CC-008280', sales_lot_id: null })
    const cell = screen.getByRole('cell', { name: 'CC-008280' })
    expect(cell).toHaveClass('item-code')
    expect(cell.querySelector('.cell-scroll')).toBeNull()
    expect(cell).toHaveAttribute('data-label', 'Item or lot')
  })

  it("scrolls a lot's title, which can be long, in its cell", () => {
    inRow(
      {
        item_code: null,
        sales_lot_id: 4,
        item_title: 'Three Morgans',
        member_count: 3,
      },
      'Item',
    )
    const cell = screen.getByRole('cell', { name: 'Three Morgans (3 items)' })
    expect(cell).not.toHaveClass('item-code')
    expect(cell.querySelector('.cell-scroll')).toHaveTextContent(
      'Three Morgans (3 items)',
    )
    expect(cell).toHaveAttribute('data-label', 'Item')
  })
})
