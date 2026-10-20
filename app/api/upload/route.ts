import { NextRequest, NextResponse } from "next/server";
import { parseReportFile } from "@/lib/parse";
import { detectReport, REPORT_SPECS, ReportType } from "@/lib/reports";
import { loadReport } from "@/lib/load";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const date = (form.get("date") as string | null) || undefined;
  // keepRaw=0 stores only per-ASIN daily totals (used when loading history).
  const keepRaw = form.get("keepRaw") !== "0";
  const results: { file: string; ok: boolean; message: string }[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File)) continue;
    try {
      const table = parseReportFile(Buffer.from(await entry.arrayBuffer()));
      const type: ReportType | null = detectReport(table.headers);
      if (!type) {
        results.push({ file: entry.name, ok: false,
          message: "Not a report I recognise. Expected one of: " + Object.values(REPORT_SPECS).map((s) => s.label).join("; ") });
        continue;
      }
      if (type !== "inventory_health" && !date) {
        results.push({ file: entry.name, ok: false, message: "Pick the sales date for this file, then upload again." });
        continue;
      }
      const r = await loadReport(type, table, entry.name, date, { keepRaw });
      results.push({ file: entry.name, ok: true,
        message: `${REPORT_SPECS[type].label}: ${r.rows} rows loaded for ${r.reportDate}` });
    } catch (e) {
      results.push({ file: entry.name, ok: false, message: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
}
