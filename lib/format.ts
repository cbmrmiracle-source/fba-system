export const int = (n: number | null | undefined) => (n == null ? "" : Math.round(n + 1e-9).toLocaleString("en-US"));
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const listing = (asin: string) => `https://www.amazon.com/dp/${asin}`;
