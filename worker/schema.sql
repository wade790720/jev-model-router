CREATE TABLE IF NOT EXISTS licenses (
  subscription_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_windows (
  subject TEXT NOT NULL,
  window_key TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (subject, window_key)
);

CREATE INDEX IF NOT EXISTS licenses_token_hash ON licenses(token_hash);
CREATE INDEX IF NOT EXISTS usage_windows_created_at ON usage_windows(created_at);
