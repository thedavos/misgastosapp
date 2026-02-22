import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { emailToAiInput } from "@/adapters/ai/cloudflare-ai.adapter";
import { parseForwardedEmail } from "@/adapters/email/parser";
import {
  CustomerRouteLookupError,
  CustomerRouteNotFoundError,
  EmailParseFailedError,
  MissingDefaultUserError,
} from "@/app/errors";
import { createContainer } from "@/composition/container";
import { getEffectFailureMeta } from "@/utils/effect-failure";

function resolveRecipientEmail(
  parsedEmail: Awaited<ReturnType<typeof parseForwardedEmail>>,
  message: ForwardableEmailMessage,
): string | null {
  const emailTo = parsedEmail.to?.[0]?.address?.trim().toLowerCase();
  if (emailTo) return emailTo;

  if (typeof message.to === "string" && message.to.trim().length > 0) {
    return message.to.trim().toLowerCase();
  }

  return null;
}

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

    const recipientEmail = resolveRecipientEmail(parsedEmail, message);
    if (!recipientEmail) {
      return yield* Effect.fail(
        new CustomerRouteNotFoundError({
          requestId,
          recipientEmail: "",
        }),
      );
    }

    const customerId = yield* Effect.tryPromise({
      try: () => container.customerEmailRouteRepo.resolveCustomerIdByRecipientEmail(recipientEmail),
      catch: (cause) => new CustomerRouteLookupError({ requestId, recipientEmail, cause }),
    });

    if (!customerId) {
      return yield* Effect.fail(
        new CustomerRouteNotFoundError({
          requestId,
          recipientEmail,
        }),
      );
    }

    const userId = yield* Effect.tryPromise({
      try: () =>
        container.customerRepo.getPrimaryExternalUserId({
          customerId,
          channel: "whatsapp",
        }),
      catch: (cause) =>
        new MissingDefaultUserError({
          requestId,
          message: `Unable to resolve primary whatsapp user for customer ${customerId}: ${String(cause)}`,
        }),
    });

    if (!userId) {
      return yield* Effect.fail(
        new MissingDefaultUserError({
          requestId,
          message: `No primary whatsapp user configured for customer ${customerId}`,
        }),
      );
    }

    container.logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
      customerId,
      recipientEmail,
    });

    const emailText = emailToAiInput(parsedEmail);

    yield* container.ingestExpenseFromEmail({
      customerId,
      emailText,
      channel: "whatsapp",
      userId,
      requestId,
    });

    container.logger.info("email.done", { requestId, customerId });
  });

  const result = await Effect.runPromiseExit(effect);
  if (result._tag === "Failure") {
    const { errorCode, errorMessage } = getEffectFailureMeta(result.cause);

    container.logger.error("email.error", {
      requestId,
      errorCode,
      message: errorMessage,
      cause: result.cause,
      error: result.cause,
    });
  }
}
