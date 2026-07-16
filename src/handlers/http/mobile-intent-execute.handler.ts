import type { WorkerEnv } from "types/env";
import {
  ChannelDisabledError,
  ChannelSettingMissingError,
  SubscriptionFeatureBlockedError,
} from "@/app/errors";
import { createExecuteMobileIntent } from "@/app/execute-mobile-intent";
import { createContainer } from "@/composition/container";
import { resolveMobileIntentRequest } from "@/handlers/http/mobile-intent-request";

export async function handleMobileIntentExecute(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  const resolvedRequest = await resolveMobileIntentRequest({
    request,
    userRepo: container.userRepo,
    mobileApiTokens: env.MOBILE_API_TOKENS,
  });

  if (!resolvedRequest.ok) {
    return resolvedRequest.response;
  }

  const { userId, text, user } = resolvedRequest.value;

  const executeMobileIntent = createExecuteMobileIntent({
    parseUserIntent: container.parseUserIntent,
    expenseRepo: container.expenseRepo,
    authorizeChannel: container.authorizeChannel,
  });

  try {
    const result = await executeMobileIntent({
      userId,
      text,
      timezone: user.timezone,
      defaultCurrency: user.defaultCurrency,
      nowIso: new Date().toISOString(),
      requestId,
    });

    return Response.json(result, { status: result.handled ? 200 : 422 });
  } catch (error) {
    if (error instanceof ChannelDisabledError || error instanceof ChannelSettingMissingError) {
      return Response.json({ error: "channel_disabled" }, { status: 403 });
    }
    if (error instanceof SubscriptionFeatureBlockedError) {
      return Response.json({ error: "payment_required" }, { status: 402 });
    }
    throw error;
  }
}
