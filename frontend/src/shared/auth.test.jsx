// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', async (importOriginal) => ({
  ApiError: (await importOriginal()).ApiError,
  api: {
    login: vi.fn(),
    me: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updateMe: vi.fn(),
  },
  loadTokens: vi.fn(),
  saveTokens: vi.fn(),
  signOut: vi.fn(),
  onSignedOut: vi.fn(() => () => {}),
}))

import { ApiError, api, loadTokens, onSignedOut, saveTokens, signOut } from './api'
import { AuthProvider } from './auth'
import { useAuth } from './auth-context'
import { adminAuth, customerAuth } from '../test/helpers'

//: The profiles `GET /api/auth/me` answers with.
const ADMIN = adminAuth().user
const BUYER = customerAuth().user

/** The auth context as a component sees it; `result.current` is the latest. */
async function mount() {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  // The real `signOut` tells every `onSignedOut` listener; the provider's
  // is the one that clears `user`, so the mock does the same.
  signOut.mockImplementation(() => onSignedOut.mock.calls.at(-1)?.[0]())
})

describe('AuthProvider', () => {
  it('finishes loading as anonymous when no token is stored', async () => {
    loadTokens.mockReturnValue(null)
    const auth = await mount()
    expect(auth.current.user).toBeNull()
    expect(api.me).not.toHaveBeenCalled()
  })

  it('restores the signed-in user from a stored token', async () => {
    loadTokens.mockReturnValue({ access_token: 'a', refresh_token: 'r' })
    api.me.mockResolvedValue(ADMIN)
    const auth = await mount()
    expect(auth.current.user).toEqual(ADMIN)
    expect(auth.current.isAdmin).toBe(true)
  })

  it('finishes loading as anonymous on a token the server no longer accepts', async () => {
    // Expiring while the tab was closed must leave the app anonymous and
    // usable. Dropping the tokens is `send`'s job (api.test.js: a refused
    // session signs out), so the provider only has to settle.
    loadTokens.mockReturnValue({ access_token: 'stale' })
    api.me.mockRejectedValue(new ApiError(401, 'Could not validate credentials'))
    const auth = await mount()
    expect(auth.current.user).toBeNull()
  })

  it.each([
    ['a server that is down', new ApiError(503, 'Service Unavailable')],
    ['no network at all', new TypeError('Failed to fetch')],
  ])('keeps the stored tokens through %s', async (_case, failure) => {
    // Only the server saying no (401) means the tokens are no good. A restart
    // of the API or a dropped connection says nothing about them, and
    // clearing them would sign the owner out of every tab over a blip.
    loadTokens.mockReturnValue({ access_token: 'a', refresh_token: 'r' })
    api.me.mockRejectedValue(failure)
    await mount()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('stores the tokens a login returns and then loads the profile', async () => {
    loadTokens.mockReturnValue(null)
    api.login.mockResolvedValue({ access_token: 'new', refresh_token: 'r' })
    api.me.mockResolvedValue(BUYER)
    const auth = await mount()

    await act(() => auth.current.login('buyer@example.com', 'hunter2'))

    expect(api.login).toHaveBeenCalledWith('buyer@example.com', 'hunter2')
    expect(saveTokens).toHaveBeenCalledWith({ access_token: 'new', refresh_token: 'r' })
    expect(auth.current.user).toEqual(BUYER)
    expect(auth.current.isAdmin).toBe(false)
  })

  it('signs in straight after registering', async () => {
    loadTokens.mockReturnValue(null)
    api.register.mockResolvedValue(BUYER)
    api.login.mockResolvedValue({ access_token: 'new' })
    api.me.mockResolvedValue(BUYER)
    const auth = await mount()

    await act(() =>
      auth.current.register({
        email: 'buyer@example.com',
        password: 'p',
        full_name: 'B',
      }),
    )
    expect(api.login).toHaveBeenCalledWith('buyer@example.com', 'p')
    expect(auth.current.user).toEqual(BUYER)
  })

  it('shows nobody signed in once the session is refused mid-visit', async () => {
    // The tokens expire, or the password is reset, while the page is open.
    // A header still naming the account beside requests that all fail gives
    // no way to the sign-in form short of a reload.
    loadTokens.mockReturnValue({ access_token: 'a', refresh_token: 'r' })
    api.me.mockResolvedValue(BUYER)
    const auth = await mount()
    expect(auth.current.user).toEqual(BUYER)

    const signedOut = onSignedOut.mock.calls.at(-1)[0]
    act(() => signedOut())

    expect(auth.current.user).toBeNull()
  })

  it('stops listening for a refused session when it unmounts', async () => {
    const stop = vi.fn()
    onSignedOut.mockReturnValueOnce(stop)
    loadTokens.mockReturnValue(null)
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    unmount()

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('retires the tokens on the server, then signs out here', async () => {
    loadTokens.mockReturnValue({ access_token: 'a' })
    api.me.mockResolvedValue(ADMIN)
    // Signing out here before the server is asked would send the request
    // with no token to retire.
    api.logout.mockImplementation(async () => {
      expect(signOut).not.toHaveBeenCalled()
      return null
    })
    const auth = await mount()
    expect(auth.current.user).toEqual(ADMIN)

    await act(() => auth.current.logout())

    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(auth.current.user).toBeNull()
  })

  it.each([
    ['no network at all', new TypeError('Failed to fetch')],
    ['a session already refused', new ApiError(401, 'Could not validate credentials')],
    ['a server that is down', new ApiError(503, 'Service Unavailable')],
  ])('signs out here through %s', async (_case, failure) => {
    loadTokens.mockReturnValue({ access_token: 'a' })
    api.me.mockResolvedValue(BUYER)
    api.logout.mockRejectedValue(failure)
    const auth = await mount()

    await act(() => auth.current.logout())

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(auth.current.user).toBeNull()
  })

  describe("the account's light/dark choice", () => {
    afterEach(() => {
      document.documentElement.removeAttribute('data-theme')
      window.localStorage.clear()
    })

    it('shows the page in the theme the account chose, on sign-in', async () => {
      loadTokens.mockReturnValue({ access_token: 'a' })
      api.me.mockResolvedValue({ ...BUYER, theme: 'dark' })
      await mount()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(window.localStorage.getItem('ccwebdb.theme')).toBe('dark')
    })

    it('saves a choice to the account, and the page shows it at once', async () => {
      loadTokens.mockReturnValue({ access_token: 'a' })
      api.me.mockResolvedValue({ ...BUYER, theme: 'auto' })
      api.updateMe.mockResolvedValue({ ...BUYER, theme: 'light' })
      const auth = await mount()

      await act(() => auth.current.setTheme('light'))

      expect(api.updateMe).toHaveBeenCalledWith({ theme: 'light' })
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(auth.current.user.theme).toBe('light')
      expect(auth.current.theme).toBe('light')
    })

    it('keeps a visitor’s choice in the browser only', async () => {
      loadTokens.mockReturnValue(null)
      const auth = await mount()

      await act(() => auth.current.setTheme('dark'))

      expect(api.updateMe).not.toHaveBeenCalled()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(auth.current.theme).toBe('dark')
    })

    it('keeps the page as chosen when the account cannot be reached', async () => {
      loadTokens.mockReturnValue({ access_token: 'a' })
      api.me.mockResolvedValue({ ...BUYER, theme: 'auto' })
      api.updateMe.mockRejectedValue(new TypeError('Failed to fetch'))
      const auth = await mount()

      await act(() => auth.current.setTheme('dark'))

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(auth.current.theme).toBe('dark')
    })

    /** A promise and the function that settles it, for a save answered late. */
    function deferred() {
      let resolve
      const promise = new Promise((done) => {
        resolve = done
      })
      return { promise, resolve }
    }

    it('keeps the latest choice when an earlier save answers after it', async () => {
      loadTokens.mockReturnValue({ access_token: 'a' })
      api.me.mockResolvedValue({ ...BUYER, theme: 'auto' })
      const first = deferred()
      const second = deferred()
      api.updateMe
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const auth = await mount()

      let saves
      act(() => {
        saves = [auth.current.setTheme('dark'), auth.current.setTheme('light')]
      })
      await act(async () => {
        second.resolve({ ...BUYER, theme: 'light' })
        first.resolve({ ...BUYER, theme: 'dark' })
        await Promise.all(saves)
      })

      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(auth.current.theme).toBe('light')
      expect(auth.current.user.theme).toBe('light')
    })

    it('leaves nobody signed in when a save answers after signing out', async () => {
      loadTokens.mockReturnValue({ access_token: 'a' })
      api.me.mockResolvedValue({ ...BUYER, theme: 'auto' })
      const late = deferred()
      api.updateMe.mockReturnValueOnce(late.promise)
      const auth = await mount()

      let save
      act(() => {
        save = auth.current.setTheme('dark')
      })
      act(() => onSignedOut.mock.calls.at(-1)[0]())
      await act(async () => {
        late.resolve({ ...BUYER, theme: 'dark' })
        await save
      })

      expect(auth.current.user).toBeNull()
    })
  })
})
