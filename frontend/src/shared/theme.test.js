// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { THEME_KEY, applyTheme, normalTheme, storedTheme } from './theme'

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  window.localStorage.clear()
})

describe('applyTheme', () => {
  it('sets light or dark on the page and remembers it in the browser', () => {
    for (const theme of ['dark', 'light']) {
      applyTheme(theme)
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
      expect(window.localStorage.getItem(THEME_KEY)).toBe(theme)
      expect(storedTheme()).toBe(theme)
    }
  })

  it('leaves Automatic to the device: no attribute, nothing remembered', () => {
    applyTheme('dark')
    applyTheme('auto')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
    expect(storedTheme()).toBe('auto')
  })

  it("tells the browser the page's color scheme, so its own canvas matches", () => {
    // Before a stylesheet loads the browser paints its default canvas: white,
    // unless `color-scheme` on <html> says dark. Without this a dark page
    // reloads through one white frame.
    applyTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    applyTheme('auto')
    expect(document.documentElement.style.colorScheme).toBe('')
  })

  it('reads anything it does not know as Automatic', () => {
    expect(normalTheme('purple')).toBe('auto')
    expect(normalTheme(undefined)).toBe('auto')
    window.localStorage.setItem(THEME_KEY, 'purple')
    expect(storedTheme()).toBe('auto')
  })
})

describe('the pieces that must agree', () => {
  it('has the early script read the key and values theme.js writes', () => {
    const early = read('../../public/theme-init.js')
    expect(early).toContain(`'${THEME_KEY}'`)
    expect(early).toContain("theme === 'light' || theme === 'dark'")
  })

  it('loads the early script in the head of both pages, after the scheme it may narrow', () => {
    for (const page of ['../../index.html', '../../management.html']) {
      const html = read(page)
      const head = html.slice(0, html.indexOf('</head>'))
      const meta = head.indexOf('<meta name="color-scheme" content="light dark" />')
      const script = head.indexOf('<script src="/theme-init.js"></script>')
      expect(meta, page).toBeGreaterThan(-1)
      expect(script, page).toBeGreaterThan(meta)
    }
  })

  it.each([
    ['dark', 'dark', 'dark'],
    ['light', 'light', 'light'],
    [null, null, ''],
    ['purple', null, ''],
  ])(
    'early script: remembered %s gives data-theme %s and color-scheme "%s"',
    (stored, attribute, scheme) => {
      if (stored) window.localStorage.setItem(THEME_KEY, stored)
      document.documentElement.style.colorScheme = ''
      // Run the shipped file as the page would.
      new Function(read('../../public/theme-init.js'))()
      expect(document.documentElement.getAttribute('data-theme')).toBe(attribute)
      expect(document.documentElement.style.colorScheme).toBe(scheme)
    },
  )

  it('gives the chosen dark and the device-asked dark the same colors', () => {
    // shared.css repeats the dark set: once for `data-theme="dark"`, once
    // inside `prefers-color-scheme: dark`. A color changed in one only would
    // make a chosen Dark differ from an automatic one.
    const css = read('./shared.css')
    const block = (selector) => {
      const start = css.indexOf(selector)
      expect(start, selector).toBeGreaterThan(-1)
      const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
      return body
        .split(';')
        .map((line) => line.trim())
        .filter(Boolean)
    }
    const chosen = block(":root[data-theme='dark']")
    const asked = block(":root:not([data-theme='light'])")
    expect(chosen.length).toBeGreaterThan(5)
    expect(asked).toEqual(chosen)
  })
})
