// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
// Its own module, apart from FriedbergLookup.jsx: a component module that
// also exports a plain function breaks Fast Refresh.

import { isMuleNumber } from '../../friedberg-format'

/**
 * The Mule line beside the Fr. number box, and a warning when the number
 * and the plates disagree.
 *
 * `says` is the plate rules' answer (`GET /api/friedberg/mule`,
 * `app/mule_rules.py`); undefined while it is not in. `number` is the Fr.
 * number typed or attached, normalized; `marked` whether the note carries
 * the Mule attribute; `series` and `backPlate` name the plates in the line.
 *
 * A mule's number says it first: it was read off the note or its holder, and
 * confirming it marks the note a Mule. A note already marked is one. The
 * plates speak after those, and a disagreement with the number is said, not
 * settled: one of the two was misread.
 */
export function muleStatus({ says, number = '', marked = false, series, backPlate }) {
  if (says === undefined) return { text: '', warning: '' }
  const plates = `series ${series} with back plate ${backPlate}`
  const check = 'Check the number and the back plate.'
  if (number && isMuleNumber(number)) {
    return {
      text: `Mule: yes -- ${number} is a mule's number.`,
      warning: says === 'not_mule' ? `But ${plates} is not a mule. ${check}` : '',
    }
  }
  if (says === 'mule') {
    return {
      text: `Mule: yes, by its plates -- ${plates}.`,
      warning: number
        ? `But ${number} is not a mule's number: a mule's ends in m. ${check}`
        : '',
    }
  }
  if (marked) return { text: 'Mule: yes -- this note is marked a Mule.', warning: '' }
  const text = {
    not_mule: `Mule: no, by its plates -- ${plates}.`,
    undecided: `Mule: back plate ${backPlate} cannot be told by its number -- look at the note.`,
    needs_back_plate: 'Mule: not known until the back plate number is entered.',
    no_rule:
      "Mule: its plates cannot tell for this series -- only a mule's Fr. number (ending in m) makes it one.",
  }[says]
  return { text: text ?? '', warning: '' }
}
