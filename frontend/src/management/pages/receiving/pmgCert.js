// Its own module, apart from FriedbergLookup.jsx: a component module that
// also exports a plain function defeats Fast Refresh.

//: PMG's page for one certificate, which the owner reads in the browser.
//: Nothing is fetched from it here (`docs/reference-data.md`).
const CERT_LOOKUP = 'https://www.pmgnotes.com/certlookup/'

//: A PMG certificate: seven digits and three, written with or without the
//: dash PMG's page puts between them (2452276-014).
const CERT = /^(\d{7})-?(\d{3})$/

/**
 * The address of PMG's verification page for the note's certificate, or
 * null when the note is not in a PMG holder with a certificate number.
 *
 * The page wants the grade as well: a note grade's number (`N30` -> 30).
 * Without one, PMG's page for the certificate alone.
 */
export function pmgCertUrl(item) {
  if (item?.grading_service !== 'PMG') return null
  const cert = (item.cert_numbers ?? [])
    .map((number) => CERT.exec(number.replace(/\s/g, '')))
    .find(Boolean)
  if (!cert) return null
  const grade = /\d+/.exec(item.grade ?? '')?.[0]
  return `${CERT_LOOKUP}${cert[1]}-${cert[2]}/${grade ? `${grade}/` : ''}`
}
