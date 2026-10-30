// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0

/**
 * Where a paged list stands -- "12 of 12", or "101-200 of 340" -- and the
 * buttons to the pages either side.
 *
 * `offset` is where this page starts, `shown` how many rows it holds, and
 * `total` the count across every page from the server, or null when it
 * gave none, which counts this page's rows instead. `onOffset` gets the
 * offset to load, a `pageSize` either way. `earlier` and `later` name the
 * buttons, in the order the server sends the rows: Newer and Older for a
 * list that starts with the newest.
 *
 * A fragment, not a row of its own, so a page can put it beside its
 * filters. A button is shown only where there is a page to go to, rather
 * than greyed out where there is none.
 */
export default function Pager({
  offset,
  shown,
  total,
  pageSize,
  onOffset,
  earlier = 'Newer',
  later = 'Older',
}) {
  const count = total ?? offset + shown
  const counted =
    offset === 0 && shown === count
      ? `${count} of ${count}`
      : `${shown === 0 ? 0 : offset + 1}-${offset + shown} of ${count}`

  return (
    <>
      <span className="muted">{counted}</span>
      {offset > 0 && (
        <button
          className="link"
          onClick={() => onOffset(Math.max(0, offset - pageSize))}
        >
          {earlier}
        </button>
      )}
      {offset + shown < count && (
        <button className="link" onClick={() => onOffset(offset + pageSize)}>
          {later}
        </button>
      )}
    </>
  )
}
