import { Effect } from "effect";
import { createLogger } from "@/logger";

export const tapErrorLog =
  (logger: ReturnType<typeof createLogger>, event: string) =>
  (error: { _tag: string; cause: unknown }) =>
    Effect.sync(() => logger.error(event, { tag: error._tag, cause: error.cause }));
