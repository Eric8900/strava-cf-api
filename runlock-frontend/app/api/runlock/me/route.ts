import { NextRequest } from "next/server";
const WORKER = process.env.WORKER_BASE!; // https://runlock.ericchen890.workers.dev

export async function GET(req: NextRequest) {
  // Forward an auth header or a server-stored session instead of relying on browser cookies to workers.dev
  const token = req.cookies.get("runlock_jwt")?.value; // or other server session
  const res = await fetch(`${WORKER}/api/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
}