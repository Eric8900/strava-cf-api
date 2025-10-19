import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE; // e.g., https://api.runlock.app

type ParamsShape = { path?: string[] | string };

// robustly coerce to string[]
function toSegments(p: ParamsShape["path"]): string[] {
  if (Array.isArray(p)) return p;
  if (typeof p === "string") return [p];
  return [];
}

// build target URL (handles empty segments and preserves ?query)
function buildTarget(req: NextRequest, segs: string[]): string {
  if (!API_BASE) {
    throw new Error('Missing NEXT_PUBLIC_API_BASE (e.g. "https://api.runlock.app")');
  }
  const encoded = segs.map(encodeURIComponent).join("/");
  const base = encoded ? `${API_BASE}/api/${encoded}` : `${API_BASE}/api`;
  const search = req.nextUrl.search || "";
  return `${base}${search}`;
}

// 307 so the browser preserves method + body on redirect
function r307(to: string) {
  return NextResponse.redirect(to, 307);
}

// --- Handlers (params may be a Promise) ---
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}

export async function OPTIONS(
  req: NextRequest,
  ctx: { params: Promise<ParamsShape> } | { params: ParamsShape }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  return r307(buildTarget(req, toSegments(params.path)));
}