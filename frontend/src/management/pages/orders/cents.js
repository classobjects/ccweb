// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { isMoney, toCents } from '../../../shared/cents'

/**
 * The order editor's running total, in whole cents.
 *
 * A line counts once its quantity is a whole number and its price is money
 * text; a line still being typed adds nothing rather than throwing.
 */
export function totalCents(lines) {
  return lines.reduce((sum, line) => {
    const quantity = String(line.quantity)
    if (!/^\d+$/.test(quantity) || !isMoney(line.unit_price)) return sum
    return sum + Number(quantity) * toCents(line.unit_price)
  }, 0)
}
