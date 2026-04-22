import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";

export async function handleMobileIntentPreview(
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
