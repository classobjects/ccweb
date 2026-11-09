# ClassObjects pictures

The sources of the pictures in `frontend/public`. The build does not copy
this folder; it copies `public`.

| Source                  | Picture                                                                                           | Size          |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| `avatar.html`           | `public/brand/classobjects-avatar.png`, the square picture (GitHub profile, avatars)              | 1000 × 1000   |
| `banner.html`           | `public/brand/classobjects-social.png`, the banner (GitHub social preview)                        | 1280 × 640    |
| `shop-banner.html`      | `public/brand/classobjects-shop.png`, the banner for customers (storefronts, business listings)   | 1280 × 640    |
| `public/brand/bimi.svg` | `public/brand/classobjects-logo.png`, the logo alone, for profile pictures cropped to a circle    | 1000 × 1000   |
| `public/favicon.svg`    | itself, and `public/favicon-32.png` and `public/apple-touch-icon.png` (180 × 180, square corners) |               |
| `public/favicon.svg`    | `public/brand/logo.svg`, a copy: the logo left of the site's name in every header                 | 36 × 36 shown |
| `public/favicon.svg`    | `public/brand/bimi.svg`, the logo mail apps show beside the domain's mail (BIMI)                  | square        |

`bimi.svg` is the favicon in the SVG Tiny Portable/Secure profile BIMI
accepts: `version="1.2" baseProfile="tiny-ps"`, a `<title>`, square
corners (a mail app crops to its own circle or rounded square), gradient
positions as fractions, and `stroke-opacity` where the favicon has
`opacity`, which the profile lacks. The domain's DNS names it in a TXT
record at `default._bimi`:
`v=BIMI1; l=https://classobjects.com/brand/bimi.svg; a=;` -- `a=` stays
empty until a mark certificate (VMC or CMC) is bought, without which Gmail
and Apple Mail do not show it. BIMI needs DMARC at `p=quarantine` or
`p=reject`.

`logo.svg` has the same name on every installation, so a site shows its own
logo by replacing that file; nothing in the code names ClassObjects.

`banner.html` is `avatar.html`'s scene beside the name and tagline: the
same notes, coins and tilt. `shop-banner.html` is `banner.html` with words
for customers in place of the project's name and stack. A change to the
scene is made in all three.

`classobjects-logo.png` is `bimi.svg` shown at 1000 × 1000: its square
background fills the corners, and the note and coin stay inside the circle
a profile picture is cropped to.

The notes and coins are original designs, not any real issuer's, and each
note carries a SPECIMEN overprint.

## Making a picture

The scenes are drawn by the script in the page, so a picture is a
screenshot of the page in Chrome at exactly its size: open the file, open
DevTools (F12), turn on the device toolbar (Ctrl+Shift+M), set the size from
the table, and choose _Capture screenshot_ from the toolbar's menu. For the
PNG favicons, show `favicon.svg` the same way at 32 × 32 and, with its
background's `rx="14"` set to `0`, at 180 × 180.
