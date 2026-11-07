// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext } from './auth-context'
import ThemeSwitch from './ThemeSwitch'

function renderWith(theme) {
  const setTheme = vi.fn()
  render(
    <AuthContext.Provider value={{ theme, setTheme }}>
      <ThemeSwitch />
    </AuthContext.Provider>,
  )
  return setTheme
}

describe('ThemeSwitch', () => {
  it('offers Automatic, Light and Dark, showing the current one', () => {
    renderWith('dark')
    const box = screen.getByRole('combobox', { name: 'Theme' })
    expect(box).toHaveValue('dark')
    expect(
      within(box)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Automatic', 'Light', 'Dark'])
  })

  it('changes the theme when another is picked', async () => {
    const setTheme = renderWith('auto')
    await userEvent
      .setup()
      .selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'light')
    expect(setTheme).toHaveBeenCalledWith('light')
  })
})
