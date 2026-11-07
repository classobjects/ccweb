// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0

/**
 * Where an installation keeps its logo: `frontend/public/brand/logo.svg`,
 * served at the site's root. The name is the same for every site, so a shop
 * shows its own logo by replacing that one file; nothing in the code names it.
 */
export const LOGO_URL = '/brand/logo.svg'

/**
 * The site's logo, shown to the left of its name in every header.
 *
 * Decorative: the name is written beside it, so it has no alt text of its own
 * to read out twice. A site with no logo file shows no broken picture -- the
 * image hides itself and the name stands alone.
 */
export default function SiteLogo() {
  return (
    <img
      className="brand-logo"
      src={LOGO_URL}
      alt=""
      width="36"
      height="36"
      onError={(e) => {
        e.currentTarget.hidden = true
      }}
    />
  )
}
