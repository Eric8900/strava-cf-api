import { NextRequest, NextResponse } from "next/server";

// Ensure Node.js runtime (so process.env behaves as expected)
export const runtime = "nodejs";
// Avoid any caching on this redirect endpoint
export const dynamic = "force-dynamic";

function getApiBase(): string | null {
  // Prefer NEXT_PUBLIC_API_BASE (what you already use in the client)
  // Fallback to API_BASE if you set a server-only var instead.
  const a = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || "";
  try {
    // Validate it looks like a proper origin
    if (!a) return null;
    const u = new URL(a);
    return u.origin; // strips trailing slashes if any
  } catch {
    return null;
  }
}

function buildTarget(req: NextRequest, apiBase: string): string {
  const pathname = req.nextUrl.pathname;
  // Strip "/api/runlock" prefix (with or without trailing slash)
  const rest = pathname.replace(/^\/api\/runlock\/?/, "");
  const encoded = rest
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const base = encoded ? `${apiBase}/api/${encoded}` : `${apiBase}/api`;
  const search = req.nextUrl.search || "";
  return `${base}${search}`;
}

function redirect307(to: string) {
  return NextResponse.redirect(to, 307); // preserves method + body
}

function error500(message: string) {
  return new NextResponse(message, { status: 500, headers: { "Content-Type": "text/plain" } });
}

export function GET(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE (e.g. "https://api.runlock.app").');
  return redirect307(buildTarget(req, apiBase));
}
export function HEAD(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}
export function POST(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}
export function PUT(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}
export function PATCH(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}
export function DELETE(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}
export function OPTIONS(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) return error500('Server missing API base. Set NEXT_PUBLIC_API_BASE.');
  return redirect307(buildTarget(req, apiBase));
}