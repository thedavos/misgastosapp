export interface WorkerEnv extends Cloudflare.Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EMAIL_WORKER_SECRET: string;

  // Bindings
  DB: D1Database;
  REPORTS: R2Bucket;

  // Variables
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
}
