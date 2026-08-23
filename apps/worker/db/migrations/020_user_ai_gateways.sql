-- Per-user AI model routing preferences.
-- Two modes:
--   byok    -> user brings their own gateway account: provider + api_key required.
--   managed -> user only picks a model; usage runs through the platform's own
--              AI_PROVIDER gateway credentials (app pays). provider/api_key must be NULL.
--
-- api_key_encrypted holds AES-256-GCM ciphertext, format v1.<iv_b64>.<ciphertext_b64>,
-- encrypted with the USER_AI_GATEWAY_ENC_KEY secret.
-- Managed models are enforced against the PLATFORM_MANAGED_MODELS allowlist at read time.

CREATE TABLE IF NOT EXISTS user_ai_gateways (
  user_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('byok', 'managed')),
  provider TEXT NULL CHECK (provider IN ('vercel', 'openrouter')),
  api_key_encrypted TEXT,
  base_url TEXT,
  model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  CHECK (
    (mode = 'byok' AND provider IS NOT NULL AND api_key_encrypted IS NOT NULL)
    OR
    (mode = 'managed' AND provider IS NULL AND api_key_encrypted IS NULL AND model IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_ai_gateways_enabled ON user_ai_gateways(enabled);
