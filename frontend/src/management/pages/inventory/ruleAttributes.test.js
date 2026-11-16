// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'

import { shownAttributes } from './ruleAttributes'

describe('shownAttributes', () => {
  it('is the ruled set until the person chooses', () => {
    expect(shownAttributes(undefined, [], ['star', 'radar'])).toEqual(['star', 'radar'])
  })

  it('is their choice while the rules say nothing new', () => {
    expect(shownAttributes(['cac'], ['star'], ['star'])).toEqual(['cac'])
  })

  it('adds what the rules have read since', () => {
    expect(shownAttributes(['no_motto'], [], ['radar', 'fancy_serial'])).toEqual([
      'no_motto',
      'radar',
      'fancy_serial',
    ])
  })

  it('drops what the rules have taken back since', () => {
    expect(shownAttributes(['radar', 'no_motto'], ['radar'], [])).toEqual(['no_motto'])
  })

  it('keeps off what the person took off', () => {
    expect(shownAttributes([], ['radar'], ['radar'])).toEqual([])
  })

  it('does not list a code twice', () => {
    expect(shownAttributes(['radar'], [], ['radar'])).toEqual(['radar'])
  })
})
