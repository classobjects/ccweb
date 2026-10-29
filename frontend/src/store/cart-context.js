// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react'

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
