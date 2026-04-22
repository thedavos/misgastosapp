import type { WorkerEnv } from "types/env";
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
    customerRepo: container.customerRepo,
  });

  if (!resolvedRequest.ok) {
    return resolvedRequest.response;
  }

  const { customerId, text, customer } = resolvedRequest.value;

  const executeMobileIntent = createExecuteMobileIntent({
    parseUserIntent: container.parseUserIntent,
    expenseRepo: container.expenseRepo,
  });

  const result = await executeMobileIntent({
    customerId,
    text,
    timezone: customer.timezone,
    defaultCurrency: customer.defaultCurrency,
    nowIso: new Date().toISOString(),
    requestId,
  });

  return Response.json(result, { status: result.handled ? 200 : 422 });
}
