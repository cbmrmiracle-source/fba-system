import { Pool, PoolClient } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: normalizeUrl(process.env.DATABASE_URL), max: 5 });
  }
  return pool;
}

// Supabase passwords can contain "/" or other characters that break URL parsing
// when pasted unencoded; percent-encode the password if the URL doesn't parse.
export function normalizeUrl(url: string): string {
  try {
    new URL(url);
    return url;
  } catch {
    const m = url.match(/^([a-z]+:\/\/[^:@\/]+:)(.*)@([^@]+)$/i);
    if (!m) return url;
    return m[1] + encodeURIComponent(decodeURIComponentSafe(m[2])) + "@" + m[3];
  }
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
