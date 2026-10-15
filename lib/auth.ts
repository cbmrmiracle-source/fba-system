/** The login cookie holds a SHA-256 of APP_PASSWORD, so the password itself is never stored in the browser. */
export const AUTH_COOKIE = "fba_auth";

export async function authToken(): Promise<string> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("APP_PASSWORD is not set");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fba-system:${pw}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
