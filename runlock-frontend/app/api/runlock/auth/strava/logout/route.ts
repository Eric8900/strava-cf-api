// app/api/runlock/auth/logout/route.ts
export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_BASE!;
  return Response.redirect(`${api}/api/auth/logout`, 302);
}