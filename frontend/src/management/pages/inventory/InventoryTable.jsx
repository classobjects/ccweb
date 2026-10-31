// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { Fragment } from 'react'
import { Link } from 'react-router-dom'

import HelpScope from '../../HelpScope'

import { date, money } from '../../../shared/format'

/**
 * What one field shows for a row: a muted dash for a value that is missing
 * or empty, the amount formatted when `kind` is 'money', else the text.
 */
function cell(row, key, kind) {
  const value = row[key]
  if (value === null || value === undefined || value === '')
    return <span className="muted">-</span>
  if (kind === 'money') return money(value)
  return String(value)
}

/**
 * The order field: a link to the purchase an item arrived on, opened in
 * Purchases as Order lookup opens it, or a dash when none is recorded.
 *
 * Named by its own number when the vendor issued one; many eBay listings
 * have no vendor order number, so those fall back to the vendor and the
 * date ordered -- still enough to tell one order from another.
 */
function orderCell(row) {
  if (row.purchase_order_id == null) return <span className="muted">-</span>
  const label =
    row.order_number ?? `${row.vendor ?? 'order'} ${date(row.ordered_on)}`.trim()
  return (
    <Link className="mono" to={`/purchases?order=${row.purchase_order_id}`}>
      {label}
    </Link>
  )
}

/** The arrow next to the field currently being sorted on, if any. */
function sortMarker(current, key) {
  if (current.sort !== key) return ''
  return current.desc === 'true' ? ' v' : ' ^'
}

/** A sortable field's `aria-sort`: its direction when it is the sort, else none. */
function sortDirection(current, key) {
  if (current.sort !== key) return 'none'
  return current.desc === 'true' ? 'descending' : 'ascending'
}

/**
 * The inventory results table: two lines of headers, and three lines per item.
 *
 * `config.columns` are pairs of fields (`specs.js`): each column's first
 * field on an item's first line, its second -- where it has one -- on the
 * line under it, and a header line for each, so every field keeps its own
 * title and sort. `config.detail`, when set, names a field shown on a third
 * line, spanning the columns: the description is read rather than compared,
 * and long, so it takes no column of its own. An item without one is two
 * lines.
 *
 * `selected` is an array of ids; `onSelect(ids)` replaces it wholesale, so
 * the parent holds one piece of state rather than the table holding a
 * second copy able to disagree with it. `onOpen` opens the edit form for a
 * row's item.
 *
 * `sortable` is what the server says it can sort by, sent with every page.
 * Only those headers are clickable: the server refuses any other field
 * ("cannot sort by"), so a header it cannot sort by must not look sortable.
 */
export default function InventoryTable({
  config,
  rows,
  current,
  apply,
  selected,
  onSelect,
  onOpen,
  sortable = [],
}) {
  const ids = rows.map((r) => r.id)
  const allShown = ids.length > 0 && ids.every((id) => selected.includes(id))
  const columns = config.columns

  function toggle(id) {
    onSelect(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    )
  }

  /** One field's header: its sort button where the server can sort by it. */
  function header(field, line) {
    if (!field) return <th key={`blank-${line}`} />
    const [label, key] = field
    if (!sortable.includes(key)) return <th key={key}>{label}</th>
    // A button, so the sort is reached from the keyboard, and `aria-sort`
    // says which way: the marker is only seen.
    return (
      <th key={key} className="sortable" aria-sort={sortDirection(current, key)}>
        <button
          type="button"
          className="link sort-header"
          onClick={() =>
            apply({
              sort: key,
              desc: current.sort === key && current.desc !== 'true' ? 'true' : '',
            })
          }
        >
          {label}
          <span aria-hidden="true">{sortMarker(current, key)}</span>
        </button>
      </th>
    )
  }

  /** One field's cell on an item's line, or an empty cell where a column has none. */
  function field(row, spec, line) {
    if (!spec) return <td key={`blank-${line}`} />
    const [label, key, kind] = spec
    // The code opens the item; the order links to its purchase; every other
    // field is its value.
    let shown
    if (key === 'item_code') {
      shown = (
        <button className="link mono" onClick={() => onOpen(row.id)}>
          {row.item_code}
        </button>
      )
    } else if (key === 'order_number') {
      shown = orderCell(row)
    } else {
      shown = cell(row, key, kind)
    }
    // A long value scrolls in its cell rather than widening the table; an
    // amount or the item's code is short, read whole, and stays as it is.
    const whole = kind === 'money' || key === 'item_code'
    return (
      <td
        key={key}
        className={key === 'item_code' ? 'item-code' : whole ? undefined : kind}
        data-label={label}
      >
        {whole ? shown : <div className="cell-scroll">{shown}</div>}
      </td>
    )
  }

  return (
    <HelpScope>
      {/* On a phone each item stacks into a card, a line per labelled cell. */}
      <table className="table inventory-table stacks">
        <thead>
          <tr>
            <th className="select-cell" data-help="select_page" rowSpan={2}>
              {/* Selects the current page, not the whole result set.
                "Apply to 7,591" from one click on a 50-row page is not
                something anyone means. */}
              <input
                type="checkbox"
                aria-label="Select this page"
                checked={allShown}
                onChange={() =>
                  onSelect(
                    allShown
                      ? selected.filter((id) => !ids.includes(id))
                      : [...new Set([...selected, ...ids])],
                  )
                }
              />
            </th>
            {columns.map((pair) => header(pair[0], 0))}
          </tr>
          <tr className="second-titles">
            {columns.map((pair, at) => header(pair[1], at))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = config.detail ? row[config.detail] : null
            return (
              // The lines of one item read as one: a rule after the last
              // only (`item-line`).
              <Fragment key={row.id}>
                <tr className="item-line">
                  <td
                    className="select-cell"
                    data-help="select_row"
                    rowSpan={detail ? 3 : 2}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.item_code}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  {columns.map((pair) => field(row, pair[0], 0))}
                </tr>
                <tr className={detail ? 'item-line item-second' : 'item-second'}>
                  {columns.map((pair, at) => field(row, pair[1], at))}
                </tr>
                {detail && (
                  <tr className="item-detail">
                    <td colSpan={columns.length}>{detail}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </HelpScope>
  )
}
