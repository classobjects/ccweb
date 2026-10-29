// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from 'react'

import { api } from '../api'
import { ADD, useAddOption } from '../../shared/add-option'
import { useRequest } from '../../shared/useRequest'
import { PHONE_DEFAULT_CC, phoneTyped } from '../phone'
import { siteName, withScheme } from '../site-name'
import { useInlineAdd } from '../useInlineAdd'

const BLANK_DRAFT = {
  name: '',
  store_url: '',
  contact_name: '',
  contact_email: '',
  contact_phone: PHONE_DEFAULT_CC,
}

/**
 * A new seller as the server takes it: the name, and only the store and
 * contact fields typed in -- a phone with nothing after its country code is
 * none.
 */
function newSeller(draft) {
  const body = {
    name: draft.name.trim(),
    store_url: withScheme(draft.store_url) ?? '',
    contact_name: draft.contact_name.trim(),
    contact_email: draft.contact_email.trim(),
    contact_phone: phoneTyped(draft.contact_phone),
  }
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== ''))
}

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
 * A box of the add form with its caption shown above it. The box carries its
 * own name (`aria-label`); the caption is for the eye, so it is not read twice.
 */
function Captioned({ text, children }) {
  return (
    <span className="add-field">
      <span aria-hidden="true">{text}</span>
      {children}
    </span>
  )
}

/**
 * The seller picker: who sold a purchase on the marketplace its vendor
 * names.
 *
 * A store address typed in picks the seller, once the box is left or Enter
 * pressed: the seller whose store it is; else the seller of the name the
 * address gives (`siteName`), there being one seller to a name; else the
 * add form opens with that store and name, for the contact to be typed
 * before the seller is added. While an address is typed the select is not
 * shown; with none, the select over `listSellers()` is, opening with
 * "+ Add a seller..." for the same inline form -- the vendor picker's shape:
 * the store's address is asked first and proposes the name; then the name
 * and an optional contact name, email and phone (E.164, prefilled with the
 * country code).
 *
 * `value` is the seller's id as text ('' for none), and `onChange` receives
 * the same, so it sits in a form of text fields; the form turns it into a
 * number or null when it sends it.
 */
export default function SellerField({ value, onChange }) {
  const loaded = useRequest('sellers', () => api.listSellers())
  const [added, setAdded] = useState([])
  const addOption = useAddOption()
  // The store address typed, and what it came to: the seller on file it
  // chose, or why it chose none.
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
      create: (d) => api.createSeller(newSeller(d)),
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
      setPicked(known)
      onChange(String(known.id))
      return
    }
    // A store not on file opens the add form with it and the name it gives,
    // so the seller's contact is asked for before they are added.
    setDraft({ ...BLANK_DRAFT, store_url: store.trim(), name })
    setAdding(true)
    clearStore()
  }

  function clearStore() {
    setStore('')
    setPicked(null)
    setStoreError('')
    pickedFor.current = null
  }

  /** Close the add form, leaving nothing typed in it for the next open. */
  function cancelAdd() {
    setAdding(false)
    setDraft(BLANK_DRAFT)
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
        {picked && <span className="notice">{picked.name}</span>}
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
        {/* Each box captioned, not just given a placeholder: five filled
            boxes would otherwise not say which is the name and which the
            contact. A caption, not a <label>: the field already sits in the
            form's own "Seller" label, and a label inside a label names
            nothing. */}
        <Captioned text="Store web address or email">
          <input
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
        </Captioned>
        <Captioned text="Seller name">
          <input
            aria-label="Seller name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Captioned>
        {/* The person behind the account, each optional. */}
        <Captioned text="Contact name">
          <input
            aria-label="Contact name"
            value={draft.contact_name}
            onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })}
          />
        </Captioned>
        <Captioned text="Contact email">
          <input
            type="email"
            aria-label="Contact email"
            value={draft.contact_email}
            onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
          />
        </Captioned>
        <Captioned text="Contact phone">
          <input
            type="tel"
            aria-label="Contact phone"
            title="Country code, then the number"
            value={draft.contact_phone}
            onChange={(e) => setDraft({ ...draft, contact_phone: e.target.value })}
          />
        </Captioned>
        <button
          type="button"
          onClick={() => {
            setAskedEmpty(!ready)
            if (ready) add()
          }}
        >
          Add seller
        </button>
        <button type="button" className="link" onClick={cancelAdd}>
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
          if (meant === undefined) {
            setDraft(BLANK_DRAFT)
            setAdding(true)
          } else if (meant !== null) onChange(meant)
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
