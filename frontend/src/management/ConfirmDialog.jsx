// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import HelpScope from './HelpScope'
import ModalDialog from './ModalDialog'

/**
 * The console's question before something that cannot be undone.
 *
 * `question` is both the dialog's accessible name and its heading, and names
 * the thing about to change rather than asking "are you sure": the page
 * behind is covered while the dialog is open. `children` says what the
 * action does. The confirm button reads `confirmLabel`, or `busyLabel` while
 * the request is out, and is disabled only then; the other button,
 * `cancelLabel`, backs out. An answer that is not complete yet keeps the
 * button live: `onConfirm` says what is missing when it is pressed.
 *
 * `help` is for a question that asks for something -- where returned items
 * are put away -- and gives the dialog its help band, with `children` in a
 * `HelpScope`; a plain question has no field to explain and no band.
 */
export default function ConfirmDialog({
  question,
  confirmLabel,
  busyLabel,
  cancelLabel,
  busy,
  help = false,
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <ModalDialog label={question} onClose={onCancel} help={help}>
      <h2>{question}</h2>
      {help ? <HelpScope>{children}</HelpScope> : children}
      <div className="row">
        <button disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button className="link" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </ModalDialog>
  )
}
