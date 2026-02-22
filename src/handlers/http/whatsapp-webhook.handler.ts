import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";
import {
  ChannelDisabledError,
  ChannelSettingMissingError,
  SubscriptionFeatureBlockedError,
  WebhookIdempotencyError,
  WebhookParseError,
  WebhookVerificationError,
} from "@/app/errors";
import { getEffectFailureMeta } from "@/utils/effect-failure";

const WHATSAPP_PROVIDER = "kapso_whatsapp";
const WEBHOOK_RETENTION_DAYS = 30;

export async function handleWhatsAppWebhook(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);
  let processingEventId: string | undefined;
  const signatureMode = env.KAPSO_WEBHOOK_SIGNATURE_MODE ?? "dual";
  const providedSignature = request.headers.get("x-kapso-signature");

  if (typeof ctx.waitUntil === "function" && Math.random() < 0.01) {
    ctx.waitUntil(
      container.webhookEventRepo
        .cleanupOld({ provider: WHATSAPP_PROVIDER, retentionDays: WEBHOOK_RETENTION_DAYS })
        .catch((cause) => {
          container.logger.warn("whatsapp.webhook_idempotency_cleanup_failed", {
            requestId,
            cause,
          });
        }),
    );
  }

  const effect = Effect.gen(function* () {
    const rawBody = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: (cause) => new WebhookParseError({ requestId, cause }),
    });

    const isVerified = yield* Effect.tryPromise({
      try: () => container.whatsappChannel.verifyWebhook({ headers: request.headers, rawBody }),
      catch: (cause) => new WebhookVerificationError({ requestId, cause }),
    });

    if (!isVerified) {
      container.logger.warn("whatsapp.webhook_signature_invalid", {
        requestId,
        signatureMode,
      });
      container.logger.warn("whatsapp.webhook_unauthorized", { requestId });
      return new Response("Unauthorized", { status: 401 });
    }

    if (signatureMode === "dual" && providedSignature && providedSignature === env.KAPSO_WEBHOOK_SECRET) {
      container.logger.warn("whatsapp.webhook_legacy_signature_accepted", { requestId });
    }

    const incomingMessage = yield* Effect.tryPromise({
      try: () =>
        container.whatsappChannel.parseWebhook(
          new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: rawBody,
          }),
        ),
      catch: (cause) => new WebhookParseError({ requestId, cause }),
    });

    if (!incomingMessage) {
      container.logger.warn("whatsapp.webhook_invalid_payload", { requestId });
      return new Response("Invalid payload", { status: 400 });
    }

    const customer = yield* Effect.tryPromise({
      try: () =>
        container.customerRepo.findByChannelExternalId({
          channel: incomingMessage.channel,
          externalUserId: incomingMessage.userId,
        }),
      catch: (cause) => new WebhookParseError({ requestId, cause }),
    });

    if (!customer) {
      container.logger.warn("whatsapp.webhook_customer_not_found", {
        requestId,
        externalUserId: incomingMessage.userId,
      });
      return new Response("Customer not found", { status: 404 });
    }

    const authorizationResult = yield* container.authorizeChannel({
      customerId: customer.id,
      channelId: incomingMessage.channel,
      requestId,
    }).pipe(Effect.either);

    if (authorizationResult._tag === "Left") {
      if (authorizationResult.left instanceof ChannelDisabledError) {
        return new Response("Channel disabled", { status: 403 });
      }
      if (authorizationResult.left instanceof ChannelSettingMissingError) {
        return new Response("Channel setting missing", { status: 403 });
      }
      if (authorizationResult.left instanceof SubscriptionFeatureBlockedError) {
        return new Response("Payment Required", { status: 402 });
      }
      return yield* Effect.fail(authorizationResult.left);
    }

    const eventId = incomingMessage.providerEventId ?? `hash:${incomingMessage.payloadHash ?? crypto.randomUUID()}`;
    const payloadHash = incomingMessage.payloadHash ?? "missing";
    processingEventId = eventId;

    const idempotencyStatus = yield* Effect.tryPromise({
      try: () =>
        container.webhookEventRepo.tryStartProcessing({
          provider: WHATSAPP_PROVIDER,
          eventId,
          payloadHash,
          requestId,
        }),
      catch: (cause) =>
        new WebhookIdempotencyError({
          requestId,
          operation: "tryStartProcessing",
          cause,
        }),
    });

    container.logger.info("whatsapp.webhook_idempotency_started", {
      requestId,
      eventId,
      status: idempotencyStatus,
    });

    if (idempotencyStatus === "DUPLICATE_INFLIGHT" || idempotencyStatus === "DUPLICATE_PROCESSED") {
      container.logger.info("whatsapp.webhook_duplicate_ignored", {
        requestId,
        eventId,
        status: idempotencyStatus,
      });
      return new Response("ok", { status: 200 });
    }

    yield* container.handleUserReply({ customerId: customer.id, message: incomingMessage });

    yield* Effect.tryPromise({
      try: () =>
        container.webhookEventRepo.markProcessed({
          provider: WHATSAPP_PROVIDER,
          eventId,
        }),
      catch: (cause) =>
        new WebhookIdempotencyError({
          requestId,
          operation: "markProcessed",
          cause,
        }),
    });

    container.logger.info("whatsapp.webhook_idempotency_processed", { requestId, eventId });

    return new Response("ok", { status: 200 });
  });

  const result = await Effect.runPromiseExit(effect);

  if (result._tag === "Failure") {
    const { errorCode, errorMessage } = getEffectFailureMeta(result.cause);

    if (processingEventId) {
      await container.webhookEventRepo
        .markFailed({
          provider: WHATSAPP_PROVIDER,
          eventId: processingEventId,
          errorMessage: errorMessage ?? errorCode ?? "unknown webhook error",
        })
        .catch(() => null);

      container.logger.error("whatsapp.webhook_idempotency_failed", {
        requestId,
        eventId: processingEventId,
        errorCode,
        message: errorMessage,
      });
    }

    container.logger.error("whatsapp.webhook_error", {
      requestId,
      errorCode,
      message: errorMessage,
      cause: result.cause,
      error: result.cause,
    });
    return new Response("Internal Server Error", { status: 500 });
  }

  return result.value;
}
