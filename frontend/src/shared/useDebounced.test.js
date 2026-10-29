// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebounced } from './useDebounced'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDebounced', () => {
  it('starts at the value it is given', () => {
    const { result } = renderHook(() => useDebounced('m', 250))
    expect(result.current).toBe('m')
  })

  it('follows only once the value has held still for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 250), {
      initialProps: { value: '' },
    })
    rerender({ value: 'm' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'mo' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe('mo')
  })
})
