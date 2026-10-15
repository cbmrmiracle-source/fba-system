import { google, sheets_v4 } from "googleapis";

/** Read-only Sheets client. The service account only ever gets the readonly scope. */
export function sheetsClient(): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the Sheets API, waiting and retrying when the per-minute read quota is hit. */
export async function withQuota<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code ?? e?.response?.status;
      if ((code === 429 || code >= 500) && i < tries) { await sleep(15000 * (i + 1)); continue; }
      throw e;
    }
  }
}

export const idFromUrl = (url: string) => url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;

export const SHEETS = {
  MAIN: "1BH9t7rfL4aBcBentSf-LOt8sB524bfYVNMbWiGxZJs0",
  SALES_CENTRAL: "1JF_9QvO9FxxCbZFJlikbKrVt2xfEDoQ2QZQjdUX3TCg",
  FBA_INVENTORY_STATUS: "1blOnL5xBJn2-0kSkRMeK_ydDWGybctdzqc_w4wEzYmQ",
};
