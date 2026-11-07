// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SiteLogo, { LOGO_URL } from './SiteLogo'

describe('SiteLogo', () => {
  it('shows the logo by its generic name, silent to a screen reader', () => {
    const { container } = render(<SiteLogo />)
    const img = container.querySelector('img')
    expect(LOGO_URL).toBe('/brand/logo.svg')
    expect(img.getAttribute('src')).toBe(LOGO_URL)
    expect(img.getAttribute('alt')).toBe('')
    expect(img.hidden).toBe(false)
  })

  it('hides itself when the site has no logo file', () => {
    const { container } = render(<SiteLogo />)
    const img = container.querySelector('img')
    fireEvent.error(img)
    expect(img.hidden).toBe(true)
  })
})
