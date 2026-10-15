/**
 * Reads the manual lists the stock view needs from your existing sheets (read-only):
 *   FBA Inventory Status > Discontinued (column A: ASIN)
 *   FBA Inventory Status > errors (column A: ASIN, column D: units), as the Inventory tab's VLOOKUP(...,4) uses
 *   MAIN SHEETS > Images (column B: ASIN, column C: image URL)
 * Usage: npm run sync:sheets
 */
import { sheetsClient, withQuota, SHEETS } from "../lib/google";
import { withTransaction, getPool } from "../lib/db";
import { num } from "../lib/parse";

const isAsin = (v: unknown) => /^[A-Z0-9]{10}$/.test(String(v ?? "").trim());

async function main() {
  const sheets = sheetsClient();
  const get = (spreadsheetId: string, range: string) =>
    withQuota(() => sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: "UNFORMATTED_VALUE" }))
      .then((r) => (r.data.values ?? []) as unknown[][]);

  const discontinued = (await get(SHEETS.FBA_INVENTORY_STATUS, "Discontinued!A:B")).filter((r) => isAsin(r[0]));
  const errors = (await get(SHEETS.FBA_INVENTORY_STATUS, "errors!A:D")).filter((r) => isAsin(r[0]));
  const images = (await get(SHEETS.MAIN, "Images!B:C")).filter((r) => isAsin(r[0]) && String(r[1] ?? "").startsWith("http"));

  // VLOOKUP takes the first match, so keep the first row per ASIN.
  const firstBy = <T extends unknown[]>(rows: T[]) => [...new Map(rows.slice().reverse().map((r) => [String(r[0]).trim(), r])).values()];

  await withTransaction(async (c) => {
    await c.query("DELETE FROM product_flags");
    for (const r of firstBy(discontinued)) {
      await c.query("INSERT INTO product_flags (asin, flag, note) VALUES ($1, 'discontinued', $2)", [String(r[0]).trim(), String(r[1] ?? "")]);
    }
    for (const r of firstBy(errors)) {
      await c.query("INSERT INTO product_flags (asin, flag, error_units) VALUES ($1, 'error', $2)", [String(r[0]).trim(), Math.round(num(String(r[3] ?? "")))]);
    }
    for (const r of firstBy(images)) {
      await c.query("UPDATE products SET image_url = $2 WHERE asin = $1", [String(r[0]).trim(), String(r[1]).trim()]);
    }
  });
  console.log(`discontinued=${firstBy(discontinued).length} errors=${firstBy(errors).length} images=${firstBy(images).length}`);
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
