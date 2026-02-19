import * as Sentry from "@sentry/cloudflare";
import type { WorkerEnv } from "types/env";
import { onEmail } from "@/email/onEmail";
import { onFetch } from "@/http/onFetch";

export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: env.SENTRY_DSN,
    enableLogs: true,
    sendDefaultPii: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
  }),
  {
    fetch: onFetch,
    email: onEmail,
  } satisfies ExportedHandler<WorkerEnv>,
);
