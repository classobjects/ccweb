# A tour of the screens

Last revised: 2026-11-01.

What each screen looks like and how it is used, for someone deciding whether
to run this software or learning to. It shows the screens; for the order the
work is done in, read
[workflow-new-collection.md](workflow-new-collection.md), and for every rule
behind them, [system-administration.md](system-administration.md).

**The pictures hold made-up data.** The shop, the people, the orders and the
prices are invented, and the coin and note pictures are drawings marked "DEMO
IMAGE". A long screen is shown as a series of pictures, scrolling down it, each
one overlapping the last a little.

## Contents

- [The console](#the-console): [getting around](#getting-around),
  [Inventory](#inventory), [Procurement](#procurement), [Selling](#selling),
  [Reports](#reports), [Settings](#settings)
- [The shop](#the-shop)

## The console

The management console, at `/management`, is where the business is run. It
shows costs, sellers and customers, so only a manager can sign in to it.

![The console's sign-in page](images/ui-guide/login.png)

### Getting around

The menu across the top groups the pages by what the work is for: **Inventory**,
**Procurement**, **Selling**, **Reports** and **Settings**. The group holding the
page you are on is underlined.

The band at the bottom of the window explains whichever field has focus, on
every page. Underlined letters in labels are keyboard shortcuts: Alt plus the
letter goes to that field. In a window whose button shows "Ctrl+S", Ctrl+S
saves it, and Escape closes a dialog.

![The Selling group open in the console's menu](images/ui-guide/menu.png)

### Inventory

#### Coins and Currency

Most work starts on these two pages, which find items. Coins lists everything
that is not a banknote: coins, bullion, sets, medals and tokens. Currency lists
notes, with the columns that matter for them, such as serial, seal and district.

![The Coins page: search, filters, checks and the item table, part 1 of 4](images/ui-guide/coins_1.png)

![The Coins page: search, filters, checks and the item table, part 2 of 4](images/ui-guide/coins_2.png)

![The Coins page: search, filters, checks and the item table, part 3 of 4](images/ui-guide/coins_3.png)

![The Coins page: search, filters, checks and the item table, part 4 of 4](images/ui-guide/coins_4.png)

![The Currency page](images/ui-guide/currency.png)

- **Search** matches a title, description, rating, item code or order number,
  and also the names of what an item is: `mercury` finds Winged Liberty Head
  dimes whose listing never says Mercury. **Search tips**, under the box, gives
  examples.
- **The dropdowns** narrow the result, and each lists only the values among the
  items the other filters found, with a count.
- **A column heading** sorts the table by that column. A second click reverses
  the order.
- **An item code** opens that item in the editor.

The rounded chips are data-quality checks, each with the number of items it
finds. Click one to list those items, and click it again to go back. This one
shows the items with no grade:

![Coins narrowed to the items with no grade, part 1 of 2](images/ui-guide/coins_issue_1.png)

![Coins narrowed to the items with no grade, part 2 of 2](images/ui-guide/coins_issue_2.png)

Tick rows to get the bulk bar, which sets what the selected items share, offers
them for sale or groups them into a sales lot:

![Three coins selected, with the bulk bar above the table, part 1 of 4](images/ui-guide/coins_bulk_1.png)

![Three coins selected, with the bulk bar above the table, part 2 of 4](images/ui-guide/coins_bulk_2.png)

![Three coins selected, with the bulk bar above the table, part 3 of 4](images/ui-guide/coins_bulk_3.png)

![Three coins selected, with the bulk bar above the table, part 4 of 4](images/ui-guide/coins_bulk_4.png)

**Review these** walks through the current result one item at a time, in the
editor. The list is frozen when you start, so fixing an item does not skip the
next one.

![Review, with the item editor open on the first of the result](images/ui-guide/review.png)

#### The item editor

Everything recorded about one item is here. Changes are held until **Save**.

- A value marked *suggested* was worked out from the facts, and typing over it
  makes it yours, so nothing fills that field again.
- **Suggest description** writes a description from what the form shows.
- **Photographs** adds pictures from a file or a web address, and sets which is
  primary.
- **Offers** shows where the item has been offered, and **History** shows who
  changed what and when.
- A banner warns when the item is for sale, because buyers see a change at once.
  Tick **Change it anyway** to save.

![The item editor for a coin, part 1 of 5](images/ui-guide/editor_coin_1.png)

![The item editor for a coin, part 2 of 5](images/ui-guide/editor_coin_2.png)

![The item editor for a coin, part 3 of 5](images/ui-guide/editor_coin_3.png)

![The item editor for a coin, part 4 of 5](images/ui-guide/editor_coin_4.png)

![The item editor for a coin, part 5 of 5](images/ui-guide/editor_coin_5.png)

A note has its own fields, such as series, serial, plates, seal, signatures and
district, and most of them follow from the series and serial:

![The item editor for a note, part 1 of 5](images/ui-guide/editor_note_1.png)

![The item editor for a note, part 2 of 5](images/ui-guide/editor_note_2.png)

![The item editor for a note, part 3 of 5](images/ui-guide/editor_note_3.png)

![The item editor for a note, part 4 of 5](images/ui-guide/editor_note_4.png)

![The item editor for a note, part 5 of 5](images/ui-guide/editor_note_5.png)

**Split into pieces...** turns a lot bought as one item into one item per
piece, each with its share of the cost. It cannot be undone.

![Splitting a lot of four coins, with the cost divided equally](images/ui-guide/split_dialog.png)

#### Photos

Photographs not yet filed against an item wait here, usually from a bulk import
whose file names could not be matched. Enter an item code, use **Find** to check
it, then **Link**.

![Two unattached photographs waiting to be filed](images/ui-guide/photos.png)

#### Order lookup

Finds a purchase from what you remember of it: part of an order number, a vendor
or a seller, a range of dates, or whether anything is still to arrive. The page
says how many purchases match and what they cost together, and an order number
opens that purchase.

![Order lookup listing every purchase](images/ui-guide/order_lookup.png)

### Procurement

#### Purchases

Every item enters the system on a purchase, so its cost always traces to an
order. Start a new one with a vendor. The order number, date, web address, seller
and notes are optional, and a blank number is issued as `Order-0001` and up.

![Starting a new purchase](images/ui-guide/purchases.png)

To add to a purchase already recorded, choose **Add to an existing purchase**
and pick it from the list:

![Choosing an existing purchase](images/ui-guide/purchase_existing.png)

An open purchase lists its items and takes more under **New item**. A kind and a
title make the item and open it in the editor. **Add another like** starts the
next one from what items on the same order usually share. **Receive these** goes
to Receiving for this purchase.

![An open purchase with five items and the New item form](images/ui-guide/purchase_open.png)

#### Receive

Records what actually arrived and where it is kept. Only a received item can be
offered for sale. By default the search finds everything not yet arrived:

![Receiving, listing what has not arrived](images/ui-guide/receive_found.png)

**Receive these** on a purchase opens it already searched for that order:

![Receiving for one order, with Receive all above the search](images/ui-guide/receive_order.png)

Clicking a line opens it. Confirm the facts that identify the piece, then give
the arrival date, storage location, any note and photographs, and choose one of
**Receive**, **Missing**, **Returned** or **Cancelled**. The date and location
carry to the next item, so a parcel going into one box is picked once.

![Receiving one coin](images/ui-guide/receive_dialog.png)

When the whole parcel came, **Receive all** records every line still ordered in
one step:

![Receiving all three items on an order](images/ui-guide/receive_all.png)

### Selling

An item is offered in one place at a time, so it can never be sold twice.

#### Listings

Every offer, in the web store and elsewhere, with its price, cost and margin.
**Edit** changes the wording or price and **End** withdraws the offer.
**Record sale...** enters a sale made on another platform.

![Listings across the web store, eBay and an auction house](images/ui-guide/listings.png)

An offer is made with **Offer for sale...**, from the Coins or Currency bulk bar
or the item editor. Choose a platform and format, then give each item a price,
title and description. The dialog shows cost, estimated fees, net and margin as
you type, and **Fill blank prices** prices the empty rows for the margin you ask
for.

![The offer dialog](images/ui-guide/offer_dialog.png)

Recording an outside sale takes the price, buyer, the platform's order number
and the fees it actually charged, and ends the listing:

![Recording a sale made on eBay](images/ui-guide/record_sale.png)

#### Lots

A sales lot is a group of items sold as one thing. The items stay individually
owned, costed and reportable. Select them on Coins or Currency and choose **Group
into lot...**, and they appear here to be worded and offered. Offering freezes
the lot. Ending the offer dissolves it, and **Re-offer as a lot** starts it again.

![An assembling lot, and the lots already offered, sold or dissolved](images/ui-guide/lots.png)

#### Auctions

The platform runs the bidding, and this page runs everything around it. An
auction moves from draft to scheduled, optionally consigned at an auction house,
then closed and settled.

![The list of auctions](images/ui-guide/auctions.png)

While it is a draft, **Add lot...** puts in a sales lot or a single item, and lot
numbers and reserves can be edited:

![A draft auction with two lots](images/ui-guide/auction_draft.png)

Once closed, each lot's result, hammer price and buyer are entered, and **Settle**
makes one order per buyer. Unsold lots come back:

![A settled auction: one lot sold, one unsold](images/ui-guide/auction_settled.png)

#### Sales

Every order, whatever its source. Change the status from the order's row, through
pending, paid, packed, shipped and delivered, or cancelled and refunded. **Edit**
revises an order still pending or paid. No money moves here: orders are settled
outside the system.

![The Sales page](images/ui-guide/sales.png)

**New order** places an order on a customer's behalf, for a sale in person or by
telephone:

![Placing an order for a customer](images/ui-guide/sales_new.png)

**History** shows who placed and changed an order:

![An order's history](images/ui-guide/sales_history.png)

#### Platforms

Where items are sold, with each account's default fees. Those fees are only for
estimating a price. Nothing is shipped for them, so enter them from your own
account, with the date you read them.

![The Platforms page](images/ui-guide/platforms.png)

#### Spot prices

The price of a troy ounce of each metal, the fine ounces held and what they melt
for. Type a price and press **Record**. A price is never edited: a new one becomes
the current one, and the old one is kept.

![Spot prices with holdings and melt value](images/ui-guide/spot_prices.png)

### Reports

Reports answer questions over the whole collection, and only read. Choose one from
the list on the left, which is grouped as Collection, Data quality, Purchasing and
receiving, Selling and Money.

![The Reports page before a report is chosen](images/ui-guide/reports.png)

Set any parameters and press **Run**. **Export workbook** downloads the same result
as a spreadsheet, and **Print** prints it. A linked cell opens the items it counts.

![Holdings: what the collection is made of](images/ui-guide/report_cb_holdings.png)

Some of the reports worth knowing first:

**Precious metal** gives ounces, cost and melt value at the latest spot price.

![The Precious metal report](images/ui-guide/report_cb_metal.png)

**Open issues** counts every data-quality check across coins and currency.

![The Open issues report, part 1 of 2](images/ui-guide/report_dq_issues_1.png)

![The Open issues report, part 2 of 2](images/ui-guide/report_dq_issues_2.png)

**Not yet arrived** lists purchases still waiting, oldest first, and marks the
overdue ones.

![The Not yet arrived report](images/ui-guide/report_pr_outstanding.png)

**Ready to sell** counts the items in hand and not offered, and how many have a
photograph, a grade or weight, a location and a cost.

![The Ready to sell report](images/ui-guide/report_sl_ready.png)

**Sales** gives orders, gross, fees, net, cost basis and gain by month and platform.

![The Sales report](images/ui-guide/report_sl_sales.png)

### Settings

#### People

**Accounts** are who can sign in, as a manager or a customer. They are deactivated,
never deleted. **Customers** are who has bought, with their contact details and
addresses, including buyers recorded from other platforms.

![People: accounts](images/ui-guide/people.png)

![People: customers](images/ui-guide/people_customers.png)

#### Vocabularies

The values the pickers offer: grades, denominations, series, storage forms and the
rest. Choose a vocabulary to add a value or give one another name (an alias, which
search and the pickers then recognise). The ⋮ menu on a row renames, retires, merges
or edits it.

![The storage form vocabulary with a row's menu open](images/ui-guide/vocab_storage_form.png)

#### Lists

The lists you keep yourself. **Friedberg numbers** starts empty, because publishers'
numbering is not shipped with the software
([reference-data.md](reference-data.md)).

![Lists: Friedberg numbers, empty](images/ui-guide/lists.png)

**Sellers** are the accounts purchases were bought from, **Vendors** are where they
were made, and **Storage locations** are where items are kept, with how many are in
each.

![Lists: sellers](images/ui-guide/lists_sellers.png)

![Lists: vendors](images/ui-guide/lists_vendors.png)

![Lists: storage locations](images/ui-guide/lists_locations.png)

## The shop

The shop is a separate application for customers, at the site's root. It never shows
costs or where an item came from. `SHOP_OPEN=false` closes it to the public
([settings.md](settings.md)).

The catalog shows what is offered in the web store, with search and a filter by type:

![The shop's catalog, part 1 of 2](images/ui-guide/shop_catalog_1.png)

![The shop's catalog, part 2 of 2](images/ui-guide/shop_catalog_2.png)

An item's page shows its primary photograph, price, description and details:

![An item's page in the shop, part 1 of 2](images/ui-guide/shop_detail_1.png)

![An item's page in the shop, part 2 of 2](images/ui-guide/shop_detail_2.png)

The cart holds what a customer means to buy. **Place order** records the order, and
payment is arranged outside the system.

![The shop's cart](images/ui-guide/shop_cart.png)

**Orders** lists the signed-in customer's own orders and their status:

![A customer's orders](images/ui-guide/shop_orders.png)

Customers sign in or register here. An account made this way is always a customer.

![The shop's sign-in page](images/ui-guide/shop_login.png)

![The shop's registration page](images/ui-guide/shop_register.png)

The shop rearranges itself to fit a phone:

![The catalog at phone width](images/ui-guide/shop_phone.png)
