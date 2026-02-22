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
SELECT
  printf('sub_%s_free', c.id),
  c.id,
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
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM customer_subscriptions s
  WHERE s.customer_id = c.id AND s.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
);
