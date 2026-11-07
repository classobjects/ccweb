// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Every field a person can fill in explains itself.
 *
 * `uncovered(container)` walks every input, dropdown and text box actually
 * rendered and names each one with no `data-help` topic above it that has
 * both a title and text, and each one that no `HelpScope` would read. A
 * page's test asserts the list is empty once its forms are open. A
 * literal-key scan of the source cannot see a key built at runtime --
 * `data-help={helpFor(param)}` -- nor a control added with no key at all,
 * which is the gap this closes.
 */
import { FIELD_HELP } from '../management/fieldHelp'

export function uncovered(container) {
  return [...container.querySelectorAll('input, select, textarea')]
    .filter((control) => control.type !== 'hidden')
    .map((control) => ({
      control,
      key: control.closest('[data-help]')?.dataset.help ?? null,
      scoped: Boolean(control.closest('.help-scope')),
    }))
    .filter(
      ({ key, scoped }) =>
        !scoped || !key || !FIELD_HELP[key]?.title || !FIELD_HELP[key]?.text,
    )
    .map(
      ({ control, key, scoped }) =>
        `${control.tagName.toLowerCase()} ${control.getAttribute('aria-label') ?? control.name ?? ''} (${key ?? 'no topic'}${scoped ? '' : ', no HelpScope'})`,
    )
}
