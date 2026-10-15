import { Table, num } from "./parse";

export type ReportType = "inventory_health" | "all_orders" | "nineyard_profit_by_sku";

interface Spec {
  label: string;
  required: string[];
}

export const REPORT_SPECS: Record<ReportType, Spec> = {
  inventory_health: {
    label: "Seller Central: Manage Inventory Health",
    required: ["snapshot-date", "sku", "asin", "available", "Total Reserved Quantity", "fc-transfer",
      "inbound-working", "inbound-shipped", "inbound-received", "unfulfillable-quantity"],
  },
  all_orders: {
    label: "Seller Central: All Orders (daily sales sheet 'amz' tab)",
    required: ["amazon-order-id", "asin", "quantity", "item-price"],
  },
  nineyard_profit_by_sku: {
    label: "Nineyard: Profit by SKU",
    required: ["Asin", "QtySold", "Sales", "Marketplace"],
  },
};

const norm = (h: string) => h.trim().toLowerCase();

export class ColumnIndex {
  private map = new Map<string, number>();
  constructor(headers: string[]) {
    headers.forEach((h, i) => { if (!this.map.has(norm(h))) this.map.set(norm(h), i); });
  }
  has(name: string) { return this.map.has(norm(name)); }
  get(row: string[], name: string): string {
    const i = this.map.get(norm(name));
    return i == null ? "" : (row[i] ?? "").trim();
  }
}

/** Works out which report a file is from its header row. */
export function detectReport(headers: string[]): ReportType | null {
  const idx = new ColumnIndex(headers);
  for (const [type, spec] of Object.entries(REPORT_SPECS) as [ReportType, Spec][]) {
    if (spec.required.every((c) => idx.has(c))) return type;
  }
  return null;
}

/** Names the required columns a file is missing for a given report type. */
export function missingColumns(type: ReportType, headers: string[]): string[] {
  const idx = new ColumnIndex(headers);
  return REPORT_SPECS[type].required.filter((c) => !idx.has(c));
}

export interface InventoryRow {
  snapshotDate: string; sku: string; asin: string; fnsku: string; title: string;
  available: number; reserved: number; fcTransfer: number; inboundWorking: number;
  inboundShipped: number; inboundReceived: number; unfulfillable: number; daysOfSupply: number | null;
}

export function inventoryRows(t: Table): InventoryRow[] {
  const c = new ColumnIndex(t.headers);
  return t.rows
    .filter((r) => c.get(r, "sku") && c.get(r, "asin"))
    .map((r) => ({
      snapshotDate: c.get(r, "snapshot-date").slice(0, 10),
      sku: c.get(r, "sku"),
      asin: c.get(r, "asin"),
      fnsku: c.get(r, "fnsku"),
      title: c.get(r, "product-name"),
      available: num(c.get(r, "available")),
      reserved: num(c.get(r, "Total Reserved Quantity")),
      fcTransfer: num(c.get(r, "fc-transfer")),
      inboundWorking: num(c.get(r, "inbound-working")),
      inboundShipped: num(c.get(r, "inbound-shipped")),
      inboundReceived: num(c.get(r, "inbound-received")),
      unfulfillable: num(c.get(r, "unfulfillable-quantity")),
      daysOfSupply: c.get(r, "days-of-supply") === "" ? null : num(c.get(r, "days-of-supply")),
    }));
}

export interface DailySalesRow { asin: string; units: number; sales: number; orders: number; }

/**
 * Per-ASIN totals for one day, counted the way the daily sheets do today:
 * All Orders: units = SUMIF(asin, quantity) over every row; sales = sum of item-price over every row
 *   (Sales Central Summary column C). Orders = distinct order ids with quantity > 0.
 * Nineyard Profit by SKU: units = QtySold summed per ASIN; sales = Sales where Marketplace is Amazon.
 */
export function dailySales(type: "all_orders" | "nineyard_profit_by_sku", t: Table): DailySalesRow[] {
  const c = new ColumnIndex(t.headers);
  const by = new Map<string, { units: number; sales: number; orders: Set<string> }>();
  const bucket = (asin: string) => {
    let b = by.get(asin);
    if (!b) { b = { units: 0, sales: 0, orders: new Set() }; by.set(asin, b); }
    return b;
  };
  for (const r of t.rows) {
    if (type === "all_orders") {
      const asin = c.get(r, "asin");
      if (!asin) continue;
      const b = bucket(asin);
      const q = num(c.get(r, "quantity"));
      b.units += q;
      b.sales += num(c.get(r, "item-price"));
      if (q > 0) b.orders.add(c.get(r, "amazon-order-id"));
    } else {
      const asin = c.get(r, "Asin");
      if (!asin) continue;
      const b = bucket(asin);
      b.units += num(c.get(r, "QtySold"));
      if (c.get(r, "Marketplace") === "Amazon") b.sales += num(c.get(r, "Sales"));
      const orders = num(c.get(r, "Orders"));
      for (let i = 0; i < orders; i++) b.orders.add(`${c.get(r, "Sku")}#${i}`);
    }
  }
  return [...by.entries()].map(([asin, b]) => ({
    asin, units: b.units, sales: Math.round(b.sales * 100) / 100, orders: b.orders.size,
  }));
}
