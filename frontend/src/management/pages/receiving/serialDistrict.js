// Its own module, apart from FriedbergLookup.jsx: a component module that
// also exports a plain function defeats Fast Refresh. What a serial says
// about the note's Friedberg number: its district, and whether it is a star.

// One or two letters, then the digits: the Bank's letter is the one next to
// the digits -- the only letter, or the second where a series letter leads
// (BEP, bep.gov/currency/serial-numbers).
const PREFIX = /^([A-Z]{1,2})\d/
// A Federal Reserve Bank's letter, A (Boston) to L (San Francisco).
const BANK_LETTERS = 'ABCDEFGHIJKL'

/**
 * The district letter a Federal Reserve Note's serial names, or '' when it
 * names none.
 *
 * For a note that records no district, so the Friedberg lookup can still
 * search for that district's number and leave every other district's out.
 * Read from the prefix alone, however many digits follow: a serial typed a
 * digit short or long gets no district suggested when the note is entered
 * (`app/classifier_defaults.py` wants the whole serial well formed before it
 * writes one to the note), and its letter still says whose note it is.
 *
 * Only a Federal Reserve Note's: another class's first letter is a block,
 * not a Bank. A star in place of the prefix hides the Bank.
 */
export function serialDistrict(item) {
  if (item?.note_type !== 'frn') return ''
  const serial = (item.serial_number ?? '').replace(/\s/g, '').toUpperCase()
  const letter = PREFIX.exec(serial)?.[1].slice(-1) ?? ''
  return BANK_LETTERS.includes(letter) ? letter : ''
}

/**
 * Whether the note's serial carries a star: true, false, or null when the
 * note has no serial to read.
 *
 * A star note's Friedberg number is its own (`3007-B*` beside `3007-B`), so
 * the lookup offers only the kind the serial is. Any class: a star stands in
 * for a suffix letter or, on older notes, the prefix.
 */
export function serialStar(item) {
  const serial = (item?.serial_number ?? '').trim()
  if (!serial) return null
  return serial.includes('*')
}
