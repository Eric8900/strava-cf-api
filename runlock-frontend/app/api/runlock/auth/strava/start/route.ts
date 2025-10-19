// app/api/runlock/auth/strava/start/route.ts
export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_BASE!;
  // 302 to the Worker’s OAuth start endpoint
  return Response.redirect(`${api}/api/auth/strava/start`, 302);
}