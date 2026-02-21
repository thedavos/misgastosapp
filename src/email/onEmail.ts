import { Either, Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { parseEmail, parseEmailWithAi, getTransactionWithParser } from "@/email/emailProcessors";
import { createLogger } from "@/logger";
import { tapErrorLog } from "@/utils/tapErrorLog";

export async function onEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv,
  _ctx: ExecutionContext,
) {
  const requestId = message.headers.get("cf-ray") ?? undefined;
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });

  const effect = Effect.gen(function* () {
    const parsedEmail = yield* parseEmail(message.raw).pipe(
      Effect.tapError(tapErrorLog(logger, "email.parse_failed")),
    );

    logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
    });

    const transactionResult = getTransactionWithParser(parsedEmail);

    if (Either.isRight(transactionResult)) {
      logger.info("email.parser", { parser: transactionResult.right.parserName });
      logger.info("email.transaction", { transaction: transactionResult.right.transaction });
      logger.info("email.done");
      return;
    }

    if (transactionResult.left._tag === "NoParser") {
      logger.warn("email.error", { reason: "No parser available" });
    } else {
      logger.warn("email.error", { reason: "No se pudo parsear la transacción" });
      logger.info("email.parser", { parser: transactionResult.left.parserName });
    }

    const aiTransaction = yield* parseEmailWithAi(env, parsedEmail).pipe(
      Effect.tapError(tapErrorLog(logger, "email.ai_failed")),
    );

    if (!aiTransaction) return;
    logger.info("email.transaction", { transaction: aiTransaction, source: "ai" });
    logger.info("email.done");
  });

  const result = await Effect.runPromiseExit(effect);
  if (result._tag === "Failure") {
    logger.error("email.error", { error: String(result.cause) });
  }
}
