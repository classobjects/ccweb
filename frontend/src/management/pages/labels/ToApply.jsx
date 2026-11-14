// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'

import { api } from '../../api'

/** "1 label" or "N labels". */
const labelsWord = (n) => (n === 1 ? '1 label' : `${n} labels`)

/** A run's key: one Yes stamps all its labels alike, one run per sheet. */
const runKey = (run) => `${run.printed_at} ${run.sheet}`

/**
 * To apply: printed labels not yet on their holders
 * (holder-labels-design.md, section 4, "Applying").
 *
 * One table per Yes and sheet, newest first, each label in the order it
 * printed with a tick box. Nothing starts ticked: finding the coins can take
 * days, and a label counts as applied only when the owner ticks it. Select
 * all and Deselect all act on the whole list, or on one run. Applied puts
 * the ticked labels on their holders; Not used forgets them, so the next
 * run prints those items again.
 */
export default function ToApply({ runs, sheetNames, onChanged }) {
  const [ticked, setTicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [said, setSaid] = useState('')

  if (!runs) return null
  const waitingIds = runs.flatMap((run) => run.labels.map((label) => label.item_id))
  // A label settled elsewhere (the inventory) since the tick is not counted.
  const chosen = waitingIds.filter((id) => ticked.has(id))

  function tick(ids, on) {
    setSaid('')
    setTicked((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function settle(how) {
    setBusy(true)
    setError('')
    setSaid('')
    try {
      const answer =
        how === 'applied'
          ? await api.markLabelsApplied(chosen)
          : await api.markLabelsUnused(chosen)
      const verb = how === 'applied' ? 'marked applied' : 'returned to print again'
      const others = answer.not_waiting.length
        ? ` No label was waiting for ${answer.not_waiting.join(', ')}.`
        : ''
      setSaid(`${labelsWord(answer.done)} ${verb}.${others}`)
      setTicked(new Set())
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="to-apply-heading" data-help="labels_to_apply">
      <h2 id="to-apply-heading">
        To apply{waitingIds.length ? `: ${labelsWord(waitingIds.length)}` : ''}
      </h2>
      <p className="muted">
        Labels printed and not yet on their holders. Tick each one once it is on its
        holder, then press Applied. Not used returns the ticked labels -- spoiled, lost
        or set aside -- so the next run prints them again.
      </p>
      {said && <output className="notice status-line">{said}</output>}
      {error && <p className="error">{error}</p>}
      {runs.length === 0 && <p className="muted">No printed labels are waiting.</p>}
      {runs.length > 0 && (
        <div className="label-run-actions">
          <button type="button" onClick={() => tick(waitingIds, true)}>
            Select all
          </button>
          <button type="button" onClick={() => tick(waitingIds, false)}>
            Deselect all
          </button>
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={() => settle('applied')}
          >
            Applied ({chosen.length})
          </button>
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={() => settle('unused')}
          >
            Not used ({chosen.length})
          </button>
        </div>
      )}
      {runs.map((run) => {
        const ids = run.labels.map((label) => label.item_id)
        const title =
          `${sheetNames[run.sheet] ?? run.sheet} labels, printed ` +
          `${new Date(run.printed_at).toLocaleString()}`
        return (
          <div key={runKey(run)} className="label-run" role="group" aria-label={title}>
            <h3>
              {title}: {labelsWord(ids.length)}
            </h3>
            <div className="label-run-actions">
              <button type="button" className="link" onClick={() => tick(ids, true)}>
                Select all
              </button>
              <button type="button" className="link" onClick={() => tick(ids, false)}>
                Deselect all
              </button>
            </div>
            <table className="table stacks" aria-label={title}>
              <thead>
                <tr>
                  <th>On the holder</th>
                  <th>Item</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {run.labels.map((label) => (
                  <tr key={label.item_id}>
                    <td data-label="On the holder">
                      <input
                        type="checkbox"
                        aria-label={`${label.item_code} is on its holder`}
                        checked={ticked.has(label.item_id)}
                        onChange={(e) => tick([label.item_id], e.target.checked)}
                      />
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </section>
  )
}
