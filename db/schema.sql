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

INSERT OR IGNORE INTO customers (id, name, status, default_currency, timezone, locale, confidence_threshold, created_at, updated_at)
VALUES ('cust_default', 'Default Customer', 'ACTIVE', 'PEN', 'America/Lima', 'es-PE', 0.75, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO channels (id, name, status, created_at, updated_at)
VALUES
  ('whatsapp', 'WhatsApp', 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('telegram', 'Telegram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('instagram', 'Instagram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO categories (id, customer_id, name, slug) VALUES
  ('cat_food', NULL, 'Comida', 'comida'),
  ('cat_transport', NULL, 'Transporte', 'transporte'),
  ('cat_shopping', NULL, 'Compras', 'compras'),
  ('cat_services', NULL, 'Servicios', 'servicios');

INSERT OR IGNORE INTO customer_channels (id, customer_id, channel, external_user_id, is_primary, created_at, updated_at)
VALUES ('custch_default_whatsapp', 'cust_default', 'whatsapp', '51999999999', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customer_channel_settings (id, customer_id, channel_id, enabled, is_primary, config_json, created_at, updated_at)
VALUES ('ccs_cust_default_whatsapp', 'cust_default', 'whatsapp', 1, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
