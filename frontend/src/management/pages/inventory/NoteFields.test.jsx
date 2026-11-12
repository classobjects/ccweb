// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { uncovered } from '../../../test/helpCoverage'
import { emptyReference, renderWithProviders } from '../../../test/helpers'
import HelpScope from '../../HelpScope'
import NoteFields from './NoteFields'

// Made-up note values.
const BASE = { denomination: 'usd_note_1', series_year: '2017A', serial_number: '' }

function show(fields, setNumber = () => () => {}) {
  return renderWithProviders(
    <HelpScope>
      <NoteFields
        value={(key) => ({ ...BASE, ...fields })[key] ?? ''}
        set={() => () => {}}
        setNumber={setNumber}
        setField={() => {}}
        side={() => <span />}
      />
    </HelpScope>,
    { reference: emptyReference({ tables: {} }) },
  )
}

describe('the lookups beside the serial number', () => {
  it('opens Check serial in a new tab for a serial with eight digits', () => {
    show({ serial_number: 'F 0000 3333 A' })
    const link = screen.getByRole('link', { name: 'Check serial' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/00003333',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.getAttribute('title')).toContain('mycurrencycollection.com')
    expect(screen.queryByRole('link', { name: 'Star note lookup' })).toBeNull()
  })

  it('shows Star note lookup only for a star serial, with the year digits', () => {
    show({ serial_number: 'F01011010*' })
    const link = screen.getByRole('link', { name: 'Star note lookup' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.mycurrencycollection.com/reference/star-notes/lookup/1/2017/F01011010*',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.getAttribute('title')).toContain('mycurrencycollection.com')
  })

  it('shows no star lookup for a fractional note', () => {
    show({ denomination: 'usd_note_0_50', serial_number: 'F01011010*' })
    expect(screen.queryByRole('link', { name: 'Star note lookup' })).toBeNull()
  })

  it('shows neither for a serial that is not eight digits and has no star', () => {
    show({ serial_number: 'F1234A' })
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('the Coolness index and the star run size', () => {
  it('are boxes after Printed at, each with help', () => {
    const { container } = show({ coolness_index: '96.9', star_run_size: '320000' })
    expect(screen.getByLabelText('Coolness index')).toHaveValue(96.9)
    expect(screen.getByLabelText('Star run size')).toHaveValue(320000)
    expect(
      uncovered(container).filter((line) => /coolness|star_run/.test(line)),
    ).toEqual([])
  })

  it('pass what is typed to the form', async () => {
    const change = vi.fn()
    const setNumber = (key) => (e) => change(key, e.target.value)
    show({}, setNumber)
    await userEvent.type(screen.getByLabelText('Star run size'), '5')
    expect(change).toHaveBeenCalledWith('star_run_size', '5')
  })
})
