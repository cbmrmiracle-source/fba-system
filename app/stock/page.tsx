import { stockHealth, getSettings, todayLocal } from "@/lib/queries";
import { int, listing } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORTS = {
  sellable: { label: "Sellable inventory", key: "daysSellable" },
  fba: { label: "FBA inventory", key: "daysWithReserved" },
  all: { label: "All inventory (incl. inbound)", key: "daysWithInbound" },
} as const;

export default async function StockPage({ searchParams }: { searchParams: { sort?: string; date?: string; q?: string } }) {
  const sort = (searchParams.sort ?? "all") as keyof typeof SORTS;
  const sortKey = (SORTS[sort] ?? SORTS.all).key;
  const asOf = searchParams.date || todayLocal();
  const [report, settings] = await Promise.all([stockHealth(asOf), getSettings()]);
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const rows = report.rows
    .filter((r) => !q || r.asin.toLowerCase().includes(q) || r.skus.toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q))
    .filter((r) => r[sortKey] != null && r.avg30 > 0)
    .sort((a, b) => (a[sortKey] as number) - (b[sortKey] as number));
  const noSales = report.rows.length - report.rows.filter((r) => r.avg30 > 0).length;
  const cls = (d: number | null) => (d == null ? "" : d <= settings.minDays ? "low" : d <= settings.maxAlertDays ? "mid" : "");

  return (
    <>
      <h1>Stock health</h1>
      <p className="sub">
        Stock from the Inventory Health report of {report.snapshotDate ?? "(none uploaded yet)"}; sales from the 30 days
        before {report.asOf} ({report.salesDays} of 30 days loaded). Red is {settings.minDays} days or less, amber
        {" "}{settings.maxAlertDays} or less. {noSales} ASINs with no sales are hidden.
      </p>
      <form className="controls">
        <label>Sort by <select name="sort" defaultValue={sort}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></label>
        <label>As of <input type="date" name="date" defaultValue={asOf} /></label>
        <input name="q" placeholder="ASIN, SKU or title" defaultValue={searchParams.q} />
        <button type="submit">Apply</button>
      </form>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead><tr>
            <th className="l"></th><th className="l">ASIN</th><th className="l">Title</th>
            <th>Total in FBA</th><th>Sellable</th><th>Reserved</th><th>Shipped</th><th>Receiving</th>
            <th>Shipment created</th><th>Errors</th><th>7d</th><th>14d</th><th>30d</th><th>30-day pace</th>
            <th>Days sellable</th><th>Days incl. reserved</th><th>Days incl. inbound</th><th>Qty to ship</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asin}>
                <td className="l">{r.imageUrl && <img className="thumb" src={r.imageUrl} alt="" />}</td>
                <td className="l"><a className="asin" href={listing(r.asin)} target="_blank">{r.asin}</a></td>
                <td className="l title" title={`${r.title ?? ""}\n${r.skus}`}>{r.title ?? r.skus}</td>
                <td>{int(r.totalInFba)}</td><td>{int(r.sellable)}</td><td>{int(r.reservedIncTransfer)}</td>
                <td>{int(r.inboundShipped)}</td><td>{int(r.inboundReceived)}</td><td>{int(r.inboundWorking)}</td>
                <td>{int(r.errorUnits)}</td><td>{int(r.sales7)}</td><td>{int(r.sales14)}</td><td>{int(r.sales30)}</td>
                <td>{int(r.avg30)}</td>
                <td className={cls(r.daysSellable)}>{int(r.daysSellable)}</td>
                <td className={cls(r.daysWithReserved)}>{int(r.daysWithReserved)}</td>
                <td className={cls(r.daysWithInbound)}>{int(r.daysWithInbound)}</td>
                <td>{r.qtyToShip == null ? "-" : int(r.qtyToShip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
