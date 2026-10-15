import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (req.cookies.get(AUTH_COOKIE)?.value === (await authToken())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
