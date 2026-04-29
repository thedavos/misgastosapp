PRAGMA foreign_keys = ON;

-- Backfill MVP core tables from the legacy schema.
-- Safe to run multiple times because inserts are idempotent where possible.

INSERT OR IGNORE INTO users (id, display_name, default_currency, timezone, locale, created_at, updated_at)
SELECT
  c.id,
  c.name,
  c.default_currency,
  c.timezone,
  c.locale,
  c.created_at,
  c.updated_at
FROM customers c;

INSERT OR IGNORE INTO user_sources (
  id,
  user_id,
  source_type,
  external_id,
  status,
  is_primary,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  cc.id,
  cc.customer_id,
  cc.channel,
  cc.external_user_id,
  'active',
  cc.is_primary,
  NULL,
  cc.created_at,
  cc.updated_at
FROM customer_channels cc
WHERE cc.channel IN ('whatsapp', 'telegram');

INSERT OR IGNORE INTO user_sources (
  id,
  user_id,
  source_type,
  external_id,
  status,
  is_primary,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  ces.id,
  ces.customer_id,
  'email',
  ces.sender_email,
  CASE WHEN ces.enabled = 1 THEN 'active' ELSE 'inactive' END,
  0,
  NULL,
  ces.created_at,
  ces.updated_at
FROM customer_email_senders ces;

INSERT OR IGNORE INTO categories_v2 (id, user_id, name, slug, created_at)
SELECT
  c.id,
  c.customer_id,
  c.name,
  c.slug,
  c.created_at
FROM categories c;

INSERT OR IGNORE INTO transactions (
  id,
  user_id,
  source_message_id,
  amount_minor,
  currency,
  merchant,
  description,
  category_id,
  occurred_at,
  status,
  created_via,
  created_at,
  updated_at
)
SELECT
  e.id,
  e.customer_id,
  NULL,
  CAST(ROUND(e.amount * 100.0) AS INTEGER),
  e.currency,
  e.merchant,
  e.raw_text,
  e.category_id,
  e.occurred_at,
  CASE
    WHEN e.status IN ('CATEGORIZED', 'CONFIRMED', 'confirmed') THEN 'confirmed'
    WHEN e.status IN ('PENDING_CATEGORY', 'NEEDS_CLARIFICATION', 'needs_clarification') THEN 'needs_clarification'
    WHEN e.status IN ('DISCARDED', 'DELETED', 'deleted') THEN 'deleted'
    ELSE lower(e.status)
  END,
  'migration',
  e.created_at,
  e.updated_at
FROM expenses e;

INSERT OR IGNORE INTO transaction_revisions (
  id,
  transaction_id,
  user_id,
  revision_type,
  before_json,
  after_json,
  reason,
  created_at
)
SELECT
  ee.id,
  ee.expense_id,
  ee.customer_id,
  CASE
    WHEN ee.type LIKE '%DELETE%' THEN 'delete'
    ELSE 'update'
  END,
  NULL,
  ee.payload_json,
  ee.type,
  ee.created_at
FROM expense_events ee;
