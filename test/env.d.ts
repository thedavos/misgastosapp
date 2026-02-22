declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    // Secrets
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    EMAIL_WORKER_SECRET: string;
    KAPSO_API_KEY?: string;
    KAPSO_WEBHOOK_SECRET?: string;

    // Bindings
    DB: D1Database;
    REPORTS: R2Bucket;
    AI: Ai;
    PROMPTS_KV: KVNamespace;
    CONVERSATION_STATE_KV: KVNamespace;

    // Variables
    ENVIRONMENT?: string;
    SENTRY_DSN?: string;
    SENTRY_RELEASE?: string;
    CLOUDFLARE_AI_MODEL: string;
    KAPSO_API_BASE_URL?: string;
    DEFAULT_EXPENSE_USER_ID?: string;
    DEFAULT_CUSTOMER_ID?: string;
  }
}

declare module "*.txt?raw" {
  const content: string;
  export default content;
}
