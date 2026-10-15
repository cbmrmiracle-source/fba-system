# FBA System

Private web app that replaces the paste-and-IMPORTRANGE Google Sheets setup for the Mr Miracle Amazon business.
Milestone 1: **Stock health** (FBA Inventory Status > Inventory and Dashboard) and **Sales** (Sales Central),
fed by report files uploaded on one page. Your existing Google Sheets are only ever read, never written.

## Daily use

1. Download the reports you already download today.
2. Open **Upload reports** and drop them in:
   - Seller Central **Manage Inventory Health** (the file pasted into MAIN SHEETS > FBA). Date comes from the file.
   - Seller Central **All Orders** (the file pasted into each daily sheet's `amz` tab). Pick the sales date.
   - Nineyard **Profit by SKU** is also accepted for a sales day, if you use it instead.
3. Re-uploading a report for the same date replaces that date.

## How the numbers are worked out

Same rules as the sheets (see `lib/stock.ts` and `lib/reports.ts`):

- Daily units per ASIN = sum of `quantity` over every row of that day's All Orders file; daily sales = sum of `item-price`
  (Sales Central Summary column C).
- 7/14/30-day sales end yesterday. 30-day pace = max(30-day units, (4 x 7-day + 2 x 14-day + 30-day) / 3), or 0 if discontinued.
- Days sellable = sellable / (pace / 30); days incl. reserved uses available + reserved + FC transfer;
  days incl. inbound adds shipped, receiving, unfulfillable and (setting) shipment created, minus error units.
- Qty to ship follows Dashboard L7:L10 (14 / 24 / 45 / 15 days), stored in the `settings` table.

One intended difference: when an ASIN has several SKUs, the app adds their stock together. The sheet only reads the first SKU it finds.

## Setup

Needs Node 20+ and a Postgres database (Supabase works).

```
cp .env.example .env.local     # fill in DATABASE_URL and APP_PASSWORD
npm install
npm run migrate                # creates the tables
npm run dev                    # http://localhost:3000
```

Deploy on Vercel: import the repo, set `DATABASE_URL` and `APP_PASSWORD` as environment variables, deploy.

### Loading history and manual lists (read-only Google access)

These scripts read your sheets with a Google service account limited to the `spreadsheets.readonly` scope.
Share the Sales Central folder, FBA Inventory Status and MAIN SHEETS with the service account's email as **Viewer**.

```
npm run backfill:sales -- --missing-only   # loads every daily sheet linked in Sales Central > Summary
npm run sync:sheets                        # Discontinued list, errors list, product images
```

`backfill:sales` writes `backfill-report.csv` comparing each loaded day with Summary column C.

### Checks

```
npm test                                         # formula tests from real sheet rows
npm run parity -- inventory.json 2026-10-15      # column-by-column comparison with the Inventory tab export
```
