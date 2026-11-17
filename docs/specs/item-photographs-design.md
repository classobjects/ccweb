# Photographs on an item: importing them, and putting them right

*2026-09-29.* A photograph is how a buyer sees a coin or note, and how the
owner confirms which physical piece a record describes. This feature gets
photographs onto items and keeps them filed correctly.

- **In the management console** the owner:
  - adds, labels, promotes to primary, moves and removes an item's
    photographs in the item editor's **Photographs** panel
    (`/management/inventory/coins` or `/currency`, `PhotosPanel`);
  - attaches photographs while receiving an item (`/management/receiving`,
    `ReceiptPanel`);
  - files photographs that belong to no item yet on **Photos**
    (`/management/photos`).
- **From the command line**, `python -m app.photo_import` files a whole
  library of photographs named by the `CC-######_NN` convention.

The shop serves an item's **primary** photograph and nothing else
(`routers/catalog.py`, with no fallback to "the first one"). So every rule
here is ultimately about what a buyer sees, and every change to an item's
photographs is guarded by the for-sale rule.

## Model

**`image`** is a stored photograph.

- **Content-addressed.** `image.sha256` is unique: the hash of the cleansed
  bytes. The same photograph stored twice is one row; `ingest` returns the
  existing image, keeping its name.
- **Derivatives** (`thumb`, `web`) are in `image_derivative`. They are served
  at `/api/images/{sha256}/{kind}`. The route is public, so a plain `<img>`
  works in the shop. It is addressed by hash rather than id, so the unlisted
  collection cannot be enumerated.
- **Originals are never served publicly.** Public requests are answered from
  derivatives.
- **Deleting.** The files are named by the hash too. So a delete holds the
  hash's advisory lock (`hold_content`) from before it deletes the row. Once
  its commit is done, it removes the files only when no row names that hash
  (`image_store.remove_unheld`, under the same lock). An upload of the same
  picture in the meantime waits for the delete and stores it again.
- **Metadata stripped.** `imaging.cleanse` strips all metadata at ingest, and
  re-reads the written bytes to prove it is gone. Photographs of valuables
  carry the GPS position of where they are kept. `captured_at` is the one
  field kept, because capture order helps match photographs to items.

**`item_image`** links a photograph to an item.

- Each link has an `image_role` (obverse, reverse, edge, detail, slab,
  certificate, group, packaging, unassigned), `is_primary` and `sort_order`.
- **A photograph can exist with no item.** It exists before anyone has
  decided what it shows, and is storable and browsable in that state: an
  `image` row with no `item_image` row at all. The `inventory_item_id` column
  is nullable, but `image_links` never writes a link without an item.
- `uq_item_image_primary` (partial unique) allows at most one primary per
  item. `uq_item_image_pair` allows one link per image and item.
- **Default placement.** A photograph filed with no `sort_order` -- every
  console upload, and an attach that names none -- goes after the item's
  last one. So a reverse lists after its obverse.

**Formats.** Every file is re-encoded as it is stored: as JPEG, or as PNG
where the picture has transparency or a palette (as a GIF does). So a WebP
can be filed as a JPEG is.

- Only the formats photographs arrive in are decoded: JPEG (a phone's
  multi-picture JPEG among them), PNG, WebP, GIF, TIFF and BMP.
- Anything else is refused as not a readable image.

**Names.** `image.source_ref` is the name the photograph goes by:

- for an upload, the file's name as uploaded, with the stored format's
  extension when it was converted (`CC-000412_02.webp` is kept as
  `CC-000412_02.jpg`; `DSC00417.JPG` stays as it is);
- for a fetch from a web address, a name made for its place;
- renamed when it is filed in another place (below).

**`image_store.ingest`** stores a photograph -- the original and both
derivatives. The upload endpoint and the import pass share it.

## `image_links.py` -- the only writer of `item_image`

This is the same single-writer rule `offering_writes` keeps for listings. It
keeps the console and the import pass from drifting about what a link means.

- **The primary swap.** Promoting a photograph demotes the incumbent first,
  in the same transaction. The partial unique index would reject a second
  primary outright.
- **Filling the vacancy.** `attach` makes a new link primary when the item
  has none, even if the caller did not ask. The shop has no fallback to "the
  first photograph", so an item with photographs and no primary shows a buyer
  nothing. Filling a vacancy never demotes anyone. An incumbent is displaced
  only when the caller asks for `is_primary`.
- **Keeping it filled.** `fill_primary_vacancy` promotes the next photograph
  (lowest `sort_order`, then id) when `detach` removes the primary, and when
  `DELETE /api/images/{id}` cascades links away.
- **No duplicate link.** `attach` refuses (`LinkRefused`) a photograph
  already linked to that item.

## The filename convention

```
<item_code>_<nn>.<ext>          CC-000412_01.jpg
```

Parsed by `photo_names.parse`, a pure function.

- **`item_code`** matches `CC-` and six digits, or more digits with no
  leading zero past `CC-999999`. The match is exact and case-sensitive: the
  shape the database generates.
  - A lowercase `cc-` is a miss, not a correction. A parser that repairs
    input teaches the operator that the convention does not matter.
  - It is the code rather than the numeric id because the code is what
    appears in the console and on holders, and a mistyped id silently names a
    different coin.
- **`_<nn>`** is at least two digits, 1 or more. `_1` is a miss.
- **The sequence carries the role:** `_01` is obverse and primary, `_02`
  reverse, `_03` and beyond `unassigned`.
- **The extension** is whatever `imaging.cleanse` accepts. The pass keeps no
  second list of formats.

## The import pass

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.photo_import
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.photo_import
```

Add `--root FOLDER` to read another library, and `--commit` to write.

- **`--root`** defaults to `settings.photo_library_root`: `photos/` at the
  repository root, environment-configurable, git-ignored.
- **Dry run by default.** It writes no rows *and no bytes to media storage*.
  It runs `imaging.cleanse` to validate and hash each file, but not `ingest`,
  which would store files no rollback can remove. `--commit` writes.
- **The report** prints each exception by name, and the counts.

**Nothing is dropped.** In a committing run every file `imaging` accepts is
stored; only the *link* is withheld.

| Case | Stored | Linked | Reported as |
|---|---|---|---|
| `imaging` refuses the file | no | no | `REJECTED`, with the reason |
| Name does not match the convention | yes, unattached | no | `unmatched` |
| No item has the code | yes, unattached | no | `unmatched` |
| The item is deleted or split | yes, unattached | no | `unmatched`, saying which |
| Two files claim the same code and sequence | both | **neither** | `collision`, both names |
| The item already has a link at that `sort_order` | yes, unattached | no | `occupied`, naming the holder |
| A `_01` for an item that already has a primary | yes | yes, not primary | `primary`, naming what kept it |
| This photograph is already linked to the item | already stored | already linked | counted as `already` |

- **A collision links neither file.** With two candidates and nothing to
  choose between them, linking one is a coin flip presented as a fact.
- **An occupied slot is never replaced silently, and an existing primary is
  never taken away.** A re-shoot, or a change to what a buyer sees, is a
  decision, and the console is where decisions are made.
  - A console upload files after the item's last photograph. So an item's
    first upload takes slot 1, and a `_01` for that item is reported as
    `occupied` and not linked.
  - A primary that sits at any other slot is not seen by the slot check, so
    the primary check is separate from it.
- **Idempotent.** A second run re-finds images by hash and existing links,
  and changes nothing.
- **Shooting order.** `sort_order` is the sequence number, so the console
  lists photographs in shooting order.
- **For-sale items are reported, not refused.** A CLI pass has nobody to
  acknowledge a warning, and a batch job that auto-acknowledges is worse than
  no guard. The report lists the linked items that are for sale.

## The console

**`PhotosPanel`** sits in the item editor beside `OffersPanel` and
`ErrorsPanel`. It shows thumbnails in `sort_order`, with role and primary
shown.

- **Actions:** add, change role, make primary, **Move** to another item, and
  **Remove**. Remove detaches; it never deletes the photograph.
- **Nothing in it writes until the editor's Save.** The one exception is a
  new kind of photograph: the role picker's **+ Add a new value...** creates
  it at once by its name (code derived, as for attributes). Choosing it for
  the photograph is still held.
- **Adding.** A new photograph is added from a file, dropped onto the picker,
  pasted from the clipboard with **Ctrl+V** while the picker has focus, or
  from a **web address**. It is listed as not saved yet, with Discard.
  - A dropped file that is not an image refuses the whole drop, with a
    message naming it.
  - A paste takes only the clipboard's image files. A paste carrying none is
    left alone, so text still pastes wherever it was aimed.
- **What a new photograph shows.** Each new photograph has its own role
  picker, beside it in the held list. There is never one beside the add
  controls, which would read as the label of the photograph listed above it.
  - It starts as Obverse, then Reverse, whichever the item lacks once held
    changes are counted.
  - Once the item has both, it starts empty and the panel asks.
  - Save waits until every held photograph says what it shows.
- **Changes to a filed photograph** -- a new role, a new primary, a removal
  or a move -- show in place, marked not saved yet, with Undo. Choosing the
  saved value again drops the change.
- **Moving.** A move names the other item by its code (the Photos page's
  `ItemPicker`). It refuses the item the photograph is already on.
- **Save.** Save applies the photograph changes after the fields, the
  Friedberg number and the errors, under the editor's one for-sale
  acknowledgement. The order is:
  1. roles and the new primary;
  2. moves;
  3. removals (so the server never fills a vacated primary over the one
     chosen);
  4. new photographs.

  Whatever fails stays held, with its reason. The panel reads from the
  server again after Save.

**`/management/photos`** lists unattached photographs, most recent capture
first (nulls last). Each has an item picker that searches by item code across
coins and currency. The import pass's leftovers are filed here, and a
photograph detached from the wrong item waits here.

**Moving a photograph** (`image_links.move`):

- keeps its role;
- files it after the target's photographs;
- makes it the target's primary only when the target had none;
- gives the item it left its next photograph as primary.

Both items are checked by the for-sale guard, under one acknowledgement.

**Named for its place.** A photograph moved, or filed from
`/management/photos`, is renamed for its new place (`CC-000414_02.jpg`)
when both of these hold (`image_links.name_for_place`):

- its name was another item's place: a real item's code and a position,
  whatever folder of the library it was imported from;
- it is filed on no other item.

A camera's `DSC00417.JPG` keeps its name, and so does a group photograph
shared by several items.

**Receiving.** `ReceiptPanel` uploads photographs for the one item being
received.

- They are chosen from a file, dropped onto the picker, or pasted with
  Ctrl+V.
- The first is primary. None is given a role.
- They are sent after the receipt is recorded, under the receipt's own
  for-sale acknowledgement.
- A failed upload never rolls back the receipt. The panel stays open, naming
  each file that failed.

All of these go through `ForSaleNotice` / the for-sale refusal: every link
change is guarded by `sale_state.guard` (`for-sale-guards-design.md`).

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/images` | upload (multipart); optionally attach with `inventory_item_id`, `image_role`, `is_primary`. Re-uploading a photograph the item already has updates its role (when one is sent) and primacy rather than refusing |
| `POST /api/images/from-url` | fetch from a web address and file on an item (below) |
| `GET /api/images` | links for `inventory_item_id`, or `unattached=true`; **exactly one** is required, otherwise 422 |
| `GET /api/images/{sha256}/{kind}` | serve a derivative |
| `POST /api/images/{image_id}/links` | attach to an item, with role and primary |
| `PATCH /api/image-links/{link_id}` | change role (an explicit null clears it, an omitted field is left alone), or make primary |
| `POST /api/image-links/{link_id}/move` | file on another item (`inventory_item_id`), placed, promoted and renamed there |
| `DELETE /api/image-links/{link_id}` | **detach**; the photograph survives |
| `DELETE /api/images/{image_id}` | destroy the photograph, its derivatives and its stored bytes |

**Refusals.**

- A deleted or split item is refused (422) as the item of an upload, a fetch,
  an attach or a move, as the import pass declines it.
- A request is refused with 409 when what it read changed before it held the
  item: a photograph moved or unfiled meanwhile, or destroyed before it was
  filed.

**Why the API is shaped this way.**

- `GET /api/images` requires a filter. An unfiltered list of every
  photograph is a page nobody wants, and a query that grows without bound.
- The link routes live under **`/api/image-links`** rather than
  `/api/images/links/...`. Otherwise `/api/images/{sha256}/{kind}` would be
  separated from them only by route declaration order.
- Detach and delete are separate endpoints, so that correcting a filing error
  can never destroy a photograph.

### From a web address

`POST /api/images/from-url` takes `url`, `inventory_item_id`, `image_role`,
`is_primary` and `acknowledge_for_sale`. The server:

1. fetches the address (`app/image_fetch.py`);
2. stores it as any upload is stored (converted, stripped);
3. names it for its place on the item -- `CC-000412_02.jpg`;
4. files it there, after the item's other photographs.

**Fetch guards.**

- Only `http(s)` is fetched.
- Only from a host whose every address is public: not loopback, private,
  link-local, multicast or reserved.
- Each redirect is checked the same way, and there are at most three.
- The body is no larger than the upload limit.
- Each connection and each read is given 15 seconds, and the whole fetch 60.
- **No DNS rebinding.** The host is resolved once, and the request is sent to
  the address checked. The name is carried in the `Host` header and as the
  TLS server name, so the certificate is still verified against it. So a host
  cannot answer public to the check and private to the connection.

**Answers.**

- A refused fetch, or bytes `imaging` will not take, is a 422 naming why,
  and stores nothing. So is an address whose full-size form is too long to
  keep.
- 422 for an unknown, deleted or split item.
- 409 when the item already has that photograph.
- The for-sale acknowledgement works as for an upload.
- Bytes already stored (the same hash) are filed under the existing image,
  which keeps its own name.

**The full-size picture is the one fetched.** A marketplace serves one
photograph at many sizes, and the size is part of the address. eBay's
`.../s-l140.webp` is the picture at `.../s-l1600.webp`, forty times smaller,
and the address a person copies is whichever the page showed.

- `image_urls.full_size` rewrites an address to the largest form its host
  serves:
  - eBay's `s-l<edge>` becomes `s-l1600` (asking for more returns the same
    file);
  - an NGC certificate picture loses its `TN_` prefix or `@<w>X<h>` suffix;
  - any other address is left alone.
- `image_fetch.fetch_full_size` fetches that form, and falls back to the
  address as given when the full-size form is refused.
- The address kept is the one the bytes came from.

**Enlarging stored photographs.**
`python -m app.image_enlarge [--commit] [--limit N] [--pause S] [--list]`
does the same for photographs already stored. `--pause` waits that many
seconds between fetches, 0.05 unless given.

- **Which are looked at.** A photograph whose address has a larger form, and
  whose held picture is no bigger than that address names. (An eBay picture
  held larger than its `s-l500` address was fetched at full size already.)
- **Replacement in place.** The full-size picture is fetched. When it really
  is larger, it is put behind the same image row
  (`image_store.replace_content`).
  - The row keeps its id, so every item keeps the photograph in its place,
    role and primary.
  - Its bytes, hash, dimensions, renditions and address change.
  - The files it no longer uses are deleted once the change is committed.
- **Left as they are, and counted:** a picture no larger than the one held;
  one the collection already stores as another image; one that could not be
  fetched; one on an item that is for sale.
- **Dry run and commit.** A dry run fetches nothing. A commit writes every
  25, so a run cut short keeps what it had done.

**The address is kept.** `image.source_url` holds the web address a
photograph was fetched from. An uploaded file has none.

- An image already stored learns its address the first time it is fetched
  from one, and keeps it. A second address serving the same bytes does not
  replace it.
- The item editor and the Photos page show it in the enlarged picture's
  window, as "Where it came from".

**Recovering addresses.** `python -m app.image_sources MANIFEST.csv FOLDER
[--commit]` recovers the address of photographs stored before addresses were
kept. It reads what a download left behind: a manifest with a `url` column,
and a folder holding each address's file under the SHA-1 of the address.

- Each file is cleansed as an upload is, and matched to the stored image with
  the same content. It is never matched by item or file name, so a
  photograph moved or replaced since cannot take an address that is not its
  own.
- Only an image with no address is written.
- A dry run unless `--commit`.

## Tests

- `tests/test_photo_names.py`: the parser as a table -- valid names,
  lowercase `cc-`, five and seven digits, missing and single-digit
  sequences, and the role mapping.
- `tests/test_photo_import.py`, against libraries under `tmp_path` (never the
  real one):
  - a dry run writes no rows and no bytes, asserted separately;
  - `--commit` links what it reported;
  - a second run changes nothing;
  - every row of the table above.
- `tests/test_image_links.py`: the primary swap, and vacancy filling on
  attach, detach and delete. The demotion is load-bearing: remove it and
  `uq_item_image_primary` rejects the write.
- Other backend tests:
  - `tests/test_image_move.py`: moving and `name_for_place`;
  - `tests/test_image_order_and_names.py`: placement after the last
    photograph, names kept as stored;
  - `tests/test_image_from_url.py`: the fetch guards, with a stubbed resolver
    and client;
  - `tests/test_image_urls.py`: the full-size form of an address;
  - `tests/test_image_enlarge.py`: the replacement in place, what is left
    alone, and the full-size fetch on adding by address;
  - `tests/test_image_sources.py`: the address recovery pass;
  - `tests/test_images.py`: metadata stripping against a GPS-tagged fixture,
    hashing, derivatives, the upload, list and serving routes.
- Each guard call site fails a named test when deleted:
  - the upload and the deletion in `tests/test_for_sale_guards.py`;
  - the fetch from a web address in `tests/test_image_from_url.py`;
  - the attach, re-role and detach in `tests/test_image_links.py`;
  - both ends of a move in `tests/test_image_move.py`.
- Frontend: `PhotosPanel.test.jsx`, `Photos.test.jsx` and
  `ReceiptPanel.test.jsx`.
