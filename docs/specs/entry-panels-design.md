# Entry panels: Purchases and New item

The database is the system of record, so every acquisition is entered in the
management console as it is bought. That gives each piece a cost basis
traceable to the purchase it came from, and it is what Receiving later checks
arrivals against.

Staff use one page, **Purchases** (`/management/purchases`):

- it records a vendor and a purchase order;
- its **New item** row makes each coin, banknote or lot bought on it, and
  opens it in the item editor.

Other work happens elsewhere:

- splitting a lot and attributing its pieces: the inventory pages
  (`attribution-design.md`);
- correcting or deleting a vendor, seller or storage location: the Lists page
  (`list-maintenance-design.md`);
- photographs and a Friedberg number once the piece is in hand: Receiving or
  the item editor (`receiving-purchases-design.md`,
  `item-photographs-design.md`).

## Rules

| Question | Rule |
|---|---|
| Can an item exist without a purchase? | **No.** A standalone buy is a purchase holding one item. The order number is optional, so a walk-in or show purchase needs only a vendor. One entered without a number is given the next generated one (`Order-0001` and up), so it can be found. |
| Where do shipping and tax live? | **On each item** (`shipping_cost`, `tax_rate`, `tax_includes_shipping`). The page's purchase-wide tax values are sent with every item entered on it. The exception is an item made by *Add another like it*, which takes its example's. |
| A lot? | An item with `piece_count > 1`. Splitting is a later step. |
| Status on entry | `ordered` (default), or `received` for things already in hand. The opening status-history row is written either way. |
| Other defaults | Disposition `held`, authenticity `unverified` unless given, valuation basis `numismatic`, source `manual`. The **New item** row sends country United States (`US`) by default, because the project's vocabularies (denominations, series, note types) are US-centered; the API itself sets no country. The person may change or empty it in the editor. An installation that mostly buys elsewhere changes the default in one place, `DEFAULT_COUNTRY` in `AddItem.jsx`. |
| Vendors | Picked from a list; a missing one is added inline. Names are unique, case-insensitively. |
| Web addresses | A purchase's `source_url` must start with `http://` or `https://` (422 otherwise), the rule Receiving applies when showing it. A seller's `store_url` may also be `mailto:` and a mail address, for a seller reached by mail. A mail address sent alone is stored with `mailto:` in front. |
| Who sold it? | The vendor is often the marketplace (ebay.com, whatnot.com). The seller on it is a row of its own (`seller`), which the purchase names by `seller_id`. A seller has a unique name, an optional store link, and an optional contact for the person behind the account: name, email, E.164 phone. A purchase has one seller, since a marketplace order comes from one; a seller has many purchases. |
| One form for an item | An item is entered in the item editor, the form it is later corrected in. Entering and correcting must not differ in what they offer, or in what Suggest description writes. The purchase page makes the row and opens the editor on it. |
| Repeated entry | **Add another like it** starts the next piece from exactly what it shares with the item last opened on the purchase, or with its latest (`SHARED_ON_REPEAT` in `AddItem.jsx`, listed under *New item* below). Grade and strike type are copied, since the pieces of one purchase are mostly of one grade and strike. A set's grade designation is copied too, since a run of sets is bought as one designation. A loose piece's grade designation, serial number, certificate, variety, years, description and piece count are per piece, and are entered each time, even when they often repeat. |

**Tax fields are three-state.** They sit on the purchase, above the item
form.

- **Tax rate.** The box starts empty, meaning the configured rate (sent as
  `tax_rate: null`). "No sales tax charged" sends 0 and disables the box.
- **An explicit rate** is validated as 0-1 with up to 4 places (a
  leading-dot `.0635` is accepted). While it is invalid the item form refuses
  to save, saying "Fix the tax rate above before saving items."
- **"Tax on shipping"** is "As configured" (`null`), "Taxed" (`true`) or "Not
  taxed" (`false`). A checkbox cannot tell "not taxed" from "use the
  default", and the default is `true`.

## API

- All endpoints are staff-only (401 signed out, 403 for a customer).
- Request bodies forbid unknown fields (422).
- Money crosses as decimal strings.
- The `PATCH` and `DELETE` routes for vendors, sellers and storage locations
  serve the Lists page (`list-maintenance-design.md`).

### Vendors (`routers/acquisitions.py`)

- `GET /api/vendors` -- ordered by name: `id`, `name`, `url`, `vendor_kind`,
  `order_count` (the purchases and platforms naming it).
- `POST /api/vendors` -- `name` (1-255, trimmed), `url` (http(s) only, or
  null), `vendor_kind` (code; null -> `unknown`).
  - 201 with the vendor.
  - 409 on a duplicate name.
  - 422 for an unknown kind or non-http url.

### Storage locations

- `GET /api/storage-locations` -- every location: `id`, `label` (institution and
  box, else the kind), `kind`, `institution`, `identifier`, `notes`,
  `item_count` (items there now or recorded there before).
- `POST /api/storage-locations` -- `kind` (a `storage_location_kind` code),
  `institution` and `identifier` (trimmed; blank -> null), `notes`.
  - 201 with the location.
  - 409 for one that exists (same kind, institution and identifier, case
    aside).
  - 422 for an unknown kind, or for `consigned` / `sold`. The auction code
    makes a consigned location, and `sold` is reserved (nothing creates one).
- Every location picker is `LocationSelect`: the item editor's (where a new
  item is entered too) and Receiving's. It lists the locations, "--" for not
  recorded, and "+ Add a location..." opening an inline kind / bank or place
  / box form.

### Sellers

- `GET /api/sellers` -- ordered by name, case aside: `id`, `name`, `store_url`,
  `contact_name`, `contact_email`, `contact_phone`, `order_count`.
- `POST /api/sellers` -- the fields:
  - `name` (1-255, trimmed);
  - `store_url`: http(s), or `mailto:` and a mail address; blank or absent ->
    null;
  - the optional contact of the person behind the account: `contact_name`
    (<= 255, trimmed), `contact_email` (a mail address), and `contact_phone`.
    The phone is E.164, as a customer's is: spaces, brackets, dashes and dots
    are dropped, then it must be `+` and 7-15 digits (422 "international
    form" otherwise). Each blank or absent -> null.

  Answers: 201 with the seller; 409 on a name already taken, whatever its
  case; 422 for a store that is neither.
- `PATCH /api/sellers/{id}` -- `name`, `store_url` and the three contact
  fields. Only what is sent changes; blank clears any but the name. 409 for
  a name another seller has.

### Purchase orders

- `POST /api/purchase-orders` -- the fields:
  - `vendor_id`;
  - `order_number` (trimmed; blank or absent -> the next generated
    `Order-NNNN`);
  - `ordered_on` (not after tomorrow);
  - `source_url` (http(s) only);
  - `seller_id` (422 for an unknown one);
  - `notes`.

  Answers: 201 with `PurchaseOrderDetailOut`, which names the seller:
  `seller_id`, `seller` (the name) and `seller_url` (their store). 422 for an
  unknown vendor; 409 when that vendor already has that order number.
- `PATCH /api/purchase-orders/{id}` -- `order_number`, `ordered_on`,
  `source_url`, `seller_id` (null clears it) and `notes`. The vendor is not
  changed. Only what is sent changes, and a number sent blank is given the
  next generated one.
- `GET /api/purchase-orders` -- every purchase, the latest entered first.
  Each comes with its `vendor` and `seller` by name, `total` (its items),
  `outstanding` (those not yet received) and `total_cost` (the sum of its
  items' costs). The Purchases page and Order lookup
  (`/management/order-lookup`) both narrow this one list in the browser.
- `GET /api/purchase-orders/{id}` -- one purchase. Its lines carry
  `item_kind` -- which of the Coins and Currency tables the page's items need
  -- and the amounts its total adds up. The tables themselves are read from
  the inventory search,
  `GET /api/inventory/{coins|currency}/search?purchase_order_id=`.

### Items: `POST /api/inventory` (`ItemCreate`)

| Field | Rule |
|---|---|
| `purchase_order_id` | required; 422 if unknown |
| `item_kind` | required code |
| `source_title` | required, 1-500 |
| `description` | default "" |
| `year_start`, `year_end` | a start with no end is a single year; end before start is a 422; refused for `currency` (a note's year is its `series_year`) |
| `no_date` | default false; true says the piece has no date at all (a gold bar). Refused with a year, and for `currency`. The form's **No date** box clears the year and holds it shut |
| `piece_count` | default 1, >= 1 |
| `item_cost`, `shipping_cost` | default 0.00, >= 0, 2 places |
| `tax_rate`, `tax_includes_shipping` | null -> the configured default |
| `status` | `ordered` or `received` |
| `country`, `denomination`, `grade`, `strike_type`, `grade_designation`, `grading_service`, `metal`, `series`, `bullion_form`, `set_form` | codes; unknown -> 422 naming the field. `grade` may be compound (`MS65`), split into number and strike type. |
| `fineness`, `gross_weight_ozt`, `fine_weight_ozt`, `weight_note` | optional; per piece, in troy ounces: fineness above 0 and at most 1 (4 places), weights >= 0 (6 places), a note of <= 200. A fine weight left out is worked out from the other two |
| `storage_form` | null -> `single` |
| `authenticity` | null -> `unverified` |
| `cert_number` | creates one `item_certification`, graded by `grading_service` |
| `sellers_item_id` | optional, <= 64; the seller's id for the listing it was bought from (eBay's item number); trimmed, blank -> null |
| `listing_url` | optional, <= 1000; the listing's web address; trimmed, blank -> null, otherwise http(s) only (422). Editable with `PATCH` too, and offered as a "Listing" link in the item editor only when it is a web address |
| `storage_location_id` | optional; where it is kept (422 for an unknown one). Set through `set_location`, so it is the item's first location-history row. `PATCH` moves it the same way (null: not recorded), without the for-sale acknowledgement -- no buyer sees where a piece is kept -- and a move is kept in the location history, not also as a field change |
| `mint`, `variety` | coin detail; refused for `currency` |
| `serial_number`, `series_year`, `series_letter` (<= 4), `seal_color`, `fed_district`, `note_type`, `signature_combination`, `face_plate_number`, `back_plate_number`, `printing_facility` | currency detail; refused for any other kind. A face plate is a check letter and digits (`E82`), digits alone, or either with `FW` before it; a back plate is digits; `printing_facility` is `dc` or `fw`, read from the face plate when one is sent |
| `suggested` | field names whose value the form filled from the facts and the person left alone; recorded as derived defaults |
| `attributes` | codes (Binary, Star, CAC), set as an edit sets them (`app.item_attributes`); one unknown or of the other kind is a 422 naming it, and nothing is created |

**Wrong-kind fields are refused.** A detail field for the other kind is a 422
naming the field: a silently dropped serial number is data loss. A
denomination whose `kind` contradicts the item kind is a 422.

**One transaction.** In order:

1. resolve every code;
2. build the item;
3. add exactly one detail row (`CurrencyDetail` for currency, otherwise
   `CoinDetail`);
4. add the certification;
5. record the `suggested` fields in `item_field_source`;
6. write the opening status row ("entered in the console");
7. bring the item's classifier defaults up to date
   (`classifier-defaults-design.md`);
8. commit.

The response is the same body `GET /api/inventory/{id}` returns, so the
console can show the new `item_code`.

## Console

Route `/management/purchases` (`/management/purchases/new` also opens it),
nav link **Purchases** (`management/pages/NewPurchase.jsx`). It works in two
steps on one page.

**Step 1: the purchase.** Two radio buttons: *Start a new purchase* first --
the one the page opens on -- then *Add to an existing purchase*.

*Add to an existing purchase* shows a table of purchases.

- **Columns:** order number, date, vendor, and purchase number (`#3974`, the
  purchase's own id, which the reports and Receiving's heading show too).
- **Filter:** by part of an order number, a vendor or a seller, or by an
  exact purchase number.
- **Outstanding only:** a checkbox cuts the list down to the purchases with
  an item not yet received (`ordered` or `missing`). It starts unticked, so
  every purchase is listed.
- **Sorting:** by any column, from a button in its header. The default is
  date, newest first, until another is chosen. An undated purchase is always
  last; ties are newest first.
- A row, or its order-number button, picks the purchase.

*Start a new purchase* asks for these fields:

- **Vendor** (`management/VendorField.jsx`, which the Platforms form's
  purchase source uses too). "+ Add a vendor..." opens an inline web address
  / name / kind form, which never submits the outer form.
  - The address is asked first, and proposes the name from the part of it
    that is the vendor's own:
    1. the first part of a site of their own under a marketplace's:
       `exampleauctions` of `https://exampleauctions.hibid.com/lots`;
    2. else the last part of a page: `coinbuyer42` of
       `https://www.ebay.com/usr/coinbuyer42`;
    3. else the site without `www.`: `usmint.gov`.
  - The proposed name follows the address until a name is typed by hand.
- **Order number.** One already entered, in any case or spacing, is said at
  once -- "Already entered: Open PO-1, Heritage, ..." -- and opened when the
  box is left or Enter pressed, rather than entered twice. Of several
  vendors' with the number, the chosen vendor's is opened; with no vendor
  chosen, each is offered.
- **Order date.**
- **Web address.**
- **Seller** (`SellerField`).
  - **A store address typed in** picks the seller when the box is left or
    Enter pressed. It picks, in order:
    1. the seller whose store it is, compared without scheme, `www.`,
       trailing `/`, `?` or `#`, and in any case;
    2. else the seller of the name the address gives (one seller to a name);
    3. else the add form opens, holding that store and the name it gives, so
       the contact is asked for before the seller is added.
  - **With no address typed**, the pulldown, with "+ Add a seller..." opening
    the same inline form, as the vendor picker does. The store's address is
    asked first, and proposes the name by the same rule,
    `management/site-name.js` (a mail address proposes none). Then the name,
    and the contact name, email and phone, each optional. The phone box
    starts at `+1`, which alone is no number.
- **Notes.**
- **Create purchase.**

Once a purchase is chosen:

- **Edit details** changes the same fields, except the vendor.
- The heading links the purchase's web address as "Vendor page", and names
  the seller, linked to their store, as Receiving's does.
- A refusal is shown in place, with the input kept.

**Step 2: items on this purchase.** The page shows:

- the purchase heading;
- the purchase-wide tax values;
- a table of items entered so far (code, title, kind, cost, status). An item
  code opens the item editor over the page, to fix an entry where it was
  made. The purchase is read again when the editor closes.
- **Receive all N still ordered**, when two or more lines are still
  `ordered`. It opens Receiving's dialog in place, and the purchase is read
  again when it closes.
- the New item row;
- a **Receive these** link to `/management/receiving?order=<id>`;
- **Start another purchase**.

**New item** (`management/pages/entry/AddItem.jsx`):

- **Kind, title, Add item.** The row asks only for what the server needs to
  make an item: its kind, and a title (what the seller called it).
  - It posts them to `POST /api/inventory` with the purchase's tax values.
    For a purchase whose web address is a lot's page, it sends that address
    as the listing.
  - Enter in the title adds.
  - The kind starts at the purchase detail's `default_item_kind` (the
    `DEFAULT_ITEM_KIND` setting, `coin` unless set).
- **The item opens in the item editor** (`ItemEditDialog`), where everything
  else is entered: the facts, grade, cost, storage location, errors,
  photographs (by file, web address, drag and drop or paste), the Friedberg
  number, and the description with **Suggest description**. There is no
  second form to keep in step with it.
- **Closing the editor without saving removes the item** (`DELETE
  /api/inventory/{id}`): a row nobody saved was never entered. An item a save
  wrote part of is kept. (The editor says "Not all was saved" and tells its
  opener through `onChanged`.)
- **Add another like CC-######** is shown whenever the purchase holds an
  item, and names the one it copies.
  - **Which item.** The item last opened on the page, from the table or
    entered in this row. With none opened, or that one gone from the
    purchase, the latest. The page holds which (`lastOpened` in
    `NewPurchase.jsx`).
  - **What is copied.** It reads that item and makes the next from
    `SHARED_ON_REPEAT`:
    - kind, title, item cost, shipping, seller's item id, listing web
      address, status;
    - storage location (a parcel is put away in one place);
    - country, denomination, series, set form (Proof Set, Mint Set...),
      grade, grading service;
    - for a note: series year and letter, seal, district, class and
      signatures;
    - for anything else: metal, mint, bullion form (Silver Eagle,
      Goldback...) and strike type;
    - for a set: its grade designation (`SET_ONLY`).
  - **Tax.** It takes that item's tax rate and tax-on-shipping setting,
    rather than the purchase-wide ones (`taxOf`). So "No sales tax charged"
    ticked on it stays ticked on the next.
  - Then it opens the new item in the editor.
- **Suggest description** is the editor's.
  - It posts what the form shows to
    `POST /api/inventory/{id}/suggested-description`: its unsaved changes as
    Save would send them, and the errors panel's set when that has changed.
  - The server runs Save's own steps on them inside the request's
    transaction, defaults included. So a note's class and seal from its
    series, and the metal and fine weight a save fills from the composition,
    are there. It describes the item as that left it, and rolls everything
    back.
  - The button never waits for Save. `GET` on the same path describes the
    saved record.
- **Save fills a blank description.** A Description that is empty or only
  whitespace is filled: after `refresh_items`, `POST /api/inventory` and
  `PATCH /api/inventory/{id}` call `_fill_blank_description`. It writes
  `suggested_description` of the item as saved, and the edit logs
  `description` under the person saving. Bulk edit, receiving and splitting
  write no description.
- **A coin dated outside its series** is said beside the year in the editor:
  "Morgan Dollar runs 1878-1921; 1800 is outside it. Check the year."
  (`management/series-years.js`, from the series' own
  `year_start`/`year_end`). It is a notice, never a refusal: a tribute piece
  or restrike can fall outside the design's years.
- **The editor asks for things in the order they are known.**
  1. Title.
  2. The listing's web address, then the seller's item id.
  3. Item cost, shipping and tax.
  4. Kind.
  5. What identifies the piece, which depends on its kind (`FACTS_ASKED` in
     `ItemEditForm.jsx`):

     | Kind | Asked for, in order |
     |---|---|
     | currency | denomination; then the note's series year and letter, serial number, plates and printing location |
     | coin, and any kind not listed here | denomination, year, mint |
     | bullion, medal, token | bullion form, metal, the weights, year, mint, denomination -- a bar or a round has no face value, so its form, metal and weight are what identify it |
     | set | set form, year, mint, denomination |

  6. What those facts decide (`FACTS_DECIDED`): the series, the metal, and
     from the composition the fineness and weights -- whichever of them the
     kind was not already asked for. A note's are among its own fields.
  7. The rest of the classifiers, each shown once.
  8. Variety, certificate, pieces, attributes and errors.
  9. Last, the description (with **Suggest description**, which reads all of
     the above), the rating and the storage location.

  Changing the kind reorders the form at once, before any save.
- **The listing's address fills the seller's item id** as it is typed or
  pasted: eBay's `/itm/<id>`, or a HiBid, LiveAuctioneers or Proxibid lot
  (`management/listing.js`). An order page carries none. Only an id the
  address gave is replaced or taken back when the address changes. One typed
  by hand that the address does not carry is left alone.
- **What the facts decide is shown as they are entered.**
  - A moment after the last change, the editor posts what it holds to `POST
    /api/inventory/{id}/preview`. That runs Save's own steps on it inside the
    request's transaction, returns the item as that left it, and rolls
    everything back.
  - Every field not edited here shows the answer, marked *suggested*: a
    note's class, seal, signatures and Reserve Bank, a coin's metal and
    weights, the design series (`classifier-defaults-design.md`). It can be
    typed over.
  - The answer is not sent. Save fills it by the same rules, so what was
    shown is what is saved.
  - A change the preview refuses has no answer, and what was last shown
    stays. Refused changes include an unknown code, no date beside a year, a
    fine weight above the gross weight, a range that ends before it starts,
    and a value the database's own constraints refuse.
  - The preview does not make every check Save makes on the result (a metal
    on a note, a denomination or designation of the other kind). It does not
    apply status or disposition. Those are answered by Save.
- **The Friedberg lookup starts from the note as the form shows it.** Its
  denomination, series, seal, class, signatures, Bank, printing location and
  plates, typed and not yet saved, narrow the search and go into the web
  search's question.

## Listing links

An item names the listing it was bought from twice: by its web address
(`listing_url`) and by the seller's own id for it (`sellers_item_id`). Each
can recover the other. At most vendors, a purchase's web address is its
lot's.

| Rule | Where it applies |
|---|---|
| The id is read from the address where the site puts it: eBay `/itm/<id>`, a HiBid, LiveAuctioneers or Proxibid lot. An order page (Whatnot's `/order/`, order.ebay.com) carries none. | The item editor fills it as the address is typed (`management/listing.js`); the pass fills it (`app/listing_links.py`). |
| An eBay id rebuilds its address, `https://www.ebay.com/itm/<id>`. | The pass. |
| At any vendor but eBay and Whatnot -- whose orders hold many listings -- the purchase's web address is its lot's page, when that address carries a lot id (a shop's location page is no listing) and none of its items names another lot. | `GET /api/purchase-orders/{id}` names it as `lot_page` (`listing_links.lot_page`), and a new item is made with it as its listing (`AddItem.jsx`); a purchase with no web address takes the first item's listing when the item is entered (`create_item`); the pass fills an item with no address from its purchase by the same rule, and a purchase with none from the one address its items share. |
| A purchase whose items name several lots gives no address to its items and takes none from them. | The pass. |
| An eBay purchase's web address is its order page, `https://order.ebay.com/ord/show?orderId=<order number>`: eBay removes a listing's page after a while and keeps the order's. | The pass gives the order page to an eBay purchase with an eBay order number (`NN-NNNNN-NNNNN`) when it has no address, when its address is eBay's list of purchases, and when its address is a listing's page that one of its items already carries. Any other address is kept, and the pass prints it. |

Apart from that last rule, nothing already recorded is replaced.

The pass is run from `backend`. It reports by default;
`python -m app.listing_links --commit --by EMAIL` fills the gaps and logs
each item's change in its History under that person.

## Field help

Whichever field has focus is explained in the console's **help band**, fixed
at the bottom of the window.

**Layout.** The console is laid out as a column the height of the window --
menu, page, band -- and only the page scrolls. So a form always fits between
the menu and the band, and the explanation never scrolls out of sight.

**Components.**

- `management/HelpBar.jsx` holds the band (`HelpProvider`, `HelpBar`), and
  clears it on moving to another page.
- `management/HelpScope.jsx` wraps a form and publishes to the band. It draws
  an area of its own only outside the console shell, as in a component test.
- `management/fieldHelp.js` holds the text, keyed by the field's API name, so
  every form explains a field the same way.

**How a field opts in.** With `data-help="<key>"` on its label, or on the
element wrapping a radio group or a box named through `htmlFor`. Nothing is
placed inside a label: a control in a label with no `for` takes the label
from its field.

**Behavior.**

- The last field explained stays shown when focus moves to one with none.
- Scopes nest, and the innermost one with help for the focused field shows
  it.
- The same mechanism serves every console form that takes input: buying,
  receiving, the item editor, selling, auctions, the Sales page, Platforms,
  People, Lists and Photos.
- A modal has a band of its own (`ModalDialog`). A `ConfirmDialog` that asks
  for something, such as where returned items go, passes `help` to get one.

**Tests.**

- A test scans the console source and fails on any `data-help` key with no
  text.
- Each page's test renders its forms open and asserts `uncovered`
  (`src/test/helpCoverage.js`) is empty: every input, dropdown and text box
  shown sits under a `HelpScope` and a `data-help` topic with a title and
  text.

**Errors in the band.** An error shown anywhere on the band's page -- any
red `error` box, from any form -- is repeated in the band in red, in place of
the field help (`management/raised-error.js`). So it is seen even on a page
too long for its own message to be in view.

- **The page watches itself.** No form reports to the band.
- **The newest error is the one shown**: a box appearing, or its text
  changing. When the form takes its message away, the band lets it go and
  shows the help again.
- **Not messages.** A highlighted table row (`tr.error`) and the numismatic
  `error-list` are left out.
- **A dialog's errors are its own.** A dialog with a band shows them there,
  and the console's band behind it ignores them.
- **The cross (×)** hides the errors shown so far, to read the help behind.
  One comes back when its text changes. It also comes back when a button or
  an accelerator key (Ctrl, Alt or Enter in a box) is pressed while it is
  still on the page: pressing Save again for the same refusal changes nothing
  on the page, and must still be answered. Typing does not bring it back.
- **Nothing in the band takes focus.** A click on the cross leaves the field
  being edited focused, so editing and the accelerator keys work as before.

Help text is public numismatic fact only -- what is printed where on a note
and what it means -- never a catalog's numbering or a price guide's values.
