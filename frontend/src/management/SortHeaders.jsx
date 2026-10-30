// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { nextSort } from './purchase-list'

/**
 * A purchase table's header row, each heading a button that sorts by its
 * column.
 *
 * `columns` are `[heading, key, first]`: the field a column shows and the
 * direction a first click sorts it in. `sort` is `{ key, desc }`, and
 * `onSort` is handed the change as a state updater (`nextSort`), so a
 * `useState` setter can be passed as it is.
 *
 * Buttons rather than clickable headings, so the table sorts from the
 * keyboard; the sorted column says which way it runs through `aria-sort`,
 * and the arrow beside it is for the eye alone.
 */
export default function SortHeaders({ columns, sort, onSort }) {
  return (
    <tr>
      {columns.map(([label, key, first]) => {
        const active = sort.key === key
        const direction = sort.desc ? 'descending' : 'ascending'
        return (
          <th key={key} aria-sort={active ? direction : 'none'}>
            <button
              type="button"
              className="link sort-header"
              onClick={() => onSort((current) => nextSort(current, key, first))}
            >
              {label}
              {active && <span aria-hidden="true">{sort.desc ? ' ▼' : ' ▲'}</span>}
            </button>
          </th>
        )
      })}
    </tr>
  )
}
