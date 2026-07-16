import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { emailToAiInput } from "@/adapters/ai/cloudflare-ai.adapter";
import { parseForwardedEmail } from "@/adapters/email/parser";
import {
  ChannelDisabledError,
  UserSenderLookupError,
  EmailParseFailedError,
  MissingDefaultUserError,
  SubscriptionFeatureBlockedError,
} from "@/app/errors";
import { createExecuteChannelIntent } from "@/app/execute-channel-intent";
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

  const executeChannelIntent = createExecuteChannelIntent({
    createExpenseFromIntent: container.createExpenseFromIntent,
    updateLastExpenseFromIntent: container.updateLastExpenseFromIntent,
    deleteLastExpenseFromIntent: container.deleteLastExpenseFromIntent,
    getReportFromIntent: container.getReportFromIntent,
  });

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
    let userId: string | null = null;
    for (const senderCandidate of senderCandidates) {
      const resolvedUserId = yield* Effect.tryPromise({
        try: () => container.userEmailSenderRepo.resolveUserIdBySenderEmail(senderCandidate),
        catch: (cause) =>
          new UserSenderLookupError({
            requestId,
            senderEmail: senderCandidate,
            cause,
          }),
      });
      if (resolvedUserId) {
        userId = resolvedUserId;
        matchedSenderEmail = senderCandidate;
        break;
      }
    }

    if (!userId) {
      container.logger.warn("email.sender_not_mapped_skip", {
        requestId,
        senderCandidates,
        recipientEmail,
      });
      return;
    }

    const user = yield* Effect.tryPromise({
      try: () => container.userRepo.getById(userId),
      catch: (cause) =>
        new UserSenderLookupError({
          requestId,
          senderEmail: matchedSenderEmail ?? senderCandidates[0],
          cause,
        }),
    });

    if (!user) {
      container.logger.warn("email.user_not_found_skip", {
        requestId,
        userId,
        senderEmail: matchedSenderEmail ?? senderCandidates[0],
        recipientEmail,
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      container.logger.warn("email.user_inactive_skip", {
        requestId,
        userId: user.id,
        senderEmail: matchedSenderEmail ?? senderCandidates[0],
        recipientEmail,
        status: user.status,
      });
      return;
    }

    const primaryExternalUserId = yield* Effect.tryPromise({
      try: () =>
        container.userRepo.getPrimaryExternalUserId({
          userId,
          channel: "whatsapp",
        }),
      catch: (cause) =>
        new MissingDefaultUserError({
          requestId,
          message: `Unable to resolve primary whatsapp user for user ${userId}: ${String(cause)}`,
        }),
    });

    if (!primaryExternalUserId) {
      return yield* Effect.fail(
        new MissingDefaultUserError({
          requestId,
          message: `No primary whatsapp user configured for user ${userId}`,
        }),
      );
    }

    container.logger.info("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
      userId,
      recipientEmail,
      senderEmail: matchedSenderEmail ?? senderCandidates[0],
    });

    const sourceText = emailToAiInput(parsedEmail);

    const parsedIntent = yield* Effect.tryPromise({
      try: () =>
        container.parseUserIntent({
          text: sourceText,
          context: {
            sourceType: "email",
            timezone: user.timezone,
            defaultCurrency: user.defaultCurrency,
            nowIso: new Date().toISOString(),
          },
          requestId,
        }),
      catch: (cause) => new EmailParseFailedError({ requestId, cause }),
    });

    container.logger.info("email.intent_shadow_parsed", {
      requestId,
      userId,
      intentName: parsedIntent.name,
      confidence: parsedIntent.payload.confidence,
    });

    const directIntentResult = yield* executeChannelIntent({
      userId,
      channel: "whatsapp",
      sourceType: "email",
      externalUserId: primaryExternalUserId,
      parsedIntent,
      timezone: user.timezone,
      nowIso: new Date().toISOString(),
      requestId,
    });

    if (directIntentResult.handled) {
      container.logger.info("email.done", {
        requestId,
        userId,
        mode: `direct_${parsedIntent.name}`,
      });
      return;
    }

    const captureResult = yield* container
      .captureExpenseWithClarification({
        userId,
        sourceText,
        channel: "whatsapp",
        createdVia: "email",
        externalUserId: primaryExternalUserId,
        requestId,
      })
      .pipe(Effect.either);

    if (captureResult._tag === "Left") {
      if (
        captureResult.left instanceof ChannelDisabledError ||
        captureResult.left instanceof SubscriptionFeatureBlockedError
      ) {
        container.logger.warn("email.capture_authorization_skipped", {
          requestId,
          userId,
          error: captureResult.left._tag,
        });
        return;
      }

      return yield* Effect.fail(captureResult.left);
    }

    container.logger.info("email.done", { requestId, userId, mode: "fallback_clarification" });
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
