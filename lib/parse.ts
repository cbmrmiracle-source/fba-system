import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface Table {
  headers: string[];
  rows: string[][];
}

/** Reads a Seller Central .txt (tab-separated), a .csv, or an Excel file into headers + rows. */
export function parseReportFile(buf: Buffer): Table {
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b; // .xlsx
  const isOle = buf.length > 3 && buf[0] === 0xd0 && buf[1] === 0xcf; // .xls
  let grid: string[][];
  if (isZip || isOle) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  } else {
    let text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.split(/\r?\n/, 1)[0];
    const delimiter = firstLine.includes("\t") ? "\t" : ",";
    grid = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data;
  }
  return fromGrid(grid);
}

export function fromGrid(grid: unknown[][]): Table {
  const clean = grid.map((r) => r.map((c) => (c == null ? "" : String(c))));
  const [headers = [], ...rows] = clean;
  return {
    headers: headers.map((h) => h.trim()),
    rows: rows.filter((r) => r.some((c) => c.trim() !== "")),
  };
}

/** Number from a report cell: blanks, "$1,234.50" and "#N/A" handled. */
export function num(v: string | undefined): number {
  if (v == null) return 0;
  const s = v.replace(/[$,\s]/g, "");
  if (s === "" || s.startsWith("#")) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
