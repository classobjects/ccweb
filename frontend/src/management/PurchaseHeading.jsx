// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { purchaseNumber } from './purchase-number'
import { date } from '../shared/format'

/**
 * A purchase's heading: its order number, who it was bought from and when,
 * and links to the vendor's page and the seller's where they are known.
 *
 * `numbered` puts the console's own purchase number first, for a page that
 * reaches the purchase from a link rather than from the purchase list,
 * where that number is a column of its own. A purchase with no order number
 * says so, rather than leaving an empty place between two separators.
 */
export default function PurchaseHeading({ purchase, numbered = false }) {
  return (
    <h2>
      {numbered && `${purchaseNumber(purchase.id)} · `}
      {purchase.order_number || <span className="muted">no order number</span>}
      {' · '}
      {purchase.vendor}
      {' · '}
      {date(purchase.ordered_on)}
      {purchase.source_url && (
        <>
          {' · '}
          <a href={purchase.source_url} target="_blank" rel="noopener noreferrer">
            Vendor page
          </a>
        </>
      )}
      {purchase.seller && (
        <>
          {' · Seller '}
          {purchase.seller_url ? (
            <a href={purchase.seller_url} target="_blank" rel="noopener noreferrer">
              {purchase.seller}
            </a>
          ) : (
            purchase.seller
          )}
        </>
      )}
    </h2>
  )
}
