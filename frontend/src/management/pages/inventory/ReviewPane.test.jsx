// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The editor is tested on its own; here it stands in for the form the pane
// opens, and offers what a form can tell its opener.
vi.mock('./ItemEditForm', () => ({
  default: ({ itemId, onSaved, onDeleted }) => (
    <div>
      editing item {itemId}
      <button onClick={onSaved}>stub save</button>
      <button onClick={onDeleted}>stub delete</button>
    </div>
  ),
}))

import ReviewPane from './ReviewPane'

describe('ReviewPane', () => {
  it('counts a saved item and moves on to the next', async () => {
    const user = userEvent.setup()
    render(<ReviewPane ids={[1, 2, 3]} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'stub save' }))

    expect(screen.getByText('editing item 2')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 -- 1 saved')).toBeInTheDocument()
  })

  it('drops a deleted item from the queue, uncounted, and never reopens it', async () => {
    const user = userEvent.setup()
    render(<ReviewPane ids={[1, 2, 3]} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'stub delete' }))

    // The item after it takes its place.
    expect(screen.getByText('editing item 3')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('editing item 1')).toBeInTheDocument()
  })

  it('goes back one when the last of the queue is deleted', async () => {
    const user = userEvent.setup()
    render(<ReviewPane ids={[1, 2]} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'stub save' }))
    await user.click(screen.getByRole('button', { name: 'stub delete' }))

    expect(screen.getByText('editing item 1')).toBeInTheDocument()
    expect(screen.getByText('1 of 1 -- 1 saved')).toBeInTheDocument()
  })

  it('ends the review when the only item left is deleted', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ReviewPane ids={[1]} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'stub delete' }))

    expect(onClose).toHaveBeenCalledWith([1])
  })

  it('tells its opener which items were deleted when the review is left', async () => {
    // A caller holding a deleted id must not read or receive it afterwards.
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ReviewPane ids={[1, 2, 3]} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'stub delete' }))
    await user.click(screen.getByRole('button', { name: 'Leave review' }))

    expect(onClose).toHaveBeenCalledWith([1])
  })
})
