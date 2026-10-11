-- Error inbox for ig-sorter, brand-digest and jev-model-router. One row per distinct error.
CREATE TABLE IF NOT EXISTS error_reports (
  signature TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  version TEXT NOT NULL,
  location TEXT NOT NULL,
  message TEXT NOT NULL,
  browser TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'seen'))
);
CREATE INDEX IF NOT EXISTS error_reports_status ON error_reports(status, last_seen);
