// src/index.ts
export interface Env {
	DB: D1Database;
	FLAGS: KVNamespace;
	STRAVA_CLIENT_ID: string;
	STRAVA_CLIENT_SECRET: string;
	STRAVA_WEBHOOK_VERIFY_TOKEN: string;
	APP_BASE_URL: string;
	MY_DURABLE_OBJECT: DurableObjectNamespace;
}

const STRAVA_BASE = "https://www.strava.com/api/v3";

// ---------- Types ----------
interface DbPayoutRow { id: string; activity_id: string; cents: number }

type Json = Record<string, unknown>;

interface StravaTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_at: number; // epoch seconds
	athlete: { id: number };
}

type StravaAspectType = "create" | "update" | "delete";
type StravaObjectType = "activity" | "athlete";

interface StravaWebhookEvent {
	object_type: StravaObjectType;
	aspect_type: StravaAspectType;
	owner_id: number;
	object_id: number;
}

interface StravaActivity {
	id: number | string;
	type?: string;          // "Run", "Ride", etc.
	distance?: number;      // meters
	moving_time?: number;   // seconds
}

interface DbUserId { id: string }
interface DbPoolRow { cents_locked: number; emergency_unlocks_used: number }
interface DbTokenRow { access_token: string }

// Request bodies
interface LockBody { cents: number }
interface EmergencyUnlockBody { cents: number }

// ---------- Utilities ----------
const toPosInt = (v: string | null, def: number, max: number) => {
	const n = v ? Number(v) : def;
	return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
};

// Replace your SubRow interfaces/guards with these:

type SubRow = {
	id: number;
	callback_url?: string;
	created_at?: number; // epoch seconds if we can parse, otherwise undefined
};

type SubRowRaw = Record<string, unknown>;

function normalizeSubRow(u: SubRowRaw): SubRow | null {
	const id = typeof u.id === "number" ? u.id : null;
	if (!id) return null;
	const callback_url =
		typeof u.callback_url === "string" ? u.callback_url : undefined;

	// created_at may be string ISO or number; normalize to epoch seconds if possible
	let created_at: number | undefined = undefined;
	if (typeof u.created_at === "number" && Number.isFinite(u.created_at)) {
		created_at = u.created_at;
	} else if (typeof u.created_at === "string") {
		const t = Date.parse(u.created_at);
		if (Number.isFinite(t)) created_at = Math.floor(t / 1000);
	}

	return { id, callback_url, created_at };
}

function isArrayOfObjects(a: unknown): a is SubRowRaw[] {
	return Array.isArray(a) && a.every(v => !!v && typeof v === "object");
}

async function listSubscriptions(env: Env): Promise<SubRow[]> {
	const url = new URL("https://www.strava.com/api/v3/push_subscriptions");
	url.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
	url.searchParams.set("client_secret", env.STRAVA_CLIENT_SECRET);

	const r = await fetch(url.toString(), { method: "GET" });
	if (!r.ok) throw new Error(`List subs failed: ${r.status} ${await r.text()}`);

	const js = (await r.json().catch(() => undefined)) as unknown;

	// Strava returns an array; be tolerant.
	if (!isArrayOfObjects(js)) {
		throw new Error("Unexpected list subs payload");
	}
	const out = js.map(normalizeSubRow).filter(Boolean) as SubRow[];
	return out;
}

async function createSubscription(env: Env): Promise<SubRow> {
	const callbackUrl = `${env.APP_BASE_URL}/api/strava/webhook`;
	const r = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.STRAVA_CLIENT_ID,
			client_secret: env.STRAVA_CLIENT_SECRET,
			callback_url: callbackUrl,
			verify_token: env.STRAVA_WEBHOOK_VERIFY_TOKEN
		})
	});
	if (!r.ok) throw new Error(`Create sub failed: ${r.status} ${await r.text()}`);

	const js = (await r.json().catch(() => undefined)) as unknown;

	// Accept either {id} or a fuller object
	if (js && typeof js === "object" && typeof (js as any).id === "number") {
		return normalizeSubRow(js as SubRowRaw) as SubRow;
	}
	// Some older responses were `{ id: 123 }`
	const id = Number((js as any)?.id);
	if (Number.isFinite(id)) return { id };

	throw new Error("Unexpected create sub payload");
}

interface DbTokenFull { access_token: string; refresh_token: string; expires_at: number }

async function refreshStravaAccessToken(env: Env, userId: string, refreshToken: string) {
	const r = await fetch("https://www.strava.com/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.STRAVA_CLIENT_ID,
			client_secret: env.STRAVA_CLIENT_SECRET,
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		})
	});
	if (!r.ok) throw new Error(`Refresh failed: ${r.status} ${await r.text()}`);
	const js = (await r.json().catch(() => undefined)) as unknown;
	if (!isStravaTokenResponse(js)) throw new Error("Unexpected refresh payload");
	// Persist
	await env.DB.prepare(
		"UPDATE strava_tokens SET access_token=?, refresh_token=?, expires_at=? WHERE user_id=?"
	).bind(js.access_token, js.refresh_token, js.expires_at, userId).run();
	return { access_token: js.access_token, refresh_token: js.refresh_token, expires_at: js.expires_at };
}

async function getValidAccessToken(env: Env, userId: string): Promise<DbTokenFull | null> {
	const tok = await env.DB
		.prepare("SELECT access_token, refresh_token, expires_at FROM strava_tokens WHERE user_id=?")
		.bind(userId)
		.first<DbTokenFull | null>();
	if (!tok) return null;
	const now = Math.floor(Date.now() / 1000);
	// Refresh a minute before expiry for safety
	if (tok.expires_at <= now + 60) {
		try {
			const nt = await refreshStravaAccessToken(env, userId, tok.refresh_token);
			return nt;
		} catch (e) {
			console.error("token pre-refresh failed", e);
			return tok; // best effort, will likely 401 and we’ll retry once
		}
	}
	return tok;
}

async function deleteSubscription(env: Env, id: number): Promise<void> {
	const r = await fetch(`https://www.strava.com/api/v3/push_subscriptions/${id}`, {
		method: "DELETE",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.STRAVA_CLIENT_ID,
			client_secret: env.STRAVA_CLIENT_SECRET
		})
	});
	if (!r.ok) throw new Error(`Delete sub failed: ${r.status} ${await r.text()}`);
}

async function verifyStravaSignature(req: Request, clientSecret: string): Promise<{ ok: boolean; raw: string }> {
	const raw = await req.text(); // raw body as string
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(clientSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"]
	);
	const sigHeader = req.headers.get("X-Strava-Signature") || "";
	// Strava sends hex digest
	const signatureBytes = Uint8Array.from(sigHeader.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) ?? []);
	const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
	const macBytes = new Uint8Array(mac);

	// constant-time compare
	if (signatureBytes.length !== macBytes.length) return { ok: false, raw };
	let diff = 0;
	for (let i = 0; i < signatureBytes.length; i++) diff |= signatureBytes[i] ^ macBytes[i];
	return { ok: diff === 0, raw };
}

/**
 * Ensure exactly one subscription exists for our callback_url.
 * Stores the chosen subscription id in KV to avoid repeating work.
 */
async function ensureStravaWebhookSubscription(env: Env): Promise<void> {
	const kvKey = "strava:webhook:sub_id";
	const desiredCallback = `${env.APP_BASE_URL}/api/strava/webhook`;

	try {
		const subs = await listSubscriptions(env);

		// Prefer exact callback match if available
		const existing = subs.find(s => s.callback_url === desiredCallback);
		if (existing) {
			const cached = await env.FLAGS.get(kvKey);
			if (cached !== String(existing.id)) {
				await env.FLAGS.put(kvKey, String(existing.id));
			}
			return;
		}

		// If we didn't find a match, create one (each app may have only one subscription)
		const created = await createSubscription(env);
		await env.FLAGS.put(kvKey, String(created.id));

		// Optionally: delete non-matching legacy subs
		// for (const s of subs) await deleteSubscription(env, s.id);

	} catch (e) {
		console.error("ensureStravaWebhookSubscription error:", e);
	}
}

function getUidFromCookie(cookie: string | null): string | null {
	const m = cookie?.match(/uid=([a-z0-9-]+)/i);
	return m ? m[1] : null;
}

async function readJson<T>(
	req: Request,
	validate: (u: unknown) => u is T
): Promise<T> {
	const raw = (await req.json().catch(() => undefined)) as unknown;
	if (!validate(raw)) throw new Response("Bad JSON", { status: 400 });
	return raw;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isLockBody = (u: unknown): u is LockBody =>
	!!u && typeof u === "object" && isNumber((u as Json).cents);

const isEmergencyUnlockBody = (u: unknown): u is EmergencyUnlockBody =>
	!!u && typeof u === "object" && isNumber((u as Json).cents);

const isStravaTokenResponse = (u: unknown): u is StravaTokenResponse => {
	if (!u || typeof u !== "object") return false;
	const j = u as Json;
	return (
		typeof j.access_token === "string" &&
		typeof j.refresh_token === "string" &&
		isNumber(j.expires_at) &&
		!!j.athlete &&
		typeof (j.athlete as Json).id === "number"
	);
};

const isStravaEvent = (u: unknown): u is StravaWebhookEvent => {
	if (!u || typeof u !== "object") return false;
	const j = u as Json;
	return (
		(j.object_type === "activity" || j.object_type === "athlete") &&
		(j.aspect_type === "create" || j.aspect_type === "update" || j.aspect_type === "delete") &&
		isNumber(j.owner_id) &&
		isNumber(j.object_id)
	);
};

const isStravaActivity = (u: unknown): u is StravaActivity => {
	if (!u || typeof u !== "object") return false;
	const j = u as Json;
	const idOk = typeof j.id === "string" || isNumber(j.id);
	const distOk = j.distance === undefined || isNumber(j.distance);
	const timeOk = j.moving_time === undefined || isNumber(j.moving_time);
	const typeOk = j.type === undefined || typeof j.type === "string";
	return idOk && distOk && timeOk && typeOk;
};

function dollars(cents: number): string {
	return (cents / 100).toFixed(2);
}

const ALLOWED_ORIGINS = new Set([
	"http://localhost:3000",
	"https://your-frontend-domain.com", // add prod UI origin
]);

function getCorsHeaders(req: Request) {
	const origin = req.headers.get("Origin") ?? "";
	if (!ALLOWED_ORIGINS.has(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Vary": "Origin",
	};
}

function preflight(req: Request) {
	const cors = getCorsHeaders(req);
	if (!cors["Access-Control-Allow-Origin"]) {
		// Reject unknown origins (optional; you can be more permissive in dev)
		return new Response("CORS origin not allowed", { status: 403 });
	}
	const reqHeaders =
		req.headers.get("Access-Control-Request-Headers") || "Content-Type";

	return new Response(null, {
		status: 204,
		headers: {
			...cors,
			"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
			"Access-Control-Allow-Headers": reqHeaders,
			"Access-Control-Max-Age": "86400",
		},
	});
}
function withCors(req: Request, init: ResponseInit = {}, body?: BodyInit | null) {
	const cors = getCorsHeaders(req);
	const headers = new Headers(init.headers || {});
	for (const [k, v] of Object.entries(cors)) headers.set(k, v as string);
	return new Response(body ?? (init as any).body ?? null, { ...init, headers });
}


// ---------- Main Worker ----------
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight first
		if (request.method === "OPTIONS") {
			return preflight(request);
		}

		// Start OAuth with Strava
		if (url.pathname === "/api/auth/strava/start") {
			const redirectUri = `${env.APP_BASE_URL}/api/auth/strava/callback`;
			const scopes = "read,activity:read_all";
			const location =
				`https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(env.STRAVA_CLIENT_ID)}` +
				`&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
				`&scope=${encodeURIComponent(scopes)}&approval_prompt=auto`;
			return Response.redirect(location, 302);
		}

		// OAuth callback
		if (url.pathname === "/api/auth/strava/callback") {
			const code = url.searchParams.get("code");
			if (!code) return new Response("Missing code", { status: 400 });

			const redirectUri = `${env.APP_BASE_URL}/api/auth/strava/callback`;
			// Use form-encoded per Strava’s expectations
			const tokenRes = await fetch("https://www.strava.com/oauth/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: env.STRAVA_CLIENT_ID,
					client_secret: env.STRAVA_CLIENT_SECRET,
					code,
					grant_type: "authorization_code",
					redirect_uri: redirectUri
				})
			});
			if (!tokenRes.ok) {
				const txt = await tokenRes.text().catch(() => "");
				return new Response(`Token exchange failed: ${txt}`, { status: 502 });
			}

			const tokUnknown = (await tokenRes.json().catch(() => undefined)) as unknown;
			if (!isStravaTokenResponse(tokUnknown)) {
				return new Response("Unexpected token payload", { status: 502 });
			}
			const tok = tokUnknown;

			// 1) Does this athlete already exist?
			const existing = await env.DB
				.prepare("SELECT id FROM users WHERE strava_athlete_id = ? LIMIT 1")
				.bind(tok.athlete.id)
				.first<{ id: string } | null>();

			// 2) Pick the correct userId
			const userId = existing?.id ?? crypto.randomUUID();

			// 3) Build statements (order matters)
			const statements: D1PreparedStatement[] = [];

			if (!existing) {
				statements.push(
					env.DB.prepare(
						"INSERT INTO users (id, strava_athlete_id) VALUES (?, ?)"
					).bind(userId, tok.athlete.id),
					env.DB.prepare(
						"INSERT INTO money_pools (user_id, cents_locked, emergency_unlocks_used) VALUES (?, 0, 0)"
					).bind(userId)
				);
			} else {
				// Ensure pool row exists (idempotent)
				statements.push(
					env.DB.prepare(
						"INSERT OR IGNORE INTO money_pools (user_id, cents_locked, emergency_unlocks_used) VALUES (?, 0, 0)"
					).bind(userId)
				);
			}

			// 4) Upsert tokens
			statements.push(
				env.DB.prepare(
					"INSERT OR REPLACE INTO strava_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)"
				).bind(userId, tok.access_token, tok.refresh_token, tok.expires_at)
			);

			// 5) Run atomically — D1 batch is transactional
			await env.DB.batch(statements);
			// After await env.DB.batch(statements);
			ctx.waitUntil(ensureStravaWebhookSubscription(env));


			// 6) Set session cookie and redirect
			return new Response(null, {
				status: 302,
				headers: {
					"Location": "http://localhost:3000",
					"Set-Cookie": `uid=${userId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=31536000`
				}
			});
		}

		// Which athlete is my current session tied to?
		if (url.pathname === "/api/whoami" && request.method === "GET") {
			const uid = getUidFromCookie(request.headers.get("Cookie"));
			if (!uid) return new Response("No session", { status: 401 });
			const row = await env.DB.prepare(
				"SELECT u.id as user_id, u.strava_athlete_id, mp.cents_locked, mp.emergency_unlocks_used FROM users u LEFT JOIN money_pools mp ON mp.user_id=u.id WHERE u.id = ?"
			).bind(uid).first<{ user_id: string; strava_athlete_id: number; cents_locked: number; emergency_unlocks_used: number } | null>();
			return new Response(JSON.stringify(row), { headers: { "Content-Type": "application/json" } });
		}


		if (url.pathname === "/api/strava/webhook/subscriptions" && request.method === "GET") {
			try {
				// quick sanity guard so you don't send "undefined"
				if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
					return new Response(JSON.stringify({
						error: "missing_env",
						message: "STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET not set"
					}), { status: 500, headers: { "Content-Type": "application/json" } });
				}

				const subs = await listSubscriptions(env);
				return new Response(JSON.stringify(subs), {
					headers: { "Content-Type": "application/json" }
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error("subscriptions endpoint failed:", msg);
				return new Response(JSON.stringify({
					error: "strava_list_failed",
					message: msg
				}), { status: 502, headers: { "Content-Type": "application/json" } });
			}
		}


		if (url.pathname === "/api/auth/logout") {
			// Expire the cookie immediately
			return new Response("Logged out", {
				status: 302,
				headers: {
					"Location": "http://localhost:3000", // or wherever you want to redirect after logout
					"Set-Cookie": "uid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
				}
			});
		}

		// Webhook verification (GET)
		if (url.pathname === "/api/strava/webhook" && request.method === "GET") {
			const challenge = url.searchParams.get("hub.challenge");
			const verify = url.searchParams.get("hub.verify_token");
			if (verify !== env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
				return new Response("bad token", { status: 403 });
			}
			return new Response(JSON.stringify({ "hub.challenge": challenge }), {
				headers: { "Content-Type": "application/json" }
			});
		}

		// Webhook events (POST)
		if (url.pathname === "/api/strava/webhook" && request.method === "POST") {
			// If you have HMAC verification, keep it; just add logging on failure.
			try {
				const raw = await request.text();
				const evtUnknown = JSON.parse(raw) as unknown;

				console.log("[webhook] raw:", raw);

				if (isStravaEvent(evtUnknown)) {
					console.log("[webhook] parsed:", evtUnknown);

					if (evtUnknown.object_type === "activity" &&
						(evtUnknown.aspect_type === "create" || evtUnknown.aspect_type === "update")) {
						const u = await env.DB.prepare(
							"SELECT id FROM users WHERE strava_athlete_id = ?"
						).bind(evtUnknown.owner_id).first<{ id: string } | null>();

						console.log("[webhook] owner_id:", evtUnknown.owner_id, "user:", u?.id ?? null);

						if (u?.id) {
							ctx.waitUntil(processActivity(env, u.id, String(evtUnknown.object_id)));
						} else {
							console.warn("[webhook] no user found for owner_id");
						}
					}
				} else {
					console.warn("[webhook] payload failed guard");
				}
				return new Response("ok");
			} catch (e) {
				console.error("[webhook] error:", e);
				return new Response("bad", { status: 400 });
			}
		}



		// List payouts for the current user — GET /api/payouts?limit=50&offset=0
		if (url.pathname === "/api/payouts" && request.method === "GET") {
			const uid = getUidFromCookie(request.headers.get("Cookie"));
			if (!uid) return new Response("No session", { status: 401 });

			// simple pagination (sane caps)
			const limit = toPosInt(url.searchParams.get("limit"), 50, 200);
			const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset") || "0")) || 0);

			// fetch rows, newest first (rowid is fine since you insert once)
			const { results } = await env.DB
				.prepare(
					"SELECT id, activity_id, cents FROM payouts WHERE user_id = ? ORDER BY rowid DESC LIMIT ? OFFSET ?"
				)
				.bind(uid, limit, offset)
				.all<DbPayoutRow>();

			return withCors(
				request,
				{ headers: { "Content-Type": "application/json" } },
				JSON.stringify({ items: results ?? [], limit, offset })
			);
		}



		// Lock funds (demo) — POST { cents: number }
		if (url.pathname === "/api/pool/lock" && request.method === "POST") {
			const body = await readJson<LockBody>(request, isLockBody);
			const uid = getUidFromCookie(request.headers.get("Cookie"));
			if (!uid) return new Response("No session", { status: 401 });

			await env.DB.batch([
				env.DB.prepare(
					"UPDATE money_pools SET cents_locked = cents_locked + ? WHERE user_id = ?"
				).bind(body.cents, uid),
				env.DB.prepare(
					"INSERT INTO pool_transactions (id,user_id,type,cents) VALUES (?,?,?,?)"
				).bind(crypto.randomUUID(), uid, "LOCK", body.cents)
			]);
			return withCors(request, { status: 200 }, `locked $${dollars(body.cents)}`);
		}

		// Emergency unlock — POST { cents: number } (enforce <= 3)
		if (url.pathname === "/api/pool/emergency-unlock" && request.method === "POST") {
			const body = await readJson<EmergencyUnlockBody>(request, isEmergencyUnlockBody);
			const uid = getUidFromCookie(request.headers.get("Cookie"));
			if (!uid) return new Response("No session", { status: 401 });

			const row = await env.DB
				.prepare(
					"SELECT cents_locked, emergency_unlocks_used FROM money_pools WHERE user_id = ?"
				)
				.bind(uid)
				.first<DbPoolRow | null>();

			if (!row) return new Response("not found", { status: 404 });
			if (row.emergency_unlocks_used >= 3)
				return new Response("limit reached", { status: 403 });
			if (row.cents_locked < body.cents)
				return new Response("insufficient", { status: 400 });

			await env.DB.batch([
				env.DB.prepare(
					"UPDATE money_pools SET cents_locked = cents_locked - ?, emergency_unlocks_used = emergency_unlocks_used + 1 WHERE user_id = ? AND emergency_unlocks_used < 3 AND cents_locked >= ?"
				).bind(body.cents, uid, body.cents),
				env.DB.prepare(
					"INSERT INTO pool_transactions (id,user_id,type,cents) VALUES (?,?,?,?)"
				).bind(crypto.randomUUID(), uid, "EMERGENCY_UNLOCK", body.cents)
			]);

			return withCors(request, { status: 200 }, `unlocked $${dollars(body.cents)}`);
		}

		// In your fetch handler:
		if (url.pathname === "/api/me" && request.method === "GET") {
			const uid = getUidFromCookie(request.headers.get("Cookie"));
			if (!uid) return new Response("No session", { status: 401 });

			const row = await env.DB.prepare(
				"SELECT cents_locked, emergency_unlocks_used FROM money_pools WHERE user_id = ?"
			).bind(uid).first<{ cents_locked: number; emergency_unlocks_used: number } | null>();

			return withCors(request, {
				headers: { "Content-Type": "application/json" }
			}, JSON.stringify(row ?? { cents_locked: 0, emergency_unlocks_used: 0 }));
		}

		return withCors(request, { status: 404 }, "Not found");
	},
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(ensureStravaWebhookSubscription(env));
	}
} satisfies ExportedHandler<Env>;

// ---------- Activity processing ----------
async function processActivity(env: Env, userId: string, activityId: string): Promise<void> {
	let tok = await getValidAccessToken(env, userId);
	if (!tok) return;

	const fetchActivity = async (accessToken: string) => {
		return fetch(`${STRAVA_BASE}/activities/${encodeURIComponent(activityId)}`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
	};

	let r = await fetchActivity(tok.access_token);

	// If token expired unexpectedly, refresh once and retry
	if (r.status === 401) {
		try {
			tok = await refreshStravaAccessToken(env, userId, tok.refresh_token);
			r = await fetchActivity(tok.access_token);
		} catch (e) {
			console.error("refresh+retry failed", e);
			return;
		}
	}

	if (!r.ok) {
		console.error("activity fetch failed", r.status, await r.text().catch(() => ""));
		return;
	}

	const actUnknown = (await r.json().catch(() => undefined)) as unknown;
	if (!isStravaActivity(actUnknown)) return;
	const a = actUnknown;

	if (a.type !== "Run") return;

	const distanceM = Math.round(a.distance ?? 0);
	const miles = distanceM / 1609.34;

	// $1/mi capped at $5
	let payout = Math.min(Math.round(miles * 100), 500); // cents

	const pool = await env.DB
		.prepare("SELECT cents_locked FROM money_pools WHERE user_id = ?")
		.bind(userId)
		.first<{ cents_locked: number } | null>();

	if (!pool || pool.cents_locked <= 0) {
		payout = 0;
	} else {
		payout = Math.min(payout, pool.cents_locked);
	}

	try {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT OR IGNORE INTO runs (id,user_id,distance_m,moving_time_s,processed) VALUES (?,?,?,?,1)"
			).bind(String(activityId), userId, distanceM, a.moving_time ?? 0),
			env.DB.prepare(
				"UPDATE money_pools SET cents_locked = cents_locked - ? WHERE user_id = ?"
			).bind(payout, userId),
			env.DB.prepare(
				"INSERT INTO payouts (id,user_id,activity_id,cents) VALUES (?,?,?,?)"
			).bind(crypto.randomUUID(), userId, String(activityId), payout),
			env.DB.prepare(
				"INSERT INTO pool_transactions (id,user_id,type,cents,meta) VALUES (?,?,?,?,json_object('activity_id',?))"
			).bind(crypto.randomUUID(), userId, "RUN_PAYOUT", payout, String(activityId))
		]);
	} catch (e) {
		console.error("DB batch failed in processActivity", e);
	}
}

export class MyDurableObject {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	// Optional: simple health endpoint
	async fetch(_req: Request): Promise<Response> {
		return new Response("MyDurableObject OK");
	}
}