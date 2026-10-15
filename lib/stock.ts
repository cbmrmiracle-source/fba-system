/**
 * Stock-health math, matching FBA Inventory Status > Inventory columns D to T.
 * Column letters in comments refer to that sheet.
 */

export interface StockSettings {
  minDays: number;            // Dashboard!L7
  maxAlertDays: number;       // Dashboard!L8
  maxDays: number;            // Dashboard!L9
  daysToSend: number;         // Dashboard!L10
  daysAhead: number;          // Dashboard!L11
  includeShipmentCreated: boolean; // Dashboard!L13
}

export const DEFAULT_SETTINGS: StockSettings = {
  minDays: 14, maxAlertDays: 24, maxDays: 45, daysToSend: 15, daysAhead: 0, includeShipmentCreated: true,
};

export interface StockInputs {
  available: number;        // E
  reserved: number;         // Total Reserved Quantity (F = reserved + K)
  fcTransfer: number;       // K
  inboundShipped: number;   // G
  inboundReceived: number;  // H
  unfulfillable: number;    // I
  inboundWorking: number;   // J ("Shipment Created")
  errorUnits: number;       // L
  sales7: number;           // M
  sales14: number;          // N
  sales30: number;          // O
  discontinued: boolean;
}

export interface StockResult {
  totalInFba: number;              // D
  sellable: number;                // E
  reservedIncTransfer: number;     // F
  avg30: number;                   // P (a 30-day figure, not per day)
  daysSellable: number | null;     // Q
  daysWithReserved: number | null; // R
  daysWithInbound: number;         // S
  qtyToShip: number | null;        // T (null shows as "-")
}

export function computeStock(i: StockInputs, s: StockSettings = DEFAULT_SETTINGS): StockResult {
  const reservedIncTransfer = i.reserved + i.fcTransfer;
  const totalInFba = i.available + reservedIncTransfer;
  // P: weighted 30-day pace that leans on recent weeks, never below the plain 30-day total.
  const weighted = (i.sales7 * 4 + i.sales14 * 2 + i.sales30) / 3;
  const avg30 = i.discontinued ? 0 : Math.max(i.sales30, weighted);
  const perDay = avg30 / 30;

  const daysSellable = perDay > 0 ? i.available / perDay : null;
  const daysWithReserved = perDay > 0 ? totalInFba / perDay : null;
  const pipeline = totalInFba + i.inboundShipped + i.inboundReceived + i.unfulfillable - i.errorUnits
    + (s.includeShipmentCreated ? i.inboundWorking : 0);
  // The sheet's IFERROR returns "" when there are no sales, and "" - L11 evaluates to -L11.
  const daysWithInbound = (perDay > 0 ? pipeline / perDay : 0) - s.daysAhead;

  let qtyToShip: number | null;
  if (daysWithInbound > s.maxAlertDays) qtyToShip = null;
  else if (daysWithInbound > s.minDays) qtyToShip = perDay * s.daysToSend;
  else qtyToShip = perDay * (s.maxDays - daysWithInbound);

  return { totalInFba, sellable: i.available, reservedIncTransfer, avg30, daysSellable, daysWithReserved,
    daysWithInbound, qtyToShip };
}
