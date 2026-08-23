-- Add mobile as a first-class channel with plan entitlement kill-switch.

INSERT OR IGNORE INTO channels (id, name, status, created_at, updated_at)
VALUES (
  'mobile',
  'Mobile',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO plan_features (id, plan_id, feature_key, feature_type, bool_value, limit_value, created_at, updated_at)
VALUES
  ('pf_free_mobile', 'free', 'channels.mobile', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pf_pro_mobile', 'pro', 'channels.mobile', 'boolean', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

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
  printf('ucs_%s_mobile', u.id),
  u.id,
  'mobile',
  1,
  0,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM user_channel_settings s
  WHERE s.user_id = u.id AND s.channel_id = 'mobile'
);
