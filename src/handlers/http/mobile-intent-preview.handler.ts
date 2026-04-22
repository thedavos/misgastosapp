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
    customerRepo: container.customerRepo,
  });

  if (!resolvedRequest.ok) {
    return resolvedRequest.response;
  }

  const { customerId, text, customer } = resolvedRequest.value;

  const parsedIntent = await container.parseUserIntent({
    text,
    context: {
      sourceType: "mobile",
      timezone: customer.timezone,
      defaultCurrency: customer.defaultCurrency,
      nowIso: new Date().toISOString(),
    },
    requestId,
  });

  return Response.json(
    {
      customerId,
      sourceType: "mobile",
      parsedIntent,
    },
    { status: 200 },
  );
}
