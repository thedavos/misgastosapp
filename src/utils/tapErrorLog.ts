import { Effect } from "effect";
import { createLogger } from "@/logger";

export const tapErrorLog =
  (logger: ReturnType<typeof createLogger>, event: string) =>
  (error: { _tag: string; cause: unknown; message?: string; requestId?: string }) =>
    Effect.sync(() =>
      logger.error(event, {
        tag: error._tag,
        message: error.message,
        requestId: error.requestId,
        cause: error.cause,
      }),
    );
