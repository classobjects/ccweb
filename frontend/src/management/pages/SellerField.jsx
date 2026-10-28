import { useRef, useState } from 'react'

import { api } from '../api'
import { ADD, useAddOption } from '../../shared/add-option'
import { useRequest } from '../../shared/useRequest'
import { siteName, withScheme } from '../site-name'
import { useInlineAdd } from '../useInlineAdd'

const BLANK_DRAFT = { name: '', store_url: '' }

/**
 * A store address as it is compared: the site without `www.` and the page,
 * in lower case, with no scheme, trailing `/`, `?` or `#` part -- so
 * `EBAY.com/usr/coinhound/?_trksid=1` is `https://www.ebay.com/usr/coinhound`.
 * Null for text that is not a web address.
 */
function storeKey(text) {
  const address = withScheme(text)
  if (!address || siteName(address) === '') return null
  try {
    const url = new URL(address)
    const site = url.hostname.toLowerCase().replace(/^www\./, '')
    return `${site}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The seller picker: who sold a purchase on the marketplace its vendor
 * names.
 *
 * A store address typed in picks the seller, once the box is left or Enter
 * pressed: the seller whose store it is; else the seller of the name the
 * address gives (`siteName`), there being one seller to a name; else a new
 * seller, so named, with that store. While an address is typed the select
 * is not shown; with none, the select over `listSellers()` is, opening with
 * "+ Add a seller..." for an inline store and name form -- the vendor
 * picker's shape: the store's address is asked first and proposes the name.
 *
 * `value` is the seller's id as text ('' for none), and `onChange` receives
 * the same, so it sits in a form of text fields; the form turns it into a
 * number or null when it sends it.
 */
export default function SellerField({ value, onChange }) {
  const loaded = useRequest('sellers', () => api.listSellers())
  const [added, setAdded] = useState([])
  const addOption = useAddOption()
  // The store address typed, and what it came to: the seller chosen (and
  // whether it was added for it), or why it chose none.
  const [store, setStore] = useState('')
  const [picked, setPicked] = useState(null)
  const [storeError, setStoreError] = useState('')
  // The address last picked from, so it is picked from once.
  const pickedFor = useRef(null)
  // Add stays live: a press with no name says so, rather than a dimmed
  // button that says nothing.
  const [askedEmpty, setAskedEmpty] = useState(false)
  const sellers = [...(loaded.data ?? []), ...added].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  const { adding, setAdding, draft, setDraft, error, add, wrapper, ready } =
    useInlineAdd({
      blank: BLANK_DRAFT,
      ready: (d) => Boolean(d.name.trim()),
      create: (d) =>
        api.createSeller({
          name: d.name.trim(),
          store_url: withScheme(d.store_url),
        }),
      onCreated: (created) => {
        setAdded((list) => [...list, created])
        onChange(String(created.id))
      },
    })

  /**
   * Choose the seller the typed store address names, adding one if none.
   * Once per address: Enter and then leaving the box ask twice, and a
   * second ask while the first adds would add the seller again.
   */
  async function pickByStore() {
    if (store.trim() === '' || pickedFor.current === store) return
    pickedFor.current = store
    const key = storeKey(store)
    setPicked(null)
    setStoreError('')
    if (key === null) {
      setStoreError('That is not a web address.')
      return
    }
    const name = siteName(withScheme(store))
    const known =
      sellers.find((s) => s.store_url && storeKey(s.store_url) === key) ??
      sellers.find(
        (s) => s.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0,
      )
    if (known) {
      setPicked({ seller: known, added: false })
      onChange(String(known.id))
      return
    }
    try {
      const created = await api.createSeller({ name, store_url: withScheme(store) })
      setAdded((list) => [...list, created])
      setPicked({ seller: created, added: true })
      onChange(String(created.id))
    } catch (err) {
      setStoreError(err.message)
    }
  }

  const storeBox = (
    <input
      placeholder="Store web address"
      aria-label="Seller's store address"
      value={store}
      // Read before the list is: matching against a half-read list would
      // add a seller who is on file.
      disabled={!loaded.data}
      onChange={(e) => {
        setStore(e.target.value)
        setPicked(null)
        setStoreError('')
        pickedFor.current = null
      }}
      onBlur={pickByStore}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        // Enter picks the seller; it does not submit the purchase form.
        e.preventDefault()
        pickByStore()
      }}
    />
  )

  if (store.trim() !== '' && !adding) {
    return (
      <>
        {storeBox}
        {picked && (
          <span className="notice">
            {picked.seller.name}
            {picked.added && ' (added)'}
          </span>
        )}
        {storeError && <span className="error">{storeError}</span>}
      </>
    )
  }

  if (adding) {
    return (
      <div className="add-reference" ref={wrapper}>
        {/* The store first: a seller is named for their place on the
            marketplace, so its address proposes the name. Only a name the
            address gave follows it, or an empty one, which is nobody's
            choice; one typed by hand is left alone. */}
        <input
          placeholder="Store web address or email"
          aria-label="Store web address or email"
          value={draft.store_url}
          autoFocus
          onChange={(e) => {
            const store = e.target.value
            const proposed =
              draft.name === '' || draft.name === siteName(draft.store_url)
            setDraft({
              ...draft,
              store_url: store,
              name: proposed ? siteName(store) : draft.name,
            })
          }}
        />
        <input
          placeholder="Seller name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <button
          type="button"
          onClick={() => {
            setAskedEmpty(!ready)
            if (ready) add()
          }}
        >
          Add seller
        </button>
        <button type="button" className="link" onClick={() => setAdding(false)}>
          Cancel
        </button>
        {askedEmpty && !ready && (
          <span className="error">Type the seller&apos;s name first.</span>
        )}
        {error && <span className="error">{error}</span>}
      </div>
    )
  }

  return (
    <>
      {storeBox}
      <select
        value={value ?? ''}
        onKeyDown={addOption.onKeyDown}
        onChange={(e) => {
          if (e.target.value !== ADD) {
            onChange(e.target.value)
            return
          }
          // An arrow steps over Add; only choosing it opens the form.
          const meant = addOption.steppedOver(e.target)
          if (meant === undefined) setAdding(true)
          else if (meant !== null) onChange(meant)
        }}
        aria-label="Seller"
      >
        <option value="">--</option>
        <option value={ADD}>+ Add a seller...</option>
        {sellers.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
      {/* A list that could not be read is not an empty one. */}
      {loaded.error && <span className="error">{loaded.error}</span>}
    </>
  )
}
