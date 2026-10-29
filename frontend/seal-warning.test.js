// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { sealWarning } from './seal-warning.js'

describe('the build says when the shop will have no seal', () => {
  it('warns on a production build with no seal tag', () => {
    expect(sealWarning('build', 'production', {})).toMatch(/VITE_DIGICERT_SEAL_ID/)
  })

  it('says nothing when the tag is set', () => {
    expect(
      sealWarning('build', 'production', { VITE_DIGICERT_SEAL_ID: 'abc' }),
    ).toBeNull()
  })

  it('says nothing to the development server or the tests', () => {
    expect(sealWarning('serve', 'development', {})).toBeNull()
    expect(sealWarning('serve', 'test', {})).toBeNull()
  })
})
