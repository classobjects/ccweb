// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { api } from './api'

/** The inventory views an item can be in: an item code does not say which. */
const INVENTORY_VIEWS = ['coins', 'currency']

/**
 * Every item whose code contains `code`, from both inventory views: coins
 * first, then currency.
 *
 * `GET /api/inventory/{view}/search` filters `item_code` with `ilike`
 * (`inventory_search.py`), so the answer holds near matches too; a caller
 * that needs the one item a code names looks for it with `sameItemCode`.
 */
export async function searchItemsByCode(code) {
  const pages = await Promise.all(
    INVENTORY_VIEWS.map((view) => api.searchInventory(view, { item_code: code })),
  )
  return pages.flatMap((page) => page?.rows ?? [])
}

/** Whether `row` is the item `code` names, ignoring case as the search does. */
export function sameItemCode(row, code) {
  return String(row.item_code).toLowerCase() === code.toLowerCase()
}

/**
 * Whether `row` is the item `number` names: its whole code (`CC-004521`),
 * or the number a holder label prints, the code without its prefix and dash
 * (`004521`, `000412_02`). Case is ignored, as the search ignores it.
 */
export function sameItemNumber(row, number) {
  const code = String(row.item_code)
  return (
    sameItemCode(row, number) ||
    code.slice(code.indexOf('-') + 1).toLowerCase() === number.toLowerCase()
  )
}

/**
 * The one item `number` names, as the inventory's search takes it -- with
 * the prefix or without -- or null when none is. The search matches part of
 * a code, so `004521` also finds `CC-004521_02`; only the exact item is
 * answered.
 */
export async function findItemByNumber(number) {
  const rows = await searchItemsByCode(number)
  return rows.find((row) => sameItemNumber(row, number)) ?? null
}
