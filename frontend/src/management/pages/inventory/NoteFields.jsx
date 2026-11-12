// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { Fragment } from 'react'

import { PRINTING_FACILITIES } from '../../../shared/kinds'
import { ReferenceSelect } from '../../../shared/reference'
import { AccessLabel } from '../../AccessLabel'
import { FIELD_HELP } from '../../fieldHelp'
import { faceFromDenomination, fancyCheckerUrl, starLookupUrl } from '../../mcc-links'
import { accel } from '../../shortcuts'

//: A note's own classifiers. Letters are scarce by here: only Reserve
//: Bank's label holds one that is still free.
const NOTE_CLASSIFIERS = [
  ['Note type', 'note_type', 'note_type', null],
  ['Seal color', 'seal_color', 'seal_color', null],
  ['Signatures', 'signature_combination', 'signature_combination', null],
  ['Reserve Bank', 'fed_district', 'fed_district', 'b'],
]

const NOTE_TEXT_FIELDS = [
  ['Series year', 'series_year', 'number'],
  ['Series letter', 'series_letter', 'text'],
  ['Serial number', 'serial_number', 'text'],
  // `E82`, `153`, or `FW E82` for a Fort Worth note; the server stores it
  // one way and reads the printing location from it (app.plates).
  ['Face plate', 'face_plate_number', 'text'],
  ['Back plate', 'back_plate_number', 'text'],
]

//: What the owner reads off mycurrencycollection.com and types in: the
//: Coolness Index (0 to 100, one decimal place) and a star run's size.
const NOTE_RECORDED_FIELDS = [
  ['Coolness index', 'coolness_index', { min: 0, max: 100, step: 0.1 }],
  ['Star run size', 'star_run_size', { min: 1, step: 1 }],
]

/**
 * The two mycurrencycollection.com lookups, as links styled as buttons that
 * open a new tab: Check serial for a serial with eight digits, Star note
 * lookup for one with a star. Neither is shown when it has nothing to look up.
 */
function LookupLinks({ serial, denomination, seriesYear }) {
  const fancy = fancyCheckerUrl(serial)
  const star = starLookupUrl({
    face: faceFromDenomination(denomination),
    seriesYear,
    serial,
  })
  if (!fancy && !star) return null
  return (
    <span className="lookup-links">
      {fancy && (
        <a
          className="button-link"
          href={fancy}
          target="_blank"
          rel="noopener noreferrer"
          data-help="check_serial_link"
          title={FIELD_HELP.check_serial_link.text}
        >
          Check serial
        </a>
      )}
      {star && (
        <a
          className="button-link"
          href={star}
          target="_blank"
          rel="noopener noreferrer"
          data-help="star_lookup_link"
          title={FIELD_HELP.star_lookup_link.text}
        >
          Star note lookup
        </a>
      )}
    </span>
  )
}

/**
 * The item editor's rows for a banknote's own fields: what identifies it
 * first -- series, serial, plates, where it was printed -- then what follows
 * from those facts: its note type, seal, signatures and Reserve Bank.
 *
 * `value(key)` is a field's value as the form shows it; `set(key)` is a text
 * box's change handler, `setNumber(key)` a number box's, and
 * `setField(key, value)` sets one outright. `side(key, column)` is the
 * editor's third grid cell: what the lot claimed, and whether the facts
 * filled the value in.
 */
export default function NoteFields({ value, set, setNumber, setField, side }) {
  return (
    <>
      {NOTE_TEXT_FIELDS.map(([label, key, type]) => (
        <Fragment key={key}>
          <label className="field" data-help={key}>
            <span>{label}</span>
            <input
              type={type}
              value={value(key)}
              onChange={type === 'number' ? setNumber(key) : set(key)}
            />
            {side(key, key)}
            <span />
          </label>
          {/* Outside the label: a link inside it would join the box's name. */}
          {key === 'serial_number' && (
            <LookupLinks
              serial={value('serial_number')}
              denomination={value('denomination')}
              seriesYear={value('series_year')}
            />
          )}
        </Fragment>
      ))}
      {/* Read from the face plate when there is one -- FW before it is
          Fort Worth -- so set here only for a note with none. */}
      <label className="field" data-help="printing_facility">
        <span>Printed at</span>
        <select
          value={value('printing_facility') || ''}
          onChange={(e) => setField('printing_facility', e.target.value || null)}
        >
          <option value="">--</option>
          {PRINTING_FACILITIES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        {side('printing_facility', 'printing_facility')}
        <span />
      </label>
      {/* Typed from mycurrencycollection.com's lookups; never filled in. */}
      {NOTE_RECORDED_FIELDS.map(([label, key, props]) => (
        <label key={key} className="field" data-help={key}>
          <span>{label}</span>
          <input
            type="number"
            {...props}
            value={value(key)}
            onChange={setNumber(key)}
          />
          {side(key, key)}
          <span />
        </label>
      ))}
      {NOTE_CLASSIFIERS.map(([label, key, table, letter]) => (
        <label key={key} className="field" data-help={key}>
          <AccessLabel text={label} accessKey={letter} />
          <ReferenceSelect
            table={table}
            value={value(key)}
            onChange={set(key)}
            allowAdd={false}
            {...accel(letter)}
          />
          {side(key, `${key}_id`)}
          <span />
        </label>
      ))}
    </>
  )
}
