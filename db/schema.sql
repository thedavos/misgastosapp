-- Current schema snapshot (post-017 MVP-aligned model)

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_amount INTEGER NOT NULL DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'PEN',
  billing_interval TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE plan_features (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  bool_value INTEGER,
  limit_value INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
CREATE UNIQUE INDEX uq_plan_features_plan_key
  ON plan_features(plan_id, feature_key);
CREATE TABLE inbound_webhook_events (
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
CREATE UNIQUE INDEX uq_inbound_webhook_events_provider_event
  ON inbound_webhook_events(provider, event_id);
CREATE INDEX idx_inbound_webhook_events_status
  ON inbound_webhook_events(status);
CREATE INDEX idx_inbound_webhook_events_last_seen_at
  ON inbound_webhook_events(last_seen_at);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'PEN',
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  locale TEXT NOT NULL DEFAULT 'es-PE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, status TEXT NOT NULL DEFAULT 'ACTIVE', confidence_threshold REAL NOT NULL DEFAULT 0.75);
CREATE TABLE user_sources (
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
CREATE UNIQUE INDEX uq_user_sources_type_external
  ON user_sources(source_type, external_id);
CREATE INDEX idx_user_sources_user
  ON user_sources(user_id);
CREATE TABLE inbound_messages (
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
CREATE UNIQUE INDEX uq_inbound_messages_source_provider
  ON inbound_messages(source_type, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_inbound_messages_user
  ON inbound_messages(user_id);
CREATE INDEX idx_inbound_messages_received_at
  ON inbound_messages(received_at);
CREATE TABLE categories_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX uq_categories_v2_slug_per_user
  ON categories_v2(slug, user_id);
CREATE INDEX idx_categories_v2_user
  ON categories_v2(user_id);
CREATE TABLE transactions (
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
CREATE INDEX idx_transactions_user
  ON transactions(user_id);
CREATE INDEX idx_transactions_occurred_at
  ON transactions(occurred_at);
CREATE INDEX idx_transactions_status
  ON transactions(status);
CREATE TABLE transaction_revisions (
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
CREATE INDEX idx_transaction_revisions_transaction
  ON transaction_revisions(transaction_id);
CREATE INDEX idx_transaction_revisions_user
  ON transaction_revisions(user_id);
CREATE TABLE report_requests (
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
CREATE INDEX idx_report_requests_user
  ON report_requests(user_id);
CREATE INDEX idx_report_requests_status
  ON report_requests(status);
CREATE TABLE user_channel_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);
CREATE UNIQUE INDEX uq_user_channel_settings_pair
  ON user_channel_settings(user_id, channel_id);
CREATE INDEX idx_user_channel_settings_user
  ON user_channel_settings(user_id);
CREATE INDEX idx_user_channel_settings_channel
  ON user_channel_settings(channel_id);
CREATE TABLE user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  start_at TEXT NOT NULL,
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_subscription_id TEXT,
  plan_version_at_start INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
CREATE INDEX idx_user_subscriptions_user
  ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status
  ON user_subscriptions(status);
CREATE UNIQUE INDEX uq_user_active_subscription
  ON user_subscriptions(user_id)
  WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE');
CREATE TABLE user_email_routes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX uq_user_email_routes_recipient
  ON user_email_routes(recipient_email);
CREATE INDEX idx_user_email_routes_user
  ON user_email_routes(user_id);
CREATE TABLE IF NOT EXISTS "chat_media" (
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
CREATE INDEX idx_chat_media_user_id
  ON chat_media(user_id);
CREATE INDEX idx_chat_media_transaction_id
  ON chat_media(transaction_id);
CREATE INDEX idx_chat_media_expires_at
  ON chat_media(expires_at);
CREATE INDEX idx_chat_media_provider_event
  ON chat_media(provider_event_id);
