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

ALTER TABLE expenses ADD COLUMN customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_customer_id ON expenses(customer_id);

ALTER TABLE categories ADD COLUMN customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_categories_customer_id ON categories(customer_id);

ALTER TABLE expense_events ADD COLUMN customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_expense_events_customer_id ON expense_events(customer_id);

INSERT OR IGNORE INTO customers (id, name, status, default_currency, timezone, locale, confidence_threshold, created_at, updated_at)
VALUES ('cust_default', 'Default Customer', 'ACTIVE', 'PEN', 'America/Lima', 'es-PE', 0.75, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE expenses
SET customer_id = 'cust_default'
WHERE customer_id IS NULL;

INSERT OR IGNORE INTO customer_channels (id, customer_id, channel, external_user_id, is_primary, created_at, updated_at)
VALUES ('custch_default_whatsapp', 'cust_default', 'whatsapp', '51999999999', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
