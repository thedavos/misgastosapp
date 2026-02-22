CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

INSERT OR IGNORE INTO channels (id, name, status, created_at, updated_at)
VALUES
  ('whatsapp', 'WhatsApp', 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('telegram', 'Telegram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('instagram', 'Instagram', 'INACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customer_channel_settings (id, customer_id, channel_id, enabled, is_primary, config_json, created_at, updated_at)
SELECT
  printf('ccs_%s_%s', customer_id, channel) AS id,
  customer_id,
  channel AS channel_id,
  1 AS enabled,
  MAX(is_primary) AS is_primary,
  NULL AS config_json,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS created_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS updated_at
FROM customer_channels
GROUP BY customer_id, channel;
