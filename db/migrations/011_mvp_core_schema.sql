PRAGMA foreign_keys = ON;

-- MVP core schema for LukaApp.
-- This migration does not delete old tables yet.
-- It creates the new canonical model so runtime can migrate gradually.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'PEN',
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  locale TEXT NOT NULL DEFAULT 'es-PE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sources_type_external
  ON user_sources(source_type, external_id);

CREATE INDEX IF NOT EXISTS idx_user_sources_user
  ON user_sources(user_id);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref_id TEXT,
  provider_message_id TEXT,
  raw_text TEXT,
  normalized_text TEXT,
  payload_json TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (source_ref_id) REFERENCES user_sources(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_messages_source_provider
  ON inbound_messages(source_type, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user
  ON inbound_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_received_at
  ON inbound_messages(received_at);

CREATE TABLE IF NOT EXISTS categories_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_v2_slug_per_user
  ON categories_v2(slug, user_id);

CREATE INDEX IF NOT EXISTS idx_categories_v2_user
  ON categories_v2(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_message_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  merchant TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_via TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (source_message_id) REFERENCES inbound_messages(id),
  FOREIGN KEY (category_id) REFERENCES categories_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user
  ON transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at
  ON transactions(occurred_at);

CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON transactions(status);

CREATE TABLE IF NOT EXISTS transaction_revisions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_revisions_transaction
  ON transaction_revisions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_revisions_user
  ON transaction_revisions(user_id);

CREATE TABLE IF NOT EXISTS report_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  period_kind TEXT NOT NULL,
  request_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (request_message_id) REFERENCES inbound_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_report_requests_user
  ON report_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_report_requests_status
  ON report_requests(status);
