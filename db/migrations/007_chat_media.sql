CREATE TABLE IF NOT EXISTS chat_media (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  expense_id TEXT,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  ocr_text TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_media_customer_id
  ON chat_media(customer_id);

CREATE INDEX IF NOT EXISTS idx_chat_media_expense_id
  ON chat_media(expense_id);

CREATE INDEX IF NOT EXISTS idx_chat_media_expires_at
  ON chat_media(expires_at);

CREATE INDEX IF NOT EXISTS idx_chat_media_provider_event
  ON chat_media(provider_event_id);
