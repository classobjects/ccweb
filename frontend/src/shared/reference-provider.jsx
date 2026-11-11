// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from './api'
import { ReferenceContext } from './reference-context'

/**
 * Classifier vocabularies, fetched on first use and shared.
 *
 * The API takes classifier *codes* -- `usd_coin_1_00`, `MS64`, `US` -- which is
 * the right contract between machines and useless to a person filling in a
 * form. This turns them into pickers that submit the code and show the label.
 *
 * Cached in one place because a single admin form needs five or six of these
 * vocabularies. A copy older than `STALE_MS` is renewed the next time
 * something uses it or the window gets focus back, and a copy is dropped
 * when a value is added or changed (`invalidate`).
 *
 * A table's first load is one request, however many pickers ask for it in
 * the same commit and however often StrictMode repeats their effects:
 * `requested` is a ref, read and written synchronously, so the second caller
 * sees the first caller's request before any state has updated. `load` is
 * therefore stable; `useReference` calls it while its table is missing, and
 * `refresh` once it is held.
 */

/*
 * The provider is a module of its own, apart from `ReferenceSelect`, because
 * the shop mounts the provider and never the picker: a module both apps
 * import lands whole in the bundle they share, so the picker -- with its add
 * form, find box and their helpers -- would be downloaded by every visitor
 * to the shop for nothing.
 */

//: How old a loaded vocabulary may be before it is fetched again on its
//: next use. Long enough that a form's dozen pickers ask once, short
//: enough that a value changed elsewhere is not offered for long.
const STALE_MS = 60_000

/**
 * Holds the loaded vocabularies and gives its children `tables`, by name,
 * with `load`, `refresh` and `invalidate` to fetch one, renew an old copy,
 * and drop one that has been changed, and `failed`, naming the tables whose
 * latest fetch did not succeed.
 *
 * `includeInactive` fetches retired values too. The console sets it -- it
 * is a manager's, and a record may still use a retired value its picker has
 * to show -- and the shop does not: the server refuses retired values to
 * anyone else.
 */
export function ReferenceProvider({ children, includeInactive = false }) {
  const [tables, setTables] = useState({})
  //: table -> true while its latest fetch failed. Such a table is held as
  //: an empty list, which on its own cannot be told from an empty vocabulary.
  const [failed, setFailed] = useState({})
  //: table -> a token for its latest request, loaded or still in flight.
  const requested = useRef(new Map())
  //: table -> when its values were last asked for, once they have arrived.
  const asked = useRef(new Map())

  /**
   * Ask for `table`'s values as the newest request for it. An answer to a
   * request since superseded -- invalidated, or asked again -- is stale and
   * dropped; the newer one wins. Values that arrive replace the table's and
   * clear its failure; a fetch that fails calls `onFail()` instead.
   */
  const fetchTable = useCallback(
    async (table, { onFail }) => {
      const token = {}
      requested.current.set(table, token)
      let values
      let missed = false
      try {
        values = (await api.getReference(table, { includeInactive })).values
      } catch {
        missed = true
      }
      if (requested.current.get(table) !== token) return
      asked.current.set(table, Date.now())
      if (missed) {
        onFail()
        return
      }
      setTables((t) => ({ ...t, [table]: values }))
      setFailed((f) => ({ ...f, [table]: false }))
    },
    [includeInactive],
  )

  const load = useCallback(
    async (table) => {
      if (requested.current.has(table)) return
      await fetchTable(table, {
        // A missing vocabulary must not take the form down: the field falls
        // back to a free-text input, and says the vocabulary did not load.
        onFail: () => {
          setTables((t) => ({ ...t, [table]: [] }))
          setFailed((f) => ({ ...f, [table]: true }))
        },
      })
    },
    [fetchTable],
  )

  // A vocabulary is changed in other places than this page: another tab,
  // the Vocabularies page in another window, a merge. A copy kept for the
  // life of the page then offers a value that no longer exists, and a
  // save that picks it is refused. So a copy older than `STALE_MS` is
  // fetched again when something asks for the vocabulary, and when the
  // window gets focus back. The values held stay in place until the
  // answer arrives -- a picker never falls back to a text box for this --
  // and stay if it fails.
  const refresh = useCallback(
    async (table) => {
      const at = asked.current.get(table)
      // Never loaded, still loading, or fresh enough.
      if (at === undefined || Date.now() - at < STALE_MS) return
      // Marked now, not on arrival, so a second use meanwhile asks nothing.
      asked.current.set(table, Date.now())
      // A failed refresh keeps the values held.
      await fetchTable(table, { onFail: () => {} })
    },
    [fetchTable],
  )

  useEffect(() => {
    const onFocus = () => {
      for (const table of asked.current.keys()) refresh(table)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // After adding a value the cached vocabulary is stale, so it is dropped and
  // refetched rather than patched locally -- the server decides sort order and
  // provenance, and guessing at them here is how a cache starts lying.
  //
  // The refetch starts here, not from the consumers: a table invalidated
  // while its first load is still out was never in `tables`, so its
  // consumers' "missing" does not change and their effects do not run again.
  // Only a table already asked for is fetched again; one nobody has used
  // stays unrequested until something asks for it.
  const invalidate = useCallback(
    (table) => {
      const wasRequested = requested.current.delete(table)
      asked.current.delete(table)
      setTables((t) => {
        const next = { ...t }
        delete next[table]
        return next
      })
      if (wasRequested) load(table)
    },
    [load],
  )

  const value = useMemo(
    () => ({ tables, failed, load, invalidate, refresh }),
    [tables, failed, load, invalidate, refresh],
  )

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>
}
