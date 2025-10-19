import { NextRequest, NextResponse } from "next/server";

// Use Node runtime for predictable env & stream handling
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read and validate the upstream base once
function getWorkerBase(): string | null {
  const raw = process.env.WORKER_BASE || "";
  if (!raw) return null;
  try {
    const u = new URL(raw);         // validates it's a URL
    return u.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// Only pass through safe headers to the client
function passThroughHeaders(h: Headers): HeadersInit {
  const out: Record<string, string> = {};
  const allow = new Set([
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    // add others you really need; avoid set-cookie/content-length/transfer-encoding
  ]);
  for (const [k, v] of h.entries()) {
    if (allow.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const base = getWorkerBase();
  if (!base) {
    return new NextResponse(
      'Server misconfigured: set WORKER_BASE (e.g. "https://api.runlock.app" or your workers.dev URL).',
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  // If you’re doing header auth, pick it up from a first-party cookie (or session)
  const token = req.cookies.get("runlock_jwt")?.value;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/me`, {
      method: "GET",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    return new NextResponse(
      "Upstream fetch failed (cannot reach Worker). Check WORKER_BASE and network.",
      { status: 502, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Stream the body through, but with sanitized headers
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: passThroughHeaders(upstream.headers),
  });
}
