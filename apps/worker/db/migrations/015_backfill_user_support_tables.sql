INSERT OR IGNORE INTO user_channel_settings (
  id,
  user_id,
  channel_id,
  enabled,
  is_primary,
  config_json,
  created_at,
  updated_at
)
SELECT
  ccs.id,
  ccs.customer_id,
  ccs.channel_id,
  ccs.enabled,
  ccs.is_primary,
  ccs.config_json,
  ccs.created_at,
  ccs.updated_at
FROM customer_channel_settings ccs
JOIN users u ON u.id = ccs.customer_id;

INSERT OR IGNORE INTO user_subscriptions (
  id,
  user_id,
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
  cs.id,
  cs.customer_id,
  cs.plan_id,
  cs.status,
  cs.start_at,
  cs.current_period_start,
  cs.current_period_end,
  cs.cancel_at_period_end,
  cs.provider,
  cs.provider_subscription_id,
  cs.plan_version_at_start,
  cs.metadata_json,
  cs.created_at,
  cs.updated_at
FROM customer_subscriptions cs
JOIN users u ON u.id = cs.customer_id;

INSERT OR IGNORE INTO user_email_routes (
  id,
  user_id,
  recipient_email,
  enabled,
  created_at,
  updated_at
)
SELECT
  cer.id,
  cer.customer_id,
  cer.recipient_email,
  cer.enabled,
  cer.created_at,
  cer.updated_at
FROM customer_email_routes cer
JOIN users u ON u.id = cer.customer_id;
