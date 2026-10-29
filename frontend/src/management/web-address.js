// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
//: Only a web address is ever made a link. An address is stored data, and an
//: `href` of any other scheme -- `javascript:` above all -- would run in the
//: console when clicked.
const WEB_ADDRESS = /^https?:\/\//i

/** Whether `text` is an `http(s)` address, safe to make a link of. */
export function isWebAddress(text) {
  return typeof text === 'string' && WEB_ADDRESS.test(text)
}
