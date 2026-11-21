// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * The printer correction, kept in this browser (holder-labels-design.md,
 * section 4, "Printer correction").
 *
 * The shrink it undoes belongs to the printer driver of the computer that
 * prints, so each browser keeps its own, under `CORRECTION_KEY`. With no
 * storage, or nothing stored, it is 100% both ways.
 */
import { NO_CORRECTION, normalCorrection } from './layout'

export const CORRECTION_KEY = 'ccwebdb.labelPrinterCorrection'

/** The correction this browser last saved. */
export function storedCorrection() {
  try {
    const saved = window.localStorage.getItem(CORRECTION_KEY)
    return saved ? normalCorrection(JSON.parse(saved)) : NO_CORRECTION
  } catch {
    return NO_CORRECTION
  }
}

/** Keep `correction` in this browser; 100% both ways keeps nothing. */
export function saveCorrection(correction) {
  const kept = normalCorrection(correction)
  try {
    if (kept.across === 100 && kept.down === 100) {
      window.localStorage.removeItem(CORRECTION_KEY)
    } else {
      window.localStorage.setItem(CORRECTION_KEY, JSON.stringify(kept))
    }
  } catch {
    // No storage: the correction holds until the page is left.
  }
  return kept
}
