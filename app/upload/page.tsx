import { recentImports } from "@/lib/queries";
import { REPORT_SPECS, ReportType } from "@/lib/reports";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const imports = await recentImports();
  return (
    <>
      <h1>Upload reports</h1>
      <p className="sub">Drop the files you download today. The report type is recognised from its columns.</p>
      <div className="card">
        <ul>
          <li><b>Manage Inventory Health</b> (Seller Central), daily. The date comes from the file.</li>
          <li><b>All Orders</b> (Seller Central, the file you paste into the daily sheet&apos;s amz tab), daily. Pick the sales date.</li>
          <li><b>Nineyard Profit by SKU</b>, daily, if you use it instead. Pick the sales date.</li>
        </ul>
        <UploadForm />
      </div>
      <h1>Recent uploads</h1>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th className="l">Report</th><th className="l">For date</th><th className="l">File</th><th>Rows</th><th className="l">Loaded</th></tr></thead>
          <tbody>{imports.map((i, n) => (
            <tr key={n}><td className="l">{REPORT_SPECS[i.report_type as ReportType]?.label ?? i.report_type}</td>
              <td className="l">{i.report_date}</td><td className="l">{i.source}</td><td>{i.row_count}</td>
              <td className="l">{new Date(i.loaded_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
