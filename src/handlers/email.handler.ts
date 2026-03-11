import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { emailToAiInput } from "@/adapters/ai/cloudflare-ai.adapter";
import { parseForwardedEmail } from "@/adapters/email/parser";
import {
  CustomerSenderLookupError,
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

function resolveSenderCandidates(
  parsedEmail: Awaited<ReturnType<typeof parseForwardedEmail>>,
  message: ForwardableEmailMessage,
): string[] {
  const candidates: string[] = [];
  if (typeof message.from === "string" && message.from.trim().length > 0) {
    candidates.push(message.from.trim().toLowerCase());
  }

  const emailFrom = parsedEmail.from?.address?.trim().toLowerCase();
  if (emailFrom) {
    candidates.push(emailFrom);
  }

  return Array.from(new Set(candidates));
}

function resolveWorkerInbox(env: WorkerEnv): string {
  const configured = env.EMAIL_WORKER_INBOX?.trim().toLowerCase();
  if (configured && configured.length > 0) return configured;
  return "recibos@misgastos.app";
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
    const expectedInbox = resolveWorkerInbox(env);
    if (!recipientEmail || recipientEmail !== expectedInbox) {
      container.logger.warn("email.inbox_mismatch_skip", {
        requestId,
        recipientEmail: recipientEmail ?? "missing",
        expectedInbox,
      });
      return;
    }

    const senderCandidates = resolveSenderCandidates(parsedEmail, message);
    if (senderCandidates.length === 0) {
      container.logger.warn("email.sender_missing_skip", {
        requestId,
        recipientEmail,
      });
      return;
    }

    let matchedSenderEmail: string | null = null;
    let customerId: string | null = null;
    for (const senderCandidate of senderCandidates) {
      const resolvedCustomerId = yield* Effect.tryPromise({
        try: () =>
          container.customerEmailSenderRepo.resolveCustomerIdBySenderEmail(
            senderCandidate,
          ),
        catch: (cause) =>
          new CustomerSenderLookupError({
            requestId,
            senderEmail: senderCandidate,
            cause,
          }),
      });
      if (resolvedCustomerId) {
        customerId = resolvedCustomerId;
        matchedSenderEmail = senderCandidate;
        break;
      }
    }

    if (!customerId) {
      container.logger.warn("email.sender_not_mapped_skip", {
        requestId,
        senderCandidates,
        recipientEmail,
      });
      return;
    }

    const customer = yield* Effect.tryPromise({
      try: () => container.customerRepo.getById(customerId),
      catch: (cause) =>
        new CustomerSenderLookupError({
          requestId,
          senderEmail: matchedSenderEmail ?? senderCandidates[0],
          cause,
        }),
    });

    if (!customer) {
      container.logger.warn("email.customer_not_found_skip", {
        requestId,
        customerId,
        senderEmail: matchedSenderEmail ?? senderCandidates[0],
        recipientEmail,
      });
      return;
    }

    if (customer.status !== "ACTIVE") {
      container.logger.warn("email.customer_inactive_skip", {
        requestId,
        customerId: customer.id,
        senderEmail: matchedSenderEmail ?? senderCandidates[0],
        recipientEmail,
        status: customer.status,
      });
      return;
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
      senderEmail: matchedSenderEmail ?? senderCandidates[0],
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
