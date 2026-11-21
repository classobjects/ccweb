// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'

import { api } from '../../api'
import ConfirmDialog from '../../ConfirmDialog'

//: Past this many matches, the button asks first: emptying a batch filled by
//: mistake takes a Remove per item.
const ASK_ABOVE = 200

/** "1 item" or "N items", the number grouped. */
const itemsWord = (n) => (n === 1 ? '1 item' : `${n.toLocaleString()} items`)

/** What an add did, in one sentence. */
function saidOf({ added, already, not_labelable: skipped }) {
  const parts = [`${itemsWord(added)} added to the label batch`]
  if (already) parts.push(`${already.toLocaleString()} already in it`)
  if (skipped) parts.push(`${skipped.toLocaleString()} take no label`)
  return `${parts.join('; ')}. Print them from the Labels page.`
}

/**
 * Add every item the search matches -- on every page, not only the ticked
 * rows -- to the label print batch, so the screen's own filters (an
 * item-number range, a series, the Label state...) choose what to label.
 * Items that take no label (sold, deleted, split) are passed over and
 * counted, and the Labels page prints the batch.
 */
export default function AddMatchesToLabelBatch({ view, filters, total }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const [error, setError] = useState('')
  // What was said is about one search; another search says nothing yet.
  const key = JSON.stringify(filters)
  const [saidFor, setSaidFor] = useState(null)

  if (total === 0) return null

  async function add() {
    setBusy(true)
    setError('')
    try {
      const done = await api.addMatchesToLabelBatch(view, filters)
      setSaid(saidOf(done))
      setSaidFor(key)
      setAsking(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => (total > ASK_ABOVE ? setAsking(true) : add())}
      >
        Add all {total.toLocaleString()} matching to label batch
      </button>
      {saidFor === key && said && (
        <output className="notice status-line">{said}</output>
      )}
      {error && !asking && <p className="error">{error}</p>}
      {asking && (
        <ConfirmDialog
          question={`Add all ${itemsWord(total)} to the label batch?`}
          confirmLabel="Add them"
          busyLabel="Adding..."
          cancelLabel="Cancel"
          busy={busy}
          onConfirm={add}
          onCancel={() => setAsking(false)}
        >
          <p>
            Every item these filters match, on every page. Those that take no label are
            passed over.
          </p>
          {error && <p className="error">{error}</p>}
        </ConfirmDialog>
      )}
    </>
  )
}
