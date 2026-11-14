// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    labelSheets: vi.fn(),
    labelRun: vi.fn(),
    labelBatch: vi.fn(),
    addToLabelBatch: vi.fn(),
    removeFromLabelBatch: vi.fn(),
    recordPrintedLabels: vi.fn(),
    labelsWaiting: vi.fn(),
    markLabelsApplied: vi.fn(),
    markLabelsUnused: vi.fn(),
    searchInventory: vi.fn(),
  },
}))

import { api } from '../api'
import { renderWithProviders } from '../../test/helpers'
import { uncovered } from '../../test/helpCoverage'
import Labels from './Labels'
import { SL564, SL597 } from './labels/sheets.fixture'

const COIN = {
  item_id: 11,
  item_code: 'CC-009901',
  lines: ['009901', '1921-S', 'Silver'],
}
const COIN_2 = {
  item_id: 12,
  item_code: 'CC-009902',
  lines: ['009902', '1922', 'Silver'],
}
const NOTE = {
  item_id: 21,
  item_code: 'CC-009903',
  lines: ['009903  Fr 9901', 'Series 1935-D $1 Silver Certificate'],
}

const BATCH_RUN = {
  runs: [
    { sheet: 'SL597', labels: [COIN, COIN_2] },
    { sheet: 'SL564', labels: [NOTE] },
  ],
  skipped: ['CC-009909'],
}

const WAITING = [
  { printed_at: '2026-11-14T18:00:00Z', sheet: 'SL597', labels: [COIN, COIN_2] },
  { printed_at: '2026-11-13T18:00:00Z', sheet: 'SL564', labels: [NOTE] },
]

function open({
  run = BATCH_RUN,
  batch = [COIN, COIN_2, NOTE],
  waiting = WAITING,
} = {}) {
  api.labelSheets.mockResolvedValue([SL597, SL564])
  api.labelsWaiting.mockResolvedValue(waiting)
  api.labelRun.mockResolvedValue(run)
  api.labelBatch.mockResolvedValue(batch)
  renderWithProviders(<Labels />)
  return userEvent.setup()
}

const run = (name) => screen.getByRole('region', { name })

let printSpy

beforeEach(() => {
  vi.resetAllMocks()
  printSpy = vi.fn()
  window.print = printSpy
})

afterEach(() => {
  delete window.print
})

/** The browser's print dialog closing. */
function afterPrint() {
  act(() => {
    window.dispatchEvent(new Event('afterprint'))
  })
}

describe('Labels', () => {
  it('tells the owner how to print', async () => {
    open()
    expect(await screen.findByText(/Actual size/)).toHaveTextContent(
      /not "Fit to page"/,
    )
    expect(screen.getByText(/Actual size/)).toHaveTextContent(/headers and footers/)
  })

  it('opens on the print batch, counted, with one run per sheet', async () => {
    open()
    expect(
      await screen.findByRole('radio', { name: /The print batch \(3\)/ }),
    ).toBeChecked()
    expect(api.labelRun).toHaveBeenCalledWith('batch')
    expect(
      within(run('Coin labels, SL597')).getByText(/2 labels from cell 1/),
    ).toBeInTheDocument()
    expect(
      within(run('Note and set labels, SL564')).getByText(/1 label at cell 1/),
    ).toBeInTheDocument()
  })

  it('names the batch items that will not print', async () => {
    open()
    expect(await screen.findByText(/CC-009909/)).toHaveTextContent(
      /no longer labelable/,
    )
  })

  it('names skipped items even when nothing is left to print', async () => {
    open({ run: { runs: [], skipped: ['CC-009909'] } })
    expect(await screen.findByText(/CC-009909/)).toBeInTheDocument()
    expect(screen.getByText('Nothing to print.')).toBeInTheDocument()
  })

  it('fetches another source when it is chosen, and counts it', async () => {
    const user = open()
    await screen.findByRole('region', { name: 'Coin labels, SL597' })
    api.labelRun.mockResolvedValue({
      runs: [{ sheet: 'SL597', labels: [COIN] }],
      skipped: [],
    })
    await user.click(screen.getByRole('radio', { name: /Not yet labeled/ }))
    expect(api.labelRun).toHaveBeenLastCalledWith('unlabeled')
    expect(
      await screen.findByRole('radio', { name: /Not yet labeled \(1\)/ }),
    ).toBeChecked()
    expect(screen.queryByRole('region', { name: /SL564/ })).toBeNull()
  })

  it('starts a run at the cell clicked', async () => {
    const user = open()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    await user.click(within(coins).getByRole('button', { name: 'Start at cell 160' }))
    expect(
      within(coins).getByText(
        '2 labels from cell 160: 1 on this sheet, 1 on the next, ending at cell 1.',
      ),
    ).toBeInTheDocument()
  })

  it('prints the chosen run alone, and Yes records exactly what it carried', async () => {
    const user = open()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    api.recordPrintedLabels.mockResolvedValue({ recorded: 2 })
    await user.click(within(coins).getByRole('button', { name: 'Print' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    const sheets = document.querySelector('.label-print')
    expect(sheets.querySelectorAll('.label')).toHaveLength(2)
    expect(screen.queryByRole('dialog')).toBeNull()

    afterPrint()
    const dialog = await screen.findByRole('dialog', {
      name: 'Did these labels print correctly?',
    })
    api.labelRun.mockClear()
    api.labelBatch.mockClear()
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }))
    expect(api.recordPrintedLabels).toHaveBeenCalledWith('batch', [
      { item_id: 11, lines: ['009901', '1921-S', 'Silver'] },
      { item_id: 12, lines: ['009902', '1922', 'Silver'] },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.getByText(
        '2 labels recorded as printed: tick them in To apply once they are on ' +
          'their holders.',
      ),
    ).toBeInTheDocument()
    // And To apply is drawn again: they wait there now.
    expect(api.labelsWaiting).toHaveBeenCalledTimes(2)
    // The run and the batch are drawn again: what printed has left them.
    expect(api.labelRun).toHaveBeenCalledWith('batch')
    expect(api.labelBatch).toHaveBeenCalled()
    expect(document.querySelector('.label-print')).toBeNull()
  })

  it('prints from the cell chosen', async () => {
    const user = open()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    await user.click(within(coins).getByRole('button', { name: 'Start at cell 160' }))
    await user.click(within(coins).getByRole('button', { name: 'Print' }))
    expect(document.querySelectorAll('.label-print .label-page')).toHaveLength(2)
  })

  it('opens the print dialog once under StrictMode', async () => {
    api.labelSheets.mockResolvedValue([SL597, SL564])
    api.labelRun.mockResolvedValue(BATCH_RUN)
    api.labelBatch.mockResolvedValue([])
    renderWithProviders(<Labels />, { strict: true })
    const user = userEvent.setup()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    await user.click(within(coins).getByRole('button', { name: 'Print' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    afterPrint()
    expect(
      await screen.findByRole('dialog', { name: 'Did these labels print correctly?' }),
    ).toBeInTheDocument()
  })

  it('records nothing on No', async () => {
    const user = open()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    await user.click(within(coins).getByRole('button', { name: 'Print' }))
    afterPrint()
    const dialog = await screen.findByRole('dialog', {
      name: 'Did these labels print correctly?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'No' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.recordPrintedLabels).not.toHaveBeenCalled()
  })

  it('prints a test page with every cell outlined, and asks nothing after', async () => {
    const user = open()
    const coins = await screen.findByRole('region', { name: 'Coin labels, SL597' })
    await user.click(within(coins).getByRole('button', { name: 'Print a test page' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.label-print .label-cell')).toHaveLength(160)
    afterPrint()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.label-print')).toBeNull()
  })

  it('lists the batch, and Remove takes an item out', async () => {
    const user = open()
    const batch = await screen.findByRole('table', { name: 'Print batch' })
    expect(within(batch).getByText('CC-009902')).toBeInTheDocument()
    api.removeFromLabelBatch.mockResolvedValue(null)
    api.labelBatch.mockResolvedValue([COIN, NOTE])
    await user.click(within(batch).getAllByRole('button', { name: 'Remove' })[1])
    expect(api.removeFromLabelBatch).toHaveBeenCalledWith(12)
    await waitFor(() => expect(within(batch).queryByText('CC-009902')).toBeNull())
    // The batch run is drawn again.
    expect(api.labelRun).toHaveBeenLastCalledWith('batch')
  })

  it('adds an item by its number as the inventory search takes it', async () => {
    const user = open({ batch: [] })
    await screen.findByText('The print batch is empty.')
    api.searchInventory.mockImplementation((view) =>
      Promise.resolve({
        rows:
          view === 'coins'
            ? [
                { id: 77, item_code: 'CC-004521_02' },
                { id: 76, item_code: 'CC-004521' },
              ]
            : [],
      }),
    )
    api.addToLabelBatch.mockResolvedValue([])
    await user.type(screen.getByRole('textbox', { name: 'Item number' }), '004521')
    await user.click(screen.getByRole('button', { name: 'Add to batch' }))
    expect(api.addToLabelBatch).toHaveBeenCalledWith([76])
  })

  it('says why an item cannot be added', async () => {
    const user = open({ batch: [] })
    await screen.findByText('The print batch is empty.')
    api.searchInventory.mockResolvedValue({ rows: [] })
    await user.type(
      screen.getByRole('textbox', { name: 'Item number' }),
      '000001{Enter}',
    )
    expect(
      await screen.findByText('No item has the number 000001.'),
    ).toBeInTheDocument()
    expect(api.addToLabelBatch).not.toHaveBeenCalled()

    api.searchInventory.mockImplementation((view) =>
      Promise.resolve({
        rows: view === 'coins' ? [{ id: 5, item_code: 'CC-000005' }] : [],
      }),
    )
    api.addToLabelBatch.mockRejectedValue(
      new Error('Not labelable: CC-000005. Nothing was added.'),
    )
    const box = screen.getByRole('textbox', { name: 'Item number' })
    await user.clear(box)
    await user.type(box, 'CC-000005{Enter}')
    expect(
      await screen.findByText('Not labelable: CC-000005. Nothing was added.'),
    ).toBeInTheDocument()
  })

  it('lists the labels waiting to be applied, none ticked', async () => {
    open()
    const list = await screen.findByRole('region', { name: 'To apply: 3 labels' })
    const boxes = within(list).getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    for (const box of boxes) expect(box).not.toBeChecked()
    expect(within(list).getByRole('button', { name: 'Applied (0)' })).toBeDisabled()
    expect(within(list).getByRole('button', { name: 'Not used (0)' })).toBeDisabled()
  })

  it('selects and deselects the whole list, or one run', async () => {
    const user = open()
    const list = await screen.findByRole('region', { name: 'To apply: 3 labels' })
    const [selectAll] = within(list).getAllByRole('button', { name: 'Select all' })
    await user.click(selectAll)
    expect(within(list).getByRole('button', { name: 'Applied (3)' })).toBeEnabled()
    const [deselectAll] = within(list).getAllByRole('button', { name: 'Deselect all' })
    await user.click(deselectAll)
    expect(within(list).getByRole('button', { name: 'Applied (0)' })).toBeDisabled()

    const [coinRun] = within(list).getAllByRole('group')
    await user.click(within(coinRun).getByRole('button', { name: 'Select all' }))
    expect(within(list).getByRole('button', { name: 'Applied (2)' })).toBeEnabled()
    expect(screen.getByLabelText('CC-009903 is on its holder')).not.toBeChecked()
  })

  it('marks the ticked labels applied and says so', async () => {
    const user = open()
    await screen.findByRole('region', { name: 'To apply: 3 labels' })
    api.markLabelsApplied.mockResolvedValue({ done: 1, not_waiting: [] })
    await user.click(screen.getByLabelText('CC-009902 is on its holder'))
    await user.click(screen.getByRole('button', { name: 'Applied (1)' }))
    expect(api.markLabelsApplied).toHaveBeenCalledWith([12])
    expect(await screen.findByText('1 label marked applied.')).toBeInTheDocument()
    expect(api.labelsWaiting).toHaveBeenCalledTimes(2)
  })

  it('returns the ticked labels with Not used', async () => {
    const user = open()
    await screen.findByRole('region', { name: 'To apply: 3 labels' })
    api.markLabelsUnused.mockResolvedValue({ done: 1, not_waiting: ['CC-009903'] })
    await user.click(screen.getByLabelText('CC-009903 is on its holder'))
    await user.click(screen.getByRole('button', { name: 'Not used (1)' }))
    expect(api.markLabelsUnused).toHaveBeenCalledWith([21])
    expect(
      await screen.findByText(
        '1 label returned to print again. No label was waiting for CC-009903.',
      ),
    ).toBeInTheDocument()
  })

  it('says when no label waits to be applied', async () => {
    open({ waiting: [] })
    expect(
      await screen.findByText('No printed labels are waiting.'),
    ).toBeInTheDocument()
  })

  it('explains every field', async () => {
    open()
    await screen.findByRole('region', { name: 'Coin labels, SL597' })
    expect(uncovered(document.body)).toEqual([])
  })
})
