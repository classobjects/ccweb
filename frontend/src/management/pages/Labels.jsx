// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '../api'
import ConfirmDialog from '../ConfirmDialog'
import HelpScope from '../HelpScope'
import { findItemByNumber } from '../item-search'
import { useRequest } from '../../shared/useRequest'
import LabelSheets from './labels/LabelSheets'
import SheetPicker from './labels/SheetPicker'
import ToApply from './labels/ToApply'
import { CORRECTION_RANGE, keyedLines, normalCorrection } from './labels/layout'
import { correctionSaver } from './labels/printerCorrection'
import { sampleLabels } from './labels/sampleLabels'
import './labels/labels.css'

//: What a run is drawn from (`LabelSource`), as the page offers it.
const SOURCES = [
  ['batch', 'The print batch'],
  ['unlabeled', 'Not yet labeled'],
  ['stale', 'Needs a new label'],
]

/** How many labels a run prints: every sheet's together. */
function labelCount(answer) {
  return answer.runs.reduce((sum, run) => sum + run.labels.length, 0)
}

/** "1 label" or "N labels". */
const labelsWord = (n) => (n === 1 ? '1 label' : `${n} labels`)

/**
 * The print batch: its items, each with Remove, and a box that adds one by
 * its number.
 *
 * The number is typed as the inventory's search takes it -- `004521`, as
 * the label prints it, or `CC-004521` -- and found in both inventory views
 * (`findItemByNumber`). The server refuses an item that takes no holder
 * label, and says which; the refusal is shown as it came.
 */
function PrintBatch({ batch, onChanged }) {
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [clearing, setClearing] = useState(false)

  async function clear() {
    setBusy(true)
    setError('')
    try {
      await api.clearLabelBatch()
      setClearing(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const wanted = number.trim()
    if (!wanted) return
    setBusy(true)
    setError('')
    try {
      const item = await findItemByNumber(wanted)
      if (!item) {
        setError(`No item has the number ${wanted}.`)
        return
      }
      await api.addToLabelBatch([item.id])
      setNumber('')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(itemId) {
    setError('')
    try {
      await api.removeFromLabelBatch(itemId)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section aria-labelledby="label-batch-heading">
      <h2 id="label-batch-heading">The print batch</h2>
      <p className="muted">
        Items kept for the next run. Printing the batch and answering Yes empties it of
        what printed. To choose them by any filter -- a range of item numbers, a series,
        the label state -- filter the Coins or Currency screen and press Add all
        matching to label batch.
      </p>
      <div className="row">
        <label data-help="label_item_number">
          Item number{/* */}
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={add}>
          Add to batch
        </button>
        {batch?.length > 0 && (
          <button type="button" disabled={busy} onClick={() => setClearing(true)}>
            Clear the batch
          </button>
        )}
      </div>
      {clearing && (
        <ConfirmDialog
          question="Clear the print batch?"
          confirmLabel="Clear it"
          busyLabel="Clearing..."
          cancelLabel="Keep it"
          busy={busy}
          onConfirm={clear}
          onCancel={() => setClearing(false)}
        >
          <p>
            Takes all {batch.length === 1 ? '1 item' : `${batch.length} items`} out of
            the batch. Nothing is recorded as printed; add them again to print them.
          </p>
          {error && <p className="error">{error}</p>}
        </ConfirmDialog>
      )}
      {error && !clearing && <p className="error">{error}</p>}
      {batch?.length === 0 && <p className="muted">The print batch is empty.</p>}
      {batch && batch.length > 0 && (
        <table className="table stacks" aria-label="Print batch">
          <thead>
            <tr>
              <th>Item</th>
              <th>Label</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {batch.map((label) => (
              <tr key={label.item_id}>
                <td data-label="Item" className="item-code">
                  {label.item_code}
                </td>
                <td data-label="Label">
                  {keyedLines(label.lines).map(({ line, key }) => (
                    <div key={key} className="cell-scroll">
                      {line}
                    </div>
                  ))}
                </td>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => remove(label.item_id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/**
 * The printer correction: how large the printer prints the page, percent
 * across and down, read off a test page. Each change applies at once and is
 * handed to `onChange` to keep for the installation; a value outside 90 to
 * 110, or a box left empty, prints at 100%.
 */
function PrinterCorrection({ correction, onChange }) {
  const [typed, setTyped] = useState({
    across: String(correction.across),
    down: String(correction.down),
  })

  function change(axis, value) {
    const next = { ...typed, [axis]: value }
    setTyped(next)
    onChange(normalCorrection(next))
  }

  const ignored = ['across', 'down'].filter(
    (axis) => typed[axis].trim() !== '' && Number(typed[axis]) !== correction[axis],
  )

  return (
    <fieldset className="label-correction" data-help="label_printer_correction">
      <legend>Printer correction</legend>
      <label>
        Prints at{' '}
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={CORRECTION_RANGE.min}
          max={CORRECTION_RANGE.max}
          value={typed.across}
          onChange={(e) => change('across', e.target.value)}
        />
        % across
      </label>
      <label>
        and{' '}
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={CORRECTION_RANGE.min}
          max={CORRECTION_RANGE.max}
          value={typed.down}
          onChange={(e) => change('down', e.target.value)}
        />
        % down
      </label>
      {ignored.length > 0 && (
        <p className="error">
          {CORRECTION_RANGE.min} to {CORRECTION_RANGE.max} only: printing at 100%{' '}
          {ignored.join(' and ')} until it is.
        </p>
      )}
    </fieldset>
  )
}

/**
 * Labels: prints holder labels on sheets of labels, from any starting cell
 * (holder-labels-design.md, section 4, "Printing").
 *
 * **What to print** is one source: the print batch, every labelable item
 * never labeled, or those whose label no longer matches. Its run comes back
 * one list per sheet product -- a batch of coins and notes is two runs --
 * each shown as its first sheet, where a click on any cell starts the run
 * there, with a Print button and a test page.
 *
 * **Print** lays the run out on Letter pages in inches (`LabelSheets`),
 * rendered beside the console where `@media print` shows it alone, and
 * opens the browser's dialog. When the dialog closes (`afterprint`) the
 * page asks whether the labels printed correctly: Yes sends back the lines
 * each label carried, as printed, and the server records them; No records
 * nothing, and the run can be printed again from any cell. Printed labels
 * then wait in To apply (`ToApply`) until each is marked on its holder. The
 * test page
 * prints the same layout with every cell outlined, for plain paper, and
 * asks nothing. **Test pages** print that outline for either sheet with a
 * made-up label in every cell (`sampleLabels`, numbered from 900001), so the
 * printer's placement and the text's size can be checked, and a label
 * scanned, with nothing chosen to print. Its **printer correction** undoes a printer that prints
 * the page a little small (or large): every label and test page is laid out
 * larger (or smaller) by it (`PrinterCorrection`, `correctedBox`). It is one
 * for the installation, read from the server and saved back as it is typed
 * (`correctionSaver`); until it has loaded, its boxes wait.
 */
export default function Labels() {
  const [source, setSource] = useState('batch')
  const [starts, setStarts] = useState({})
  // What is being printed: the run's labels as they were when Print was
  // pressed, so the answer records exactly what went to the printer.
  const [printing, setPrinting] = useState(null)
  const [asking, setAsking] = useState(null)
  const [recording, setRecording] = useState(false)
  const [askError, setAskError] = useState('')
  const [said, setSaid] = useState('')
  // The correction typed here, once there is one; until then, the server's.
  const [chosen, setChosen] = useState(null)
  const [correctionError, setCorrectionError] = useState('')
  const saveCorrection = useRef(null)
  // The print request already handed to the browser: an effect run again
  // for the same one (StrictMode's setup, cleanup, setup) prints it once.
  const printed = useRef(null)

  const sheets = useRequest('label-sheets', () => api.labelSheets())
  const run = useRequest(source, () => api.labelRun(source))
  const batch = useRequest('label-batch', () => api.labelBatch())
  const waiting = useRequest('labels-waiting', () => api.labelsWaiting())
  const stored = useRequest('label-correction', () => api.labelCorrection())
  const correction = chosen ?? normalCorrection(stored.data)
  const answer = run.busy ? null : run.data
  const sheetByCode = Object.fromEntries((sheets.data ?? []).map((s) => [s.code, s]))

  function chooseCorrection(next) {
    setChosen(next)
    saveCorrection.current ??= correctionSaver(
      (value) => api.saveLabelCorrection(value),
      setCorrectionError,
      stored.data,
    )
    saveCorrection.current(next)
  }

  useEffect(() => {
    if (!printing) return undefined
    function done() {
      setPrinting(null)
      if (!printing.outline) {
        setAskError('')
        setAsking(printing)
      }
    }
    window.addEventListener('afterprint', done, { once: true })
    if (printed.current !== printing) {
      printed.current = printing
      window.print()
    }
    return () => window.removeEventListener('afterprint', done)
  }, [printing])

  function batchChanged() {
    batch.reload()
    if (source === 'batch') run.reload()
  }

  function print(sheetRun, outline) {
    setSaid('')
    setPrinting({
      source,
      sheet: sheetByCode[sheetRun.sheet],
      labels: sheetRun.labels,
      start: starts[sheetRun.sheet] ?? 1,
      outline,
    })
  }

  /** A sheet of outlined cells, each with a sample label, whatever the run holds. */
  function printTest(sheet) {
    setSaid('')
    setPrinting({ source, sheet, labels: sampleLabels(sheet), start: 1, outline: true })
  }

  async function recordPrinted() {
    setRecording(true)
    setAskError('')
    try {
      await api.recordPrintedLabels(
        asking.source,
        asking.labels.map(({ item_id, lines }) => ({ item_id, lines })),
      )
      setSaid(
        `${labelsWord(asking.labels.length)} recorded as printed: tick them in To ` +
          'apply once they are on their holders.',
      )
      setAsking(null)
      run.reload()
      batch.reload()
      waiting.reload()
    } catch (err) {
      setAskError(err.message)
    } finally {
      setRecording(false)
    }
  }

  return (
    <HelpScope>
      <h1>Labels</h1>
      <p className="muted">
        Holder labels on sheets from sheetlabels.com: SL597 for coins, SL564 for notes
        and sets. Choose what to print, click the cell of the first unused label on your
        sheet, then Print. In the print dialog print at 100% -- &quot;Actual size&quot;,
        not &quot;Fit to page&quot; -- with headers and footers turned off.
      </p>
      {sheets.error && <p className="error">{sheets.error}</p>}
      {said && <output className="notice status-line">{said}</output>}

      <fieldset className="label-source" data-help="label_source">
        <legend>What to print</legend>
        {SOURCES.map(([value, text]) => (
          <label key={value}>
            <input
              type="radio"
              name="label-source"
              value={value}
              checked={source === value}
              onChange={() => {
                setSaid('')
                setSource(value)
              }}
            />{' '}
            {text}
            {source === value && answer ? ` (${labelCount(answer)})` : ''}
          </label>
        ))}
      </fieldset>

      {run.error && <p className="error">{run.error}</p>}
      {!answer && !run.error && <p className="muted">Loading...</p>}
      {answer && answer.skipped.length > 0 && (
        <p className="error">
          Not printed, no longer labelable: {answer.skipped.join(', ')}. Remove them
          from the batch.
        </p>
      )}
      {answer?.runs.length === 0 && <p className="muted">Nothing to print.</p>}
      {answer &&
        sheets.data &&
        answer.runs.map((sheetRun) => {
          const sheet = sheetByCode[sheetRun.sheet]
          if (!sheet) return null
          const title = `${sheet.name} labels, ${sheet.code}`
          return (
            <section key={sheetRun.sheet} aria-label={title} className="label-run">
              <h2>
                {title}: {labelsWord(sheetRun.labels.length)}
              </h2>
              <SheetPicker
                sheet={sheet}
                count={sheetRun.labels.length}
                start={starts[sheetRun.sheet] ?? 1}
                onStart={(cell) =>
                  setStarts((current) => ({ ...current, [sheetRun.sheet]: cell }))
                }
              />
              <div className="label-run-actions">
                <button type="button" onClick={() => print(sheetRun, false)}>
                  Print
                </button>
                <button type="button" onClick={() => print(sheetRun, true)}>
                  Print a test page
                </button>
              </div>
            </section>
          )
        })}

      {sheets.data && (
        <section aria-labelledby="label-tests-heading" className="label-tests">
          <h2 id="label-tests-heading">Test pages</h2>
          <p className="muted">
            Every cell of a sheet outlined on plain paper, to hold against a sheet of
            labels and check where the printer puts them. Each cell holds a sample
            label, numbered from 900001 (no such item), to show the size of the text.
            Nothing is recorded.
          </p>
          <p className="muted">
            If the outlines come out small -- the top row low and the bottom row high --
            measure the printed grid and enter what the printer printed, measured ÷
            intended × 100. The SL564 grid is 8.000 in across and 10.625 in from the top
            of the first row to the bottom of the last. Every label and test page is
            then laid out that much larger. One for the installation: every computer
            prints with it.
          </p>
          {stored.busy ? (
            <p className="muted">Loading the printer correction...</p>
          ) : (
            <PrinterCorrection correction={correction} onChange={chooseCorrection} />
          )}
          {stored.error && (
            <p className="error">
              The printer correction could not be read ({stored.error}): printing at
              100% until it is.
            </p>
          )}
          {correctionError && (
            <p className="error">
              The printer correction could not be saved: {correctionError}
            </p>
          )}
          <div className="label-run-actions">
            {sheets.data.map((sheet) => (
              <button key={sheet.code} type="button" onClick={() => printTest(sheet)}>
                Test page: {sheet.name}, {sheet.code}
              </button>
            ))}
          </div>
        </section>
      )}

      <ToApply
        runs={waiting.data}
        sheetNames={Object.fromEntries(
          (sheets.data ?? []).map((s) => [s.code, s.name]),
        )}
        onChanged={() => {
          waiting.reload()
          run.reload()
        }}
      />
      {waiting.error && <p className="error">{waiting.error}</p>}

      <PrintBatch batch={batch.data} onChanged={batchChanged} />
      {batch.error && <p className="error">{batch.error}</p>}

      {printing &&
        createPortal(
          <div className="label-print">
            <LabelSheets
              sheet={printing.sheet}
              labels={printing.labels}
              start={printing.start}
              outline={printing.outline}
              correction={correction}
            />
          </div>,
          document.body,
        )}

      {asking && (
        <ConfirmDialog
          question="Did these labels print correctly?"
          confirmLabel="Yes"
          busyLabel="Recording..."
          cancelLabel="No"
          busy={recording}
          onConfirm={recordPrinted}
          onCancel={() => setAsking(null)}
        >
          <p>
            Yes records {labelsWord(asking.labels.length)} as printed
            {asking.source === 'batch' ? ' and takes them out of the batch' : ''}; they
            wait in To apply until you mark them on their holders. No records nothing:
            the run can be printed again from any cell.
          </p>
          {askError && <p className="error">{askError}</p>}
        </ConfirmDialog>
      )}
    </HelpScope>
  )
}
