// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useContext, useState } from 'react'

import { ADD, useAddOption, useEscapeCancels } from './add-option'
import { api } from './api'
import { codeFromLabel } from './reference-codes'
import { ReferenceContext, useReference } from './reference-context'
import { findEntries } from './reference-match'

//: A vocabulary longer than this gets a box to find a value by name or alias.
//: A short list is quicker to read than to search.
export const FIND_FROM = 10

/**
 * A dropdown over one vocabulary.
 *
 * Falls back to a plain text input while the vocabulary is loading, if it
 * could not be fetched, or when it holds no values, so the form is always
 * usable -- degraded, never broken.
 *
 * A long vocabulary gets a find box beside it. Typing narrows the options by
 * label, code or alias -- "Walker" offers Walking Liberty Half Dollar, with
 * the alias shown so the match makes sense -- and Enter picks the first. A
 * native select's own type-ahead only matches the start of a label.
 */
export function ReferenceSelect({
  table,
  value,
  onChange,
  allowBlank = true,
  //: Whether this picker may add a value to the vocabulary. True for the
  //: descriptive tables, which grow with use. False for one the code itself
  //: branches on: receiving, the outstanding lists and the inventory views
  //: all key on the known `item_status` codes, so a status invented from a
  //: dropdown would be a row nothing downstream can reason about.
  allowAdd = true,
  placeholder,
  //: Optional `(entry) => boolean` narrowing what is offered -- a note's grade
  //: picker offers only the paper-money scale.
  filter,
  //: Keyboard accelerator attributes (`accessKey`, `aria-keyshortcuts`),
  //: passed straight to the `<select>` -- this module stays outside
  //: `management/`, so it takes the attributes rather than importing `shortcuts`.
  accessKey,
  'aria-keyshortcuts': ariaKeyshortcuts,
  //: Extra columns sent with a value this picker adds -- e.g.
  //: `{ applies_to: 'currency' }`, the kind the item being entered is. Goes
  //: into the POST's `extra`, which is where the reference API reads a
  //: table's own columns; `ReferenceValueCreate` has no top-level field for
  //: them, so the value would otherwise take the table's default -- a series
  //: is a coin's -- and can vanish from this very picker (see `fitsKind`).
  addFields = {},
  //: When true, the add form asks for a label alone and derives the code
  //: from it with `codeFromLabel`, rather than asking for both. Attributes
  //: are the one vocabulary this is worth doing for: nothing about a "Star
  //: Note" that a person would type needs a separate code entered by hand.
  labelOnly = false,
  //: The `extra` column a chosen group is stored under, e.g.
  //: `'attribute_group'`. Present only for a table that has one -- item
  //: attributes today, not error types, which carry no group. Undefined
  //: leaves the add form without a group picker at all.
  groupField,
  //: `[{code, label}, ...]` offered when `groupField` is set. Required in
  //: that case: the column behind it is NOT NULL with no default, so a
  //: value posted without one would 422, and a silent default was the
  //: wrong call for the person to have made for them.
  groupOptions,
  //: Holds the picker still -- select, find box, and the text box shown
  //: before the vocabulary loads -- while its form is saving.
  disabled = false,
  //: The picker's accessible name: the table's own name unless the form
  //: calls the field something else, which an `aria-label` would otherwise
  //: hide from a screen reader.
  label = table,
}) {
  const values = useReference(table, { includeRetired: true })
  const context = useContext(ReferenceContext)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ code: '', label: '', group: '' })
  const [error, setError] = useState('')
  // Said after a typed label turned out to be a value already there, which
  // is chosen instead -- visible, so it does not look like an add that did
  // nothing. Cleared by the next pick.
  const [notice, setNotice] = useState('')
  const [find, setFind] = useState('')
  const addOption = useAddOption()
  // Escape in the add form cancels the add, not the dialog the form is in.
  const addForm = useEscapeCancels(() => setAdding(false))
  // Always derived: a label-only form stores it, and the code-and-label
  // form falls back to it when the code box is left empty.
  const derivedCode = codeFromLabel(draft.label)

  function selectAndClose(code) {
    onChange({ target: { value: code } })
    setAdding(false)
    setDraft({ code: '', label: '', group: '' })
    setError('')
  }

  /** What the add form still needs before it can send, or '' when nothing. */
  function missingForAdd() {
    if (draft.label.trim() === '') return 'A label is needed first.'
    const usable = labelOnly ? derivedCode : draft.code.trim() || derivedCode
    if (usable === '') {
      return 'The label needs a letter or a digit to make a code from.'
    }
    if (labelOnly && groupField && draft.group === '') return 'Choose a group first.'
    return ''
  }

  async function addValue() {
    // Add is kept live: pressing it before the form is complete says why.
    const missing = missingForAdd()
    if (missing) {
      setError(missing)
      return
    }
    const label = draft.label.trim()
    const code = labelOnly ? derivedCode : draft.code.trim() || derivedCode
    if (labelOnly) {
      // The label a person typed may already name a value under another
      // wording -- or the same one, typed again. Either way the code already
      // exists, so posting it would only 409. Choosing it is what they meant
      // when this picker offers it, and is said; when it does not -- retired,
      // or filtered out (already on the item, or the other kind of item) --
      // choosing it would change nothing visible, so the reason is given.
      const existing = values?.find((entry) => entry.code === code)
      if (existing) {
        if (existing.is_active === false) {
          setError(
            `${existing.label} already exists but is retired. ` +
              'Restore it in Vocabularies to use it.',
          )
        } else if (filter && !filter(existing)) {
          setError(
            `${existing.label} already exists but is not offered here: it is ` +
              'already chosen, or belongs to the other kind of item.',
          )
        } else {
          selectAndClose(existing.code)
          setNotice(
            `${existing.label} already exists, so it was chosen rather than added again.`,
          )
        }
        return
      }
    }
    const extra = groupField ? { ...addFields, [groupField]: draft.group } : addFields
    try {
      await api.addReferenceValue(table, { code, label, extra })
      context?.invalidate(table)
      selectAndClose(code)
    } catch (err) {
      setError(err.message)
    }
  }

  if (adding) {
    // Vocabularies grow with use: rather than abandoning an entry that does
    // not fit, the missing value is added here and selected immediately.
    return (
      <div className="add-reference" ref={addForm}>
        {labelOnly ? (
          <>
            <input
              placeholder="label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
            {/* What will actually be stored, visible before saving -- a
                person typing "Off-Center" should see it becomes
                off_center, not guess. Empty for a label that derives to
                nothing (e.g. "!!!"), which is exactly why Add refuses it,
                saying so, rather than trusting the raw label alone. */}
            <span className="derived-code">{derivedCode}</span>
            {groupField && (
              <select
                aria-label="group"
                value={draft.group}
                onChange={(e) => setDraft({ ...draft, group: e.target.value })}
              >
                <option value="">-- group --</option>
                {(groupOptions ?? []).map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
          </>
        ) : (
          <>
            <input
              // Shows the code the label will give when this is left empty.
              placeholder={derivedCode ? `code: ${derivedCode}` : 'code'}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
            <input
              placeholder="label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </>
        )}
        <button type="button" onClick={addValue}>
          Add
        </button>
        <button type="button" className="link" onClick={() => setAdding(false)}>
          Cancel
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    )
  }

  if (!values || values.length === 0) {
    const box = (
      <input
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label}
        accessKey={accessKey}
        aria-keyshortcuts={ariaKeyshortcuts}
        disabled={disabled}
      />
    )
    // A box that appears because the fetch failed says so: unexplained, it
    // reads as a field that takes any text, and what is typed is a code the
    // server may not know.
    if (!context?.failed?.[table]) return box
    return (
      <>
        {box}
        <output className="error">Could not load {table}.</output>
      </>
    )
  }

  // Only active values that pass the filter are offered. The one already
  // chosen is always shown, even retired or filtered out, so the form never
  // pretends a record holds nothing.
  const choosable = values.filter(
    (e) => (e.is_active !== false && (!filter || filter(e))) || e.code === value,
  )
  const active = values.filter((e) => e.is_active !== false)
  const found = findEntries(choosable, find)
  // A filter narrows what is offered, never what is shown as chosen: a value
  // already set stays visible even if it no longer fits.
  const offered = found.some(({ entry }) => entry.code === value)
    ? found
    : [
        ...choosable
          .filter((entry) => entry.code === value)
          .map((entry) => ({ entry, match: { alias: null } })),
        ...found,
      ]

  function pickFirst(e) {
    if (e.key !== 'Enter') return
    // Enter in a form would otherwise submit it.
    e.preventDefault()
    if (found.length > 0) onChange({ target: { value: found[0].entry.code } })
  }

  return (
    <div className="reference-select">
      {active.length > FIND_FROM && (
        <input
          className="reference-find"
          type="search"
          placeholder="Find..."
          aria-label={`Find ${table}`}
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={pickFirst}
          disabled={disabled}
        />
      )}
      <select
        value={value ?? ''}
        onKeyDown={addOption.onKeyDown}
        // An arrow on its way down the list steps over Add; only choosing it
        // opens the form. Without `allowAdd` there is no Add to choose.
        onChange={addOption.onSelectChange({
          pick: (code, e) => {
            setNotice('')
            onChange(e ?? { target: { value: code } })
          },
          open: () => {
            setNotice('')
            setAdding(true)
          },
        })}
        aria-label={label}
        accessKey={accessKey}
        aria-keyshortcuts={ariaKeyshortcuts}
        disabled={disabled}
      >
        {allowBlank && <option value="">--</option>}
        {/* Above the values, not below: under a long list it is a scroll
            away, and not known to be there. */}
        {allowAdd && <option value={ADD}>+ Add a new value...</option>}
        {offered.map(({ entry, match }) => (
          <option key={entry.code} value={entry.code}>
            {entry.label}
            {match.alias ? ` (${match.alias})` : ''}
            {entry.is_active === false ? ' (retired)' : ''}
          </option>
        ))}
        {find && found.length === 0 && (
          <option value="" disabled>
            nothing matches {find}
          </option>
        )}
      </select>
      {notice && <output className="muted">{notice}</output>}
    </div>
  )
}
