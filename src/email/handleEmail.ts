import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { parseEmail, parseEmailWithAi } from "@/email/emailProcessors";
import { createLogger } from "@/logger";
import { tapErrorLog } from "@/utils/tapErrorLog";

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv,
  _ctx: ExecutionContext,
) {
  const requestId = message.headers.get("cf-ray") ?? undefined;
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });

  const effect = Effect.gen(function* () {
    const parsedEmail = yield* parseEmail(message.raw, { requestId }).pipe(
      Effect.tapError(tapErrorLog(logger, "email.parse_failed")),
    );

    logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
    });

    const transactionResult = yield* parseEmailWithAi(env, parsedEmail, { requestId }).pipe(
      Effect.tapError(tapErrorLog(logger, "email.ai_failed")),
    );

    if (!transactionResult) {
      logger.warn("email.ai_no_transaction", {
        requestId,
        subject: parsedEmail.subject,
      });
      return;
    }
    logger.info("email.transaction", { transaction: transactionResult, source: "ai" });
    logger.info("email.done");
  });

  const result = await Effect.runPromiseExit(effect);
  if (result._tag === "Failure") {
    logger.error("email.error", {
      requestId,
      tag: result.cause._tag,
      error: result.cause,
    });
  }
}
