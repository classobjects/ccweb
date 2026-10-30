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
