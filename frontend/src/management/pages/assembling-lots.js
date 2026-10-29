// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * The `listLots` query for every lot still being assembled.
 *
 * 500 is far beyond any real afternoon's assembling, and the API's own
 * ceiling, so the answer is every open lot rather than a first page of them.
 */
export const ASSEMBLING_LOTS = { status: 'assembling', limit: 500 }
