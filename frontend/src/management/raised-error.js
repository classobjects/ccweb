// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * An error message on a page: the `error` class every console form gives
 * the red box it reports a problem in. A table row marked `error` is a row
 * highlighted for its problem, not a message, so it is left out; so are
 * `error-list` and the like, which are notes' printing errors, not faults.
 */
const ERROR_SELECTOR = '.error:not(tr)'

/** Keys that, held, make a key an accelerator rather than typing. */
function isAccelerator(event) {
  if (['Control', 'Alt', 'Meta', 'Shift'].includes(event.key)) return false
  if (event.ctrlKey || event.altKey || event.metaKey) return true
  return event.key === 'Enter' && event.target?.tagName === 'INPUT'
}

/**
 * The newest error message shown on the band's page, for the band to repeat
 * where it is always in sight: `{ error, dismiss }`, `error` null when there
 * is none to show.
 *
 * The band's page is the element the band sits in -- the console shell, or a
 * dialog with a band of its own. An error inside a dialog belongs to that
 * dialog, so the console's band does not repeat what a dialog's band shows,
 * nor what a dialog without a band shows in plain sight.
 *
 * The page is watched rather than told: every form already shows its errors
 * in an `error` box, and the band picks up any of them -- one appearing, or
 * its text changing, is the newest. When the form takes the message away,
 * the band lets it go too.
 *
 * `dismiss` hides the errors shown so far, so the field help behind them can
 * be read. One comes back when its text changes, or when a button or an
 * accelerator key is pressed while it is still on the page: pressing Save
 * again for the same refusal changes nothing on the page, and must not go
 * unanswered.
 */
export function useRaisedError(bandRef) {
  const [error, setError] = useState(null)
  const dismissRef = useRef(() => {})

  useEffect(() => {
    const band = bandRef.current
    const page = band?.parentElement
    if (!page) return undefined
    const owner = page.tagName === 'DIALOG' ? page : null
    const seen = new Map()
    let order = 0

    function scan() {
      const present = new Set()
      for (const box of page.querySelectorAll(ERROR_SELECTOR)) {
        if (band.contains(box) || box.closest('dialog') !== owner) continue
        const text = box.textContent.trim()
        if (!text) continue
        present.add(box)
        const known = seen.get(box)
        if (!known || known.text !== text)
          seen.set(box, { text, order: ++order, dismissed: false })
      }
      let newest = null
      for (const [box, entry] of seen) {
        if (!present.has(box)) seen.delete(box)
        else if (!entry.dismissed && (!newest || entry.order > newest.order))
          newest = entry
      }
      setError(newest ? newest.text : null)
    }

    function showAgain(event) {
      if (band.contains(event.target)) return
      if (event.type === 'click' && !event.target.closest?.('button')) return
      if (event.type === 'keydown' && !isAccelerator(event)) return
      for (const entry of seen.values()) entry.dismissed = false
      scan()
    }

    dismissRef.current = () => {
      for (const entry of seen.values()) entry.dismissed = true
      scan()
    }

    const observer = new MutationObserver(scan)
    observer.observe(page, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    // A message already on the page when the band mounts is picked up
    // straight after.
    queueMicrotask(scan)
    document.addEventListener('click', showAgain, true)
    document.addEventListener('keydown', showAgain, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', showAgain, true)
      document.removeEventListener('keydown', showAgain, true)
      dismissRef.current = () => {}
    }
  }, [bandRef])

  const dismiss = useCallback(() => dismissRef.current(), [])
  return { error, dismiss }
}
