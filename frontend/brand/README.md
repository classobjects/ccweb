# ClassObjects pictures

The sources of the pictures in `frontend/public`. The build does not copy
this folder; it copies `public`.

| Source               | Picture                                                                                           | Size        |
| -------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| `avatar.html`        | `public/brand/classobjects-avatar.png`, the square picture (GitHub profile, avatars)              | 1000 × 1000 |
| `banner.html`        | `public/brand/classobjects-social.png`, the banner (GitHub social preview)                        | 1280 × 640  |
| `public/favicon.svg` | itself, and `public/favicon-32.png` and `public/apple-touch-icon.png` (180 × 180, square corners) |             |

`banner.html` is `avatar.html`'s scene beside the name and tagline: the
same notes, coins and tilt. A change to the scene is made in both.

The notes and coins are original designs, not any real issuer's, and each
note carries a SPECIMEN overprint.

## Making a picture

The scenes are drawn by the script in the page, so a picture is a
screenshot of the page in Chrome at exactly its size: open the file, open
DevTools (F12), turn on the device toolbar (Ctrl+Shift+M), set the size from
the table, and choose _Capture screenshot_ from the toolbar's menu. For the
PNG favicons, show `favicon.svg` the same way at 32 × 32 and, with its
background's `rx="14"` set to `0`, at 180 × 180.
