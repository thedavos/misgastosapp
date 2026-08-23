CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  request_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  processed_at TEXT,
  last_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_webhook_events_provider_event
  ON inbound_webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_status
  ON inbound_webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_last_seen_at
  ON inbound_webhook_events(last_seen_at);
