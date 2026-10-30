// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'

import ItemEditForm from './ItemEditForm'

/**
 * Walk a result set one item at a time.
 *
 * **The queue is frozen at entry.** `ids` is taken as fixed for the whole
 * review: the caller hands it a list captured once, when review starts. If
 * the search re-ran at each step, fixing item 3's missing year would remove
 * it from `issue=no_year`, shrink the set by one, and shift every position
 * after it -- silently skipping an item. A saved item keeps its place in the
 * queue, and the count of those saved is shown beside the position.
 *
 * A deleted item is the one exception: it no longer exists to be reviewed,
 * so it leaves the queue -- the item after it takes its place -- and is not
 * counted as saved. Deleting the last one left ends the review. However the
 * review ends, `onClose` is told the ids deleted in it, so a caller holding
 * one of them does not go on to read or receive an item that is gone.
 *
 * Previous and Next open another item's form: an edit not yet saved on the
 * one being left is not carried over.
 */
export default function ReviewPane({ ids, onClose }) {
  const [at, setAt] = useState(0)
  const [done, setDone] = useState([])
  const [deleted, setDeleted] = useState([])

  const queue = ids.filter((id) => !deleted.includes(id))
  if (queue.length === 0) return null
  const itemId = queue[at]

  function removed() {
    if (queue.length === 1) {
      onClose?.([...deleted, itemId])
      return
    }
    setDeleted((d) => [...d, itemId])
    setDone((d) => d.filter((id) => id !== itemId))
    // The item after it slides into this place; at the end, the one before.
    setAt(Math.min(at, queue.length - 2))
  }

  return (
    <div className="review-pane">
      <div className="row">
        <button disabled={at === 0} onClick={() => setAt(at - 1)}>
          Previous
        </button>
        <span className="muted">
          {at + 1} of {queue.length}
          {done.length > 0 && ` -- ${done.length} saved`}
        </span>
        <button disabled={at + 1 >= queue.length} onClick={() => setAt(at + 1)}>
          Next
        </button>
        <button className="link" onClick={() => onClose?.(deleted)}>
          Leave review
        </button>
      </div>

      <ItemEditForm
        key={itemId}
        itemId={itemId}
        onSaved={() => {
          setDone((d) => (d.includes(itemId) ? d : [...d, itemId]))
          // Saving advances, because the next thing you want after finishing
          // a coin is the next coin.
          if (at + 1 < queue.length) setAt(at + 1)
        }}
        onDeleted={removed}
      />
    </div>
  )
}
