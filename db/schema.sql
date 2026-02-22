-- Current schema snapshot (customers + 3-layer channel model)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  default_currency TEXT NOT NULL DEFAULT 'PEN',
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  locale TEXT NOT NULL DEFAULT 'es-PE',
  confidence_threshold REAL NOT NULL DEFAULT 0.75,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_channels (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_channels_external
  ON customer_channels(channel, external_user_id);

CREATE INDEX IF NOT EXISTS idx_customer_channels_customer
  ON customer_channels(customer_id);

CREATE TABLE IF NOT EXISTS customer_channel_settings (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_channel_settings_pair
  ON customer_channel_settings(customer_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_customer_channel_settings_customer
  ON customer_channel_settings(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_channel_settings_channel
  ON customer_channel_settings(channel_id);

CREATE TABLE IF NOT EXISTS customer_email_routes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_email_routes_recipient
  ON customer_email_routes(recipient_email);

CREATE INDEX IF NOT EXISTS idx_customer_email_routes_customer
  ON customer_email_routes(customer_id);

CREATE TABLE IF NOT EXISTS plans (
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

CREATE TABLE IF NOT EXISTS plan_features (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_features_plan_key
  ON plan_features(plan_id, feature_key);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
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
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer
  ON customer_subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_status
  ON customer_subscriptions(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_active_subscription
  ON customer_subscriptions(customer_id)
  WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE');

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  subscription_id TEXT,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_events_provider_event
  ON subscription_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_slug_per_customer
  ON categories(slug, customer_id);

CREATE INDEX IF NOT EXISTS idx_categories_customer_id ON categories(customer_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  merchant TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  bank TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL,
  category_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_customer_id ON expenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_occurred_at ON expenses(occurred_at);

CREATE TABLE IF NOT EXISTS expense_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  expense_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_events_customer_id ON expense_events(customer_id);

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

INSERT OR IGNORE INTO customers (id, name, status, default_currency, timezone, locale, confidence_threshold, created_at, updated_at)
VALUES ('cust_default', 'Default Customer', 'ACTIVE', 'PEN', 'America/Lima', 'es-PE', 0.75, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO channels (id, name, status, created_at, updated_at)
VALUES
  ('whatsapp', 'WhatsApp', 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('telegram', 'Telegram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('instagram', 'Instagram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO plans (id, name, price_amount, price_currency, billing_interval, status, version, created_at, updated_at)
VALUES
  ('free', 'Free', 0, 'PEN', 'none', 'ACTIVE', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pro', 'Pro', 1990, 'PEN', 'monthly', 'ACTIVE', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO plan_features (id, plan_id, feature_key, feature_type, bool_value, limit_value, created_at, updated_at)
VALUES
  ('pf_free_whatsapp', 'free', 'channels.whatsapp', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_free_telegram', 'free', 'channels.telegram', 'boolean', 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_free_instagram', 'free', 'channels.instagram', 'boolean', 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_pro_whatsapp', 'pro', 'channels.whatsapp', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_pro_telegram', 'pro', 'channels.telegram', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_pro_instagram', 'pro', 'channels.instagram', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO categories (id, customer_id, name, slug) VALUES
  ('cat_food', NULL, 'Comida', 'comida'),
  ('cat_transport', NULL, 'Transporte', 'transporte'),
  ('cat_shopping', NULL, 'Compras', 'compras'),
  ('cat_services', NULL, 'Servicios', 'servicios');

INSERT OR IGNORE INTO customer_channels (id, customer_id, channel, external_user_id, is_primary, created_at, updated_at)
VALUES ('custch_default_whatsapp', 'cust_default', 'whatsapp', '51999999999', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customer_channel_settings (id, customer_id, channel_id, enabled, is_primary, config_json, created_at, updated_at)
VALUES ('ccs_cust_default_whatsapp', 'cust_default', 'whatsapp', 1, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customer_email_routes (id, customer_id, recipient_email, enabled, created_at, updated_at)
VALUES
  ('cer_default_gastos', 'cust_default', 'gastos@misgastos.app', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('cer_default_devmail', 'cust_default', 'davidvargas.d45@gmail.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customer_subscriptions (
  id,
  customer_id,
  plan_id,
  status,
  start_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  provider,
  provider_subscription_id,
  plan_version_at_start,
  metadata_json,
  created_at,
  updated_at
)
VALUES (
  'sub_cust_default_free',
  'cust_default',
  'free',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  '9999-12-31T23:59:59.000Z',
  0,
  'manual',
  NULL,
  1,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
