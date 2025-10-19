# 🏃‍♂️ RunLock

**RunLock** is a behavioral motivation app for runners. It helps you stay consistent by locking your own money—and only unlocking it when you log real runs on Strava. If you skip your run, your funds stay locked. If you run, you get paid. Simple, powerful, and motivating.

<picture width="817" height="974">
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/306d093d-66bf-48c5-9019-631dde600614">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/807d267f-a768-4f7a-a1cb-f7cdbc9b8474">
  <img alt="Screenshot" src="https://github.com/user-attachments/assets/807d267f-a768-4f7a-a1cb-f7cdbc9b8474">
</picture>

---

## 📖 Table of Contents

- [Introduction](#-introduction)
- [Live Demo](#-live-demo)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Usage](#-usage)
- [Architecture](#-architecture)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema-d1)
- [Troubleshooting](#-troubleshooting)
- [Contributors](#-contributors)

---

## 🚀 Introduction

RunLock provides financial accountability for runners. It works like this:
- You lock money into a personal pool.
- When you complete a run and save it to Strava, RunLock pays you $1 per mile, up to $5.
- If you don’t run, the money stays locked.
- You get 3 lifetime emergency unlocks—use them wisely.

---

## 🌐 Live Demo

- Frontend: **[strava-runlock.vercel.app](https://strava-runlock.vercel.app)**
- Backend: **[runlock.ericchen890.workers.dev](https://runlock.ericchen890.workers.dev)**

---

## ✨ Features

- 🔒 Lock personal funds into your RunLock pool.
- 🏃 Auto-payout when a Strava run is logged.
- ⚠️ Emergency unlocks (max 3, lifetime).
- 💳 Track payout history for each activity.
- 🔐 Strava OAuth2 login & secure token system.
- ☁️ Cloudflare Workers + D1 + KV architecture.
- 💡 Dark mode toggle with `ThemeToggle`.
- 🧼 Clean, modern UI with TailwindCSS + Shadcn.

---

## 🧱 Tech Stack

| Layer        | Technology                         |
|--------------|-------------------------------------|
| Frontend      | Next.js, TypeScript, React, TailwindCSS, Shadcn UI, Framer Motion |
| Backend       | Cloudflare Workers, Durable Objects |
| Database      | Cloudflare D1 (SQLite-like), KV     |
| Auth          | Strava OAuth2                      |
| Deployment    | Vercel (Frontend), Cloudflare Workers (Backend)

---

## ⚙️ Installation

> Prerequisites: Node.js, [pnpm](https://pnpm.io/), [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/), Strava Developer Account

1. **Clone the repository:**

```bash
git clone https://github.com/your-username/runlock.git
cd runlock
````

2. **Install frontend dependencies:**

```bash
pnpm install
```

3. **Configure environment variables:**

Fill in the environment values in a ```.env``` file.

4. **Run frontend locally:**

```bash
pnpm dev
```

5. **Run Cloudflare Worker backend:**

```bash
wrangler dev
```

---

## 🔐 Environment Variables

These must be set in your `.env.local` (frontend) and `wrangler.jsonc` or `wrangler secret` (backend):

| Variable                      | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE`        | URL to the Cloudflare backend (`*.workers.dev`)       |
| `APP_BASE_URL`                | Same as above, for backend API                        |
| `FRONTEND_URL`                | Vercel or local frontend URL                          |
| `STRAVA_CLIENT_ID`            | Your Strava app’s Client ID                           |
| `STRAVA_CLIENT_SECRET`        | **(Secret)** Use `wrangler secret put`                |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Random string used for webhook verification           |
| `PAYOUT_CAP_CENTS`            | (Optional) Max payout in cents (default: 500 = $5)    |
| `PAYOUT_RATE_CENTS_PER_MILE`  | (Optional) Rate per mile in cents (default: 100 = $1) |

---

## 🧪 Usage

1. Open the frontend site.
2. Click **Connect Strava** to authorize your Strava account.
3. Lock money into your pool.
4. Go for a run and record it via Strava.
5. Once your run is saved, RunLock automatically:

   * Detects the activity via Strava webhook
   * Checks the type and distance
   * Pays out `$1 per mile`, up to `$5 per run`
6. View your updated locked balance and payout history.

---

## 🏗️ Architecture

- User
  - ↳ Frontend (Next.js)
       - ↳ Calls backend Cloudflare Worker
           - ↳ /api/pool/lock
           - ↳ /api/me
           - ↳ /api/payouts
           - ↳ /api/pool/emergency-unlock
       - ↳ Strava Auth & Webhooks
           - ↳ OAuth redirects
           - ↳ /api/strava/webhook
               - ↳ Processes activity
               - ↳ Triggers payout if valid run
       - ↳ D1 DB for transactions, payouts
       - ↳ KV for flags and webhook IDs

---

## 🔌 API Endpoints

| Endpoint                            | Method   | Purpose                                |
| ----------------------------------- | -------- | -------------------------------------- |
| `/api/auth/strava/start`            | GET      | Begin OAuth with Strava                |
| `/api/auth/strava/callback`         | GET      | Handle redirect from Strava            |
| `/api/auth/finalize`                | GET      | Set session cookie and return token    |
| `/api/auth/logout`                  | POST     | Clear session                          |
| `/api/me`                           | GET      | Get pool balance + unlocks used        |
| `/api/pool/lock`                    | POST     | Lock funds                             |
| `/api/pool/emergency-unlock`        | POST     | Unlock funds (up to 3x)                |
| `/api/payouts?limit=10&offset=0`    | GET      | List recent payouts                    |
| `/api/strava/webhook`               | GET/POST | Verify + handle webhook events         |
| `/api/strava/webhook/subscriptions` | GET      | Debug webhook subscriptions (dev only) |

---

## 🧩 Database Schema (D1)

```sql
-- Users & OAuth
users(id, strava_athlete_id, created_at)
strava_tokens(user_id, access_token, refresh_token, expires_at)

-- Money Pool
money_pools(user_id, cents_locked, emergency_unlocks_used)
pool_transactions(id, user_id, type, cents, meta, created_at)

-- Runs & Payouts
runs(id, user_id, distance_m, moving_time_s, processed, created_at)
payouts(id, user_id, activity_id, cents, created_at)
```

---

## 🧯 Troubleshooting

* ❗ **`NEXT_PUBLIC_API_BASE` is not set**
  → Ensure `.env.local` points to your backend worker URL.

* ❗ **Webhook isn't triggering payouts**
  → Confirm that:

  * The run is recorded as a `Run`, not a `Ride` or other type.
  * You’ve set up Strava webhook subscriptions correctly.
  * Your Strava client ID and secret are valid.

* ❗ **Emergency unlock fails**
  → You only get 3 emergency unlocks total. Use them wisely.

---

## 👥 Contributors

* [@ericchen890](https://github.com/ericchen890) – Creator

---

## ❤️ Motivation

The app was made as part of HackTX 2025 on the track of Capital One's Finance Hack and Human Intelligence Hack (No AI Functionality).

