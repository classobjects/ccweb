import { describe, expect, it } from 'vitest'

import { muleStatus } from './muleStatus'

const PLATES = { series: '1934A', backPlate: '912' }

describe('muleStatus', () => {
  it('says a mule by its plates, naming them', () => {
    expect(muleStatus({ says: 'mule', ...PLATES })).toEqual({
      text: 'Mule: yes, by its plates -- series 1934A with back plate 912.',
      warning: '',
    })
  })

  it('says not a mule by its plates', () => {
    expect(muleStatus({ says: 'not_mule', ...PLATES }).text).toBe(
      'Mule: no, by its plates -- series 1934A with back plate 912.',
    )
  })

  it("says a mule's number makes it one, whatever no rule says", () => {
    expect(muleStatus({ says: 'no_rule', number: '9907-Em', ...PLATES })).toEqual({
      text: "Mule: yes -- 9907-Em is a mule's number.",
      warning: '',
    })
  })

  it("warns when a mule's number meets plates that are no mule's", () => {
    const { text, warning } = muleStatus({
      says: 'not_mule',
      number: '9907-Em',
      ...PLATES,
    })
    expect(text).toBe("Mule: yes -- 9907-Em is a mule's number.")
    expect(warning).toBe(
      'But series 1934A with back plate 912 is not a mule. Check the number and the back plate.',
    )
  })

  it("warns when the plates make a mule and the number is not a mule's", () => {
    const { text, warning } = muleStatus({ says: 'mule', number: '9907-E', ...PLATES })
    expect(text).toBe('Mule: yes, by its plates -- series 1934A with back plate 912.')
    expect(warning).toBe(
      "But 9907-E is not a mule's number: a mule's ends in m. Check the number and the back plate.",
    )
  })

  it('says a note already marked a Mule is one', () => {
    expect(muleStatus({ says: 'no_rule', marked: true }).text).toBe(
      'Mule: yes -- this note is marked a Mule.',
    )
  })

  it('asks for the back plate where a rule would speak', () => {
    expect(muleStatus({ says: 'needs_back_plate', series: '1934A' }).text).toBe(
      'Mule: not known until the back plate number is entered.',
    )
  })

  it('leaves a back the number cannot decide to a person', () => {
    expect(
      muleStatus({ says: 'undecided', series: '1935A', backPlate: '470' }).text,
    ).toBe('Mule: back plate 470 cannot be told by its number -- look at the note.')
  })

  it('says the plates cannot tell for a series no rule covers', () => {
    expect(muleStatus({ says: 'no_rule' }).text).toBe(
      "Mule: its plates cannot tell for this series -- only a mule's Fr. number (ending in m) makes it one.",
    )
  })

  it('says nothing while the answer is not in', () => {
    expect(muleStatus({ says: undefined })).toEqual({ text: '', warning: '' })
  })
})
