// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * The label reader's files, served from the site itself.
 *
 * Reading a label's number runs Tesseract in the browser: a script, its
 * worker, the compiled engine and the English model. They come from the
 * site's own origin, never a CDN, so the content policy stays `'self'` and
 * no picture or request leaves for a third party.
 *
 * They live under `/assets/ocr-<version>/`: under /assets/ so the server
 * lets a browser keep them a year unasked (deploy/Caddyfile), and named
 * for tesseract.js's version so an upgrade is a new address rather than a
 * stale copy. The dev server answers them from node_modules; a build
 * copies them into dist.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function packageDir(name) {
  return dirname(require.resolve(`${name}/package.json`))
}

const VERSION = JSON.parse(
  readFileSync(join(packageDir('tesseract.js'), 'package.json'), 'utf-8'),
).version

/** Where the files are served; `labelReader.js` builds its paths on it. */
export const OCR_BASE = `/assets/ocr-${VERSION}`

/**
 * Each served file and the file it is. Tesseract picks the SIMD engine
 * where the browser has SIMD, the plain one otherwise; both are LSTM-only,
 * the recognizer the reader asks for.
 */
function ocrFiles() {
  const lib = join(packageDir('tesseract.js'), 'dist')
  const core = packageDir('tesseract.js-core')
  const eng = join(packageDir('@tesseract.js-data/eng'), '4.0.0_best_int')
  return {
    'tesseract.min.js': join(lib, 'tesseract.min.js'),
    'worker.min.js': join(lib, 'worker.min.js'),
    'core/tesseract-core-simd-lstm.wasm.js': join(
      core,
      'tesseract-core-simd-lstm.wasm.js',
    ),
    'core/tesseract-core-lstm.wasm.js': join(core, 'tesseract-core-lstm.wasm.js'),
    'lang/eng.traineddata.gz': join(eng, 'eng.traineddata.gz'),
  }
}

const TYPES = { '.js': 'text/javascript', '.gz': 'application/gzip' }

export function ocrAssets() {
  const files = ocrFiles()
  return {
    name: 'ccwebdb-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path] = (req.url ?? '').split('?')
        if (!path.startsWith(`${OCR_BASE}/`)) return next()
        const source = files[path.slice(OCR_BASE.length + 1)]
        if (!source) return next()
        res.setHeader('Content-Type', TYPES[path.slice(path.lastIndexOf('.'))])
        res.end(readFileSync(source))
      })
    },
    generateBundle() {
      for (const [name, source] of Object.entries(files)) {
        this.emitFile({
          type: 'asset',
          fileName: `${OCR_BASE.slice(1)}/${name}`,
          source: readFileSync(source),
        })
      }
    },
  }
}
