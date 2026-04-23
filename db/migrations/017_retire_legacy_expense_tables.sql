PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS chat_media_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  transaction_id TEXT,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  ocr_text TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

INSERT OR REPLACE INTO chat_media_v2 (
  id,
  user_id,
  channel,
  external_user_id,
  provider_event_id,
  transaction_id,
  r2_key,
  mime_type,
  size_bytes,
  sha256,
  ocr_text,
  created_at,
  expires_at
)
SELECT
  id,
  customer_id,
  channel,
  external_user_id,
  provider_event_id,
  expense_id,
  r2_key,
  mime_type,
  size_bytes,
  sha256,
  ocr_text,
  created_at,
  expires_at
FROM chat_media;

DROP TABLE IF EXISTS chat_media;
ALTER TABLE chat_media_v2 RENAME TO chat_media;

CREATE INDEX IF NOT EXISTS idx_chat_media_user_id
  ON chat_media(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_media_transaction_id
  ON chat_media(transaction_id);

CREATE INDEX IF NOT EXISTS idx_chat_media_expires_at
  ON chat_media(expires_at);

CREATE INDEX IF NOT EXISTS idx_chat_media_provider_event
  ON chat_media(provider_event_id);

DROP TABLE IF EXISTS expense_events;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS subscription_events;
DROP TABLE IF EXISTS customers;

PRAGMA foreign_keys = ON;
