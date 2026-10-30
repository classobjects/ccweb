// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { api } from '../../api'
import { NUMBERS, identifyKeys, isYearRange } from '../../identify'
import { fitsKind, isCurrencyKind } from '../../../shared/kinds'
import { ReferenceSelect } from '../../../shared/reference'
import { useReference } from '../../../shared/reference-context'
import { useDebounced } from '../../../shared/useDebounced'
import { useRequest } from '../../../shared/useRequest'
import SerialPair from '../inventory/SerialPair'

//: How long typing must pause before the facts are looked up again.
const SUGGEST_DELAY_MS = 250

const LABELS = {
  series_year: 'Series year',
  series_letter: 'Series letter',
  denomination: 'Denomination',
  serial_number: 'Serial number',
  face_plate_number: 'Face plate',
  back_plate_number: 'Back plate',
  year_start: 'Year',
  mint: 'Mint',
}

//: What the look-up can say the facts decide, each read from the vocabulary
//: of the same name, for a note and for anything else.
const NOTE_DECIDED = [
  'series',
  'note_type',
  'seal_color',
  'signature_combination',
  'fed_district',
]
const COIN_DECIDED = ['series', 'metal']

/**
 * What the facts typed here decide, as the entry form is told it: a note's
 * class, seal, signatures and Bank, a coin's metal, and either's design
 * series. Only the facts are sent, so a value a person set on the item is
 * not shown here and still stands when saved.
 *
 * Asked once typing pauses, and nothing is shown while the answer on hand
 * is for other facts than those typed. A convenience: a failed look-up
 * shows nothing rather than an error.
 */
function Decided({ item, values }) {
  const currency = isCurrencyKind(item.item_kind)
  const facts = currency
    ? {
        denomination: values.denomination,
        series_year: values.series_year,
        series_letter: values.series_letter,
        serial_number: values.serial_number,
      }
    : {
        denomination: values.denomination,
        country: item.country ?? '',
        year: values.year_start,
      }
  const factsKey = JSON.stringify([currency, facts])
  // One hook per vocabulary, always in the same order.
  const vocabularies = {
    series: useReference('series', { includeRetired: true }),
    note_type: useReference('note_type', { includeRetired: true }),
    seal_color: useReference('seal_color', { includeRetired: true }),
    signature_combination: useReference('signature_combination', {
      includeRetired: true,
    }),
    fed_district: useReference('fed_district', { includeRetired: true }),
    metal: useReference('metal', { includeRetired: true }),
  }

  const settled = useDebounced(factsKey, SUGGEST_DELAY_MS)
  const [isNote, params] = JSON.parse(settled)
  const found = useRequest(params.denomination ? settled : null, () =>
    (isNote ? api.suggestNote : api.suggestCoin)(params),
  )

  if (settled !== factsKey || found.busy || found.error) return null
  const { warning, ...codes } = found.data ?? {}
  const label = (table, code) =>
    vocabularies[table]?.find((entry) => entry.code === code)?.label ?? code
  const decided = (currency ? NOTE_DECIDED : COIN_DECIDED)
    .filter((key) => codes[key])
    .map((key) => label(key, codes[key]))
  if (decided.length === 0 && !warning) return null
  return (
    <div className="identify-decided">
      {decided.length > 0 && (
        <output className="muted">From these facts: {decided.join(' · ')}</output>
      )}
      {warning && <output className="notice">{warning}</output>}
    </div>
  )
}

/**
 * The facts that identify the piece in hand, first in the receipt dialog:
 * a note's series, face value, serial and plates, or a coin's year, mint and
 * face value (`docs/specs/identify-first-entry-design.md`).
 *
 * Controlled: `values` are the section's text and `onChange` receives the
 * next set. Saving belongs to the receipt, which sends `identifyChanges`.
 */
export default function IdentifySection({ item, values, onChange, disabled }) {
  const kind = item.item_kind
  const kinds = useReference('item_kind', { includeRetired: true })
  const kindLabel = kinds?.find((entry) => entry.code === kind)?.label ?? kind
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  function control(key) {
    if (key === 'denomination') {
      return (
        <ReferenceSelect
          table="denomination"
          value={values.denomination}
          onChange={set('denomination')}
          filter={(entry) => fitsKind(entry, kind)}
          allowAdd={false}
          disabled={disabled}
        />
      )
    }
    if (key === 'mint') {
      return (
        <ReferenceSelect
          table="mint"
          value={values.mint}
          onChange={set('mint')}
          disabled={disabled}
        />
      )
    }
    // A coin's years as a range, which one Year box cannot show.
    const ranged = key === 'year_start' && isYearRange(item.year_start, item.year_end)
    return (
      <input
        type={NUMBERS.has(key) ? 'number' : 'text'}
        inputMode={key === 'back_plate_number' ? 'numeric' : undefined}
        maxLength={key === 'series_letter' ? 4 : undefined}
        value={values[key]}
        onChange={set(key)}
        // One box cannot hold a range of years; the full editor can.
        disabled={disabled || ranged}
        title={
          ranged
            ? 'A range of years: change it in Confirm or correct fields'
            : undefined
        }
      />
    )
  }

  return (
    <fieldset className="identify">
      <legend>Identify</legend>
      <p className="muted">{kindLabel}</p>
      <div className="filter-grid">
        {identifyKeys(kind).map((key) => (
          <label key={key} data-help={key}>
            {LABELS[key]}
            {control(key)}
          </label>
        ))}
      </div>
      <Decided item={item} values={values} />
      {isCurrencyKind(kind) && (
        <SerialPair itemId={item.id} serial={values.serial_number} />
      )}
    </fieldset>
  )
}
