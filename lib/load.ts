import { PoolClient } from "pg";
import { withTransaction } from "./db";
import { Table } from "./parse";
import { ReportType, inventoryRows, dailySales, missingColumns } from "./reports";

export interface LoadResult { importId: number; reportType: ReportType; reportDate: string; rows: number; }

/**
 * Loads one report for one date. Re-loading the same report type and date replaces it.
 * For inventory_health the date comes from the file's snapshot-date; for sales reports it must be given.
 */
export async function loadReport(type: ReportType, table: Table, source: string, date?: string): Promise<LoadResult> {
  const missing = missingColumns(type, table.headers);
  if (missing.length) throw new Error(`File is missing column(s): ${missing.join(", ")}`);

  let reportDate = date;
  const inv = type === "inventory_health" ? inventoryRows(table) : [];
  if (type === "inventory_health") {
    const dates = new Set(inv.map((r) => r.snapshotDate));
    if (dates.size !== 1) throw new Error(`Expected one snapshot-date in the file, found ${dates.size}`);
    reportDate = [...dates][0];
  }
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("A report date (YYYY-MM-DD) is required");

  return withTransaction(async (c) => {
    await c.query("DELETE FROM report_imports WHERE report_type = $1 AND report_date = $2", [type, reportDate]);
    const { rows } = await c.query(
      "INSERT INTO report_imports (report_type, report_date, source, row_count) VALUES ($1,$2,$3,$4) RETURNING id",
      [type, reportDate, source, table.rows.length]);
    const importId = Number(rows[0].id);
    await insertRaw(c, importId, table);

    if (type === "inventory_health") {
      await c.query("DELETE FROM inventory_daily WHERE snapshot_date = $1", [reportDate]);
      await c.query(
        `INSERT INTO inventory_daily (snapshot_date, sku, asin, available, reserved, fc_transfer, inbound_working,
           inbound_shipped, inbound_received, unfulfillable, days_of_supply)
         SELECT $1::date, * FROM unnest($2::text[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[],
           $9::int[], $10::int[], $11::numeric[])
         ON CONFLICT (snapshot_date, sku) DO UPDATE SET asin = EXCLUDED.asin, available = EXCLUDED.available,
           reserved = EXCLUDED.reserved, fc_transfer = EXCLUDED.fc_transfer, inbound_working = EXCLUDED.inbound_working,
           inbound_shipped = EXCLUDED.inbound_shipped, inbound_received = EXCLUDED.inbound_received,
           unfulfillable = EXCLUDED.unfulfillable, days_of_supply = EXCLUDED.days_of_supply`,
        [reportDate, inv.map((r) => r.sku), inv.map((r) => r.asin), inv.map((r) => r.available),
          inv.map((r) => r.reserved), inv.map((r) => r.fcTransfer), inv.map((r) => r.inboundWorking),
          inv.map((r) => r.inboundShipped), inv.map((r) => r.inboundReceived), inv.map((r) => r.unfulfillable),
          inv.map((r) => r.daysOfSupply)]);
      await c.query(
        `INSERT INTO products (sku, asin, fnsku, title)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
         ON CONFLICT (sku) DO UPDATE SET asin = EXCLUDED.asin, fnsku = COALESCE(NULLIF(EXCLUDED.fnsku, ''), products.fnsku),
           title = COALESCE(NULLIF(EXCLUDED.title, ''), products.title), updated_at = now()`,
        [inv.map((r) => r.sku), inv.map((r) => r.asin), inv.map((r) => r.fnsku), inv.map((r) => r.title)]);
    } else {
      const sales = dailySales(type, table);
      await c.query("DELETE FROM sales_daily WHERE sale_date = $1 AND source = $2", [reportDate, type]);
      await c.query(
        `INSERT INTO sales_daily (sale_date, asin, source, units, sales, orders)
         SELECT $1::date, a, $2, u, s, o FROM unnest($3::text[], $4::numeric[], $5::numeric[], $6::int[]) AS t(a, u, s, o)`,
        [reportDate, type, sales.map((r) => r.asin), sales.map((r) => r.units), sales.map((r) => r.sales),
          sales.map((r) => r.orders)]);
    }
    return { importId, reportType: type, reportDate: reportDate!, rows: table.rows.length };
  });
}

// Buyer address and identity columns are not kept: the system has no use for them.
const DROP_RAW = /^(ship-(city|state|postal-code|country)|buyer-|recipient-)/i;

async function insertRaw(c: PoolClient, importId: number, t: Table) {
  const BATCH = 2000;
  const keep = t.headers.map((h, j) => [h, j] as const).filter(([h]) => h && !DROP_RAW.test(h));
  for (let i = 0; i < t.rows.length; i += BATCH) {
    const slice = t.rows.slice(i, i + BATCH);
    const json = slice.map((r) => JSON.stringify(Object.fromEntries(keep.map(([h, j]) => [h, r[j] ?? ""]))));
    await c.query(
      `INSERT INTO report_rows (import_id, row_num, data)
       SELECT $1, n, d::jsonb FROM unnest($2::int[], $3::text[]) AS t(n, d)`,
      [importId, slice.map((_, k) => i + k + 1), json]);
  }
}
