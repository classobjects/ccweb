// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
// Adds the DOM matchers (toBeInTheDocument, toHaveValue, ...) to Vitest's
// expect, and clears the rendered tree between tests so one test's DOM cannot
// leak into the next.
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// The help band repeats the newest error on its page (`raised-error.js`), so
// every message a dialog shows is on the page twice. A text query finds the
// form's own message, as the owner reads it there; the band's copy is
// checked by the band's own tests, which read the band itself.
configure({ defaultIgnore: 'script, style, .help-bar-message' })

// jsdom has the <dialog> element but not its modal methods, so a component
// calling showModal() throws before anything can be asserted. These do what
// the browser does to the DOM -- toggle `open`, fire `close` -- and nothing
// more: no top layer, no inert background, no focus move.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
