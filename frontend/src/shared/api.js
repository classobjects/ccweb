// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
// Thin fetch wrapper around the FastAPI backend.
//
// Access tokens are short lived. One already past its expiry is refreshed
// before the request goes out; one refused anyway (a 401 -- revoked rather
// than expired) is refreshed once and the request replayed. If the refresh
// is refused the caller is signed out.

const TOKEN_KEY = 'ccwebdb.tokens'

/**
 * The stored access and refresh tokens, or null when there are none or the
 * browser's storage cannot be read.
 */
export function loadTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Keep the tokens so a reload stays signed in. Storage that refuses the
 * write is not an error: the sign-in then lasts as long as the tab.
 */
export function saveTokens(tokens) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  } catch {
    /* private browsing or blocked storage - stay signed in for this tab only */
  }
}

/** Forget the stored tokens, which is what signing out is on this side. */
export function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

//: Who is told when the server stops accepting the session.
const signedOutListeners = new Set()

/**
 * Call `listener` whenever the session ends and the tokens are dropped --
 * signed out on purpose, or a request made with the session finally
 * refused; returns the function that stops it.
 *
 * Dropping the tokens is not enough on its own: whatever holds "who is
 * signed in" would go on naming the account beside requests that all fail,
 * and whatever was kept for the account (the shop's cart) would be left for
 * the next person at the same browser.
 */
export function onSignedOut(listener) {
  signedOutListeners.add(listener)
  return () => signedOutListeners.delete(listener)
}

/** End the session on this side: drop the tokens and tell every listener. */
export function signOut() {
  clearTokens()
  for (const listener of signedOutListeners) listener()
}

export class ApiError extends Error {
  /**
   * `body` is the whole parsed response, kept beside the flattened `detail`,
   * or null when the response had no JSON body.
   *
   * Some refusals carry more than a sentence: `POST /api/offers` answers a
   * 409 with `{detail, refused: [{item_code, reason}]}`, and the console has
   * to name every refused item with its reason. `readDetail` reduces the body
   * to one string, so the per-item reasons are only on `body`.
   */
  constructor(status, detail, body = null) {
    super(typeof detail === 'string' ? detail : 'Request failed')
    this.status = status
    this.detail = detail
    this.body = body
  }
}

// FastAPI returns validation errors as a list of objects; flatten to a string.
function readDetail(body) {
  const detail = body?.detail
  if (!detail) return 'Request failed'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('; ')
  }
  return 'Request failed'
}

/**
 * The `ApiError` for a refused response whose body `parsed` is -- `undefined`
 * for one that is not JSON, which is then named by its status line.
 */
function errorFor(res, parsed) {
  if (parsed === undefined) {
    return new ApiError(res.status, res.statusText || `Request failed (${res.status})`)
  }
  return new ApiError(res.status, readDetail(parsed), parsed)
}

/**
 * Exchange the stored refresh token for a new pair, store it and return it;
 * null when there is no refresh token or the server refuses it.
 *
 * Only a 401 or 403 refuses the token. Any other failure -- a server
 * restarting, a proxy's 502 -- says nothing about the session, so it is
 * thrown as an `ApiError` and the stored tokens are kept.
 */
async function refreshTokens() {
  const tokens = loadTokens()
  if (!tokens?.refresh_token) return null

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw errorFor(res, parseBody(await res.text()))

  const fresh = await res.json()
  saveTokens(fresh)
  return fresh
}

//: The refresh in flight, shared by every request that needs one while it runs.
let refreshing = null

/**
 * One refresh for however many requests need it together.
 *
 * A page that loads several things at once on an expired access token finds
 * it expired (or gets a 401) for each. Refreshing once per request would be
 * that many exchanges for one expiry, each storing a pair over the last; they
 * all wait on the same one instead. The server does not retire a refresh token when it is used, so
 * this saves requests rather than guarding a single-use token.
 */
function refreshOnce() {
  refreshing ??= refreshTokens().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Parse a response body as JSON; `undefined` when it is not JSON at all. */
function parseBody(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * `path` with `params` as its query string, leaving out the ones not given.
 *
 * Empty strings, null and undefined are left out: a blank filter box asks for
 * nothing. `false` is kept -- `mine=false` can mean something -- unless
 * `dropFalse` says an unticked box asks for nothing too. An array repeats its
 * key once per value (`item_ids=3&item_ids=5`).
 */
export function withQuery(path, params = {}, { dropFalse = false } = {}) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined) continue
    if (dropFalse && value === false) continue
    for (const one of Array.isArray(value) ? value : [value]) qs.append(key, one)
  }
  const query = qs.toString()
  return query ? `${path}?${query}` : path
}

/** The file name a `Content-Disposition: attachment` header gives, or null. */
function attachmentName(header) {
  const match = /filename="?([^";]+)"?/i.exec(header ?? '')
  return match ? match[1] : null
}

/**
 * A request's body as `fetch` takes it, with the headers that describe it:
 * `{ payload, headers }`. A form goes URL-encoded, a `FormData` untouched,
 * anything else as JSON, and no body at all is no payload.
 */
function encodeBody(body, form) {
  if (form) return { payload: new URLSearchParams(body), headers: {} }
  // Multipart body (an image upload). Handed to `fetch` untouched: the
  // browser sets `Content-Type` itself, boundary included, and setting it
  // by hand here would produce a request the server cannot parse.
  if (body instanceof FormData) return { payload: body, headers: {} }
  if (body === undefined) return { payload: undefined, headers: {} }
  return {
    payload: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }
}

/**
 * The tokens another request stored while this one, sent with `sentWith`,
 * was out -- the ones to send it again with -- or null when the stored ones
 * are still those it was refused with.
 */
function refreshedMeanwhile(sentWith) {
  const stored = loadTokens()
  const moved = stored?.access_token && stored.access_token !== sentWith?.access_token
  return moved ? stored : null
}

/**
 * Throw the `ApiError` for a refused response, whose body `parsed` is --
 * `undefined` for one that is not JSON. `carriedSession` says the request
 * was sent with an access token, which a 401 then ends.
 */
function refuse(res, parsed, carriedSession) {
  // Only a request that carried the session says anything about it. A
  // refused sign-in is a 401 too, and must leave a session already held
  // alone; so must a request sent with no token at all.
  if (res.status === 401 && carriedSession) signOut()
  throw errorFor(res, parsed)
}

//: How long before its stated expiry an access token is treated as expired:
//: the browser's clock and the server's need not agree to the second, and a
//: token that expires on the way is refused all the same.
const EXPIRY_SKEW_MS = 30_000

/**
 * When the access token `token` expires, in epoch milliseconds, from the
 * `exp` claim of its JWT payload; null when it is not a JWT or states none,
 * which leaves it to the server to judge.
 */
function expiresAt(token) {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(base64))
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * The tokens to send a signed-in request with: the stored ones, or, when
 * their access token has expired, a refreshed pair; null when there are
 * none or the refresh is refused, which signs the caller out.
 *
 * Why not just wait for the 401: endpoints that serve anonymous callers
 * too (the catalog, a listing, the reference vocabularies) read an expired
 * token as no token at all and answer as for a stranger -- "the shop is not
 * open yet", 410 on an ended listing, 403 on retired values -- never 401,
 * so the refresh that a 401 triggers would never come. Asking with a token
 * known to be dead is pointless; with none, a public endpoint answers as it
 * does for anyone signed out, which after a refused refresh is what the
 * caller is. A refresh that fails for a reason of its own (a 502) is thrown,
 * and the stored tokens are kept, as on the 401 path.
 */
async function liveTokens() {
  const stored = loadTokens()
  const token = stored?.access_token
  if (!token) return stored
  const expiry = expiresAt(token)
  if (expiry === null || expiry - EXPIRY_SKEW_MS > Date.now()) return stored

  const fresh = await refreshOnce()
  if (fresh) return fresh
  // Every request waiting on the same refused refresh lands here; the first
  // ends the session, and the rest find it already ended.
  if (loadTokens()?.access_token === token) signOut()
  return null
}

/**
 * The one place a request is made, exported so `management/api.js` can build the
 * console's calls on the same token handling and error shape.
 *
 * `binary` asks for a file rather than JSON -- a workbook download -- and
 * answers `{ blob, filename }`. The session is a bearer token, not a cookie,
 * so a plain `<a href>` to such a file would arrive signed out; it is fetched
 * here, with the token, and refused the same way as any other request.
 *
 * `withTotal` asks for a paged list's rows with the full count the server
 * puts in `X-Total-Count`, and answers `{ rows, total }` -- `total` null
 * when the header is missing.
 */
export async function send(
  path,
  { method = 'GET', body, form, auth = true, binary = false, withTotal = false } = {},
) {
  const { payload, headers } = encodeBody(body, form)

  const withAuth = (tokens) => {
    const h = { ...headers }
    if (tokens?.access_token) {
      h.Authorization = `Bearer ${tokens.access_token}`
    }
    return h
  }

  const sentWith = auth ? await liveTokens() : null
  // Whether the last attempt carried an access token: only then does its
  // 401 say anything about the session.
  let sentToken = Boolean(sentWith?.access_token)
  let res = await fetch(path, {
    method,
    headers: withAuth(sentWith),
    body: payload,
  })

  if (res.status === 401 && sentToken) {
    // Another request may already have refreshed while this one was out;
    // its tokens are then the ones to retry with.
    const fresh = refreshedMeanwhile(sentWith) ?? (await refreshOnce())
    if (fresh) {
      sentToken = Boolean(fresh.access_token)
      res = await fetch(path, {
        method,
        headers: withAuth(fresh),
        body: payload,
      })
    }
  }

  if (res.status === 204) return null
  if (binary && res.ok) {
    return {
      blob: await res.blob(),
      filename: attachmentName(res.headers.get('Content-Disposition')),
    }
  }

  // A proxy or a crashed server can answer with an HTML page. That is still
  // a failed request with a status, not a SyntaxError from the parser.
  const parsed = parseBody(await res.text())

  if (!res.ok) refuse(res, parsed, sentToken)
  if (parsed === undefined) {
    throw new ApiError(res.status, 'The server sent a response that is not JSON')
  }
  if (withTotal) return { rows: parsed, total: totalCount(res) }
  return parsed
}

/**
 * The row count a paged list reports in `X-Total-Count`, or null when the
 * header is absent or not a number.
 */
function totalCount(res) {
  const header = res.headers?.get('X-Total-Count')
  if (header === null || header === undefined || header.trim() === '') return null
  const total = Number(header)
  return Number.isFinite(total) ? total : null
}

/**
 * The calls the shop makes, plus the ones shared components make.
 *
 * The console's calls are deliberately NOT here -- see `management/api.js`. This
 * object is a single literal, so nothing tree-shakes out of it: every path
 * written here is downloaded by every anonymous visitor to the shop. A list
 * of `/api/inventory/...` and `/api/users/...` endpoints is a map of the
 * owner's tooling -- the same reason the console's styles are a stylesheet
 * of their own.
 */
export const api = {
  // auth
  login: (email, password) =>
    send('/api/auth/login', {
      method: 'POST',
      form: true,
      auth: false,
      body: { username: email, password },
    }),
  register: (payload) =>
    send('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  me: () => send('/api/auth/me'),
  // Retires every token of the account on the server, not just this tab's.
  logout: () => send('/api/auth/logout', { method: 'POST' }),

  // catalog
  //
  // A catalog entry is a listing plus the inventory item behind it. The
  // id in these paths is the LISTING id -- the item id is carried alongside
  // as inventory_item_id, for the admin views that need it.
  // Signed in when it can be: a closed shop (SHOP_OPEN=false) serves its
  // catalog to signed-in accounts only.
  listCatalog: (params = {}) =>
    send(withQuery('/api/catalog', params, { dropFalse: true })),
  // Whether the shop is open to visitors who are not signed in.
  getShop: () => send('/api/shop', { auth: false }),
  // Signed in when it can be: an ended listing is served in full only to an
  // administrator, and answered 410 for anyone else.
  getCatalogItem: (id) => send(`/api/catalog/${id}`),

  // reference vocabularies, for dropdowns
  // Signed in when it can be: only a few vocabularies are served to anyone,
  // the rest to staff. `includeInactive` adds retired values and their
  // aliases, which the server gives a manager only (403 otherwise) -- the
  // console asks for them, because a record may still use one and its picker
  // has to show it; the shop never does.
  getReference: (table, { includeInactive = false } = {}) =>
    send(
      withQuery(`/api/reference/${table}`, {
        include_inactive: includeInactive ? 'true' : undefined,
      }),
    ),
  // Shared because `shared/reference.jsx`'s ReferenceSelect calls it. Only
  // console pages render that component today, but the component lives here,
  // and shared code may not import from management/.
  addReferenceValue: (table, payload) =>
    send(`/api/reference/${table}`, { method: 'POST', body: payload }),

  // orders
  // Each line is `{listing_id, quantity, expected_price}`: the price the
  // shopper saw, which the server refuses (409) if the listing's has moved.
  createOrder: (items) => send('/api/orders', { method: 'POST', body: { items } }),
  // Mine even for an administrator: in the shop they are a customer. Every
  // order, and changing status, are console tools in management/api.js.
  listMyOrders: () => send('/api/orders?mine=true'),
}
