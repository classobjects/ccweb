// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
//
// Applies the light/dark choice this browser last saw before the page is
// drawn, so a dark page does not flash light while the application loads
// (docs/specs/theme-preference-design.md). A file of its own, loaded from
// the page's <head>, because the site's Content-Security-Policy refuses
// inline scripts. Keep the key and values in step with src/shared/theme.js.
;(function () {
  try {
    var theme = window.localStorage.getItem('ccwebdb.theme')
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme)
      // The browser's own canvas, painted before the stylesheet arrives,
      // follows this; without it a dark page reloads through a white frame.
      document.documentElement.style.colorScheme = theme
    }
  } catch {
    // No storage (a private window, blocked site data): the device decides.
  }
})()
