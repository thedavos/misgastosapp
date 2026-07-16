export interface WorkerEnv extends Cloudflare.Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  CLOUDFLARE_AI_MODEL: string;
  CLOUDFLARE_OCR_MODEL?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  KAPSO_API_KEY?: string;
  KAPSO_WEBHOOK_SECRET?: string;
  /** WhatsApp Business phone_number_id used by Kapso Meta proxy send API */
  KAPSO_PHONE_NUMBER_ID?: string;
  /** Override Meta WhatsApp proxy base, default https://api.kapso.ai/meta/whatsapp/v24.0 */
  KAPSO_META_WHATSAPP_BASE_URL?: string;
  /** JSON map of opaque Bearer tokens to user ids, e.g. {"tok_abc":"cust_1"} */
  MOBILE_API_TOKENS?: string;

  // Bindings
  DB: D1Database;
  REPORTS: R2Bucket;
  AI: Ai;
  ExpenseIngestionAgent: DurableObjectNamespace;
  PROMPTS_KV: KVNamespace;
  CONVERSATION_STATE_KV: KVNamespace;
  ENTITLEMENTS_KV?: KVNamespace;

  // Variables
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
  KAPSO_API_BASE_URL?: string;
  /** Comma-separated extra hostnames allowed for WhatsApp media fetches */
  KAPSO_MEDIA_HOST_ALLOWLIST?: string;
  KAPSO_WEBHOOK_SIGNATURE_MODE?: "dual" | "strict";
  KAPSO_WEBHOOK_MAX_SKEW_SECONDS?: string;
  CHAT_MEDIA_RETENTION_DAYS?: string;
  EMAIL_WORKER_INBOX?: string;
  STRICT_POLICY_MODE?: string;
}
