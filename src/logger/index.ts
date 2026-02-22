import * as Sentry from "@sentry/cloudflare";
import { sanitize, type LogContext } from "@/logger/sanitize";

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerConfig = {
  service?: string;
  env?: string;
  requestId?: string;
};

const DEFAULT_CONTEXT: LoggerConfig = {
  service: "misgastosapp",
};

function logWithConsoleFallback(level: LogLevel, event: string, context: LogContext) {
  const payload = sanitize({ event, ...context });

  try {
    Sentry.logger[level](event, payload);
    return;
  } catch {
    // fall through
  }

  const logFn = (console[level] ?? console.log).bind(console);
  try {
    logFn(JSON.stringify({ level, ...payload }));
  } catch {
    logFn(`[${level}] ${event}`, payload);
  }
}

function normalizeError(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === "string") return new Error(input);

  try {
    return new Error(JSON.stringify(sanitize({ error: input }).error));
  } catch {
    return new Error(String(input));
  }
}

export function createLogger(config: LoggerConfig = {}) {
  const baseContext = { ...DEFAULT_CONTEXT, ...config };

  return {
    debug(event: string, context: LogContext = {}) {
      logWithConsoleFallback("debug", event, { ...baseContext, ...context });
    },
    info(event: string, context: LogContext = {}) {
      logWithConsoleFallback("info", event, { ...baseContext, ...context });
    },
    warn(event: string, context: LogContext = {}) {
      logWithConsoleFallback("warn", event, { ...baseContext, ...context });
    },
    error(event: string, context: LogContext = {}) {
      if ("error" in context) {
        try {
          Sentry.captureException(normalizeError(context.error), {
            extra: sanitize({ ...baseContext, ...context }),
          });
        } catch {
          // ignore capture failure
        }
      }
      logWithConsoleFallback("error", event, { ...baseContext, ...context });
    },
  };
}

export function createRequestLogger(options: {
  env?: string;
  requestId?: string;
  service?: string;
}) {
  return createLogger({
    env: options.env,
    requestId: options.requestId,
    service: options.service,
  });
}

export const logger = createLogger();
