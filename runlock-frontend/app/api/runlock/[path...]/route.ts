// app/api/runlock/[...path]/route.ts
import { NextRequest } from "next/server";

/**
 * Redirects ANY /api/runlock/<...> request to the Worker custom domain,
 * preserving method & body via 307/308 semantics.
 *
 * Example:
 *   /api/runlock/me                 -> https://api.runlock.app/api/me
 *   /api/runlock/payouts?limit=10   -> https://api.runlock.app/api/payouts?limit=10
 *   /api/runlock/pool/lock          -> https://api.runlock.app/api/pool/lock
 *   /api/runlock/auth/strava/start  -> https://api.runlock.app/api/auth/strava/start
 */
function targetUrl(req: NextRequest, pathParam?: string[]): string {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  if (!apiBase) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE env var (e.g. https://api.runlock.app)");
  }
  const rest = (pathParam ?? []).join("/"); // e.g. "me" or "payouts"
  const url = new URL(req.nextUrl);
  const search = url.search || "";
  return `${apiBase}/api/${rest}${search}`;
}

// 307 keeps the original method + body on redirect
function redirect307(to: string) {
  return Response.redirect(to, 307);
}

export function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}
export function HEAD(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}
export function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}
export function PUT(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}
export function PATCH(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}
export function DELETE(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}

// If the browser preflights the final URL, it'll do it *after* following this redirect.
// We still return a redirect here to be consistent.
export function OPTIONS(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return redirect307(targetUrl(req, params.path));
}