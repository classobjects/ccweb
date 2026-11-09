// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react'

import { api } from '../api'
import InventoryTable from './inventory/InventoryTable'
import { COIN_VIEW, CURRENCY_VIEW } from './inventory/specs'

//: The most rows the search returns at once; a bigger purchase takes more pages.
const PAGE = 200

//: Where a purchase's list starts: in item-code order, the order entered.
const FIRST_SORT = { sort: 'item_code', desc: '' }

/**
 * A view's columns less Order: every item here is on the purchase above it.
 * A pair left with no field goes too.
 */
function withoutOrder(config) {
  const columns = config.columns
    .map((pair) => pair.filter((spec) => spec && spec[1] !== 'order_number'))
    .filter((pair) => pair.length > 0)
  // The description is the third line, as on Coins and Currency; an item
  // not yet described shows the seller's title there instead, so no line of
  // the purchase is left saying nothing about what it is.
  return { ...config, columns, detail: 'about' }
}

/**
 * Every item of one view on the purchase, sorted as asked, page by page;
 * with the fields the server can sort by.
 */
async function allOf(view, purchaseId, { sort, desc }) {
  const rows = []
  for (;;) {
    const page = await api.searchInventory(view, {
      purchase_order_id: purchaseId,
      sort,
      desc: desc === 'true',
      limit: PAGE,
      offset: rows.length,
    })
    rows.push(...page.rows)
    if (page.rows.length === 0 || rows.length >= page.total) {
      return { rows, sortable: page.sortable ?? [] }
    }
  }
}

/** The views a purchase's lines need: Coins for anything not a note, Currency for notes. */
function viewsFor(lines) {
  const views = []
  if (lines.some((line) => line.item_kind !== 'currency')) views.push(COIN_VIEW)
  if (lines.some((line) => line.item_kind === 'currency')) views.push(CURRENCY_VIEW)
  return views
}

/**
 * One kind's table: its own sort, which starts at the item code and moves
 * with a click on any header the server can sort by, as on Coins and
 * Currency. Read again whenever the purchase is -- after an item is saved,
 * entered or received -- or the sort changes; the last rows stay on screen
 * while it is, so the list does not blink.
 */
function KindTable({ config, purchase, onOpen, headed }) {
  const [current, setCurrent] = useState(FIRST_SORT)
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const shown = withoutOrder(config)

  useEffect(() => {
    let live = true
    allOf(config.view, purchase.id, current)
      .then(({ rows, sortable }) => {
        if (!live) return
        setFound({
          purchaseId: purchase.id,
          sortable,
          rows: rows.map((row) => ({
            ...row,
            about: row.description || row.source_title,
          })),
        })
        setError('')
      })
      .catch((err) => {
        if (live) setError(err.message)
      })
    return () => {
      live = false
    }
  }, [config.view, purchase, current])

  let body
  if (error) {
    body = <p className="error">The items could not be read: {error}</p>
  } else if (!found || found.purchaseId !== purchase.id) {
    // Another purchase's rows are never shown for this one.
    body = <p className="muted">Reading the items...</p>
  } else {
    body = (
      <InventoryTable
        config={shown}
        rows={found.rows}
        current={current}
        apply={(change) => setCurrent((was) => ({ ...was, ...change }))}
        onOpen={onOpen}
        sortable={found.sortable}
      />
    )
  }
  return (
    <section aria-label={`${config.title} on this purchase`}>
      {headed && found && found.purchaseId === purchase.id && (
        <h3>
          {config.title} ({found.rows.length})
        </h3>
      )}
      {body}
    </section>
  )
}

/**
 * A purchase's items, listed as Coins and Currency list them: year, mint,
 * denomination, series, grade and metal for a coin; serial, Fr#, series,
 * grade and seal for a note; status and cost for both; and the description
 * under each. A purchase holding both kinds shows a table for each, headed.
 *
 * Read from the inventory search (`purchase_order_id`), which counts the
 * same live items the purchase lists: deleted rows and a split lot's
 * superseded parent left out.
 */
export default function PurchaseItems({ purchase, onOpen }) {
  const views = viewsFor(purchase.lines ?? [])
  return views.map((config) => (
    <KindTable
      key={config.view}
      config={config}
      purchase={purchase}
      onOpen={onOpen}
      headed={views.length > 1}
    />
  ))
}
