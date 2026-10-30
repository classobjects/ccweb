// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { api } from '../../api'
import { COIN_VIEW, CURRENCY_VIEW } from './specs'
import { useRequest } from '../../../shared/useRequest'

/**
 * The other view's matches for the search made here.
 *
 * Coins and Currency each search only their own items, so a search that
 * belongs on the other view -- a note's serial typed on Coins, a grade of
 * 70 that only coins reach -- finds nothing here, with nothing to say where
 * the items are. This counts the other view's matches for the same filters.
 *
 * When this view found nothing and the other has matches, the other view is
 * where the answer is: this opens it with every filter carried, and that
 * view says why it is showing. Sorting and paging are left behind -- a
 * column sorted on one view need not exist on the other -- and a filter the
 * other view does not know makes its count fail, so the page stays. The
 * step replaces the empty page in history: were it kept, Back would return
 * to it and it would send the reader on again.
 *
 * When this view has matches of its own, only a serial is counted on the
 * other view too, and the page links there rather than going. A serial is
 * one item's; a year or a grade matches on both views, and pointing at the
 * other after every such search would be noise. One view's rows never mix
 * with the other's, whose columns differ.
 *
 * The count is kept with the filters it was asked for, so a hint for an
 * earlier search never shows beside a later one. A count that fails to
 * arrive shows no hint: the search above reports its own errors, and this
 * one only adds a pointer.
 */
export default function OtherViewMatches({ view, filters, hereEmpty }) {
  const here = view === COIN_VIEW.view ? COIN_VIEW : CURRENCY_VIEW
  const other = view === COIN_VIEW.view ? CURRENCY_VIEW : COIN_VIEW
  const navigate = useNavigate()
  const { state } = useLocation()

  const key = new URLSearchParams(filters).toString()
  const serial = filters.serial_number
  const ask = Boolean(key) && (Boolean(serial) || hereEmpty)
  const target = `/inventory/${other.view}?${key}`

  // Keyed by the other view and the filters: `busy` while the count on hand
  // was asked for others.
  const answer = useRequest(ask ? target : null, () =>
    api.searchInventory(other.view, {
      ...Object.fromEntries(new URLSearchParams(key)),
      limit: 1,
    }),
  )
  const counted = ask && !answer.busy && !answer.error && answer.data != null
  const total = counted ? answer.data.total : 0
  const switching = counted && total > 0 && hereEmpty

  useEffect(() => {
    if (!switching) return
    navigate(target, {
      replace: true,
      state: { switchedFrom: here.title, key, total },
    })
  }, [switching, navigate, target, here.title, key, total])

  // The serial alone is said as a serial; anything more as the filters.
  const serialAlone = Object.keys(filters).length === 1 && Boolean(serial)
  const what = (verbs) =>
    serialAlone
      ? `${verbs[0]} a serial matching “${serial}”`
      : `${verbs[1]} these filters`

  if (state?.key === key && state?.switchedFrom === other.title) {
    return (
      <p className="notice">
        No items in {other.title} {what(['have', 'match'])}, so this is the{' '}
        {state.total} in {here.title}.
      </p>
    )
  }

  if (!total || switching) return null
  const one = total === 1
  return (
    <p className="notice">
      {total} {one ? 'item' : 'items'} in {other.title}{' '}
      {one ? what(['has', 'matches']) : what(['have', 'match'])}.{' '}
      <Link to={target}>{one ? 'Show it' : 'Show them'}</Link>
    </p>
  )
}
