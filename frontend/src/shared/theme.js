// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * Light, dark, or the device's own setting (docs/specs/theme-preference-design.md).
 *
 * `light` and `dark` set `<html data-theme>`, which `shared.css` reads ahead
 * of `prefers-color-scheme`; `auto` removes it, so the device decides. The
 * choice is kept in this browser too, under `THEME_KEY`, for
 * `public/theme-init.js` to apply before the next page is drawn.
 */

export const THEME_KEY = 'ccwebdb.theme'

/** The settings offered, as [value, what the dropdown says]. */
export const THEMES = [
  ['auto', 'Automatic'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]

const KNOWN = new Set(THEMES.map(([value]) => value))

/** A known setting, or `auto` for anything else (nothing stored, a stale value). */
export function normalTheme(theme) {
  return KNOWN.has(theme) ? theme : 'auto'
}

/** The choice this browser last saw. */
export function storedTheme() {
  try {
    return normalTheme(window.localStorage.getItem(THEME_KEY))
  } catch {
    return 'auto'
  }
}

/** Show the page in `theme` now, and remember it in this browser. */
export function applyTheme(theme) {
  const chosen = normalTheme(theme)
  const root = document.documentElement
  if (chosen === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', chosen)
  // The browser's own canvas follows `color-scheme`; on Automatic the
  // pages' <meta name="color-scheme" content="light dark"> leaves it to
  // the device, as public/theme-init.js does on the next load.
  root.style.colorScheme = chosen === 'auto' ? '' : chosen
  try {
    if (chosen === 'auto') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, chosen)
  } catch {
    // No storage: the page still changes; the next load follows the device.
  }
  return chosen
}
