// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useContext, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { FIELD_HELP } from './fieldHelp'
import { HelpContext } from './help-context'
import { useRaisedError } from './raised-error'

/**
 * The console's help band: always at the bottom of the window, explaining
 * whichever field has focus in any form above it.
 *
 * The console is laid out as a column the height of the window -- menu,
 * then the page, then this band -- and only the page scrolls, so a form
 * always fits between the menu and the band and the explanation never
 * scrolls out of sight.
 *
 * `HelpScope`s inside the page set the field. The explanation is keyed to
 * the page it came from and cleared on moving to another, so a field on the
 * last page is never explained under this one.
 */
export function HelpProvider({ children }) {
  const { pathname } = useLocation()
  const [shown, setShown] = useState({ pathname, field: null })
  const field = shown.pathname === pathname ? shown.field : null

  const value = useMemo(
    () => ({
      field,
      setField: (next) => setShown({ pathname, field: next }),
    }),
    [field, pathname],
  )
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

/**
 * What is shown about `field` (a `FIELD_HELP` key, or null): its title and
 * text, or the hint to click into a field. The band and a `HelpScope`
 * without one both say it the same way.
 */
export function HelpText({ field }) {
  const help = field ? FIELD_HELP[field] : null
  if (!help)
    return <span className="muted">Click in a field to see what it means.</span>
  return (
    <>
      <strong>{help.title}</strong> {help.text}
    </>
  )
}

/**
 * The band itself, rendered once by the console shell below its content, and
 * by a dialog below its body.
 *
 * An error shown anywhere on its page is repeated here in red, in place of
 * the field help, so it is seen on a page too long for its own message to be
 * in view (`useRaisedError`). The cross hides it to show the help again.
 * Nothing here takes focus: the field being edited keeps it, and so do the
 * accelerator keys.
 */
export function HelpBar() {
  const ref = useRef(null)
  const help = useContext(HelpContext)
  const { error, dismiss } = useRaisedError(ref)
  return (
    <footer
      ref={ref}
      className={error ? 'help-bar help-bar-error' : 'help-bar'}
      aria-live="polite"
      aria-label="Field help"
    >
      {error ? (
        <>
          <span className="help-bar-message">{error}</span>
          <button
            type="button"
            className="help-bar-dismiss"
            title="Hide this error and show the field help"
            aria-label="Hide this error and show the field help"
            // A click must leave focus in the field being edited.
            onMouseDown={(e) => e.preventDefault()}
            onClick={dismiss}
          >
            ×
          </button>
        </>
      ) : (
        <HelpText field={help?.field} />
      )}
    </footer>
  )
}
