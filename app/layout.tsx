import "./globals.css";
import Link from "next/link";

export const metadata = { title: "FBA System" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <strong>FBA System</strong>
          <Link href="/stock">Stock health</Link>
          <Link href="/sales">Sales</Link>
          <Link href="/upload">Upload reports</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
