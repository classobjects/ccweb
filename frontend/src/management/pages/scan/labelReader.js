// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * The text reader a label scan runs: Tesseract, loaded from the site's own
 * `/assets/ocr-<version>/` (`ocr-assets.js`), never a CDN.
 *
 * Its worker is started from that file, not from a `blob:` copy, because
 * a worker takes its content policy from its own script's response: the
 * server lets only those files compile WebAssembly (deploy/Caddyfile), and
 * every page keeps the stricter policy.
 */

import { cameraOffered } from './cameraFrame'

const BASE = __OCR_BASE__

//: The files a first scan needs, fetched ahead by `prefetchLabelReader`.
const FILES = [
  'tesseract.min.js',
  'worker.min.js',
  'core/tesseract-core-simd-lstm.wasm.js',
  'lang/eng.traineddata.gz',
]

//: Only what a label number is written with: digits, and the split piece's
//: underscore. A 0 is then never read as an O; the words on a label come
//: out as stray digits, which the number check passes over.
const CHARACTERS = '0123456789_ '

let library = null

/** The page's `Tesseract`, loading its script once. */
function loadLibrary() {
  if (!library) {
    library = new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve(window.Tesseract)
      const script = document.createElement('script')
      script.src = `${BASE}/tesseract.min.js`
      script.onload = () => resolve(window.Tesseract)
      script.onerror = () => {
        library = null
        reject(new Error('The label reader could not be loaded.'))
      }
      document.head.append(script)
    })
  }
  return library
}

/**
 * A started reader: `read(canvas)` answers the text it sees there;
 * `close()` stops its worker.
 */
export async function startLabelReader() {
  const Tesseract = await loadLibrary()
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: `${BASE}/worker.min.js`,
    workerBlobURL: false,
    corePath: `${BASE}/core`,
    langPath: `${BASE}/lang`,
  })
  await worker.setParameters({
    // One block of text: the label's lines, as cropped by the guide box.
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: CHARACTERS,
  })
  return {
    async read(canvas) {
      const { data } = await worker.recognize(canvas)
      return data.text
    },
    close: () => worker.terminate(),
  }
}

/**
 * Fetch the reader's files into the browser's cache while nothing else is
 * happening, so the first scan opens at once. Called once the console has
 * loaded; a browser that offers no camera here never scans, so fetches
 * nothing. A failure only means the first scan fetches them itself.
 */
export function prefetchLabelReader() {
  if (!cameraOffered()) return
  const idle = window.requestIdleCallback ?? ((run) => window.setTimeout(run, 2000))
  idle(() => {
    for (const file of FILES) {
      fetch(`${BASE}/${file}`, { priority: 'low' }).catch(() => {})
    }
  })
}
