import { describe, expect, it } from 'vitest'

import { pmgCertUrl } from './pmgCert'

const pmg = (more) => ({
  grading_service: 'PMG',
  cert_numbers: ['2452276014'],
  ...more,
})

describe('pmgCertUrl', () => {
  it("opens PMG's page for the certificate and grade on the holder", () => {
    expect(pmgCertUrl(pmg({ grade: 'N30' }))).toBe(
      'https://www.pmgnotes.com/certlookup/2452276-014/30/',
    )
  })

  it('takes the number as typed: a dash already in it, or spaces', () => {
    expect(pmgCertUrl(pmg({ grade: 'N64', cert_numbers: ['2452276-014'] }))).toBe(
      'https://www.pmgnotes.com/certlookup/2452276-014/64/',
    )
    expect(pmgCertUrl(pmg({ grade: 'N64', cert_numbers: [' 2452276 014 '] }))).toBe(
      'https://www.pmgnotes.com/certlookup/2452276-014/64/',
    )
  })

  it('leaves the grade off when the note records none', () => {
    expect(pmgCertUrl(pmg({ grade: null }))).toBe(
      'https://www.pmgnotes.com/certlookup/2452276-014/',
    )
  })

  it("is offered only for a PMG holder's certificate", () => {
    expect(pmgCertUrl(pmg({ grading_service: 'PCGS', grade: 'N58' }))).toBe(null)
    expect(pmgCertUrl(pmg({ cert_numbers: [] }))).toBe(null)
    expect(pmgCertUrl(pmg({ cert_numbers: ['PMG-123'] }))).toBe(null)
    expect(pmgCertUrl(undefined)).toBe(null)
  })
})
