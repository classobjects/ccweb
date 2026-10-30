// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from 'react'

import { isCancellingEscape, useKeydownRef } from '../shared/add-option'

/**
 * The small form a picker opens from its "+ Add ..." option: the vendor,
 * seller and storage location pickers' shared state and behaviour.
 *
 * `blank` is the empty draft. `ready(draft)` says whether the draft holds
 * enough to send. `create(draft)` sends it and resolves to the row made;
 * `onCreated(row)` then takes it -- the picker adds it to its list and
 * selects it. A refusal stays in `error`, with the form open and the draft
 * as typed.
 *
 * `submit()` is the form's Add: it sends a ready draft, and for one that is
 * not yet ready sets `asked`, for the picker to say what is missing -- the
 * button is kept live, so a press says why rather than a dimmed button
 * saying nothing. `cancel()` closes the form and forgets it -- draft, error
 * and `asked` -- so the next open starts empty, however this one was closed.
 *
 * `wrapper` is the `ref` of the form's wrapper, which then hears its boxes'
 * keys. The form sits inside a larger `<form>`: without it, Enter in a box
 * submits that outer form -- for whatever was already picked -- instead of
 * adding what is being typed; here Enter is `submit()`. A button keeps its
 * own Enter: swallowing it would cancel Cancel's own activation and add the
 * row the user was abandoning. Escape is `cancel()`, for this form alone:
 * unhandled, it would close the dialog the picker sits in, with everything
 * typed there.
 */
export function useInlineAdd({ blank, ready, create, onCreated }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(blank)
  const [error, setError] = useState('')
  //: True once Add (the button or Enter) was asked for before the draft was ready.
  const [asked, setAsked] = useState(false)

  // A ref, not state: Enter held down asks again before the next render.
  const sending = useRef(false)

  async function add() {
    // One request at a time: a second behind the first would make the row
    // twice, or be refused for a row the first had just made.
    if (sending.current) return
    sending.current = true
    try {
      const created = await create(draft)
      onCreated(created)
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      sending.current = false
    }
  }

  function submit() {
    if (ready(draft)) add()
    else setAsked(true)
  }

  function cancel() {
    setAdding(false)
    setDraft(blank)
    setError('')
    setAsked(false)
  }

  function onKeyDown(e) {
    // Escape cancels this form, not the dialog it sits in.
    if (isCancellingEscape(e)) {
      cancel()
      return
    }
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return
    e.preventDefault()
    submit()
  }

  const wrapper = useKeydownRef(onKeyDown)

  return {
    adding,
    setAdding,
    draft,
    setDraft,
    error,
    add,
    submit,
    cancel,
    onKeyDown,
    wrapper,
    ready: ready(draft),
    asked,
  }
}
