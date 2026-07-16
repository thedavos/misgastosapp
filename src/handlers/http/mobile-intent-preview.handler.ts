import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";
import { resolveMobileIntentRequest } from "@/handlers/http/mobile-intent-request";

export async function handleMobileIntentPreview(
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

  const parsedIntent = await container.parseUserIntent({
    text,
    context: {
      sourceType: "mobile",
      timezone: user.timezone,
      defaultCurrency: user.defaultCurrency,
      nowIso: new Date().toISOString(),
    },
    requestId,
  });

  return Response.json(
    {
      userId,
      sourceType: "mobile",
      parsedIntent,
    },
    { status: 200 },
  );
}
