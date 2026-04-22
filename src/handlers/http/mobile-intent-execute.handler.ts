import type { WorkerEnv } from "types/env";
import { createExecuteMobileIntent } from "@/app/execute-mobile-intent";
import { createContainer } from "@/composition/container";

export async function handleMobileIntentExecute(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  const customerId = typeof record.customerId === "string" ? record.customerId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!customerId || !text) {
    return Response.json({ error: "customerId_and_text_required" }, { status: 400 });
  }

  const customer = await container.customerRepo.getById(customerId);
  if (!customer) {
    return Response.json({ error: "customer_not_found" }, { status: 404 });
  }

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
