// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'

import { correctionSaver } from './printerCorrection'

/** A send whose requests stay out until `answer` settles the oldest. */
function heldSend() {
  const out = []
  const send = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        out.push({ resolve, reject })
      }),
  )
  const answer = async (fail) => {
    const next = out.shift()
    if (fail) next.reject(new Error(fail))
    else next.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { send, answer }
}

describe('printer correction saver', () => {
  it('sends a change, normalized', async () => {
    const send = vi.fn().mockResolvedValue({})
    const report = vi.fn()
    const save = correctionSaver(send, report, { across: 100, down: 100 })
    await save({ across: '97.5', down: '' })
    expect(send).toHaveBeenCalledExactlyOnceWith({ across: 97.5, down: 100 })
    expect(report).toHaveBeenLastCalledWith('')
  })

  it('sends nothing for the value already stored', async () => {
    const send = vi.fn().mockResolvedValue({})
    const save = correctionSaver(send, vi.fn(), { across: '97.5', down: '97.5' })
    await save({ across: '97.50', down: 97.5 })
    expect(send).not.toHaveBeenCalled()
  })

  it('sends one at a time, and only the newest of those typed meanwhile', async () => {
    const { send, answer } = heldSend()
    const save = correctionSaver(send, vi.fn(), { across: 100, down: 100 })
    save({ across: '9', down: 100 }) // out of range: 100, already stored
    save({ across: '97', down: 100 })
    save({ across: '97.', down: 100 }) // still 97: nothing new
    save({ across: '97.5', down: 100 })
    save({ across: '97.5', down: '9' })
    save({ across: '97.5', down: '97.5' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith({ across: 97, down: 100 })
    await answer()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ across: 97.5, down: 97.5 })
    await answer()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('reports a failure, and sends the same value again on the next change', async () => {
    const { send, answer } = heldSend()
    const report = vi.fn()
    const save = correctionSaver(send, report, { across: 100, down: 100 })
    save({ across: 98, down: 98 })
    await answer('Network down')
    expect(report).toHaveBeenLastCalledWith('Network down')
    save({ across: 98, down: 98 })
    expect(send).toHaveBeenCalledTimes(2)
    await answer()
    expect(report).toHaveBeenLastCalledWith('')
  })
})
