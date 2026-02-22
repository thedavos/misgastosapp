import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createContainer } from "@/composition/container";
import { handleWhatsAppWebhook } from "@/handlers/http/whatsapp-webhook.handler";
import { createTestEnv } from "test/helpers/fakes";

describe("whatsapp webhook integration", () => {
  it("categorizes a pending expense and clears KV state", async () => {
    const env = createTestEnv();
    const container = createContainer(env);

    const created = await Effect.runPromise(
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );

    expect(created).toBeTruthy();

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "51999999999",
        text: "comida",
        timestamp: Date.now(),
      }),
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(200);

    const expenseId = created?.expenseId as string;
    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; category_id: string | null }> };
    }).__state;

    const expense = dbState.expenses.get(expenseId);
    expect(expense?.status).toBe("CATEGORIZED");
    expect(expense?.category_id).toBe("cat_food");

    const pending = await env.CONVERSATION_STATE_KV.get("conv:cust_default:whatsapp:51999999999");
    expect(pending).toBeNull();
  });

  it("returns 404 when customer mapping does not exist", async () => {
    const env = createTestEnv();

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "00000000000",
        text: "comida",
        timestamp: Date.now(),
      }),
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(404);
  });

  it("returns 403 when channel is disabled for customer", async () => {
    const env = createTestEnv({
      channelSettings: [
        {
          id: "ccs_cust_default_whatsapp",
          customer_id: "cust_default",
          channel_id: "whatsapp",
          enabled: 0,
          is_primary: 1,
          config_json: null,
        },
      ],
    });

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "51999999999",
        text: "comida",
        timestamp: Date.now(),
      }),
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(403);
  });
});
