import { describe, it, expect } from "vitest";
import { computeStock, StockInputs } from "../lib/stock";

// Rows copied from FBA Inventory Status > Inventory on 2026-10-15 (displayed values are rounded).
const base: StockInputs = {
  available: 0, reserved: 0, fcTransfer: 0, inboundShipped: 0, inboundReceived: 0, unfulfillable: 0,
  inboundWorking: 0, errorUnits: 0, sales7: 0, sales14: 0, sales30: 0, discontinued: false,
};

describe("computeStock matches the Inventory sheet", () => {
  it("B005SX9Y4C: days 21 / 24 / 24, ship 105", () => {
    const r = computeStock({ ...base, available: 148, reserved: 11, fcTransfer: 7, inboundShipped: 1860,
      errorUnits: 1860, sales7: 51, sales14: 92, sales30: 209 });
    expect(r.totalInFba).toBe(166);
    expect(r.avg30).toBe(209);
    expect(Math.round(r.daysSellable!)).toBe(21);
    expect(Math.round(r.daysWithReserved!)).toBe(24);
    expect(Math.round(r.daysWithInbound)).toBe(24);
    expect(Math.round(r.qtyToShip!)).toBe(105);
  });

  it("B071NGT9MP: days 41 / 47 / 47, nothing to ship", () => {
    const r = computeStock({ ...base, available: 81, reserved: 7, fcTransfer: 5, inboundReceived: 1,
      inboundWorking: 850, errorUnits: 850, sales7: 9, sales14: 30, sales30: 60 });
    expect(r.totalInFba).toBe(93);
    expect(r.avg30).toBe(60);
    expect(Math.round(r.daysSellable!)).toBe(41);
    expect(Math.round(r.daysWithReserved!)).toBe(47);
    expect(Math.round(r.daysWithInbound)).toBe(47);
    expect(r.qtyToShip).toBeNull();
  });

  it("B00A3ZIL1C: no sales gives blank days and 0 to ship", () => {
    const r = computeStock({ ...base, reserved: 1, unfulfillable: 2 });
    expect(r.totalInFba).toBe(1);
    expect(r.daysSellable).toBeNull();
    expect(r.daysWithReserved).toBeNull();
    expect(r.daysWithInbound).toBe(0);
    expect(r.qtyToShip).toBe(0);
  });

  it("uses the weighted pace when recent weeks run hot", () => {
    const r = computeStock({ ...base, available: 100, sales7: 70, sales14: 100, sales30: 150 });
    expect(r.avg30).toBeCloseTo((280 + 200 + 150) / 3);
  });

  it("discontinued ASINs get zero pace", () => {
    const r = computeStock({ ...base, available: 100, sales30: 90, discontinued: true });
    expect(r.avg30).toBe(0);
  });
});
