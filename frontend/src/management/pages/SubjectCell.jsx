// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { subjectOf } from './listing-labels'

/**
 * A table cell naming what a listing offers, as `subjectOf` names it.
 *
 * An item's code is short and read whole, so it keeps its whole width
 * (`item-code`); a lot's title can be long, and scrolls in its cell rather
 * than widening the table.
 */
export default function SubjectCell({ listing, label = 'Item or lot' }) {
  const subject = subjectOf(listing)
  if (listing.item_code) {
    return (
      <td className="item-code" data-label={label}>
        {subject}
      </td>
    )
  }
  return (
    <td data-label={label}>
      <div className="cell-scroll">{subject}</div>
    </td>
  )
}
