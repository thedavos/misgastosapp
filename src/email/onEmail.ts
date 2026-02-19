import PostalMime from "postal-mime";
import { getParser } from "@/parsers";
import { createLogger } from "@/logger";
import type { WorkerEnv } from "types/env";

export async function onEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv,
  _ctx: ExecutionContext,
) {
  const requestId = message.headers.get("cf-ray") ?? undefined;
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });
  try {
    const parsedEmail = await PostalMime.parse(message.raw);

    logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
    });

    const parser = getParser(parsedEmail);

    if (!parser) {
      logger.warn("email.error", { reason: "No parser available" });
      return;
    }

    logger.info("email.parser", { parser: parser.getName() });

    const transaction = parser.parse(parsedEmail);

    if (!transaction) {
      logger.warn("email.error", { reason: "No se pudo parsear la transacción" });
      return;
    }

    logger.info("email.transaction", { transaction });
    logger.info("email.done");
  } catch (error) {
    logger.error("email.error", { error: String(error) });
  }
}
