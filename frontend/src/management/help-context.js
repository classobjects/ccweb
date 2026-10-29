// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react'

/**
 * Which field the console's help band is explaining.
 *
 * Its own module, apart from the band and the scope components, so those
 * stay components-only modules; a mixed module defeats Fast Refresh -- the
 * same split `shared/reference-context.js` makes.
 *
 * `null` outside the console shell (a form rendered on its own, as in a
 * component test): `HelpScope` then shows the help in an area of its own.
 */
export const HelpContext = createContext(null)

/** The band's `{ field, setField }`, or null when there is no band. */
export function useHelpBand() {
  return useContext(HelpContext)
}
