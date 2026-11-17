# Warning before a change to an item that is for sale

Every write that can change an item that is for sale is refused until the
person making it acknowledges that the item is for sale.

The reason: a buyer may be looking at the item in the shop or on another
platform, or may have already agreed to buy it. It must not change
underneath them without someone saying they know. Its description, grade,
errors and photographs are what the buyer is being shown, and a coin marked
missing cannot be delivered.

Managers meet the warning in the management console wherever an item is
edited:

- the item editor;
- the inventory pages' bulk edit bar;
- splitting;
- the errors panel;
- receiving;
- the Photos page;
- the Vocabularies merge.

Each shows the listings and orders involved and asks for a tick or a
confirmation. On the server, every such endpoint asks `sale_state.guard`
first. It answers **409** until the request carries `acknowledge_for_sale`.

## What "for sale" means

The definition is in `backend/app/sale_state.py`. An item is for sale while
either of these holds:

- **A listing offers it**: `active` or `paused`, with stock.
  - A paused store listing counts. The item is out of the shop only because
    it is offered somewhere else.
  - The listing half reads **claims and listings both**
    (`sale_state._offering`). A claim is the only way a lot listing reaches
    its members, and a listing written directly against an item may have no
    claim.
- **An order that has not shipped holds it**: `pending`, `paid` or `packed`
  (`OPEN_ORDER_STATUSES`).
  - `delivered` is excluded, an auction-house sale included. Once an order
    ships, its lines keep a snapshot of the item as sold, and editing the
    live record is ordinary again.
  - An order reaches its items through `sales_order_item_share`, which names
    every item on every line, a lot's members included.

`for_sale(db, item_ids)` returns the reasons per item as `SaleUse` records
(`kind` is `"listing"` or `"order"`). `refusal()` formats the message, which
starts "For sale".

## The guard

```python
def guard(db, items, *, acknowledged: bool, kinds: Collection[str] | None = None) -> None
```

The guard:

1. calls `for_sale()`;
2. narrows the result to `kinds`, when given;
3. raises `HTTPException(409, detail=refusal(...))` when anything is left
   and `acknowledged` is false.

It is the one place that decides what the refusal says. It takes loaded
items because the refusal names items by `item_code`. Callers that start
from an image or a vocabulary value select the items first.

**`kinds` exists for split.** `splitting.split_item` refuses outright a
parent that appears in an order, and that refusal is not negotiable. So the
split endpoint guards with `kinds={"listing"}`. Without the filter the
operator would tick a box and then be refused anyway.

## Guarded endpoints

| Endpoint | When it guards | Acknowledgement travels as |
|---|---|---|
| `PATCH /api/inventory/{id}` | any field, attribute or certificate-number change, except where the item is kept (`storage_location_id`: a move does not show to a buyer); a new status or disposition, acknowledged, ends the item's offers | `acknowledge_for_sale` in the body |
| `POST /api/inventory/bulk` | any change, except where the items are kept (`storage_location_id`), as for the single edit; a new status or disposition ends each changed item's offers | body |
| `POST /api/inventory/receive` | outcomes `missing`, `returned`, `canceled` only | body (`ReceiveRequest`) |
| `POST /api/inventory/{id}/split` | listings only (`kinds={"listing"}`) | body (`SplitRequest`) |
| `PUT /api/inventory/{id}/errors` | always | body (`ItemErrorsRequest`) |
| `POST /api/images` | when `inventory_item_id` names an item | multipart `Form` field |
| `POST /api/images/from-url` | always (the item it is filed on) | body |
| `POST /api/images/{image_id}/links` | always | body |
| `DELETE /api/images/{id}` | on every item the image is linked to | query parameter |
| `PATCH /api/image-links/{link_id}` | always (role, primary) | body |
| `POST /api/image-links/{link_id}/move` | both the item it leaves and the item it joins, one acknowledgement | body |
| `DELETE /api/image-links/{link_id}` | detach | query parameter |
| `POST /api/reference/{table}/{code}/merge` | any affected item for sale | body (`ReferenceMergeIn`) |

The transport differs because HTTP does. An upload is `multipart/form-data`,
and a DELETE has no reliable body, so its flag is a query parameter.

**Per path:**

- **Receiving** guards only the three outcomes that say a coin will not be
  delivered.
  - `received` needs no guard. `offering_writes.offer` refuses an item that
    is not `received`, so an unreceived item cannot be for sale.
  - Once acknowledged, the endpoint sets the status. It then ends every live
    offer holding the items through `offering_writes.end_offer`, because a
    coin that cannot be delivered must not stay offered.
  - An auction lot's listing is refused instead (`_refuse_auction_lots`). It
    is ended only through its auction.
- **Split** also ends the parent's own listings (`split_item`). It refuses
  unconditionally a parent in an order, or an open member of an offered lot.
- **Item errors** are guarded because the sale snapshot copies the error
  set: it is part of what a sale records.
- **Photographs** are guarded because the shop serves an item's primary
  image.
  - Attaching, fetching from a URL, moving, detaching, re-roling, promoting
    and deleting all change what a buyer sees.
  - An unattached upload is not guarded.
  - The guard runs before any bytes are stored, so a refused upload leaves
    no file behind.
- **Merge** reports first.
  - `reference_merge.plan()` carries `for_sale_count` and up to ten
    `for_sale` item codes on `ReferenceMergeOut`. So the `dry_run` preview
    names them before anything is written.
  - The non-dry-run call is still guarded, for a caller that skips the
    preview.
  - One acknowledgement covers the whole merge.

## Where the guard lives, and where it does not

**In the routers, not the writer modules.** The writers are also called
where nobody is present to acknowledge a warning:

- `image_links`, by the `app.photo_import` command-line pass;
- `lifecycle_writes` and `offering_writes.end_offer`, by other writers
  (auction consignment and settlement, splitting).

A batch pass that auto-acknowledges is worse than no guard, because it looks
safe. `app.photo_import` instead reports which linked items are for sale.

**Not a FastAPI dependency.** Item ids arrive differently on every endpoint:
path, body list, image join, vocabulary join. A dependency would need
bespoke extraction each time, and buys nothing over a plain call.

**API-only paths are guarded too.** Image deletion is not in
`management/api.js`, but it is guarded anyway. A guard that exists only
where a button exists is the wrong invariant.

## The console

The console has two shapes. Which one a page uses depends on whether it
already knows the item's sale state.

- **`ForSaleNotice`**: an inline notice with an acknowledgement checkbox. It
  serves forms that load the item's `sale_state` up front: `ItemEditForm`,
  `BulkEditBar`, `ErrorsPanel` and `SplitDialog`.
  - `ErrorsPanel` in Receiving saves on every change. There the
    acknowledgement is **per editing session, not per save**: re-asking on
    each change would train the operator to tick it blind.
  - In the item editor, neither the errors panel nor the photographs panel
    shows a notice of its own. The form's one acknowledgement covers
    everything its Save applies.
- **Driven by the 409**, for pages that hold no sale state for the item:
  - `ReceiptPanel` opens **`ForSaleConfirm`**. This modal shows the server's
    message and says the listing will be ended ("Record it anyway" / "Leave
    it on sale"). Confirming resubmits with `acknowledge_for_sale: true`.
    Photographs uploaded after the receipt carry the same acknowledgement.
  - The **Photos** page attempts the link unacknowledged. On a "For sale"
    409 it shows the message inline in that row, with **Link anyway** and
    **Leave it unlinked**. It is inline rather than modal because the
    operator works down a grid of rows.
- **Vocabularies** shows the merge preview's for-sale codes, and confirming
  the merge sends the acknowledgement. There is no extra dialog.

The console tells this refusal apart from other 409s by the message's
opening words, "For sale".

## Tests

`backend/tests/test_for_sale_guards.py` holds the policy for the guard
itself and for the inventory, upload, image-deletion and merge paths. Each
path refuses when the item is for sale and nothing was acknowledged, and
succeeds when it was.

The photograph-filing paths are tested beside the code they guard:

- attaching, re-roling and detaching in `backend/tests/test_image_links.py`;
- moving in `backend/tests/test_image_move.py`;
- fetching from a URL in `backend/tests/test_image_from_url.py`.

Other cases covered:

- Receiving guards only the three outcomes, and an acknowledged `missing`
  ends the listing and releases its claim.
- Split refuses an order, with no acknowledgement path.
- Merge's `dry_run` reports the codes.
- Lots: an offered lot's member warns like a listed item, and a sold lot's
  member warns while its order is open.

Receiving tests build their listing through `offering_writes.offer()`.
`conftest.build_listing` makes claimless listings, and the test has to prove
a claim was released.

Each guard call site has a test that fails when the call is removed. A move
is tested from both ends: the item the photograph leaves and the item it
joins.

Frontend: `ErrorsPanel`, `ReceiptPanel`, `Vocabularies`, `ForSaleNotice`,
`ForSaleConfirm` and the Photos page have tests. `ErrorsPanel`'s two
sticky-acknowledgement tests are rendered with
`renderWithProviders(..., { strict: true })`. A sticky acknowledgement
across auto-saves is the kind of state that breaks between StrictMode and a
non-strict harness.

## Limits

- **Image deletion is not in the console.** `DELETE /api/images/{id}` is
  guarded but not exposed; the console detaches instead.
