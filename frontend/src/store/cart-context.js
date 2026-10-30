// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react'

import { isMoney, toCents } from '../shared/cents'

/**
 * The cart context and the hook that reads it.
 *
 * Separate from the provider for the same reason as auth-context: a module
 * exporting both a component and a non-component defeats Fast Refresh, so a
 * change anywhere in it costs a full reload and the state it was holding.
 */
export const CartContext = createContext(null)

/**
 * What the provider holds: the cart's `lines`, its `count` and `total`, and
 * `add`, `setQuantity`, `remove` and `clear`. Throws outside a
 * `CartProvider`, where a null would otherwise read as an empty cart.
 */
export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside a CartProvider')
  return ctx
}

/**
 * What a cart line comes to, in whole cents -- the price times the quantity,
 * reckoned in cents because adding prices as floats shows $299.96999999999997
 * for three coins at $99.99. Null when the price is not a money amount (a
 * corrupted saved cart); checkout prices every line again.
 */
export function lineCents({ coin, quantity }) {
  return isMoney(coin.price) ? toCents(coin.price) * quantity : null
}
