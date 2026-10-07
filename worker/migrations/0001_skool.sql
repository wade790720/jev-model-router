-- Additive: preserves legacy Stripe licenses and usage data.
CREATE TABLE IF NOT EXISTS members (
  member_hash TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
  valid_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash TEXT PRIMARY KEY,
  member_hash TEXT NOT NULL REFERENCES members(member_hash),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_sessions_expiry ON member_sessions(expires_at);
