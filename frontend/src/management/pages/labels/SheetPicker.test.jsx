// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SheetPicker from './SheetPicker'
import { SL597 } from './sheets.fixture'

const cell = (n) => screen.getByRole('button', { name: `Start at cell ${n}` })

describe('SheetPicker', () => {
  it('draws every cell of the sheet as a button', () => {
    render(<SheetPicker sheet={SL597} count={23} start={37} onStart={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(160)
  })

  it('marks the cells used, the start and the cells this run fills', () => {
    render(<SheetPicker sheet={SL597} count={23} start={37} onStart={() => {}} />)
    expect(cell(36)).toHaveClass('used')
    expect(cell(37)).toHaveClass('start')
    expect(cell(37)).toHaveAttribute('aria-pressed', 'true')
    expect(cell(59)).toHaveClass('fills')
    expect(cell(60)).not.toHaveClass('fills')
  })

  it('says where a run that fits ends', () => {
    render(<SheetPicker sheet={SL597} count={23} start={37} onStart={() => {}} />)
    expect(
      screen.getByText('23 labels from cell 37, ending at cell 59.'),
    ).toBeInTheDocument()
  })

  it('says how a run splits onto the next sheet', () => {
    render(<SheetPicker sheet={SL597} count={23} start={150} onStart={() => {}} />)
    expect(
      screen.getByText(
        '23 labels from cell 150: 11 on this sheet, 12 on the next, ending at cell 12.',
      ),
    ).toBeInTheDocument()
  })

  it('counts the further sheets of a long run', () => {
    render(<SheetPicker sheet={SL597} count={400} start={1} onStart={() => {}} />)
    expect(
      screen.getByText(
        '400 labels from cell 1: 160 on this sheet, then 2 more sheets, ending at cell 80 of the last.',
      ),
    ).toBeInTheDocument()
  })

  it('names one label as one', () => {
    render(<SheetPicker sheet={SL597} count={1} start={5} onStart={() => {}} />)
    expect(screen.getByText('1 label at cell 5.')).toBeInTheDocument()
  })

  it('starts at the cell clicked', async () => {
    const onStart = vi.fn()
    render(<SheetPicker sheet={SL597} count={23} start={1} onStart={onStart} />)
    await userEvent.setup().click(cell(42))
    expect(onStart).toHaveBeenCalledWith(42)
  })

  it('scales to its container: placed in percentages, never in pixels', () => {
    render(<SheetPicker sheet={SL597} count={1} start={1} onStart={() => {}} />)
    expect(cell(160).style.left).toMatch(/%$/)
    expect(cell(160).style.width).toMatch(/%$/)
  })
})
