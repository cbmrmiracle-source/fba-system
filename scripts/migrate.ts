import { readdirSync, readFileSync } from "fs";
import path from "path";
import { getPool } from "../lib/db";

async function main() {
  // Runs during the Netlify build too; skip quietly where no database is configured.
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set, skipping migrations");
    return;
  }
  const dir = path.join(__dirname, "..", "db");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await getPool().query(readFileSync(path.join(dir, f), "utf8"));
    console.log(`applied ${f}`);
  }
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
