# Scan a label

*2026-11-23. Reading a holder label's number with a camera to open its item.*

## Why

The owner handles holders -- at the safe, at a show, while re-holdering --
and wants the record for the one in hand without typing its number. Every
holder label already prints the item's number on its first line
(`labels.printed_number`: `002427` for CC-002427, `000412_02` for a piece
of a split item).

## Goals, non-goals, anti-goals

**Goals**

- The console's **Scan a label** page (Inventory menu, `/management/scan`)
  reads that number through a phone's or laptop's camera and opens the item.
- Where a found item opens is configuration: `LABEL_LOOKUP_URL`.
- The number can be typed when the camera can't be used.

**Non-goals**

- A barcode or QR code on the label. The label stays as it is, readable by
  people; a code that scanned reliably would not fit the 0.5" coin label.
- Scanning in the shop.

**Anti-goals**

- A picture of the collection leaving the device. The text is read in the
  browser; nothing is uploaded.
- Opening the wrong item from one misread frame.
- Loosening the content policy of any page.

## How it works

**Reading.** The page starts the camera only when **Start the camera** is
pressed (the browser asks permission then) and shows its picture with a
guide box: a wide strip across the middle (`GUIDE` in
`scan/cameraFrame.js`). The picture is shown whole, its shape kept, no
taller than 45% of the screen and no wider than the screen or 720px
(`scan.css`): a phone held upright sends a tall picture, which at full
width would put the box below the fold. Starting the camera scrolls the
picture into view. The camera is asked for continuous focus and, where it
offers one, a 2x zoom (`tuneCamera`), so a phone held beyond its closest
focusing distance still fills the box; a camera without either reads as
it is. Every frame, the strip is enlarged to at least
1,400 pixels wide, turned to strong grey, and read by Tesseract
(`scan/labelReader.js`), told to see only digits, the underscore and
spaces. `scan/readLabel.js` takes the number: the first line that opens
with six digits (and a split piece's `_NN`), else six digits standing
anywhere. A number is taken only when two frames in a row read it
(`SteadyReading`).

**Finding.** The number is looked up in both inventories
(`findItemAndView` in `item-search.js`), which also says which screen lists
it: `coins` or `currency`. A number no item has -- a test page's samples
are numbered from 900001 -- is said on the page, looked up once, and
reading goes on.

**Opening.** `GET /api/labels/lookup-url` gives `LABEL_LOOKUP_URL`, with
`{item_code}` (required; the item's code, CC-002427) and `{view}` filled
in. An address under `/management` opens in the console; any other, another
site's included, opens as a page of its own. The default is the item on its
inventory screen, `/management/inventory/{view}?item_code={item_code}`,
which the inventory screens already open as one item.

**The reader's files.** Tesseract.js 5.1.1, its worker, the LSTM engine
compiled to WebAssembly (SIMD and plain) and the English model,
about 7 MB, are served by the site itself under `/assets/ocr-5.1.1/`
(`frontend/ocr-assets.js` copies them into the build from `node_modules`).
Under `/assets/` the server lets a browser keep them a year; the version in
the folder name makes an upgrade a new address. Once a signed-in console
has loaded, and only where a camera is offered, they are fetched while the
browser is idle, so the first scan opens at once.

**Content policy.** Compiling WebAssembly needs `'wasm-unsafe-eval'`. A
worker obeys the policy sent with its own script, not the page's, so the
worker is started from its file (never a `blob:` copy) and only
`/assets/ocr-*` is sent a policy allowing it (`deploy/Caddyfile`, a
deferred header). Every page keeps the policy without it;
`test_only_the_label_reader_may_compile_webassembly` holds that.

**Where a camera works.** Browsers offer a camera only to a secure page:
the site's https address, or the computer it is served from. Elsewhere the
page says so and offers only the typed number.

## Approaches considered

1. **Text recognition in the browser (chosen).** Nothing leaves the
   device; works on laptops, Android and iPhone; nothing new on the server.
   Costs a one-time ~7 MB download and the reader files' own policy.
2. **Text recognition on the server.** A light phone, but every frame is an
   upload, and every installation needs Tesseract or a ~50 MB package.
3. **A QR code on new labels.** Most reliable to scan, but it does not fit
   the coin label and labels already applied would not scan.

The browser's built-in text detector is missing from Safari and desktop
Chrome; a cloud service would send pictures of the collection away.

## Measured

A throwaway test page with the same reader and settings read two real
labels from a laptop camera: CC-000011 and CC-000184 (the label small in a
corner of the picture), 0.1 to 0.2 s a frame, the reader loading in under
0.3 s once cached. Under the production content policies the built reader
read 000184 from that label's picture with no policy violation.
