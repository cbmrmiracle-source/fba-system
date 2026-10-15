/**
 * Compares the Stock health numbers with FBA Inventory Status > Inventory, column by column.
 * Usage: npm run parity -- <inventory.json> <as-of YYYY-MM-DD>
 *   inventory.json is a Sheets API values response for Inventory!A1:T (read-only export).
 */
import { readFileSync } from "fs";
import { stockHealth } from "../lib/queries";
import { getPool } from "../lib/db";

const COLS: [string, number, string][] = [
  ["Total in FBA", 3, "totalInFba"], ["Sellable", 4, "sellable"], ["Reserved", 5, "reservedIncTransfer"],
  ["Shipped", 6, "inboundShipped"], ["Receiving", 7, "inboundReceived"], ["Unfulfillable", 8, "unfulfillable"],
  ["Shipment created", 9, "inboundWorking"], ["Errors", 11, "errorUnits"],
  ["Sales 7d", 12, "sales7"], ["Sales 14d", 13, "sales14"], ["Sales 30d", 14, "sales30"], ["30-day pace", 15, "avg30"],
  ["Days sellable", 16, "daysSellable"], ["Days incl. reserved", 17, "daysWithReserved"],
  ["Days incl. inbound", 18, "daysWithInbound"], ["Qty to ship", 19, "qtyToShip"],
];

const norm = (v: unknown): string => {
  if (v == null || v === "" || v === "-") return "";
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? String(Math.round(n + 1e-9)) : String(v);
};

async function main() {
  const [file, asOf] = process.argv.slice(2);
  const sheet: string[][] = JSON.parse(readFileSync(file, "utf8")).values;
  const sheetBy = new Map<string, string[]>();
  for (const r of sheet.slice(3)) if (r[0] && !sheetBy.has(r[0])) sheetBy.set(r[0], r);
  const report = await stockHealth(asOf);

  let rowsOk = 0, rowsBad = 0;
  const colBad = new Map<string, number>();
  const examples: string[] = [];
  for (const row of report.rows) {
    const s = sheetBy.get(row.asin);
    if (!s || s[3] == null || String(s[12] ?? "").startsWith("#")) continue;
    let ok = true;
    for (const [label, idx, key] of COLS) {
      const mine = norm((row as any)[key]), theirs = norm(s[idx]);
      if (mine !== theirs) {
        ok = false;
        colBad.set(label, (colBad.get(label) ?? 0) + 1);
        if (examples.length < 25) examples.push(`${row.asin} ${label}: app=${mine} sheet=${theirs}`);
      }
    }
    ok ? rowsOk++ : rowsBad++;
  }
  console.log(`ASINs compared: ${rowsOk + rowsBad}; all 16 columns match: ${rowsOk}; with a difference: ${rowsBad}`);
  for (const [k, v] of colBad) console.log(`  ${k}: ${v} differ`);
  examples.forEach((e) => console.log("  " + e));
  const missing = [...sheetBy.keys()].filter((a) => !report.rows.some((r) => r.asin === a));
  console.log(`ASINs in the sheet but not in the app: ${missing.length}`);
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
