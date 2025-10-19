import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE; // e.g. https://api.runlock.app

function buildTarget(req: NextRequest): string {
  if (!API_BASE) {
    throw new Error('Missing NEXT_PUBLIC_API_BASE (e.g. "https://api.runlock.app")');
  }

  // Example incoming pathname: /api/runlock/payouts or /api/runlock/pool/lock
  const pathname = req.nextUrl.pathname;

  // Remove the /api/runlock/ prefix (or /api/runlock) and split the rest
  const rest = pathname.replace(/^\/api\/runlock\/?/, ""); // "" | "payouts" | "pool/lock" ...
  const encoded = rest
    .split("/")
    .filter(Boolean)
    .map(seg => encodeURIComponent(seg))
    .join("/"); // safely re-encode path segments

  const search = req.nextUrl.search || "";

  // Route 1:1 to the Worker custom domain under /api/...
  //  - /api/runlock           -> `${API_BASE}/api`
  //  - /api/runlock/payouts   -> `${API_BASE}/api/payouts`
  //  - /api/runlock/pool/lock -> `${API_BASE}/api/pool/lock`
  const base = encoded ? `${API_BASE}/api/${encoded}` : `${API_BASE}/api`;
  return `${base}${search}`;
}

// 307 so the browser preserves method + body
function r307(to: string) {
  return NextResponse.redirect(to, 307);
}

export function GET(req: NextRequest)     { return r307(buildTarget(req)); }
export function HEAD(req: NextRequest)    { return r307(buildTarget(req)); }
export function POST(req: NextRequest)    { return r307(buildTarget(req)); }
export function PUT(req: NextRequest)     { return r307(buildTarget(req)); }
export function PATCH(req: NextRequest)   { return r307(buildTarget(req)); }
export function DELETE(req: NextRequest)  { return r307(buildTarget(req)); }
export function OPTIONS(req: NextRequest) { return r307(buildTarget(req)); }
