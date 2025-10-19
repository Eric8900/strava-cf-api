import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.nextUrl);
  const token = url.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  // Set first-party cookie on your app domain, HttpOnly
  const res = NextResponse.redirect(new URL("/", req.url), 302);
  res.cookies.set("runlock_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}