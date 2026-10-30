// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useInlineAdd } from './useInlineAdd'

const BLANK = { name: '', url: '' }

/** The hook as a picker mounts it: a name is enough to send. */
function mount(create = vi.fn(), onCreated = vi.fn()) {
  const hook = renderHook(() =>
    useInlineAdd({
      blank: BLANK,
      ready: (draft) => Boolean(draft.name.trim()),
      create,
      onCreated,
    }),
  )
  return { ...hook, create, onCreated }
}

/** A key press as React hands it over, on an element of this tag. */
function key(name, tagName = 'INPUT') {
  return { key: name, target: { tagName }, preventDefault: vi.fn() }
}

describe('useInlineAdd', () => {
  it('starts closed, with the blank draft and nothing to send', () => {
    const { result } = mount()
    expect(result.current.adding).toBe(false)
    expect(result.current.draft).toEqual(BLANK)
    expect(result.current.error).toBe('')
    expect(result.current.ready).toBe(false)
  })

  it('is ready once the draft holds enough, and not for spaces alone', () => {
    const { result } = mount()
    act(() => result.current.setDraft({ name: '   ', url: '' }))
    expect(result.current.ready).toBe(false)
    act(() => result.current.setDraft({ name: 'Apmex', url: '' }))
    expect(result.current.ready).toBe(true)
  })

  it('sends one row when it is asked again before the first answer', async () => {
    let answer
    const create = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const { result, onCreated } = mount(create)
    act(() => {
      result.current.setAdding(true)
      result.current.setDraft({ name: 'Apmex', url: '' })
    })

    let first
    act(() => {
      first = result.current.add()
      result.current.add()
    })
    expect(create).toHaveBeenCalledTimes(1)

    await act(async () => {
      answer({ id: 12, name: 'Apmex' })
      await first
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('')
  })

  it('takes another row once the first has been answered', async () => {
    const create = vi.fn().mockResolvedValue({ id: 12 })
    const { result } = mount(create)
    await act(() => result.current.add())
    await act(() => result.current.add())
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('sends the draft, hands over the row made, and closes blank again', async () => {
    const made = { id: 12, name: 'Apmex' }
    const { result, create, onCreated } = mount(vi.fn().mockResolvedValue(made))
    act(() => {
      result.current.setAdding(true)
      result.current.setDraft({ name: 'Apmex', url: 'https://apmex.com' })
    })

    await act(() => result.current.add())

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ name: 'Apmex', url: 'https://apmex.com' })
    expect(onCreated).toHaveBeenCalledWith(made)
    expect(result.current.adding).toBe(false)
    expect(result.current.draft).toEqual(BLANK)
    expect(result.current.error).toBe('')
  })

  it('keeps the form open and the draft as typed when the server refuses', async () => {
    const refusal = new Error('A vendor named Apmex already exists')
    const { result, onCreated } = mount(vi.fn().mockRejectedValue(refusal))
    const typed = { name: 'Apmex', url: 'https://apmex.com' }
    act(() => {
      result.current.setAdding(true)
      result.current.setDraft(typed)
    })

    await act(() => result.current.add())

    expect(result.current.error).toBe('A vendor named Apmex already exists')
    expect(result.current.adding).toBe(true)
    expect(result.current.draft).toEqual(typed)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('clears a refusal once a later attempt is accepted', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('taken'))
      .mockResolvedValueOnce({ id: 1 })
    const { result } = mount(create)
    act(() => result.current.setDraft({ name: 'Apmex', url: '' }))

    await act(() => result.current.add())
    expect(result.current.error).toBe('taken')
    await act(() => result.current.add())
    expect(result.current.error).toBe('')
  })

  describe('asked before it is ready', () => {
    it('is said once Add is pressed with nothing to send', () => {
      const { result, create } = mount()
      expect(result.current.asked).toBe(false)
      act(() => result.current.submit())
      expect(result.current.asked).toBe(true)
      expect(create).not.toHaveBeenCalled()
    })

    it('is said the same when Enter asks', () => {
      const { result } = mount()
      act(() => result.current.onKeyDown(key('Enter')))
      expect(result.current.asked).toBe(true)
    })

    it('sends a ready draft from submit', async () => {
      const { result, create } = mount(vi.fn().mockResolvedValue({ id: 1 }))
      act(() => result.current.setDraft({ name: 'Apmex', url: '' }))
      await act(async () => result.current.submit())
      expect(create).toHaveBeenCalledTimes(1)
      expect(result.current.asked).toBe(false)
    })
  })

  describe('closed without adding', () => {
    /** An open form with a draft, a refusal and a premature ask in it. */
    async function used() {
      const mounted = mount(vi.fn().mockRejectedValue(new Error('taken')))
      const { result } = mounted
      act(() => {
        result.current.setAdding(true)
        result.current.submit()
      })
      act(() => result.current.setDraft({ name: 'Apmex', url: 'x' }))
      await act(() => result.current.add())
      expect(result.current.error).toBe('taken')
      expect(result.current.asked).toBe(true)
      return mounted
    }

    it.each([
      ['cancel()', (result) => result.current.cancel()],
      [
        'Escape',
        (result) =>
          result.current.onKeyDown({
            ...key('Escape'),
            stopPropagation: vi.fn(),
          }),
      ],
    ])('forgets everything through %s', async (_how, close) => {
      const { result } = await used()
      act(() => close(result))
      expect(result.current.adding).toBe(false)
      expect(result.current.draft).toEqual(BLANK)
      expect(result.current.error).toBe('')
      expect(result.current.asked).toBe(false)
    })
  })

  describe('Enter inside the outer form', () => {
    it('adds the row instead of submitting the form around it', async () => {
      const { result, create } = mount(vi.fn().mockResolvedValue({ id: 1 }))
      act(() => result.current.setDraft({ name: 'Apmex', url: '' }))
      const enter = key('Enter')

      await act(async () => result.current.onKeyDown(enter))

      expect(enter.preventDefault).toHaveBeenCalledTimes(1)
      expect(create).toHaveBeenCalledTimes(1)
    })

    it('holds the outer form back even when there is nothing to add yet', async () => {
      const { result, create } = mount()
      const enter = key('Enter')

      await act(async () => result.current.onKeyDown(enter))

      expect(enter.preventDefault).toHaveBeenCalledTimes(1)
      expect(create).not.toHaveBeenCalled()
    })

    it('leaves a button its own Enter, so Cancel cancels', async () => {
      const { result, create } = mount(vi.fn().mockResolvedValue({ id: 1 }))
      act(() => result.current.setDraft({ name: 'Apmex', url: '' }))
      const enter = key('Enter', 'BUTTON')

      await act(async () => result.current.onKeyDown(enter))

      expect(enter.preventDefault).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })

    it('ignores every other key', async () => {
      const { result, create } = mount(vi.fn().mockResolvedValue({ id: 1 }))
      act(() => result.current.setDraft({ name: 'Apmex', url: '' }))
      const letter = key('a')

      await act(async () => result.current.onKeyDown(letter))

      expect(letter.preventDefault).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  })
})
