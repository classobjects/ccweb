// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'

import { tuneCamera } from './cameraFrame'

/** A camera track offering `capabilities`; `refuse` makes it turn every request down. */
function track(capabilities, { refuse = false } = {}) {
  return {
    getCapabilities: () => capabilities,
    applyConstraints: vi.fn(async () => {
      if (refuse) throw new Error('OverconstrainedError')
    }),
  }
}

describe('tuneCamera', () => {
  it('asks for continuous focus and a 2x zoom where the camera has both', async () => {
    const camera = track({
      focusMode: ['manual', 'continuous'],
      zoom: { min: 1, max: 8, step: 0.1 },
    })
    expect(await tuneCamera(camera)).toEqual({ focusMode: 'continuous', zoom: 2 })
    expect(camera.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous', zoom: 2 }],
    })
  })

  it('asks only for what the camera has', async () => {
    const focusOnly = track({ focusMode: ['continuous'] })
    expect(await tuneCamera(focusOnly)).toEqual({ focusMode: 'continuous' })
    const shortZoom = track({ zoom: { min: 1, max: 1.5 } })
    expect(await tuneCamera(shortZoom)).toEqual({})
    expect(shortZoom.applyConstraints).not.toHaveBeenCalled()
  })

  it('leaves a camera with nothing to tune, or that refuses, as it was', async () => {
    const laptop = track({})
    expect(await tuneCamera(laptop)).toEqual({})
    expect(laptop.applyConstraints).not.toHaveBeenCalled()
    const old = { applyConstraints: vi.fn() }
    expect(await tuneCamera(old)).toEqual({})
    const refusing = track({ focusMode: ['continuous'] }, { refuse: true })
    expect(await tuneCamera(refusing)).toEqual({})
  })
})
