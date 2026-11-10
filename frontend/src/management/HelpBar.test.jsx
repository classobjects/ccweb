// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { HelpBar, HelpProvider } from './HelpBar'
import HelpScope from './HelpScope'
import ModalDialog from './ModalDialog'
import { FIELD_HELP } from './fieldHelp'
import { renderWithProviders } from '../test/helpers'

const HIDE = 'Hide this error and show the field help'

function band() {
  return screen.getAllByRole('contentinfo', { name: 'Field help' })[0]
}

/**
 * A page that refuses its Save the way the console's forms do: the same
 * message, set again on each press, into an `error` box at the top.
 */
function Page({ refusal = 'Nothing to save.', children }) {
  const [error, setError] = useState('')
  const [other, setOther] = useState('')
  return (
    <HelpProvider>
      <div>
        {error && <p className="error">{error}</p>}
        {other && <p className="error">{other}</p>}
        <HelpScope>
          <label data-help="series_year">
            Series year
            <input type="text" />
          </label>
        </HelpScope>
        <button type="button" onClick={() => setError(refusal)}>
          Save
        </button>
        <button type="button" onClick={() => setError('Still nothing.')}>
          Save differently
        </button>
        <button type="button" onClick={() => setOther('The photo failed.')}>
          Upload
        </button>
        <button type="button" onClick={() => setError('')}>
          Clear
        </button>
        {children}
      </div>
      <HelpBar />
    </HelpProvider>
  )
}

describe('the help band repeats an error from its page', () => {
  it('shows a new error in place of the help, and lets it go with the page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Page />)
    await user.click(screen.getByLabelText('Series year'))
    expect(band()).toHaveTextContent(FIELD_HELP.series_year.title)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))
    expect(band()).toHaveClass('help-bar-error')
    expect(band()).not.toHaveTextContent(FIELD_HELP.series_year.title)

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(band()).toHaveTextContent(FIELD_HELP.series_year.title))
    expect(band()).not.toHaveClass('help-bar-error')
  })

  it('shows the newest of two, and the older when the newest goes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Page />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(band()).toHaveTextContent('The photo failed.'))

    await user.click(screen.getByRole('button', { name: 'Save differently' }))
    await waitFor(() => expect(band()).toHaveTextContent('Still nothing.'))

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(band()).toHaveTextContent('The photo failed.'))
  })

  it('hides on the cross to show the help, leaving the field in focus', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Page />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const field = screen.getByLabelText('Series year')
    await user.click(field)
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))

    await user.click(screen.getByRole('button', { name: HIDE }))
    expect(band()).toHaveTextContent(FIELD_HELP.series_year.title)
    expect(band()).not.toHaveClass('help-bar-error')
    expect(field).toHaveFocus()
    await user.keyboard('1928')
    expect(field).toHaveValue('1928')
    // Typing is not an action: the hidden error stays hidden.
    expect(band()).not.toHaveTextContent('Nothing to save.')
  })

  it('shows a hidden error again when the same refusal is pressed for', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Page />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))
    await user.click(screen.getByRole('button', { name: HIDE }))
    expect(band()).not.toHaveTextContent('Nothing to save.')

    // The page does not change -- the same message set again -- yet the
    // press is answered.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))
  })

  it('shows a hidden error again on an accelerator key, not on typing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Page />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByLabelText('Series year'))
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))
    await user.click(screen.getByRole('button', { name: HIDE }))

    await user.keyboard('ab')
    expect(band()).not.toHaveTextContent('Nothing to save.')
    await user.keyboard('{Control>}s{/Control}')
    await waitFor(() => expect(band()).toHaveTextContent('Nothing to save.'))
  })

  it('leaves out highlighted rows and errors that belong to a dialog', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Page>
        <table>
          <tbody>
            <tr className="error">
              <td>Lot 4 has no buyer</td>
            </tr>
          </tbody>
        </table>
        <ul className="error-list">
          <li>Inverted overprint</li>
        </ul>
        <ModalDialog label="Confirm" help={false} onClose={() => {}}>
          <p className="error">The dialog says no.</p>
        </ModalDialog>
      </Page>,
    )
    await user.click(screen.getByLabelText('Series year'))
    // Give the band a turn to have seen the page.
    await waitFor(() => expect(band()).toHaveTextContent(FIELD_HELP.series_year.title))
    expect(band()).not.toHaveClass('help-bar-error')
  })

  it('a dialog with a band repeats its own error there', async () => {
    function Dialog() {
      const [error, setError] = useState('')
      return (
        <ModalDialog label="Edit" onClose={() => {}}>
          {error && <p className="error">{error}</p>}
          <button type="button" onClick={() => setError('Refused in here.')}>
            Refuse
          </button>
        </ModalDialog>
      )
    }
    const user = userEvent.setup()
    renderWithProviders(
      <Page>
        <Dialog />
      </Page>,
    )
    await user.click(screen.getByRole('button', { name: 'Refuse' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    const dialogBand = dialog.querySelector('.help-bar')
    await waitFor(() => expect(dialogBand).toHaveTextContent('Refused in here.'))
    const consoleBand = document.querySelector('body .help-bar:not(dialog *)')
    expect(consoleBand).not.toHaveTextContent('Refused in here.')
  })
})
