// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api'
import HelpScope from '../HelpScope'
import { findItemAndView } from '../item-search'
import { useRequest } from '../../shared/useRequest'
import {
  cameraOffered,
  grabGuide,
  hasLight,
  openCamera,
  setLight,
  tuneCamera,
} from './scan/cameraFrame'
import { startLabelReader } from './scan/labelReader'
import {
  SteadyReading,
  labelNumber,
  lookupAddress,
  openAddress,
} from './scan/readLabel'
import './scan/scan.css'

//: A pause between frames, so the reader leaves the phone time to draw.
const BETWEEN_READS_MS = 150

/**
 * A number as typed: the whole code (`CC-002427`), the label's number
 * (`002427`), or the number without its zeros (`2427`), padded to six.
 */
function typedNumber(text) {
  const trimmed = text.trim()
  return /^\d{1,5}$/.test(trimmed) ? trimmed.padStart(6, '0') : trimmed
}

/**
 * Scan a label: point a phone's or laptop's camera at a holder label and
 * the item it names opens.
 *
 * The camera's picture is shown with a guide box; the part inside it is
 * read for text in the browser (`startLabelReader`, Tesseract from the
 * site's own files -- no picture leaves the device), and the first line's
 * number (`labelNumber`) is taken once two frames in a row agree
 * (`SteadyReading`). The item is looked up in both inventories
 * (`findItemAndView`); found, its address is built from the installation's
 * LABEL_LOOKUP_URL (`GET /api/labels/lookup-url`) and opened. A number no
 * item has (a test page's samples are numbered from 900001) is said, and
 * reading goes on. The number can also be typed.
 *
 * The camera is started only by the button: a browser asks the viewer's
 * permission at that moment, and leaving the page stops it.
 */
export default function ScanLabel() {
  const navigate = useNavigate()
  const lookup = useRequest('label-lookup-url', () => api.labelLookupUrl())
  const stage = useRef(null)
  const video = useRef(null)
  const canvas = useRef(null)
  const stream = useRef(null)
  const reader = useRef(null)
  const running = useRef(false)
  const timer = useRef(null)
  const steady = useRef(new SteadyReading())
  const missing = useRef(null)
  const [phase, setPhase] = useState('idle')
  const [said, setSaid] = useState('')
  const [light, setLightOffered] = useState(false)
  const [lightOn, setLightOn] = useState(false)
  const [typed, setTyped] = useState('')

  function stop() {
    running.current = false
    window.clearTimeout(timer.current)
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    reader.current?.close()
    reader.current = null
    setLightOffered(false)
    setLightOn(false)
  }

  // Leaving the page stops the camera and the reader.
  useEffect(() => stop, [])

  async function open(number) {
    if (!lookup.data) {
      setSaid('The lookup address has not loaded yet: try again in a moment.')
      return false
    }
    const hit = await findItemAndView(number)
    if (!hit) {
      missing.current = number
      setSaid(`No item has the number ${number}.`)
      return false
    }
    const address = lookupAddress(lookup.data.lookup_url, hit.item.item_code, hit.view)
    stop()
    openAddress(address, navigate)
    return true
  }

  async function readOnce() {
    if (!running.current) return
    const frame = grabGuide(video.current, canvas.current)
    if (frame) {
      try {
        const number = steady.current.see(labelNumber(await reader.current.read(frame)))
        if (number && number !== missing.current && running.current) {
          setPhase('looking')
          setSaid(`Read ${number}. Looking it up...`)
          if (await open(number)) return
          setPhase('reading')
        }
      } catch (err) {
        stop()
        setPhase('error')
        setSaid(`The label could not be read: ${err.message}`)
        return
      }
    }
    if (running.current) timer.current = window.setTimeout(readOnce, BETWEEN_READS_MS)
  }

  async function start() {
    setPhase('starting')
    setSaid('Opening the camera...')
    try {
      stream.current = await openCamera()
      video.current.srcObject = stream.current
      await video.current.play()
      const [track] = stream.current.getVideoTracks()
      setLightOffered(hasLight(track))
      await tuneCamera(track)
      // On a phone the picture is below the buttons: bring the box into view.
      stage.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      setSaid('Loading the reader...')
      reader.current = await startLabelReader()
      steady.current.reset()
      missing.current = null
      running.current = true
      setPhase('reading')
      setSaid("Hold the label's number inside the box.")
      readOnce()
    } catch (err) {
      stop()
      setPhase('error')
      setSaid(
        err.name === 'NotAllowedError'
          ? 'The camera was not allowed. Allow it for this site in the browser, then start again.'
          : `The camera could not be started: ${err.message}`,
      )
    }
  }

  async function toggleLight() {
    const [track] = stream.current?.getVideoTracks() ?? []
    if (track && (await setLight(track, !lightOn))) setLightOn(!lightOn)
  }

  async function openTyped(event) {
    event.preventDefault()
    const number = typedNumber(typed)
    if (!number) return
    setSaid(`Looking up ${number}...`)
    await open(number)
  }

  function stopWatching() {
    stop()
    setPhase('idle')
    setSaid('')
  }

  const watching = phase === 'reading' || phase === 'looking' || phase === 'starting'

  return (
    <HelpScope>
      <h1>Scan a label</h1>
      <p className="muted">
        Point the camera at a holder label with its number inside the box. The item
        opens as soon as the number is read. The picture is read on this device and is
        not sent anywhere.
      </p>
      {lookup.error && <p className="error">{lookup.error}</p>}
      {!cameraOffered() && (
        <p className="error">
          This browser offers no camera here. A camera needs the site&apos;s https
          address; type the number below instead.
        </p>
      )}

      <div className="scan-actions">
        {watching && (
          <button type="button" onClick={stopWatching}>
            Stop the camera
          </button>
        )}
        {!watching && cameraOffered() && (
          <button type="button" onClick={start}>
            Start the camera
          </button>
        )}
        {light && (
          <button type="button" aria-pressed={lightOn} onClick={toggleLight}>
            Light
          </button>
        )}
      </div>

      <div ref={stage} className={`scan-stage${watching ? '' : ' scan-stage-idle'}`}>
        <video ref={video} playsInline muted aria-label="Camera" />
        <div className="scan-guide" aria-hidden="true" />
      </div>
      <canvas ref={canvas} hidden />
      {said && (
        <output className={phase === 'error' ? 'error' : 'notice status-line'}>
          {said}
        </output>
      )}

      <form className="scan-typed" onSubmit={openTyped}>
        <label data-help="scan_item_number">
          Or type the number{' '}
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="number on the label"
          />
        </label>{' '}
        <button type="submit">Open</button>
      </form>
    </HelpScope>
  )
}
