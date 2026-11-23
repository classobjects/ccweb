// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * The camera, and the part of its picture the reader is shown.
 */

/**
 * The guide box, as fractions of the camera's picture: a wide, short strip
 * across the middle, the shape of a label's first line held close. The
 * page draws its outline at the same place (`.scan-guide`).
 */
export const GUIDE = { left: 0.1, top: 0.39, width: 0.8, height: 0.22 }

//: The reader is shown the strip at least this wide, in pixels: a phone's
//: picture of 7.5pt type is too small to read unscaled.
const READ_WIDTH = 1400

/** Whether this browser offers a camera to the page at all. */
export function cameraOffered() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext
}

/**
 * The camera's stream: the one facing away from the viewer where there is
 * one (a phone's back camera), at a size fine type can be read in.
 */
export function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  })
}

/**
 * Draw the guide box's part of `video` onto `canvas`, enlarged and in
 * strong grey, and answer the canvas; null while the video has no picture.
 */
export function grabGuide(video, canvas) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null
  const sx = width * GUIDE.left
  const sy = height * GUIDE.top
  const sw = width * GUIDE.width
  const sh = height * GUIDE.height
  const scale = Math.max(1, READ_WIDTH / sw)
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.filter = 'grayscale(1) contrast(1.6)'
  context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  context.filter = 'none'
  return canvas
}

//: The zoom asked for where the camera has one: a phone held twice as far
//: back, beyond its closest focusing distance, still fills the guide box
//: with the label.
const READ_ZOOM = 2

/**
 * Ask the camera to keep focusing, and to zoom in where it can, for type
 * held close. Each is asked for only where the camera says it has it, and
 * a refusal leaves the camera as it was: the page reads either way.
 */
export async function tuneCamera(track) {
  const can = track.getCapabilities?.() ?? {}
  const wanted = {}
  if (can.focusMode?.includes('continuous')) wanted.focusMode = 'continuous'
  if (can.zoom && can.zoom.max >= READ_ZOOM && can.zoom.min <= READ_ZOOM) {
    wanted.zoom = READ_ZOOM
  }
  if (Object.keys(wanted).length === 0) return {}
  try {
    await track.applyConstraints({ advanced: [wanted] })
    return wanted
  } catch {
    return {}
  }
}

/** Turn the camera's light on or off, where it has one; false if it can't. */
export async function setLight(track, on) {
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] })
    return true
  } catch {
    return false
  }
}

/** Whether the camera's track has a light the page may switch. */
export function hasLight(track) {
  return Boolean(track.getCapabilities?.().torch)
}
