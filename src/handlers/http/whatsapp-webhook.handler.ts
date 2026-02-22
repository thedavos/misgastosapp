import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";
import { WebhookParseError, WebhookVerificationError } from "@/app/errors";

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

    const isChannelEnabled = yield* Effect.tryPromise({
      try: () =>
        container.channelPolicyRepo.isChannelEnabledForCustomer({
          customerId: customer.id,
          channelId: incomingMessage.channel,
        }),
      catch: (cause) => new WebhookParseError({ requestId, cause }),
    });

    if (!isChannelEnabled) {
      container.logger.warn("whatsapp.webhook_channel_disabled", {
        requestId,
        customerId: customer.id,
        channel: incomingMessage.channel,
      });
      return new Response("Channel disabled", { status: 403 });
    }

    yield* container.handleUserReply({ customerId: customer.id, message: incomingMessage });

    return new Response("ok", { status: 200 });
  });

  const result = await Effect.runPromiseExit(effect);

  if (result._tag === "Failure") {
    container.logger.error("whatsapp.webhook_error", {
      requestId,
      cause: result.cause,
      error: result.cause,
    });
    return new Response("Internal Server Error", { status: 500 });
  }

  return result.value;
}
