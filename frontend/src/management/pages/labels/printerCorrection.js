// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Saving the printer correction (holder-labels-design.md, section 4,
 * "Printer correction").
 *
 * The correction is one for the installation, kept on the server, and the
 * boxes save as they are typed in: 97.5 is sent as 9, 97, 97. and 97.5.
 * Sent all at once, the answers could land in any order and leave 97
 * stored. So a saver sends one at a time, and of the values typed while a
 * save is out, only the newest: what is stored is always the last typed.
 */
import { normalCorrection } from './layout'

const same = (a, b) => a.across === b.across && a.down === b.down

/**
 * A saver: `save(correction)` keeps it with `send`, one request at a time.
 *
 * `saved` is the correction already stored; saving it again sends nothing,
 * nor does one equal to the value last sent. After each request `report`
 * is called with '' or the failure's message. `save` returns a promise
 * settled once every value handed to it so far has been sent.
 */
export function correctionSaver(send, report, saved) {
  let last = saved ? normalCorrection(saved) : null
  let waiting = null
  let running = null

  async function drain() {
    while (waiting) {
      const value = waiting
      waiting = null
      try {
        await send(value)
        report('')
      } catch (err) {
        // Sent again by the next change, even if it is this value.
        last = null
        report(err?.message ?? String(err))
      }
    }
    running = null
  }

  return function save(correction) {
    const kept = normalCorrection(correction)
    if (!(last && same(last, kept))) {
      last = kept
      waiting = kept
      running ??= drain()
    }
    return running ?? Promise.resolve()
  }
}
