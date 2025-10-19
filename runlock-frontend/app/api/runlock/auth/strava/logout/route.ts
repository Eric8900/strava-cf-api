// app/api/runlock/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url)); // redirect home (or /login)
  res.cookies.set("runlock_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // expire immediately
  });

  return res;
}