// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, loadTokens, onSignedOut, saveTokens, signOut } from './api'
import { AuthContext } from './auth-context'
import { applyTheme, storedTheme } from './theme'

/**
 * Holds who is signed in, for both applications.
 *
 * `loading` is true until a stored token has been exchanged for its profile
 * or found absent, so a guard can wait rather than turn a signed-in visitor
 * away on the first render. `login` stores the tokens and reads the
 * profile; `register` creates the account and signs it in; `logout` asks
 * the server to retire the account's tokens and then drops both, telling
 * every `onSignedOut` listener. `isAdmin` is the `manager` role.
 *
 * `theme` is the light/dark choice the page shows, and `setTheme` changes
 * it: at once on the page, and saved to the account when one is signed in
 * (docs/specs/theme-preference-design.md). A profile that arrives brings
 * its account's choice with it.
 */
export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setThemeState] = useState(storedTheme)

  // Every profile that arrives -- restored, signed in, or saved -- shows its
  // account's choice; signing out (null) leaves the page as it is.
  const setUser = useCallback((profile) => {
    setUserState(profile)
    if (profile?.theme) setThemeState(applyTheme(profile.theme))
  }, [])

  // On first mount, exchange any stored token for the current profile.
  // Tokens the server refuses (a 401 past the refresh) are already dropped
  // by `send`, which signs out; any failure is otherwise ignored here. A
  // server that is down or a dropped connection says nothing about the
  // tokens, so they are kept for the next load rather than signing the
  // visitor out over a blip.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      if (!loadTokens()) {
        setLoading(false)
        return
      }
      try {
        const me = await api.me()
        if (!cancelled) setUser(me)
      } catch {
        /* nobody signed in: a refusal has already signed out, a blip keeps the tokens */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [setUser])

  // A session the server stops accepting while the page is open -- expired
  // past its refresh, or ended by a password reset -- leaves nobody signed
  // in, so the page offers sign-in again rather than naming an account
  // whose every request is refused.
  useEffect(() => onSignedOut(() => setUser(null)), [setUser])

  const login = useCallback(
    async (email, password) => {
      const tokens = await api.login(email, password)
      saveTokens(tokens)
      const me = await api.me()
      setUser(me)
      return me
    },
    [setUser],
  )

  const register = useCallback(
    async (payload) => {
      await api.register(payload)
      return login(payload.email, payload.password)
    },
    [login],
  )

  // The server is asked first, while the tokens are still here to send, to
  // retire every token of the account -- a copy taken from this browser
  // stops working too. Its answer does not decide anything: offline, or
  // already refused (401), the visitor is signed out here all the same --
  // `signOut` tells the listener above, which clears `user`.
  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* best effort: signing out here does not wait on the server */
    }
    signOut()
  }, [])

  // The page changes first, so the choice is seen at once; then the account
  // keeps it. A save that fails (offline, server down) leaves the page as
  // chosen and remembered in this browser; the account keeps its old choice
  // until the next save.
  const setTheme = useCallback(
    async (next) => {
      setThemeState(applyTheme(next))
      if (!user) return
      try {
        setUser(await api.updateMe({ theme: next }))
      } catch {
        /* the page already shows it; the account catches up on a later save */
      }
    },
    [user, setUser],
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      theme,
      setTheme,
      isAdmin: user?.role === 'manager',
    }),
    [user, loading, login, register, logout, theme, setTheme],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
