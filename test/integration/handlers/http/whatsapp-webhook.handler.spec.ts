import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createContainer } from "@/composition/container";
import { handleWhatsAppWebhook } from "@/handlers/http/whatsapp-webhook.handler";
import { createTestEnv } from "test/helpers/fakes";

async function hmacSignature(secret: string, timestamp: number, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `v1=${hex}`;
}

async function makeSignedWebhookRequest(input: {
  body: Record<string, unknown>;
  secret: string;
  method?: string;
}): Promise<Request> {
  const method = input.method ?? "POST";
  const rawBody = JSON.stringify(input.body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacSignature(input.secret, timestamp, rawBody);

  return new Request("https://example.com/webhooks/whatsapp", {
    method,
    headers: {
      "content-type": "application/json",
      "x-kapso-signature": signature,
      "x-kapso-timestamp": String(timestamp),
    },
    body: rawBody,
  });
}

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

  it("returns 402 when subscription blocks channel feature", async () => {
    const env = createTestEnv({
      planFeatures: [
        {
          id: "pf_free_whatsapp",
          plan_id: "free",
          feature_key: "channels.whatsapp",
          feature_type: "boolean",
          bool_value: 0,
          limit_value: null,
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
    expect(response.status).toBe(402);
  });

  it("creates pending expense from whatsapp image-only message", async () => {
    const env = createTestEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
        },
      }),
    );

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "evt_image_1",
        from: "51999999999",
        mediaUrl: "https://media.example.com/receipt-1.jpg",
        mediaMimeType: "image/jpeg",
        timestamp: Date.now(),
      }),
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(200);

    const dbState = (env.DB as unknown as {
      __state: {
        expenses: Map<string, { status: string }>;
        chatMedia: Map<string, { expense_id: string | null }>;
      };
    }).__state;

    expect(dbState.expenses.size).toBe(1);
    expect(dbState.chatMedia.size).toBe(1);

    fetchSpy.mockRestore();
  });

  it("returns 401 on invalid signature in strict mode", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "evt_invalid_sig",
        from: "51999999999",
        text: "comida",
        timestamp: Date.now(),
      }),
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("ignores duplicate events by provider event id", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const container = createContainer(env);

    await Effect.runPromise(
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );

    const body = {
      id: "evt_dup_1",
      from: "51999999999",
      text: "comida",
      timestamp: Date.now(),
    };

    const first = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({ body, secret: "topsecret" }),
      env,
      {} as ExecutionContext,
    );
    expect(first.status).toBe(200);

    const second = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({ body, secret: "topsecret" }),
      env,
      {} as ExecutionContext,
    );
    expect(second.status).toBe(200);

    const dbState = (env.DB as unknown as {
      __state: {
        expenseEvents: Array<{ type: string }>;
      };
    }).__state;

    expect(dbState.expenseEvents).toHaveLength(1);
  });

  it("retries processing when prior event state is FAILED", async () => {
    let shouldFail = true;
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
      aiRun: async (_model, params) => {
        const messages = Array.isArray(params.messages)
          ? (params.messages as Array<{ content?: string }>)
          : [];
        const prompt = messages.map((m) => m.content ?? "").join("\n");

        if (prompt.includes("Clasifica la respuesta del usuario") && shouldFail) {
          shouldFail = false;
          throw new Error("forced classify failure");
        }

        if (prompt.includes("Clasifica la respuesta del usuario")) {
          return { response: { categoryId: "cat_food", confidence: 0.99 } };
        }

        if (prompt.includes("Extrae la información de la transacción")) {
          return {
            response: {
              amount: 50,
              currency: "PEN",
              merchant: "Tambo",
              date: "2026-02-20T10:00:00.000Z",
              bank: "BCP",
              rawText: "consumo en tambo",
            },
          };
        }

        return { response: "Listo" };
      },
    });
    const container = createContainer(env);

    await Effect.runPromise(
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );

    const body = {
      id: "evt_retry_1",
      from: "51999999999",
      text: "categoria no exacta",
      timestamp: Date.now(),
    };

    const first = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({ body, secret: "topsecret" }),
      env,
      {} as ExecutionContext,
    );
    expect(first.status).toBe(500);

    const second = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({ body, secret: "topsecret" }),
      env,
      {} as ExecutionContext,
    );
    expect(second.status).toBe(200);
  });

  it("returns 200 when event is already inflight", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const container = createContainer(env);

    await Effect.runPromise(
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );

    const dbState = (env.DB as unknown as {
      __state: {
        inboundWebhookEvents: Map<
          string,
          {
            id: string;
            provider: string;
            event_id: string;
            status: "PROCESSING" | "PROCESSED" | "FAILED";
            payload_hash: string;
            request_id: string | null;
            attempt_count: number;
            first_seen_at: string;
            last_seen_at: string;
            processed_at: string | null;
            last_error: string | null;
          }
        >;
      };
    }).__state;

    dbState.inboundWebhookEvents.set("kapso_whatsapp:evt_inflight_1", {
      id: "id_evt_inflight_1",
      provider: "kapso_whatsapp",
      event_id: "evt_inflight_1",
      status: "PROCESSING",
      payload_hash: "hash_existing",
      request_id: "req_old",
      attempt_count: 1,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      processed_at: null,
      last_error: null,
    });

    const request = await makeSignedWebhookRequest({
      body: {
        id: "evt_inflight_1",
        from: "51999999999",
        text: "comida",
        timestamp: Date.now(),
      },
      secret: "topsecret",
    });

    const response = await handleWhatsAppWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(200);
  });
});
