// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
/**
 * What a form field means, in the words the owner reads off the item.
 *
 * One place for every form's help text, so every screen explains a field
 * the same way. A field's key is its API name where it has one; a button or
 * a page's own control has a key named for its page (`report_run`,
 * `vocabulary_rename`). `HelpScope` shows the entry for whichever field has
 * focus, or the button under the pointer; each opts in with
 * `data-help="<key>"`.
 *
 * Public numismatic fact -- what is printed where on a note, and what it
 * means -- and never a price guide's values, nor which catalog number
 * belongs to which note. One entry, `fr_number`, shows the form a Friedberg
 * number takes, with a number past any real one; `docs/reference-data.md`
 * is the rule on a catalog's numbering.
 */
export const FIELD_HELP = {
  // -- the purchase ---------------------------------------------------------
  vendor: {
    title: 'Vendor',
    text:
      'Who sold it: the website, auction house, dealer or person. Add a new one ' +
      "if it isn't listed.",
  },
  ordered_on: {
    title: 'Order date',
    text:
      'The date of the purchase -- when the order was placed or the auction won -- ' +
      'not the date it arrived. Arrival is recorded in Receiving.',
  },
  source_url: {
    title: 'Web address',
    text:
      'A link to the listing, auction lot or invoice, so the purchase can be ' +
      'checked later. It appears as "Vendor page" on the order.',
  },
  seller_id: {
    title: 'Seller',
    text:
      'Who sold it on the marketplace the vendor names -- the eBay seller, the ' +
      'Whatnot shop. Pick one, type their store address to find or add them, or ' +
      '"+ Add a seller..." for a new one with a name and store link -- a web ' +
      'address, or their email address -- and, if wanted, the contact behind ' +
      'it: name, email and phone (country code first). Shown by name, linked to ' +
      'their store, on the order and in Receiving; the contact is kept in ' +
      'Settings > Lists > Sellers.',
  },
  purchase_notes: {
    title: 'Notes',
    text: 'Anything about the purchase as a whole, rather than one item on it.',
  },
  purchase_filter: {
    title: 'Filter',
    text:
      'Type part of an order number, a vendor name or a seller name to ' +
      'shorten the list, or a purchase number (3974 or #3974) to find that ' +
      'one purchase.',
  },
  order_lookup_text: {
    title: 'Order number, vendor or seller',
    text:
      'Type any part of an order number, a vendor name or a seller name: ' +
      'the list narrows to the purchases that have it. A purchase number ' +
      '(3974 or #3974) finds that one purchase. Capitals do not matter.',
  },
  order_lookup_from: {
    title: 'Ordered from',
    text:
      'The earliest order date to list, that day included. Leave it empty ' +
      'for no earliest date. A purchase with no order date is listed only ' +
      'while both date boxes are empty.',
  },
  order_lookup_to: {
    title: 'Ordered to',
    text:
      'The latest order date to list, that day included. Leave it empty for ' +
      'no latest date.',
  },
  purchase_open_only: {
    title: 'Only purchases with items not yet received',
    text:
      'Tick to list only the purchases still waiting on something: an item ' +
      'marked Ordered, or one marked Missing, which may yet turn up. Untick ' +
      'to list every purchase again.',
  },
  tax_rate: {
    title: 'Tax rate',
    text:
      'The sales tax rate charged on this purchase, as a decimal: 0.0635 for 6.35%. ' +
      'Leave it blank to use the configured default. Every item entered below ' +
      'is stamped with it.',
  },
  spot_price: {
    title: 'New price',
    text:
      'What a troy ounce of this metal is quoted at today, in dollars: 31.50, ' +
      'or 0.2875 for copper. Record makes it the price from now on and keeps ' +
      'the one before; a price typed wrong is put right by recording another.',
  },
  no_sales_tax: {
    title: 'No sales tax charged',
    text:
      'Tick when the seller charged no sales tax at all -- the items are stamped ' +
      'with a rate of zero rather than the default.',
  },
  tax_includes_shipping: {
    title: 'Tax on shipping',
    text:
      'Whether the tax was charged on shipping as well as on the price. States ' +
      'differ; "As configured" uses the default setting.',
  },
  // -- an item --------------------------------------------------------------
  item_kind: {
    title: 'Kind',
    text:
      'What the item is: a coin, a banknote, bullion, a set, and so on. It decides ' +
      'which fields apply -- a note has no metal or strike type, a coin no serial ' +
      'number.',
  },
  source_title: {
    title: "Seller's title",
    text:
      'What the seller called it, as written in the listing or invoice -- kept as ' +
      "the seller's words. The title a buyer sees is set when it is offered for sale.",
  },
  piece_count: {
    title: 'Pieces',
    text:
      'How many pieces this one entry stands for: 1 for a single coin or note, more ' +
      'for a roll, a set or a lot bought as one. Split into pieces, below, makes ' +
      'each piece an item of its own.',
  },
  split_pieces: {
    title: 'Pieces',
    text:
      'How many items the lot becomes: a row each, below. It starts at the Pieces ' +
      'the lot records.',
  },
  split_mode: {
    title: 'Divide the cost',
    text:
      'Equally gives every item the same share -- nine proof sets, a tube of ' +
      'rounds. By value divides in proportion to a value you give each piece -- ' +
      'face, melt or a price guide -- so a half dollar does not carry the cost of a ' +
      'cent. Shipping is divided the same way.',
  },
  split_description: {
    title: 'Description',
    text:
      'What this piece is, in your words: "1980 US Proof Set". Left as it is, the ' +
      "piece keeps the lot's description. The seller's title stays the lot's.",
  },
  split_year: {
    title: 'Year',
    text: "This piece's year. Blank keeps the lot's.",
  },
  delete_item: {
    title: 'Delete item',
    text:
      'Removes an item that should never have been entered -- one purchase ' +
      'recorded twice. It asks first. An item with pieces split from it, one ' +
      'that has ever been offered, or one in a sales lot cannot be deleted, ' +
      'and the reason is shown.',
  },
  split_items: {
    title: 'Items',
    text:
      'How many items this row holds, usually 1. A row of 3 takes three shares ' +
      'of the cost and stays one item of 3 pieces.',
  },
  split_value: {
    title: 'Value of one',
    text:
      'What one item of this row is worth, on whatever basis you choose -- the ' +
      "same basis for every row. Only the proportions matter: it divides the lot's " +
      'cost and is kept on the piece.',
  },
  item_cost: {
    title: 'Item cost',
    text:
      'What was paid for this item, in dollars, before shipping and tax. On an ' +
      'order of several items, the price of this one.',
  },
  shipping_cost: {
    title: 'Shipping',
    text: "This item's share of the shipping charged on the order, in dollars.",
  },
  country: {
    title: 'Country',
    text: 'The country that issued it.',
  },
  errors: {
    title: 'Errors',
    text:
      'Printing or minting errors recorded on the item, each with a note of ' +
      "where and how -- an offset's direction, a miscut's size.",
  },
  cert_numbers: {
    title: 'Certificate no.',
    text:
      "The certification number printed on the holder's label, used to look it up " +
      "on the grader's site. Separate several with commas. A number added here is " +
      'recorded as graded by the grading service above.',
  },
  strike_type: {
    title: 'Strike type',
    text:
      'How the coin was made: a business strike, made for circulation and graded ' +
      'Mint State (MS), or a proof, struck with specially polished dies for ' +
      'collectors and graded PR. It decides whether a 65 reads MS65 or PR65.',
  },
  grade: {
    title: 'Grade',
    text:
      'The condition, on the 1 to 70 scale graders use -- 70 is perfect. Coins and ' +
      'notes each have their own scale in this list.',
  },
  grade_designation: {
    title: 'Grade designation',
    text:
      'A qualifier the grader adds to the grade, such as DCAM (Deep Cameo) on a ' +
      'proof, RD (Red) on copper, or EPQ (Exceptional Paper Quality) on a note. ' +
      "Only the ones that fit the item's kind are offered.",
  },
  grading_service: {
    title: 'Grading service',
    text:
      'The company that graded and sealed it in a holder ("slab") -- PCGS, NGC, ' +
      'PMG and others. Leave blank for an ungraded ("raw") item.',
  },
  metal: {
    title: 'Metal',
    text:
      'What it is struck in: silver, gold, copper, copper-nickel clad, and so on. ' +
      'With the fineness and weight, it decides the melt value.',
  },
  series: {
    title: 'Series',
    text:
      'The one design this piece was struck or printed in, as collectors name it: ' +
      'Morgan Dollar, Walking Liberty Half Dollar, or for a note Funnyback. Each ' +
      'design is distinct, and an item has at most one. Price guides and ' +
      'population reports are organised by it, and for a coin it can decide the ' +
      'metal and weights. On a note it is not the series year printed on the ' +
      'face: in "SERIES 1935 A", 1935 is the series year. A private round or bar ' +
      'has no design series; say what it is with Bullion form.',
  },
  variety: {
    title: 'Variety',
    text:
      'A die variety or other variant within the date and mint -- a doubled die, ' +
      'an overdate -- as the seller or grader names it.',
  },
  bullion_serial: {
    title: 'Serial number',
    text:
      'The number stamped or printed on this bar, round or Goldback, exactly as ' +
      'it reads, letters and leading zeros included. It tells this piece from ' +
      'every other of its kind, so it is what to give the police or an insurer ' +
      'if the piece is stolen.',
  },
  year_start: {
    title: 'Year',
    text:
      'The date on the coin. For a set, or a coin dated only to an era, tick ' +
      '"Range of years" and give the first and last year.',
  },
  year_end: {
    title: 'Year to',
    text: 'The last year of the range.',
  },
  storage_form: {
    title: 'Storage form',
    text:
      'How the pieces are packed: single, roll, tube, strap and so on. Choosing one ' +
      'with a usual count fills Pieces with it -- 50 for a roll -- unless Pieces ' +
      'already holds a count of its own; change Pieces when this one holds more or ' +
      'fewer.',
  },
  set_form: {
    title: 'Set form',
    text:
      'What kind of set this is: proof set, mint set, mixed sets and so on. Leave ' +
      'Denomination blank for a set of several face values -- a denomination is one ' +
      'face value. A value that is missing can be added here by its name.',
  },
  gross_weight_ozt: {
    title: 'Gross weight',
    text:
      'What one piece weighs, all of it, in troy ounces or grams -- pick the unit ' +
      'beside the box; it is kept in troy ounces. For several pieces, the weight ' +
      'of one: Pieces multiplies it.',
  },
  fineness: {
    title: 'Fineness',
    text:
      'How much of the piece is the metal, as a fraction of 1: 0.999 for fine ' +
      'silver, 0.925 for sterling, 0.9 for 90% coin silver, 0.9167 for 22 karat.',
  },
  fine_weight_ozt: {
    title: 'Fine weight',
    text:
      'The metal in one piece: what the melt value and the precious-metal report ' +
      'count. Leave it empty and it is worked out as gross weight times fineness; ' +
      'type it when it is what is known -- a one-ounce gold coin holds 1 troy ' +
      'ounce of gold and weighs more.',
  },
  weight_note: {
    title: 'Weight as written',
    text:
      'The weight in the words it came with, where a number does not say it all: ' +
      '"1 oz each", "1/2 Kilo".',
  },
  bullion_form: {
    title: 'Bullion form',
    text:
      'What shape a piece of bullion takes: bar, round and so on. A bar or a round ' +
      'has no face value, so it is recorded here and Denomination is left blank. ' +
      'A new bullion item saved with no form is a Round, shown as filled by a ' +
      'rule; choose its real form here when you know it. ' +
      'A value that is missing can be added here by its name.',
  },
  storage_location_id: {
    title: 'Storage location',
    text:
      'Where the piece is kept -- a safe, a bank box, home. Optional: choose it ' +
      'when it is known, and change it whenever the piece moves; every move is ' +
      "kept in the item's history. It never shows to a buyer.",
  },
  listing_url: {
    title: 'Listing web address',
    text:
      'The web address of the listing this was bought from -- the eBay, HiBid or ' +
      'Whatnot page. Pieces entered one after another keep it, since a lot comes ' +
      'from one listing. Shown as "Listing" in the item editor, which opens it in ' +
      'a new tab.',
  },
  sellers_item_id: {
    title: "Seller's item id",
    text:
      "The seller's own number for the listing this was bought from -- eBay's " +
      'item number. Every piece split from one listing keeps it, so a lot stays ' +
      "traceable. Where it is an eBay item number, the editor's heading shows it " +
      'as a link that opens the listing on eBay in a new tab.',
  },
  item_purchase: {
    title: 'Purchase',
    text:
      'The purchase this item was bought on: its order number and vendor. The order ' +
      'number belongs to the purchase, not the item: this opens the purchase in a new ' +
      'tab, where Edit details changes its number, date, web address, seller or ' +
      'notes.',
  },
  edit_purchase: {
    title: 'Edit details',
    text:
      "Change this purchase's order number, date, web address, seller or notes. " +
      'Clear the order number to give it the next generated one (Order-0001, ' +
      'Order-0002, ...).',
  },
  rating: {
    title: 'Rating',
    text:
      'Your own words about the piece: its condition, grade and what makes it ' +
      'special. Search reads it, and so do the rules that work out a design ' +
      "series or a note's class, so a word that is wrong here should be " +
      'corrected here. A buyer never sees it.',
  },
  add_item: {
    title: 'Add item',
    text:
      'Makes the item on this purchase and opens it in the editor, where its ' +
      'details, photographs and description are entered. Close the editor ' +
      'without saving and the item is not kept.',
  },
  add_another: {
    title: 'Add another like it',
    text:
      'Starts the next piece from what it shares with the item the button ' +
      'names: the one you last opened on this purchase, or the latest when ' +
      'none was opened. Copied: ' +
      'kind, title, cost, shipping, listing and its item id, status, where it ' +
      'is kept, storage form and pieces, country, denomination, series, set form, grade, grading ' +
      "service, and a note's series, seal, district, class and signatures or " +
      "a coin's metal, mint, bullion form and strike, and a set's designation, " +
      'and its sales tax: "No sales tax charged" ticked on it is ticked on ' +
      "the next. A loose piece's designation, serial, certificate, " +
      'years and description are entered for each piece.',
  },
  description: {
    title: 'Description',
    text:
      "Anything else worth keeping about this item: the seller's full description, " +
      'notes on condition or where it came from.',
  },
  purchase_mode: {
    title: 'New or existing purchase',
    text:
      'Start a new purchase for a new order; add to an existing one when more ' +
      'items from an order already entered need recording. Every item belongs ' +
      'to exactly one purchase.',
  },
  // -- searching and receiving ----------------------------------------------
  search_kind: {
    title: 'Search for',
    text:
      'Any: coins and notes together -- one parcel can hold both. Coins: adds a ' +
      'search by year and mint. Currency: adds a search by series year. The ' +
      "serial number box is there for all three: a note's serial, or a bar's, " +
      "round's or Goldback's.",
  },
  order_number: {
    title: 'Order number',
    text:
      "The seller's order or invoice number, from the receipt, email or packing " +
      'slip. When searching, part of it is enough: "4452" finds order ' +
      '114-4452-X, upper or lower case alike.',
  },
  status: {
    title: 'Status',
    text:
      'Where the item stands in buying: ordered (bought, not yet arrived), ' +
      'received (in hand), canceled (the order was called off), returned (sent ' +
      'back to the seller), missing (paid for, never arrived) or unknown. "Not ' +
      'yet arrived" means ordered or missing -- a missing parcel sometimes turns ' +
      'up. "Any status" shows everything, which is how to see a whole order ' +
      'including what already came.',
  },
  item_status: {
    title: 'Status',
    text:
      'Where the item stands in buying: ordered (bought, not yet arrived), ' +
      'received (in hand), canceled (the order was called off), returned (sent ' +
      'back to the seller), missing (paid for, never arrived) or unknown. ' +
      'Receiving moves an item forward; this is where a ' +
      'status recorded in error is put back, and the change is kept in the ' +
      "item's history. Whether it is held, listed or sold is a separate question.",
  },
  vendor_filter: {
    title: 'Vendor',
    text:
      'Only items bought from this vendor -- the website, auction house or dealer ' +
      'the purchase was made at. Part of the name is enough, upper or lower case ' +
      'alike: "apmex" finds apmex.com.',
  },
  seller_filter: {
    title: 'Seller',
    text:
      "Only items from this seller -- the account or shop on the vendor's " +
      'marketplace, such as an eBay seller. Part of the name is enough, upper or ' +
      'lower case alike.',
  },
  arrived_on: {
    title: 'Arrived',
    text:
      'The day the parcel came, today unless you change it. Recorded only when ' +
      'the item is received; the next item you open starts with the same day, ' +
      'since one parcel usually holds several.',
  },
  receipt_note: {
    title: 'Note',
    text:
      'Anything worth saying about this piece as it arrived: "corner bent", ' +
      '"wrong coin sent". It is kept with the status change in the item\'s ' +
      'history, and is not carried to the next item, since it describes this one.',
  },
  receipt_photo: {
    title: 'Photo',
    text:
      'Pictures of the piece as it arrived: choose files, drag them onto the ' +
      'box, or paste one with Ctrl+V. They are added to the item after the ' +
      'receipt is recorded, and only when one item is being received.',
  },
  status_filter: {
    title: 'Status',
    text:
      'Shows only the items at this point in buying: ordered (bought, not yet ' +
      'arrived), received (in hand), canceled (the order was called off), ' +
      'returned (sent back to the seller), missing (paid for, never arrived) or ' +
      'unknown. Any shows every status.',
  },
  year: {
    title: 'Year',
    text: 'The date struck on the coin.',
  },
  mint: {
    title: 'Mint',
    text:
      'The mint mark on the coin: P Philadelphia, D Denver, S San Francisco, ' +
      'O New Orleans, CC Carson City, W West Point. Most older Philadelphia ' +
      'coins carry no mark.',
  },
  denomination: {
    title: 'Denomination',
    text: 'The face value printed on the note or coin -- $1, $5, a half dollar.',
  },
  note_type: {
    title: 'Note type',
    text:
      'The kind of note, printed across the top of the face: Federal Reserve Note, ' +
      'Silver Certificate, United States Note, and so on.',
  },
  seal_color: {
    title: 'Seal color',
    text:
      'The color of the Treasury seal, right of center on the face: green on a ' +
      'Federal Reserve Note, blue on a Silver Certificate, red on a United States ' +
      'Note; brown, gold and yellow on some older and wartime issues.',
  },
  series_year: {
    title: 'Series year',
    text:
      'The year after the word SERIES on the face, near the signatures -- "SERIES ' +
      '1963 A" is 1963. It is the year the design was adopted, not the year the ' +
      'note was printed: notes of one series are often printed for years afterwards.',
  },
  face_plate_number: {
    title: 'Face plate',
    text:
      'The small plate number on the front, beside the check letter: a letter and ' +
      'digits (E82), or digits alone on older notes (153). A note printed in Fort ' +
      'Worth has FW before it (FW E82) -- that is what sets Printed at. With the ' +
      'back plate, it is how a mule is found.',
  },
  back_plate_number: {
    title: 'Back plate',
    text:
      'The plate number printed on the back, digits only (1234). A face and back ' +
      'plate from different eras make a mule; the Friedberg web search asks about ' +
      'both and answers with an m suffix when it is one.',
  },
  printing_facility: {
    title: 'Printed at',
    text:
      'Where the note was printed: Washington, DC or Fort Worth, TX. Read from the ' +
      'face plate when there is one (FW before it is Fort Worth); choose it here ' +
      'only for a note whose face plate is not recorded. It tells some Friedberg ' +
      'numbers apart: the two printings of one series and denomination can ' +
      'each have a number of their own.',
  },
  series_letter: {
    title: 'Series letter',
    text:
      'The letter after the series year -- the A in "SERIES 1963 A". It marks a ' +
      'later printing of the same series, usually because a new Treasurer or ' +
      'Secretary signed it. Leave it blank when the series has no letter, as SERIES ' +
      '1995 does. It is not the letter in the seal: that is the Reserve Bank. ' +
      'If no note of that value was issued in that series, Receiving says so and ' +
      'lists the series that were.',
  },
  signature_combination: {
    title: 'Signatures',
    text:
      'The two signatures printed on the face: the Treasurer of the United States on ' +
      'the left, the Secretary of the Treasury on the right. Each series letter ' +
      'usually has its own pair.',
  },
  fed_district: {
    title: 'Reserve Bank',
    text:
      'The Federal Reserve Bank that issued the note: the letter in the black seal ' +
      'on the left of the face (A Boston to L San Francisco; B is New York). The ' +
      'same bank shows as the number printed four times around the face (2 for ' +
      'New York).',
  },
  serial_number: {
    title: 'Serial number',
    text:
      'The number printed twice on the face, with a letter before and after. On ' +
      'most Federal Reserve Notes the first letter is the Reserve Bank (B for New ' +
      'York); on $5 and higher from Series 1996 the first letter marks the series ' +
      'and the second the bank. A star in place of the last letter marks a ' +
      'replacement note.',
  },
  web_press: {
    title: 'Web press',
    text:
      "Printed on the Bureau of Engraving and Printing's experimental web press, " +
      'from a roll of paper, instead of the usual sheet-fed press. Only some $1 ' +
      'notes of series 1988-A, 1993 and 1995 were. The two printings have ' +
      'different Friedberg numbers. Leave it as not known unless you can tell.',
  },
  star_note: {
    title: 'Star note',
    text:
      'A replacement note: its serial carries a star in place of a letter. A star ' +
      'note has its own Friedberg number, ending in * (3007-B*), so the lookup ' +
      "offers only the kind this is. Filled from the note's serial; Not known " +
      'offers both.',
  },
  mule_note: {
    title: 'Mule',
    text:
      'A note printed from a face plate and a back plate made for different ' +
      'series. A mule has its own Friedberg number, with an m (3007-Em), so Yes ' +
      'offers only mules and No leaves them out. Yes when the note carries the ' +
      'Mule attribute; Not known offers both.',
  },
  fr_number: {
    title: 'Friedberg number',
    text:
      'The Friedberg catalog number for this type of note, in the form 9901-B: a ' +
      'number for the type and, on a Federal Reserve Note, the Reserve Bank ' +
      'letter. Read it off the slab or holder or a reference, or copy it from a ' +
      'match in your own catalog.',
  },
  // -- more of an item --------------------------------------------------------
  disposition: {
    title: 'Disposition',
    text:
      'What has become of the item once it is yours: held, listed, sold, shipped, ' +
      'delivered, returned. Status says whether it has arrived; disposition says ' +
      'where it stands in selling.',
  },
  no_date: {
    title: 'No date',
    text:
      'Tick for a piece that carries no date at all -- a gold bar, an undated ' +
      'round. Different from leaving the year empty, which means not recorded ' +
      'yet: a piece with no date is not listed under "No year recorded".',
  },
  year_range: {
    title: 'Range of years',
    text:
      'Tick when the item covers several years -- a set, a roll, a lot of mixed ' +
      'dates -- to give a first and last year instead of one.',
  },
  attributes: {
    title: 'Attributes',
    text:
      'What makes this piece special beyond its grade: Star Note, Radar, First ' +
      'Strike, CAC and the like. Type in Find to narrow the list, choose one to add ' +
      "it, and use its x to remove it. Only those that fit the item's kind are " +
      'offered.',
  },
  error_details: {
    title: 'Error details',
    text:
      'A note on this error: where and how -- "Back to Front", "left margin", ' +
      '"3 o\'clock, 4mm". Clearing it removes only the note; to remove the error, ' +
      'use its Remove button.',
  },
  photos: {
    title: 'Photographs',
    text:
      "The item's pictures. Choose a file, drag one onto the box, or paste one with " +
      'Ctrl+V to add it; say what each one shows (obverse, reverse, slab ...), make ' +
      'one the primary -- the one the shop shows first -- remove one, or move one ' +
      "to another item by its code. Nothing is filed or changed until the form's " +
      'Save.',
  },
  // -- the search panel -------------------------------------------------------
  search_text: {
    title: 'Search',
    text:
      'Finds items whose title, description, rating, item code or purchase order ' +
      'number contain what you type, ignoring case, and items whose series, mint, ' +
      'strike, designation, note type or attribute is called that. Several words ' +
      'are one phrase, in that order. % stands for any run of characters and _ for ' +
      'exactly one. Press Enter or leave the box to search.',
  },
  search_tips: {
    title: 'Search tips',
    text: 'Worked examples of the search box; click one to run it.',
  },
  grade_filter: {
    title: 'Grade',
    text:
      'A grade or a range of grades: 65 is exactly 65, 64+ exactly 64+, and 55% ' +
      'both 55 and 55+. PR69 names the strike too. BU is 60-62, BU+ 63-64, BU++ ' +
      '65-66 and BU% all three. Coins and notes each use their own scale.',
  },
  serial_filter: {
    title: 'Serial number',
    text:
      'All or part of a serial, anywhere in it. _ stands for exactly one ' +
      'character, so B0808450_ finds a run of consecutive notes; % for any run. ' +
      "On coins it is a bar's, round's or Goldback's own serial.",
  },
  ordered_since: {
    title: 'Ordered since',
    text:
      'Only items from orders placed on this date or later -- the order date, ' +
      'not the day it arrives. With no order number to hand, a date a little ' +
      'before the order, a denomination and part of the serial find the item.',
  },
  error_filter: {
    title: 'Error',
    text:
      'Only items with this printing or minting error recorded on them. The ' +
      'list is of the errors the matching items carry, each with how many.',
  },
  attribute_filter: {
    title: 'Attribute',
    text:
      'Only items carrying this attribute: Star Note, Radar, First Strike, CAC ' +
      'and the like. The list is of the attributes the matching items carry, ' +
      'each with how many.',
  },
  item_code_filter: {
    title: 'Item code',
    text: 'All or part of an item code: CC-006140, or 6140.',
  },
  sellers_item_id_filter: {
    title: "Seller's item id",
    text:
      "All or part of the seller's id for the listing an item was bought from -- " +
      "eBay's item number. Every piece split from one listing keeps it, so one " +
      'number can find several items.',
  },
  year_from: {
    title: 'Year from',
    text: 'Only items dated this year or later. Leave blank for no lower limit.',
  },
  year_to: {
    title: 'Year to',
    text: 'Only items dated this year or earlier. Leave blank for no upper limit.',
  },
  issue_checks: {
    title: 'Checks',
    text:
      'Ready-made lists of items needing attention, with how many each finds: no ' +
      'grade, no cost, and so on. Click one to show only those items; ' +
      'click it again to go back. Only checks with something to find are shown.',
  },
  missing_filter: {
    title: 'Missing',
    text:
      'Only items with this field left empty -- usually set by following a link ' +
      'from a report. Click it to remove it and show the rest again.',
  },
  item_codes_filter: {
    title: 'Only these items',
    text:
      'The list is narrowed to items a report named -- the notes of one set of ' +
      'matching serial numbers. Click it to remove it and show the rest again.',
  },
  clear_filters: {
    title: 'Clear filters',
    text: 'Empties the search box and every filter, showing everything in this view.',
  },
  select_page: {
    title: 'Select all shown',
    text:
      'Ticks every item on this page -- this page only, not every match -- to act ' +
      'on them together: edit them in bulk, offer them for sale or group them into ' +
      'a lot.',
  },
  select_row: {
    title: 'Select',
    text:
      'Tick items to act on them together: edit them in bulk, offer them for ' +
      'sale or group them into a lot.',
  },
  // -- acting on a selection: one field, a lot, an offer ----------------------
  bulk_field: {
    title: 'Field to change',
    text:
      'Which one field to set on every selected item. The value beside it ' +
      'replaces what each item holds. All of them are changed or none: if any ' +
      'one is refused, nothing is. Grade is typed as on an item (65, MS65); ' +
      'country, denomination and metal are typed as their code.',
  },
  lot_target: {
    title: 'Lot',
    text:
      'Where the selected items go: a new lot, or one still being assembled. A ' +
      'lot is offered and sold as one thing. Grouping changes nothing else ' +
      'about an item, which stays in stock.',
  },
  lot_title: {
    title: 'Lot title',
    text:
      'What the new lot is called: the Lots page lists it by this, and its ' +
      'offer starts from it.',
  },
  offer_platform: {
    title: 'Platform',
    text:
      'Where these are offered: the web store, or an outside platform. One ' +
      'platform for everything in this window. An item is offered in one place ' +
      'at a time: offering one that is in the web store pauses its store ' +
      'listing: it comes back if this offer ends unsold, and ends with it if ' +
      'the item sells.',
  },
  offer_format: {
    title: 'Format',
    text:
      'Fixed price, or Auction for a listing sold by bidding. The bidding is ' +
      'run where it is listed, never here. One format for everything in this ' +
      'window.',
  },
  offer_margin: {
    title: 'Margin after fees',
    text:
      "The share of the price to be left once the platform's recorded fees and " +
      'the cost are taken out, as a percentage. Fill blank prices sets each ' +
      'empty price to the lowest that leaves it. A price already typed is not ' +
      'touched, and one with no cost recorded is left blank.',
  },
  offer_price: {
    title: 'Price',
    text:
      "What it is offered for. Beside it are the platform's recorded fees on " +
      'that price, what is left after them, and the margin over cost.',
  },
  offer_title: {
    title: 'Title',
    text:
      'What a buyer sees it called. An item starts with a title written from ' +
      "its record, not the seller's wording from the purchase; a lot starts " +
      'with its own. Change it here before offering.',
  },
  offer_description: {
    title: 'Description',
    text:
      'The wording that goes with the title. It starts as the description on ' +
      'record, and may be left empty.',
  },
  offer_listing_number: {
    title: 'Listing number',
    text:
      "The platform's own number for this listing, where it has one. Leave it " +
      'empty if there is none yet.',
  },
  // -- the Listings page ------------------------------------------------------
  listing_platform_filter: {
    title: 'Platform',
    text: 'Shows only the offers on one platform, or on all of them.',
  },
  listing_format_filter: {
    title: 'Format',
    text: 'Shows only fixed-price offers, or only auction listings, or both.',
  },
  listing_status_filter: {
    title: 'Status',
    text:
      'On offer shows what is active or paused: a paused store listing is one ' +
      'set aside while the item is offered elsewhere. Active, Paused and Ended ' +
      'show only that status; All, including ended, shows every offer ever made.',
  },
  listing_price: {
    title: 'Price',
    text:
      'What it is offered for, as an amount like 189.00. A change shows at once ' +
      'where the offer is listed in the web store; on another platform, change ' +
      'it there too.',
  },
  listing_title: {
    title: 'Title',
    text: 'What a buyer sees it called.',
  },
  listing_description: {
    title: 'Description',
    text: 'The wording that goes with the title. It may be left empty.',
  },
  listing_number: {
    title: 'Listing number',
    text:
      "The platform's own number for this listing, where it has one: the eBay " +
      'item number, the lot number on an auction site. Leave it empty if there ' +
      'is none.',
  },
  for_sale_confirm: {
    title: 'Change it anyway',
    text:
      'The item is offered for sale, as the notice above says. Tick ' +
      'this to make the change all the same; a buyer sees it at once. A sale ' +
      'already made keeps the item as it was sold.',
  },
  // -- recording a sale made elsewhere ----------------------------------------
  sale_price: {
    title: 'Sale price',
    text:
      'What the buyer paid for it, as an amount like 189.00, before the ' +
      "platform's fees: the fees go in the table below, and the net is worked " +
      'out from both.',
  },
  buyer_username: {
    title: 'Buyer username',
    text:
      'The name the platform shows for the buyer: their eBay username, their ' +
      'Whatnot handle. A buyer already recorded on this platform under that ' +
      'name, in any capitals, is the same customer; a new name becomes a new ' +
      'one. Leave it blank if the platform does not name the buyer.',
  },
  external_order_id: {
    title: 'Order number',
    text:
      "The platform's own order or transaction number for this sale, to find " +
      'it in their records. It is kept with the order.',
  },
  sale_fee: {
    title: 'Fees',
    text:
      'What the platform actually charged on this sale, one line per kind of ' +
      'fee, from its statement or invoice. Leave a kind blank if it was not ' +
      'charged. These are what the sale records; the default fees on the ' +
      'Platforms page are only for estimating a price.',
  },
  // -- the Sales lots page ----------------------------------------------------
  lot_edit_title: {
    title: 'Title',
    text:
      'What the lot is called: the Lots page lists it by this, and its offer ' +
      'starts from it.',
  },
  lot_description: {
    title: 'Description',
    text:
      'The wording for the lot as a whole -- what it holds, why it goes ' +
      'together. Its offer starts from it, and it may be left empty.',
  },
  // -- the Auctions page ------------------------------------------------------
  auction_platform: {
    title: 'Platform',
    text:
      'Where the auction is run: an auction house, a live-auction site, or a ' +
      'marketplace for a single timed auction. The web store runs no auction, ' +
      'and a retired platform is not offered. Platforms are added on the ' +
      'Platforms page.',
  },
  auction_title: {
    title: 'Title',
    text:
      "The auction's name, as the platform gives it. The list of auctions and " +
      'every question about this one name it by this.',
  },
  auction_sale_number: {
    title: 'Sale number',
    text:
      "The house's or platform's own number for the sale, to find it in their " +
      'catalog and statements. Leave it empty if there is none yet.',
  },
  auction_starts: {
    title: 'Starts',
    text:
      'When bidding opens, written year-month-day hour:minute with the hour out ' +
      'of 24: 2026-11-20 18:00. It may be left empty. It is a record only: the ' +
      'platform opens and closes the bidding, never this page.',
  },
  auction_ends: {
    title: 'Ends',
    text:
      'When bidding closes, written as Starts is. It may be left empty. Close ' +
      'the auction here once the sale has actually happened.',
  },
  auction_notes: {
    title: 'Notes',
    text: 'Anything about the auction as a whole, kept with it here.',
  },
  lot_subject: {
    title: 'Single item or assembled lot',
    text:
      'What this lot sells: one item on its own, found by its code, or a sales ' +
      'lot still being assembled -- one grouped on Coins or Currency with Group ' +
      'into lot. The lot number, reserve and starting bid are the same either ' +
      'way.',
  },
  lot_number: {
    title: 'Lot number',
    text:
      'The number the house or platform gives this lot in the sale: 1042, or ' +
      '12A. Each lot in an auction has its own. It can be changed until the ' +
      'auction closes.',
  },
  lot_item_code: {
    title: 'Item code',
    text:
      'The code on the item, as CC-000123, to sell it on its own as a lot of ' +
      'one. It is looked up when the lot is added; a code no coin or note has ' +
      'is refused.',
  },
  lot_choice: {
    title: 'Lot',
    text:
      'A sales lot still being assembled, to sell all its items together. A ' +
      'lot already offered somewhere is not listed.',
  },
  reserve: {
    title: 'Reserve',
    text:
      'The lowest price agreed for this lot, if there is one. It is kept here ' +
      'as a record and shown when settling; the platform holds the sale to it. ' +
      'It can be changed until the auction closes.',
  },
  starting_bid: {
    title: 'Starting bid',
    text: 'Where bidding opens, if the platform asks for one. It may be left empty.',
  },
  consigned_on: {
    title: 'Consigned on',
    text:
      'The day the items went to the auction house. They are recorded as at ' +
      'the house from then on, until they are sold or come back.',
  },
  return_location: {
    title: 'Return items to',
    text:
      'Where the items are put away now they are back from the auction house. ' +
      'Asked for because the auction was consigned: the items left the ' +
      'premises, and something must say where they are now.',
  },
  lot_result: {
    title: 'Result',
    text:
      'How the lot ended: Sold, Unsold, or Withdrawn before the sale. A lot left ' +
      'on Choose a result stops the settlement, and its row says so. Unsold and ' +
      'withdrawn items go back on hand.',
  },
  hammer_price: {
    title: 'Hammer price',
    text:
      "The winning bid, as an amount like 189.00, before the buyer's premium " +
      "and the house's fees. Only for a lot marked Sold.",
  },
  lot_buyer: {
    title: 'Buyer',
    text:
      'The winning bidder as the platform names them. Lots with the same buyer, ' +
      'in any capitals, become one order. At an auction house a blank buyer is ' +
      'its undisclosed buyer, for a house that does not say who bought. Only for ' +
      'a lot marked Sold.',
  },
  settlement_fee: {
    title: 'Fees',
    text:
      "What the platform charged on this buyer's order, one box per kind of " +
      'fee, from its statement. Leave a kind blank if it was not charged. Each ' +
      'buyer of a sold lot has a table of their own.',
  },
  settlement_return_location: {
    title: 'Return unsold and withdrawn items to',
    text:
      'Where the lots that did not sell are put away when they come back from ' +
      'the house. Needed before settling when the auction was consigned and any ' +
      'lot is unsold or withdrawn.',
  },
  // -- the Sales page ---------------------------------------------------------
  order_status_filter: {
    title: 'Show',
    text: 'Shows only the orders in one status, or every order.',
  },
  order_status: {
    title: 'Status',
    text:
      'Where the order stands: Pending, Paid, Packed, Shipped, Delivered, or ' +
      'Canceled or Refunded. Choosing one saves it at once. Canceling or ' +
      'refunding an order not yet shipped puts its items back on sale; a ' +
      'canceled order cannot be moved on. A status the order cannot take says ' +
      'why when chosen.',
  },
  order_customer_find: {
    title: 'Find customer',
    text:
      'Type part of a name or email address to shorten the Customer list ' +
      'beside it.',
  },
  order_customer: {
    title: 'Customer',
    text:
      'Who the order is for: a customer already on record, or a shop account ' +
      'that has not ordered yet ("account, no orders yet"), which becomes a ' +
      'customer when the order is saved.',
  },
  order_quantity: {
    title: 'Quantity',
    text:
      'How many of this listing the order takes, no more than are available. ' +
      'Saving moves the stock by the difference.',
  },
  order_unit_price: {
    title: 'Unit price',
    text:
      'What the customer pays for each, as an amount like 189.00. It starts at ' +
      'the listing price, shown below the box when this differs. Changing the ' +
      'total of a paid order flags a payment adjustment.',
  },
  order_item_find: {
    title: 'Find item',
    text:
      'Words to find something in the web store that is in stock. Press ' +
      'Search, then Add beside the one wanted; it joins the order at its ' +
      'listing price.',
  },
  order_notes: {
    title: 'Notes',
    text: 'Anything about the order: how it was taken, what was agreed.',
  },
  // -- the Platforms page -----------------------------------------------------
  platform_name: {
    title: 'Name',
    text: 'The platform as it is shown everywhere in the console: eBay, Whatnot, Heritage.',
  },
  platform_code: {
    title: 'Code',
    text:
      'A short lower-case name the system keeps for the platform, as ebay or ' +
      'heritage. It is set when the platform is added and cannot be changed.',
  },
  platform_kind: {
    title: 'Kind',
    text:
      'How the platform sells: a marketplace (fixed-price listings, or a single ' +
      'timed auction), a live-auction site, or an auction house, which holds ' +
      'the items while they are consigned to it. A sale recorded from a ' +
      'marketplace or live auction starts as paid; one from an auction house ' +
      'as delivered, since the house ships it.',
  },
  platform_vendor: {
    title: 'Purchase source',
    text:
      'The vendor of the same name, where items are also bought there, so ' +
      'eBay is one partner whether buying or selling. Each vendor can be linked ' +
      'to one platform. Leave it as (none) if nothing is bought there.',
  },
  platform_account: {
    title: 'Account',
    text: 'Your own username or seller id on the platform.',
  },
  platform_listing_link: {
    title: 'Listing link',
    text:
      'The address of a listing on this platform, with {external_id} where the ' +
      'listing number goes: https://www.ebay.com/itm/{external_id}. An example ' +
      'link is shown below the form as you type.',
  },
  platform_commission: {
    title: 'Commission %',
    text:
      "The platform's usual commission or final-value fee, as a percentage of " +
      'the price: 13.25. Used only to estimate fees when pricing an offer.',
  },
  platform_processing: {
    title: 'Processing %',
    text:
      'The payment-processing fee as a percentage of the price, if the platform ' +
      'charges one apart from its commission. Used only to estimate fees.',
  },
  platform_processing_fixed: {
    title: 'Processing $ per sale',
    text:
      'A fixed amount charged on every sale, as 0.30. Used only to estimate ' + 'fees.',
  },
  platform_listing_fee: {
    title: 'Fee $ per listing',
    text:
      'What it costs to list one item, whether it sells or not. Used only to ' +
      'estimate fees.',
  },
  platform_fees_as_of: {
    title: 'Fees as of',
    text:
      'The day you read these fees from your account. Terms change, so the ' +
      'Platforms page shows the date beside them.',
  },
  platform_notes: {
    title: 'Notes',
    text: 'Anything about the platform or the account there.',
  },
  platform_retired: {
    title: 'Retired',
    text:
      'Tick when nothing more will be sold here. A retired platform is not ' +
      'offered for new offers or auctions; everything sold there stays on ' +
      'record. A platform is never deleted.',
  },
  // -- the People page --------------------------------------------------------
  account_email: {
    title: 'Email',
    text: 'The address the person signs in with. Two accounts cannot share one.',
  },
  account_name: {
    title: 'Name',
    text: "The person's name, shown with the account.",
  },
  account_role: {
    title: 'Role',
    text:
      'What the account may do. A customer signs in to the shop only. A manager ' +
      'also signs in to this console and sees costs. The last manager cannot be ' +
      'made a customer. A change in the table is saved as it is made.',
  },
  account_password: {
    title: 'Initial password',
    text: 'At least 8 characters: what the person first signs in with.',
  },
  account_new_password: {
    title: 'New password',
    text:
      'At least 8 characters; press Set or Enter to save it. The account is ' +
      'signed out everywhere it was signed in, and signs in again with this.',
  },
  customer_name: {
    title: 'Name',
    text: 'The customer as the Sales page and their orders show them.',
  },
  customer_email: {
    title: 'Email',
    text: "The customer's email address.",
  },
  customer_phone: {
    title: 'Phone',
    text:
      'Country code first, then the number: +1 for the United States, so ' +
      '+1 212 555 0100. It is kept whole, so it can be dialed from anywhere.',
  },
  address_line1: {
    title: 'Address line 1',
    text: 'The street address, or a post office box.',
  },
  address_line2: {
    title: 'Line 2',
    text: 'An apartment, suite or floor, if there is one.',
  },
  address_city: {
    title: 'City',
    text: 'The city or town.',
  },
  address_region: {
    title: 'State / region',
    text: 'The state, province or region, as NY.',
  },
  address_postal_code: {
    title: 'Postal code',
    text: 'The ZIP or postal code.',
  },
  address_country: {
    title: 'Country',
    text:
      'The two-letter country code: US, CA, GB. Saving adds this as the ' +
      'shipping address; the one before is retired and kept, not overwritten.',
  },
  // -- the Lists page ---------------------------------------------------------
  list_search: {
    title: 'Search',
    text: 'Type part of any column to shorten the list. Clear it to see every row.',
  },
  list_fr_number: {
    title: 'Number',
    text:
      'A Friedberg number in the form 9901-B: the type and, on a Federal ' +
      'Reserve Note, the Reserve Bank letter. It is checked as one typed in ' +
      'Receiving. A number can be added here ahead of the note that will use it.',
  },
  list_fr_description: {
    title: 'Description',
    text: 'Your own words for the type, to tell it apart in the list. It may be left empty.',
  },
  seller_name: {
    title: 'Name',
    text: 'The seller as purchases and Receiving show them: their store or username.',
  },
  seller_store_url: {
    title: 'Store link',
    text:
      'The address of their store or profile page, as ebay.com/str/... ; a ' +
      'link without https:// is taken as one with it.',
  },
  seller_contact: {
    title: 'Contact',
    text: 'The person behind the account, if known.',
  },
  seller_contact_email: {
    title: 'Contact email',
    text: "The contact's email address, if known.",
  },
  seller_contact_phone: {
    title: 'Contact phone',
    text:
      'Country code first, then the number: +1 212 555 0100. Leave just the ' +
      'country code if there is no number.',
  },
  vendor_name: {
    title: 'Name',
    text:
      'Where purchases are made: the website, auction house, dealer or person, ' +
      'as the New purchase form lists it.',
  },
  vendor_url: {
    title: 'Link',
    text: "The vendor's website, if it has one; https:// is added if left off.",
  },
  vendor_kind: {
    title: 'Kind',
    text: 'What sort of source it is: a marketplace, an auction, a mint, a dealer or a private seller.',
  },
  location_kind: {
    title: 'Kind',
    text:
      'What sort of place: a safe deposit box, a safe, at home, in transit. The ' +
      'places at an auction house and the place for sold items are made by the ' +
      'system and not offered.',
  },
  location_institution: {
    title: 'Institution',
    text: 'Who holds it, for a box at a bank: the bank and branch.',
  },
  location_identifier: {
    title: 'Identifier',
    text: 'The box or container number. Kind, institution and identifier together name one place.',
  },
  location_notes: {
    title: 'Notes',
    text: 'Anything about the place: where the key is, what shelf.',
  },
  // -- the Photos page --------------------------------------------------------
  photo_link_item: {
    title: 'Item code',
    text:
      'The code of the item this photograph shows, as CC-000123. Type it and ' +
      'press Find or Enter, choose the match, then Link.',
  },
  photo_move_to: {
    title: 'Move to item',
    text:
      'The code of the item this photograph belongs on instead, as CC-000123. ' +
      'Type it and press Find or Enter, then choose the match. The move is ' +
      'made when the item is saved.',
  },
  // -- the Reports page -------------------------------------------------------
  // A report's parameter is explained by `report_<name>`; one with no entry of
  // its own falls back to `report_param`.
  report_catalog: {
    title: 'Reports',
    text:
      'Every report, by what it is about. Choose one to run it with its usual ' +
      'settings; the address then names it, so it can be bookmarked or reopened.',
  },
  report_param: {
    title: 'Report setting',
    text: 'Narrows or adjusts what this report counts. Press Run to apply it.',
  },
  report_status: {
    title: 'Status',
    text:
      'Which items to count by where they stand in buying: received (in hand) by ' +
      'default, or ordered (bought, not yet arrived), canceled (the order was ' +
      'called off), returned (sent back to the seller), missing (paid for, never ' +
      'arrived), unknown -- or all of them.',
  },
  report_disposition: {
    title: 'Disposition',
    text:
      'Which items to count by where they are in selling: held (still owned) by ' +
      'default, or listed, sold, shipped, delivered, returned by the buyer -- or all.',
  },
  report_denomination: {
    title: 'Denomination',
    text:
      'Whether matching notes must be of the same denomination: any, so a $1 ' +
      'and a $5 of one serial are a set, or must match.',
  },
  report_letters: {
    title: 'Letters',
    text:
      'Whether the letters before and after the digits count: ignore, so ' +
      'B00003333A matches F00003333C on the digits alone, or must match.',
  },
  report_stars: {
    title: 'Star notes',
    text:
      'Whether a star note matches the note without the star, the star ' +
      'standing where a letter would, or only another star note.',
  },
  report_overdue_days: {
    title: 'Overdue after (days)',
    text:
      'How many days after its order date a purchase still waiting to arrive is ' +
      'marked Overdue. 21 unless changed.',
  },
  report_vendor: {
    title: 'Vendor',
    text:
      'One vendor\'s name exactly as the Received report shows it -- "No ' +
      'purchase" for items recorded with none -- or all for every vendor.',
  },
  report_date_from: {
    title: 'From',
    text: 'Counts from this date on. Left empty, there is no start -- everything up to To.',
  },
  report_date_to: {
    title: 'To',
    text: 'Counts up to this date. Left empty, there is no end -- everything from From on.',
  },
  report_period: {
    title: 'Period',
    text:
      'How the dates are grouped into rows: by month, quarter or year, with a ' +
      'subtotal after each. Sales tax paid offers month or year only.',
  },
  report_run: {
    title: 'Run',
    text:
      'Runs the report with these settings and puts them in the address. The ' +
      'answer is from the database as it is now.',
  },
  report_export: {
    title: 'Export workbook',
    text:
      'Saves this report, with the same settings, as an Excel workbook: its title ' +
      'and settings above the table, totals below, money as numbers.',
  },
  report_print: {
    title: 'Print',
    text:
      'Prints the report as shown -- same rows, same order -- without the menu, ' +
      'this band or the settings. A wide report prints landscape.',
  },
  report_sort: {
    title: 'Sort',
    text:
      "Click a column's name to sort by it, again to reverse, and a third time " +
      "to return to the report's own order.",
  },
  report_rows: {
    title: 'Drill down',
    text:
      'A linked value opens the page behind that row: the items it counts, or the ' +
      'purchase to receive. A linked item code opens that item to edit, over the ' +
      'report. A linked percentage opens the items missing that field.',
  },
  report_show: {
    title: 'Show',
    text: 'Which rows to list: all of them, or one kind of case only.',
  },

  // -- the Vocabularies page -------------------------------------------------
  vocabulary_table: {
    title: 'Vocabulary',
    text: 'Which list to work on: the values a picker offers for one field -- grades, mints, denominations, series and the rest.',
  },
  vocabulary_find: {
    title: 'Find',
    text: 'Narrows the list to values whose label, code or other name contains what is typed.',
  },
  vocabulary_add: {
    title: 'Add a value',
    text: 'Adds a value to this list, so the pickers offer it. Not offered for a list the application acts on value by value, such as statuses.',
  },
  vocabulary_label: {
    title: 'Label',
    text: 'What people read in a picker and on an item. It can be reworded later without changing anything recorded.',
  },
  vocabulary_code: {
    title: 'Code',
    text: 'What records and saved searches store for the value. It never changes once set. Leave it empty and one is worked out from the label, or for a denomination from its currency, kind and face value.',
  },
  vocabulary_position: {
    title: 'Position',
    text: "Where the value sits in a list kept in a meaningful order: a number between its neighbors' positions, shown in the Position column. Lower comes first.",
  },
  theme: {
    title: 'Theme',
    text: 'Light or dark pages, or Automatic to follow this device’s own setting. Saved to your account, so every computer and phone you sign in on shows the same.',
  },
  vocabulary_rename: {
    title: 'Rename',
    text: 'Changes the label only. The code stays, so every item that holds the value shows the new wording at once.',
  },
  vocabulary_retire: {
    title: 'Retire',
    text: 'Stops the pickers offering the value. Every item that already holds it keeps it. A value the application looks up by its code cannot be retired.',
  },
  vocabulary_restore: {
    title: 'Restore',
    text: 'Offers a retired value in the pickers again.',
  },
  vocabulary_merge: {
    title: 'Merge into',
    text: 'Moves every item holding this value to another one, makes its names other names for that one, and removes it. What would move is shown first; it cannot be undone.',
  },
  vocabulary_alias: {
    title: 'Other names',
    text: 'Other names people use for the value, which search and the pickers also recognize: Mercury for the Winged Liberty Head dime. Click a struck-through name to bring it back.',
  },
  vocabulary_details: {
    title: 'Edit details',
    text: "Changes what this list records about the value beyond its label: which items a series is offered for, its years, a mint's mark. Every item that holds the value is affected at once, and the code stays as it is.",
  },
  vocabulary_field: {
    title: "A value's own detail",
    text: 'Something this list records about each of its values, beyond the label. A box marked optional may be left empty.',
  },
  vocabulary_field_currency: {
    title: 'Currency',
    text: 'The currency the face value is in.',
  },
  vocabulary_field_face_value: {
    title: 'Face value',
    text: "The amount the piece is worth as money, in the currency's main unit: 0.03 for three cents, 5 for five dollars. One face value is one denomination, however many designs carry it.",
  },
  vocabulary_field_kind: {
    title: 'Kind',
    text: 'Whether this face value is a coin or a note. The same value can be both -- a dollar coin and a dollar bill -- and each is its own denomination.',
  },
  vocabulary_field_applies_to: {
    title: 'Applies to',
    text: 'Which items the value is offered for: coin, which covers everything that is not a note, currency for notes, or any for both.',
  },
  vocabulary_field_denomination: {
    title: 'Denomination',
    text: 'The face value every piece of this design has. Leave it empty for a design struck in several, such as a bullion program.',
  },
  vocabulary_field_year_start: {
    title: 'First year',
    text: 'The first year the design was struck, or the first series year of a note design.',
  },
  vocabulary_field_year_end: {
    title: 'Last year',
    text: 'The last year the design was struck. Leave it empty for one still being struck.',
  },
  vocabulary_field_needs_evidence: {
    title: 'Needs evidence',
    text: "Tick for a design that shares its denomination and years with a far commoner one. It is then assigned only when an item's description names it, or a note's seal or class shows it.",
  },
  vocabulary_field_seal_color: {
    title: 'Seal color',
    text: 'The seal color that marks a note as this design: brown for Hawaii, yellow for North Africa.',
  },
  vocabulary_field_note_type: {
    title: 'Note type',
    text: 'The note type every note of this design is, such as Silver Certificate. A note recorded as another type is never taken for it.',
  },
  vocabulary_field_metal: {
    title: 'Metal',
    text: 'The metal a piece of this form is made of.',
  },
  vocabulary_field_typical_fine_weight_ozt: {
    title: 'Typical fine weight',
    text: 'The fine weight in troy ounces a piece of this form always has, when it has one: 1 for a Silver Eagle. Leave it empty where pieces vary, as bars do.',
  },
  vocabulary_field_typical_fineness: {
    title: 'Typical fineness',
    text: 'The purity a piece of this form always has, as a fraction: 0.999. Leave it empty where it varies.',
  },
  vocabulary_field_mark: {
    title: 'Mint mark',
    text: 'The letter or letters the mint puts on its coins: S, CC. Leave it empty for a mint that uses none.',
  },
  vocabulary_field_country: {
    title: 'Country',
    text: 'The country the mint belongs to.',
  },
  vocabulary_field_symbol: {
    title: 'Symbol',
    text: 'The short symbol for the value: $ for a currency, Ag for a metal.',
  },
  vocabulary_field_minor_units: {
    title: 'Minor units',
    text: "How many decimal places the currency's amounts have: 2 for dollars and cents.",
  },
  vocabulary_field_iso_alpha2: {
    title: 'Two-letter code',
    text: "The country's two-letter ISO code: US, CA, MX.",
  },
  vocabulary_field_is_precious: {
    title: 'Precious',
    text: 'Tick for a metal whose weight gives a piece its value -- gold, silver, platinum, palladium.',
  },
  vocabulary_field_base_metal: {
    title: 'Read as',
    text: "For a plated or layered metal, the metal a coin's composition reads it as: Silver for gold-plated silver, so such a coin gets a silver coin's weights. Leave it empty for a metal that is itself.",
  },
  vocabulary_field_base_seal_color: {
    title: 'Read as',
    text: 'For a shade of a seal color, the color the series facts read it as: Green for a light green seal, so such a note is not reported as disagreeing with its series. Leave it empty for a color that is itself.',
  },
  vocabulary_field_default_quantity: {
    title: 'Usual count',
    text: 'How many pieces a holder of this kind usually contains: 20 for a tube of silver rounds.',
  },
  vocabulary_field_grade_scale: {
    title: 'Grade scale',
    text: 'The scale the grade belongs to, which decides whether it is offered for a coin or for a note.',
  },
  vocabulary_field_numeric_value: {
    title: 'Number',
    text: "The grade's number on its scale: 65 for MS65. It is what grades are ordered by.",
  },
  vocabulary_field_is_plus: {
    title: 'Plus',
    text: 'Tick for a plus grade, such as 64+, which ranks just above the plain number.',
  },
  vocabulary_field_prefix: {
    title: 'Prefix',
    text: 'The letters shown before the number for this strike: PR, SP. Leave it empty for a business strike, which takes MS, AU and so on from the number.',
  },
  vocabulary_field_suffix: {
    title: 'Suffix',
    text: 'Words shown after the grade for this strike, where it has them: Reverse Proof.',
  },
  vocabulary_field_attribute_group: {
    title: 'Group',
    text: 'Which group of attributes the value is listed under in the editor: serial, variety, release, verification or qualifier.',
  },
  vocabulary_field_letter: {
    title: 'Letter',
    text: "The Federal Reserve district's letter, A to L, as printed in the seal and the serial number.",
  },
  vocabulary_field_number: {
    title: 'Number',
    text: "The Federal Reserve district's number, 1 to 12.",
  },
  vocabulary_field_city: {
    title: 'City',
    text: "The city of the district's Federal Reserve Bank.",
  },
  vocabulary_field_treasurer: {
    title: 'Treasurer',
    text: 'The Treasurer of the United States whose signature the pair carries.',
  },
  vocabulary_field_secretary: {
    title: 'Secretary',
    text:
      'The Secretary of the Treasury whose signature the pair carries, on a ' +
      'small-size note. Leave it empty for a large-size pair, which has a Register.',
  },
  vocabulary_field_register: {
    title: 'Register',
    text:
      'The Register of the Treasury whose signature a large-size note carries, ' +
      'beside the Treasurer: Speelman on a Speelman / White note. Leave it empty ' +
      'for a small-size pair, which has a Secretary.',
  },
  vocabulary_field_term_from: {
    title: 'From year',
    text: 'The first year both officials were in office together.',
  },
  vocabulary_field_term_to: {
    title: 'To year',
    text: 'The last year both officials were in office together. Leave it empty for the pair in office now.',
  },
  vocabulary_field_tracking_url_template: {
    title: 'Tracking address',
    text: "The carrier's tracking page address, with {tracking} where the tracking number goes.",
  },
}
