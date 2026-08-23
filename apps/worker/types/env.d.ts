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
  /** API key for the Vercel AI Gateway (required when AI_PROVIDER=vercel) */
  VERCEL_AI_API_KEY?: string;
  /** API key for OpenRouter (required when AI_PROVIDER=openrouter) */
  OPENROUTER_API_KEY?: string;
  /** Base64 AES-256 key to decrypt per-user BYO gateway keys in D1; per-user gateways are disabled when unset */
  USER_AI_GATEWAY_ENC_KEY?: string;
  /** Comma-separated model allowlist users may pick in managed mode; defaults per platform provider when unset */
  PLATFORM_MANAGED_MODELS?: string;

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
  /** AI provider for the AiPort adapters: "cloudflare" (default), "vercel" or "openrouter" */
  AI_PROVIDER?: "cloudflare" | "vercel" | "openrouter";
  /** OpenAI-compatible base URL, default Vercel AI Gateway https://ai-gateway.vercel.sh/v1 */
  VERCEL_AI_BASE_URL?: string;
  /** Gateway model id, e.g. "openai/gpt-4o-mini" or "anthropic/claude-3-5-haiku-latest" */
  VERCEL_AI_MODEL?: string;
  /** OpenAI-compatible base URL, default https://openrouter.ai/api/v1 */
  OPENROUTER_BASE_URL?: string;
  /** OpenRouter model id, e.g. "openai/gpt-4o-mini" or "anthropic/claude-3.5-haiku" */
  OPENROUTER_MODEL?: string;
  KAPSO_API_BASE_URL?: string;
  /** Comma-separated extra hostnames allowed for WhatsApp media fetches */
  KAPSO_MEDIA_HOST_ALLOWLIST?: string;
  KAPSO_WEBHOOK_SIGNATURE_MODE?: "dual" | "strict";
  KAPSO_WEBHOOK_MAX_SKEW_SECONDS?: string;
  CHAT_MEDIA_RETENTION_DAYS?: string;
  EMAIL_WORKER_INBOX?: string;
  STRICT_POLICY_MODE?: string;
}
