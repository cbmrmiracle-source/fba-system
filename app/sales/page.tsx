import { salesTotals, dailyTotals, unitsByAsin, todayLocal } from "@/lib/queries";
import { int, usd, listing } from "@/lib/format";

export const dynamic = "force-dynamic";

const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};

export default async function SalesPage({ searchParams }: { searchParams: { date?: string; days?: string } }) {
  const asOf = searchParams.date || todayLocal();
  const span = Math.min(Math.max(Number(searchParams.days) || 14, 1), 90);
  const end = addDays(asOf, -1), start = addDays(asOf, -span);
  const [totals, daily, grid] = await Promise.all([salesTotals(asOf), dailyTotals(start, end), unitsByAsin(start, end)]);

  return (
    <>
      <h1>Sales</h1>
      <p className="sub">Daily sales as counted in Sales Central. Windows end yesterday ({end}).</p>
      <div className="tiles">
        {totals.map((t) => (
          <div className="card tile" key={t.label}>
            <div className="k">{t.label}</div><div className="v">{usd(t.sales)}</div>
            <div className="k">{int(t.units)} units</div>
          </div>
        ))}
      </div>
      <form className="controls">
        <label>As of <input type="date" name="date" defaultValue={asOf} /></label>
        <label>Days shown <input type="number" name="days" min={1} max={90} defaultValue={span} /></label>
        <button type="submit">Apply</button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th className="l">Date</th><th>Sales</th><th>Units</th><th className="l">Source</th></tr></thead>
          <tbody>{daily.map((d) => (
            <tr key={d.date}><td className="l">{d.date}</td><td>{usd(d.sales)}</td><td>{int(d.units)}</td>
              <td className="l">{d.source === "all_orders" ? "All Orders" : "Nineyard"}</td></tr>))}
          </tbody>
        </table>
      </div>
      <h1>Units by ASIN</h1>
      <div className="card table-wrap" style={{ padding: 0, maxHeight: 700 }}>
        <table>
          <thead><tr><th className="l">ASIN</th><th className="l">Title</th><th>Total</th>
            {grid.dates.map((d) => <th key={d}>{d.slice(5)}</th>)}</tr></thead>
          <tbody>{grid.rows.map((r) => (
            <tr key={r.asin}>
              <td className="l"><a className="asin" href={listing(r.asin)} target="_blank">{r.asin}</a></td>
              <td className="l title" title={r.title ?? ""}>{r.title}</td><td>{int(r.total)}</td>
              {grid.dates.map((d) => <td key={d}>{r.byDate[d] == null ? "" : int(r.byDate[d])}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
