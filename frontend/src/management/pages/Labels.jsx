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
        Items kept for the next small run. Printing the batch and answering Yes empties
        it of what printed.
      </p>
      <div className="row">
        <label data-help="label_item_number">
          Item number
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
      </div>
      {error && <p className="error">{error}</p>}
      {batch && batch.length === 0 && (
        <p className="muted">The print batch is empty.</p>
      )}
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
                  {label.lines.map((line, i) => (
                    <div key={i} className="cell-scroll">
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
 * asks nothing.
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
  // The print request already handed to the browser: an effect run again
  // for the same one (StrictMode's setup, cleanup, setup) prints it once.
  const printed = useRef(null)

  const sheets = useRequest('label-sheets', () => api.labelSheets())
  const run = useRequest(source, () => api.labelRun(source))
  const batch = useRequest('label-batch', () => api.labelBatch())
  const waiting = useRequest('labels-waiting', () => api.labelsWaiting())
  const answer = run.busy ? null : run.data
  const sheetByCode = Object.fromEntries((sheets.data ?? []).map((s) => [s.code, s]))

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
      {answer && answer.runs.length === 0 && <p className="muted">Nothing to print.</p>}
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
