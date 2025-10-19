-- users & auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  strava_athlete_id INTEGER UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strava_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- money pool & transactions
CREATE TABLE IF NOT EXISTS money_pools (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  cents_locked INTEGER NOT NULL DEFAULT 0,
  emergency_unlocks_used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pool_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT CHECK (type IN ('LOCK','EMERGENCY_UNLOCK','RUN_PAYOUT')),
  cents INTEGER NOT NULL,
  meta JSON,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- runs & payouts
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,               -- strava activity id
  user_id TEXT REFERENCES users(id),
  distance_m INTEGER,
  moving_time_s INTEGER,
  processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  activity_id TEXT REFERENCES runs(id),
  cents INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);