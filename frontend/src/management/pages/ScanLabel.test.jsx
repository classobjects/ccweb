// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: { labelLookupUrl: vi.fn(), searchInventory: vi.fn() },
}))
vi.mock('./scan/labelReader', () => ({ startLabelReader: vi.fn() }))
vi.mock('./scan/cameraFrame', () => ({
  cameraOffered: vi.fn(),
  openCamera: vi.fn(),
  grabGuide: vi.fn(),
  hasLight: vi.fn(),
  setLight: vi.fn(),
  tuneCamera: vi.fn(),
}))

import { api } from '../api'
import { renderWithProviders } from '../../test/helpers'
import { uncovered } from '../../test/helpCoverage'
import ScanLabel from './ScanLabel'
import * as camera from './scan/cameraFrame'
import { startLabelReader } from './scan/labelReader'

const LOOKUP = '/management/inventory/{view}?item_code={item_code}'

/** Where the console went: the path and query, shown for the test to read. */
function Opened() {
  const location = useLocation()
  return <p data-testid="opened">{location.pathname + location.search}</p>
}

let track
let reader

/**
 * The page with a camera and a reader that reads `frames` in turn (the
 * last one again once they run out); `items` are the rows each inventory
 * view's search answers.
 */
function open({
  frames = [],
  items = { coins: [], currency: [] },
  strict = false,
} = {}) {
  api.labelLookupUrl.mockResolvedValue({ lookup_url: LOOKUP })
  api.searchInventory.mockImplementation(async (view) => ({ rows: items[view] }))
  track = { stop: vi.fn() }
  camera.cameraOffered.mockReturnValue(true)
  camera.openCamera.mockResolvedValue({
    getTracks: () => [track],
    getVideoTracks: () => [track],
  })
  camera.grabGuide.mockReturnValue({ frame: true })
  camera.hasLight.mockReturnValue(false)
  camera.tuneCamera.mockResolvedValue({})
  let n = 0
  reader = {
    read: vi.fn(async () => frames[Math.min(n++, frames.length - 1)] ?? ''),
    close: vi.fn(),
  }
  startLabelReader.mockResolvedValue(reader)
  const view = renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanLabel />} />
      <Route path="/inventory/:view" element={<Opened />} />
    </Routes>,
    { route: '/scan', strict },
  )
  return { user: userEvent.setup(), ...view }
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('Scan a label', () => {
  it('opens the item a label names once two frames agree', async () => {
    const { user } = open({
      frames: ['002427  1621  725\n1957 1\n'],
      items: { coins: [], currency: [{ item_code: 'CC-002427' }] },
    })
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    expect(await screen.findByTestId('opened')).toHaveTextContent(
      '/inventory/currency?item_code=CC-002427',
    )
    expect(reader.read.mock.calls.length).toBeGreaterThanOrEqual(2)
    // Leaving for the item stopped the camera and the reader.
    expect(track.stop).toHaveBeenCalled()
    expect(reader.close).toHaveBeenCalled()
    // The camera was asked to focus (and zoom) for close type.
    expect(camera.tuneCamera).toHaveBeenCalledWith(track)
  })

  it('opens a coin on the coins screen, and runs under StrictMode', async () => {
    const { user } = open({
      frames: ['000184\n1999\n'],
      items: { coins: [{ item_code: 'CC-000184' }], currency: [] },
      strict: true,
    })
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    expect(await screen.findByTestId('opened')).toHaveTextContent(
      '/inventory/coins?item_code=CC-000184',
    )
  })

  it('never looks up a number read on one frame only', async () => {
    const { user } = open({ frames: ['002427\n', '\n', '002428\n', '\n'] })
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    await waitFor(() => expect(reader.read.mock.calls.length).toBeGreaterThan(5))
    expect(api.searchInventory).not.toHaveBeenCalled()
  })

  it('says a number no item has, looks it up once, and goes on reading', async () => {
    const { user } = open({ frames: ['900001\n1964 D\n'] })
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    expect(
      await screen.findByText('No item has the number 900001.'),
    ).toBeInTheDocument()
    const reads = reader.read.mock.calls.length
    await waitFor(() =>
      expect(reader.read.mock.calls.length).toBeGreaterThan(reads + 2),
    )
    // One lookup: both inventory views, once.
    expect(api.searchInventory).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('opened')).toBeNull()
  })

  it('opens a typed number, with its zeros left off', async () => {
    const { user } = open({
      items: { coins: [], currency: [{ item_code: 'CC-002427' }] },
    })
    await screen.findByRole('button', { name: 'Start the camera' })
    await user.type(screen.getByLabelText(/Or type the number/), '2427')
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByTestId('opened')).toHaveTextContent(
      '/inventory/currency?item_code=CC-002427',
    )
    expect(api.searchInventory).toHaveBeenCalledWith('coins', { item_code: '002427' })
    expect(camera.openCamera).not.toHaveBeenCalled()
  })

  it('says so when the camera is not allowed', async () => {
    const { user } = open()
    camera.openCamera.mockRejectedValue(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    expect(await screen.findByText(/The camera was not allowed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start the camera' })).toBeInTheDocument()
  })

  it('offers no camera button where the browser has no camera', async () => {
    open()
    camera.cameraOffered.mockReturnValue(false)
    await screen.findByText(/This browser offers no camera here/)
    expect(screen.queryByRole('button', { name: 'Start the camera' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('stops the camera when the page is left, and on Stop', async () => {
    const { user, unmount } = open({ frames: ['\n'] })
    await user.click(await screen.findByRole('button', { name: 'Start the camera' }))
    await user.click(await screen.findByRole('button', { name: 'Stop the camera' }))
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(reader.close).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Start the camera' }))
    await screen.findByRole('button', { name: 'Stop the camera' })
    unmount()
    expect(track.stop).toHaveBeenCalledTimes(2)
  })

  it('explains every field', async () => {
    const { container } = open()
    await screen.findByRole('button', { name: 'Start the camera' })
    expect(uncovered(container)).toEqual([])
  })
})
