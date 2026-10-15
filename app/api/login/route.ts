import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  if (form.get("password") !== process.env.APP_PASSWORD) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  const res = NextResponse.redirect(new URL("/stock", req.url), 303);
  res.cookies.set(AUTH_COOKIE, await authToken(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
