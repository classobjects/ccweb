// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from './auth-context'

/**
 * Its children for a signed-in visitor only, in the shop and the console
 * alike. Until a stored session has been checked it says it is loading,
 * rather than turning a signed-in visitor away on the first render; anyone
 * not signed in is sent to sign in, with the page they asked for as `from`,
 * so signing in brings them back to it.
 */
export default function RequireSignIn({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p className="muted">Loading...</p>
  if (!user) {
    const from = location.pathname + location.search
    return <Navigate to="/login" replace state={{ from }} />
  }
  return children
}
