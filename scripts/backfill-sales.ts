/**
 * One-time load of sales history from the daily sheets linked in Sales Central > Summary.
 * Read-only: uses the spreadsheets.readonly scope and never writes to any sheet.
 *
 * Usage: npm run backfill:sales -- [--from 2024-04-21] [--to 2026-10-14] [--missing-only]
 * Writes backfill-report.csv listing each day's loaded total next to Summary column C.
 */
import { writeFileSync } from "fs";
import { sheetsClient, withQuota, idFromUrl, sleep, SHEETS } from "../lib/google";
import { fromGrid } from "../lib/parse";
import { detectReport, dailySales } from "../lib/reports";
import { loadReport } from "../lib/load";
import { getPool } from "../lib/db";
import { todayLocal } from "../lib/queries";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

function isoDate(mdY: string): string | null {
  const m = mdY.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

async function main() {
  const sheets = sheetsClient();
  const from = arg("--from") ?? "2000-01-01";
  const yesterday = new Date(Date.parse(todayLocal()) - 864e5).toISOString().slice(0, 10);
  const to = arg("--to") ?? yesterday;
  const missingOnly = process.argv.includes("--missing-only");

  const summary = await withQuota(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS.SALES_CENTRAL, range: "Summary!A:C", valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING" }));
  const days = (summary.data.values ?? []).slice(1)
    .map((r) => ({ date: isoDate(String(r[0] ?? "")), url: String(r[1] ?? ""), summaryTotal: Number(r[2]) || 0 }))
    .filter((d): d is { date: string; url: string; summaryTotal: number } => !!d.date && !!idFromUrl(d.url))
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const done = new Set<string>();
  if (missingOnly) {
    const { rows } = await getPool().query("SELECT DISTINCT sale_date::text d FROM sales_daily");
    rows.forEach((r) => done.add(r.d));
  }

  const report = ["date,summary_total,loaded_total,difference,report_type,rows,note"];
  for (const d of days) {
    if (done.has(d.date)) continue;
    const id = idFromUrl(d.url)!;
    try {
      const meta = await withQuota(() => sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties.title" }));
      const tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
      // Prefer the pasted report tab; fall back to every tab until one is recognised.
      const order = [...tabs.filter((t) => t.toLowerCase() === "amz"), ...tabs.filter((t) => t.toLowerCase() !== "amz")];
      let loaded = false;
      for (const tab of order) {
        const res = await withQuota(() => sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'`,
          valueRenderOption: "UNFORMATTED_VALUE" }));
        const table = fromGrid(res.data.values ?? []);
        const type = detectReport(table.headers);
        if (type !== "all_orders" && type !== "nineyard_profit_by_sku") continue;
        await loadReport(type, table, d.url, d.date);
        const total = dailySales(type, table).reduce((s, r) => s + r.sales, 0);
        const diff = Math.round((total - d.summaryTotal) * 100) / 100;
        report.push(`${d.date},${d.summaryTotal},${total.toFixed(2)},${diff},${type},${table.rows.length},${tab}`);
        console.log(`${d.date} ${type} rows=${table.rows.length} total=${total.toFixed(2)} summary=${d.summaryTotal} diff=${diff}`);
        loaded = true;
        break;
      }
      if (!loaded) {
        report.push(`${d.date},${d.summaryTotal},,,,0,no recognised report tab (${tabs.join("|")})`);
        console.log(`${d.date} SKIPPED: no recognised report in tabs ${tabs.join(", ")}`);
      }
    } catch (e) {
      report.push(`${d.date},${d.summaryTotal},,,,0,error: ${(e as Error).message.replace(/,/g, ";")}`);
      console.log(`${d.date} ERROR ${(e as Error).message}`);
    }
    await sleep(1500); // stays under the 60-reads-per-minute Sheets quota
  }
  writeFileSync("backfill-report.csv", report.join("\n") + "\n");
  console.log(`Done. ${report.length - 1} days written to backfill-report.csv`);
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
