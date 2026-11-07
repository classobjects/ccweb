// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useAuth } from './auth-context'
import { THEMES } from './theme'

/**
 * The light/dark choice, in every header of the shop and the console.
 *
 * Saved to the account when someone is signed in, to this browser when not
 * (`AuthProvider`'s `setTheme`; docs/specs/theme-preference-design.md).
 */
export default function ThemeSwitch() {
  const { theme, setTheme } = useAuth()
  return (
    <label className="theme-switch">
      <span className="muted">Theme</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        data-help="theme"
      >
        {THEMES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}
