import { getPool } from "./db";
import { computeStock, StockResult, StockSettings, DEFAULT_SETTINGS } from "./stock";

/** Today's date in the business's time zone, as YYYY-MM-DD. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export async function getSettings(): Promise<StockSettings> {
  const { rows } = await getPool().query("SELECT key, value FROM settings");
  const m = new Map(rows.map((r) => [r.key as string, r.value as string]));
  const n = (k: string, d: number) => (m.has(k) ? Number(m.get(k)) : d);
  return {
    minDays: n("min_days", DEFAULT_SETTINGS.minDays),
    maxAlertDays: n("max_alert_days", DEFAULT_SETTINGS.maxAlertDays),
    maxDays: n("max_days", DEFAULT_SETTINGS.maxDays),
    daysToSend: n("days_to_send", DEFAULT_SETTINGS.daysToSend),
    daysAhead: n("days_ahead", DEFAULT_SETTINGS.daysAhead),
    includeShipmentCreated: (m.get("include_shipment_created") ?? "true") === "true",
  };
}

export interface StockRow extends StockResult {
  asin: string; skus: string; title: string | null; imageUrl: string | null;
  inboundShipped: number; inboundReceived: number; unfulfillable: number; inboundWorking: number;
  errorUnits: number; sales7: number; sales14: number; sales30: number; discontinued: boolean;
}

export interface StockReport { asOf: string; snapshotDate: string | null; salesDays: number; rows: StockRow[]; }

/**
 * One row per ASIN: stock from the latest Inventory Health snapshot on or before asOf,
 * sales from the 7/14/30 days ending the day before asOf (the sheet's TODAY()-1 to TODAY()-30).
 */
export async function stockHealth(asOf: string = todayLocal()): Promise<StockReport> {
  const pool = getPool();
  const settings = await getSettings();
  const snap = await pool.query("SELECT MAX(snapshot_date)::text AS d FROM inventory_daily WHERE snapshot_date <= $1", [asOf]);
  const snapshotDate: string | null = snap.rows[0].d;
  const days = await pool.query(
    "SELECT COUNT(DISTINCT sale_date)::int AS n FROM sales_daily WHERE sale_date BETWEEN $1::date - 30 AND $1::date - 1", [asOf]);
  if (!snapshotDate) return { asOf, snapshotDate, salesDays: days.rows[0].n, rows: [] };

  const { rows } = await pool.query(
    `WITH inv AS (
       SELECT asin, string_agg(sku, ', ' ORDER BY sku) AS skus,
         SUM(available)::int available, SUM(reserved)::int reserved, SUM(fc_transfer)::int fc_transfer,
         SUM(inbound_working)::int inbound_working, SUM(inbound_shipped)::int inbound_shipped,
         SUM(inbound_received)::int inbound_received, SUM(unfulfillable)::int unfulfillable
       FROM inventory_daily WHERE snapshot_date = $1 GROUP BY asin),
     s AS (
       SELECT asin,
         SUM(units) FILTER (WHERE sale_date >= $2::date - 7)  AS s7,
         SUM(units) FILTER (WHERE sale_date >= $2::date - 14) AS s14,
         SUM(units) AS s30
       FROM sales_daily_best WHERE sale_date BETWEEN $2::date - 30 AND $2::date - 1 GROUP BY asin)
     SELECT inv.*, COALESCE(s.s7,0)::float s7, COALESCE(s.s14,0)::float s14, COALESCE(s.s30,0)::float s30,
       (SELECT title FROM products p WHERE p.asin = inv.asin AND title IS NOT NULL ORDER BY sku LIMIT 1) title,
       (SELECT image_url FROM products p WHERE p.asin = inv.asin AND image_url IS NOT NULL LIMIT 1) image_url,
       EXISTS (SELECT 1 FROM product_flags f WHERE f.asin = inv.asin AND f.flag = 'discontinued') discontinued,
       COALESCE((SELECT error_units FROM product_flags f WHERE f.asin = inv.asin AND f.flag = 'error'), 0) error_units
     FROM inv LEFT JOIN s ON s.asin = inv.asin`,
    [snapshotDate, asOf]);

  return {
    asOf, snapshotDate, salesDays: days.rows[0].n,
    rows: rows.map((r) => {
      const inputs = {
        available: r.available, reserved: r.reserved, fcTransfer: r.fc_transfer, inboundShipped: r.inbound_shipped,
        inboundReceived: r.inbound_received, unfulfillable: r.unfulfillable, inboundWorking: r.inbound_working,
        errorUnits: r.error_units, sales7: r.s7, sales14: r.s14, sales30: r.s30, discontinued: r.discontinued,
      };
      return { asin: r.asin, skus: r.skus, title: r.title, imageUrl: r.image_url, ...inputs,
        ...computeStock(inputs, settings) };
    }),
  };
}

export interface SalesTotals { label: string; start: string; end: string; sales: number; units: number; }

/** Dollar tab equivalents, all ending yesterday except the month figures. */
export async function salesTotals(asOf: string = todayLocal()): Promise<SalesTotals[]> {
  const { rows } = await getPool().query(
    `WITH w(label, start_d, end_d, ord) AS (VALUES
       ('Yesterday', $1::date - 1, $1::date - 1, 1),
       ('Last 7 days', $1::date - 7, $1::date - 1, 2),
       ('Last 14 days', $1::date - 14, $1::date - 1, 3),
       ('Last 30 days', $1::date - 30, $1::date - 1, 4),
       ('This month', date_trunc('month', $1::date)::date, $1::date, 5),
       ('Last month', (date_trunc('month', $1::date) - interval '1 month')::date,
                      (date_trunc('month', $1::date) - interval '1 day')::date, 6))
     SELECT w.label, w.start_d::text AS start, w.end_d::text AS "end",
       COALESCE(SUM(s.sales),0)::float sales, COALESCE(SUM(s.units),0)::float units
     FROM w LEFT JOIN sales_daily_best s ON s.sale_date BETWEEN w.start_d AND w.end_d
     GROUP BY w.label, w.start_d, w.end_d, w.ord ORDER BY w.ord`, [asOf]);
  return rows;
}

export interface DailyTotal { date: string; sales: number; units: number; source: string; }

export async function dailyTotals(start: string, end: string): Promise<DailyTotal[]> {
  const { rows } = await getPool().query(
    `SELECT sale_date::text date, SUM(sales)::float sales, SUM(units)::float units, MIN(source) source
     FROM sales_daily_best WHERE sale_date BETWEEN $1 AND $2 GROUP BY sale_date ORDER BY sale_date DESC`, [start, end]);
  return rows;
}

export interface AsinDaily { asin: string; title: string | null; total: number; byDate: Record<string, number>; }

/** Units per ASIN per day, like the Sales Central Sales tab. */
export async function unitsByAsin(start: string, end: string): Promise<{ dates: string[]; rows: AsinDaily[] }> {
  const { rows } = await getPool().query(
    `SELECT s.asin, s.sale_date::text d, s.units::float u,
       (SELECT title FROM products p WHERE p.asin = s.asin AND title IS NOT NULL ORDER BY sku LIMIT 1) title
     FROM sales_daily_best s WHERE s.sale_date BETWEEN $1 AND $2`, [start, end]);
  const dates: string[] = [];
  for (let d = new Date(end + "T00:00:00Z"); d >= new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const by = new Map<string, AsinDaily>();
  for (const r of rows) {
    let a = by.get(r.asin);
    if (!a) { a = { asin: r.asin, title: r.title, total: 0, byDate: {} }; by.set(r.asin, a); }
    a.byDate[r.d] = (a.byDate[r.d] ?? 0) + r.u;
    a.total += r.u;
  }
  return { dates, rows: [...by.values()].sort((x, y) => y.total - x.total) };
}

export async function recentImports(limit = 20) {
  const { rows } = await getPool().query(
    `SELECT report_type, report_date::text, source, row_count, loaded_at FROM report_imports
     ORDER BY loaded_at DESC LIMIT $1`, [limit]);
  return rows;
}
