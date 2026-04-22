import type { Customer } from "@/domain/customer/entity";
import type { CustomerRepoPort } from "@/ports/customer-repo.port";

export type ResolvedMobileIntentRequest = {
  customerId: string;
  text: string;
  customer: Customer;
};

export type ResolveMobileIntentRequestResult =
  | {
      ok: true;
      value: ResolvedMobileIntentRequest;
    }
  | {
      ok: false;
      response: Response;
    };

export async function resolveMobileIntentRequest(input: {
  request: Request;
  customerRepo: CustomerRepoPort;
}): Promise<ResolveMobileIntentRequestResult> {
  let payload: unknown;
  try {
    payload = await input.request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      response: Response.json({ error: "invalid_payload" }, { status: 400 }),
    };
  }

  const record = payload as Record<string, unknown>;
  const customerId = typeof record.customerId === "string" ? record.customerId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!customerId || !text) {
    return {
      ok: false,
      response: Response.json({ error: "customerId_and_text_required" }, { status: 400 }),
    };
  }

  const customer = await input.customerRepo.getById(customerId);
  if (!customer) {
    return {
      ok: false,
      response: Response.json({ error: "customer_not_found" }, { status: 404 }),
    };
  }

  return {
    ok: true,
    value: {
      customerId,
      text,
      customer,
    },
  };
}
