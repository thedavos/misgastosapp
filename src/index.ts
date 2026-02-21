import * as Sentry from "@sentry/cloudflare";
import type { WorkerEnv } from "types/env";
import { handleEmail } from "@/email/handleEmail";
import { handleFetch } from "@/http/handleFetch";

export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: env.SENTRY_DSN,
    enableLogs: true,
    sendDefaultPii: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
  }),
  {
    fetch: handleFetch,
    email: handleEmail,
  } satisfies ExportedHandler<WorkerEnv>,
);
