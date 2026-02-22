import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";
import {
  ChannelDisabledError,
  ChannelSettingMissingError,
  SubscriptionFeatureBlockedError,
  WebhookParseError,
  WebhookVerificationError,
} from "@/app/errors";
import { getEffectFailureMeta } from "@/utils/effect-failure";

export async function handleWhatsAppWebhook(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  const effect = Effect.gen(function* () {
    const isVerified = yield* Effect.tryPromise({
      try: () => container.whatsappChannel.verifyWebhook(request),
      catch: (cause) => new WebhookVerificationError({ requestId, cause }),
    });

    if (!isVerified) {
      container.logger.warn("whatsapp.webhook_unauthorized", { requestId });
      return new Response("Unauthorized", { status: 401 });
    }

    const incomingMessage = yield* Effect.tryPromise({
      try: () => container.whatsappChannel.parseWebhook(request.clone()),
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

    yield* container.handleUserReply({ customerId: customer.id, message: incomingMessage });

    return new Response("ok", { status: 200 });
  });

  const result = await Effect.runPromiseExit(effect);

  if (result._tag === "Failure") {
    const { errorCode, errorMessage } = getEffectFailureMeta(result.cause);

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
