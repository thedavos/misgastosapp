import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { parseForwardedEmail } from "@/adapters/email/parser";
import { emailToAiInput } from "@/adapters/ai/cloudflare-ai.adapter";
import { createContainer } from "@/composition/container";
import { EmailParseFailedError, MissingDefaultUserError } from "@/app/errors";

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  const requestId = message.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  const effect = Effect.gen(function* () {
    const parsedEmail = yield* Effect.tryPromise({
      try: () => parseForwardedEmail(message.raw),
      catch: (cause) => new EmailParseFailedError({ requestId, cause }),
    });

    container.logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
    });

    const emailText = emailToAiInput(parsedEmail);
    const userId = env.DEFAULT_EXPENSE_USER_ID ?? env.TELEGRAM_CHAT_ID;
    const customerId = env.DEFAULT_CUSTOMER_ID ?? "cust_default";

    if (!userId) {
      return yield* Effect.fail(
        new MissingDefaultUserError({
          requestId,
          message: "DEFAULT_EXPENSE_USER_ID or TELEGRAM_CHAT_ID is required",
        }),
      );
    }

    yield* container.ingestExpenseFromEmail({
      customerId,
      emailText,
      channel: "whatsapp",
      userId,
      requestId,
    });

    container.logger.info("email.done", { requestId });
  });

  const result = await Effect.runPromiseExit(effect);
  if (result._tag === "Failure") {
    container.logger.error("email.error", {
      requestId,
      cause: result.cause,
      error: result.cause,
    });
  }
}
