// Usage: npm run import -- <file> [YYYY-MM-DD]
import { readFileSync } from "fs";
import path from "path";
import { parseReportFile, fromGrid } from "../lib/parse";
import { detectReport } from "../lib/reports";
import { loadReport } from "../lib/load";
import { getPool } from "../lib/db";

async function main() {
  const [file, date] = process.argv.slice(2);
  if (!file) throw new Error("Usage: npm run import -- <file> [YYYY-MM-DD]");
  // A .json file is a Sheets API values response ({"values": [[...], ...]}).
  const table = file.endsWith(".json")
    ? fromGrid(JSON.parse(readFileSync(file, "utf8")).values ?? [])
    : parseReportFile(readFileSync(file));
  const type = detectReport(table.headers);
  if (!type) throw new Error(`Unrecognised report. Headers: ${table.headers.slice(0, 12).join(", ")}...`);
  const r = await loadReport(type, table, path.basename(file), date);
  console.log(`${r.reportType}: ${r.rows} rows for ${r.reportDate}`);
  await getPool().end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
