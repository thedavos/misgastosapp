export interface WorkerEnv extends Cloudflare.Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EMAIL_WORKER_SECRET: string;
  CLOUDFLARE_AI_MODEL: Name;

  // Bindings
  DB: D1Database;
  REPORTS: R2Bucket;
  AI: Ai;
  PROMPTS_KV: KVNamespace;

  // Variables
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
}
