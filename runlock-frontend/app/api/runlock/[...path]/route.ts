import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_BASE = process.env.WORKER_BASE; // e.g. https://runlock.ericchen890.workers.dev OR https://api.runlock.app

function buildUpstreamUrl(req: NextRequest): string {
  if (!WORKER_BASE) throw new Error("WORKER_BASE not set");
  const url = new URL(req.nextUrl);
  const rest = url.pathname.replace(/^\/api\/runlock\/?/, ""); // e.g. me, payouts, pool/lock
  const base = rest ? `${WORKER_BASE.replace(/\/+$/, "")}/api/${rest}` : `${WORKER_BASE.replace(/\/+$/, "")}/api`;
  return `${base}${url.search}`;
}

// Only forward safe headers; set content-type as needed
function forwardRequestHeaders(req: NextRequest): HeadersInit {
  const out: Record<string, string> = {};
  const h = req.headers;
  // Copy content-type if present
  const ct = h.get("content-type");
  if (ct) out["content-type"] = ct;
  // You can pass through additional headers if you need them.
  return out;
}

function passThroughResponseHeaders(h: Headers): HeadersInit {
  const out: Record<string, string> = {};
  // whitelist safe headers; do NOT forward set-cookie/content-length/transfer-encoding
  for (const [k, v] of h.entries()) {
    const kl = k.toLowerCase();
    if (kl === "content-type" || kl === "cache-control" || kl === "etag" || kl === "last-modified") {
      out[k] = v;
    }
  }
  return out;
}

async function proxy(req: NextRequest) {
  // 1) Build upstream URL
  let upstreamUrl: string;
  try {
    upstreamUrl = buildUpstreamUrl(req);
  } catch {
    return new NextResponse("Server missing WORKER_BASE", { status: 500 });
  }

  // 2) Read bearer token from a first-party cookie on your app domain
  const token = req.cookies.get("runlock_token")?.value; // set this in auth/finish route below

  // 3) Build init with method/body/headers
  const init: RequestInit = {
    method: req.method,
    headers: forwardRequestHeaders(req),
    cache: "no-store",
  };

  // Add Authorization if present
  if (token) {
    (init.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // Body for methods that can have one
  if (!["GET", "HEAD"].includes(req.method)) {
    // Stream or buffer; here we buffer to keep it simple
    const body = await req.arrayBuffer();
    init.body = body;
  }

  // 4) Fetch upstream
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }

  // 5) Stream back response with sanitized headers
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: passThroughResponseHeaders(upstream.headers),
  });
}

// Bind all methods
export async function GET(req: NextRequest)     { return proxy(req); }
export async function HEAD(req: NextRequest)    { return proxy(req); }
export async function POST(req: NextRequest)    { return proxy(req); }
export async function PUT(req: NextRequest)     { return proxy(req); }
export async function PATCH(req: NextRequest)   { return proxy(req); }
export async function DELETE(req: NextRequest)  { return proxy(req); }
export async function OPTIONS(req: NextRequest) { return proxy(req); }