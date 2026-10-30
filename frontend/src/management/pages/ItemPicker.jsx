// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from 'react'

import { searchItemsByCode } from '../item-search'

/**
 * Finds one inventory item by code, searching both views since an item code
 * alone does not say whether it is a coin or a piece of currency.
 *
 * `onPick` receives the chosen row (`{ id, item_code, description }`) or
 * `null` when the operator edits the code after having picked one -- a
 * stale selection pointing at a different item than the box now on screen
 * is worse than no selection at all. For the same reason an answer is
 * dropped when the code has been edited, or searched again, since it was
 * asked for: its matches are for a code no longer in the box.
 */
export default function ItemPicker({ onPick }) {
  const [code, setCode] = useState('')
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Moved on by every edit and every search; an answer that finds it moved
  // is for an older code and is dropped.
  const asked = useRef(0)

  function changeCode(value) {
    asked.current += 1
    setCode(value)
    setMatches(null)
    setBusy(false)
    onPick(null)
  }

  async function find() {
    const wanted = code.trim()
    if (!wanted) return
    asked.current += 1
    const token = asked.current
    setBusy(true)
    setError('')
    try {
      const rows = await searchItemsByCode(wanted)
      if (token !== asked.current) return
      setMatches(rows)
      if (rows.length === 0) setError('No item matches that code.')
    } catch (err) {
      if (token !== asked.current) return
      setError(err.message)
      setMatches(null)
    } finally {
      if (token === asked.current) setBusy(false)
    }
  }

  function pick(row) {
    setMatches(null)
    setError('')
    setCode(row.item_code)
    onPick(row)
  }

  return (
    <div className="item-picker">
      <label>
        Item code{/* */}
        <input
          type="text"
          value={code}
          onChange={(e) => changeCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              find()
            }
          }}
        />
      </label>
      <button type="button" disabled={busy} onClick={find}>
        Find
      </button>
      {error && <p className="error">{error}</p>}
      {matches && matches.length > 0 && (
        <ul className="item-picker-matches">
          {matches.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="item-picker-row"
                onClick={() => pick(row)}
              >
                <span className="mono">{row.item_code}</span> {row.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
