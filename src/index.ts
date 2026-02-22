import * as Sentry from "@sentry/cloudflare";
import type { WorkerEnv } from "types/env";
import { handleEmail } from "@/handlers/email.handler";
import { handleFetch } from "@/handlers/http/router.handler";

export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: env.SENTRY_DSN,
    release: env.SENTRY_RELEASE,
    enableLogs: true,
    sendDefaultPii: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
  }),
  {
    fetch: handleFetch,
    email: handleEmail,
  } satisfies ExportedHandler<WorkerEnv>,
);
