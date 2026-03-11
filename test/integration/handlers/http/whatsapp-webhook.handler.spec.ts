import { Effect } from "effect";
import { createTestEnv } from "test/helpers/fakes";
import { describe, expect, it } from "vitest";
import { createContainer } from "@/composition/container";
import { handleWhatsAppWebhook } from "@/handlers/http/whatsapp-webhook.handler";

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

function getEnqueuedJobs(env: ReturnType<typeof createTestEnv>) {
  return (
    env.ExpenseIngestionAgent as unknown as {
      __state: {
        enqueuedJobs: Array<{
          agentName: string;
          job: {
            eventId: string;
            customerId: string;
            channel: string;
            userId: string;
            attempt: number;
          };
        }>;
      };
    }
  ).__state.enqueuedJobs;
}

describe("whatsapp webhook integration", () => {
  it("enqueues processing and returns 200 without inline execution", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const container = createContainer(env);

    const created = await Effect.runPromise(
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );
    expect(created?.expenseId).toBeTruthy();

    const response = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({
        body: {
          id: "evt_async_1",
          from: "51999999999",
          text: "comida",
          timestamp: Date.now(),
        },
        secret: "topsecret",
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getEnqueuedJobs(env)).toHaveLength(1);
    expect(getEnqueuedJobs(env)[0]?.job).toMatchObject({
      eventId: "evt_async_1",
      customerId: "cust_default",
      channel: "whatsapp",
      userId: "51999999999",
      attempt: 0,
    });

    const expenseId = created?.expenseId as string;
    const dbState = (
      env.DB as unknown as {
        __state: { expenses: Map<string, { status: string }> };
      }
    ).__state;

    expect(dbState.expenses.get(expenseId)?.status).toBe("PENDING_CATEGORY");
    const pending = await env.CONVERSATION_STATE_KV.get("conv:cust_default:whatsapp:51999999999");
    expect(pending).not.toBeNull();
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

  it("returns 200 and skips enqueue when event is already inflight", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const dbState = (
      env.DB as unknown as {
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
      }
    ).__state;

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

    const response = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({
        body: {
          id: "evt_inflight_1",
          from: "51999999999",
          text: "comida",
          timestamp: Date.now(),
        },
        secret: "topsecret",
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getEnqueuedJobs(env)).toHaveLength(0);
  });

  it("re-enqueues when prior event status is FAILED (RETRY_ALLOWED)", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const container = createContainer(env);

    await container.webhookEventRepo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_retry_allowed_1",
      payloadHash: "hash_initial",
      requestId: "req_1",
    });
    await container.webhookEventRepo.markFailed({
      provider: "kapso_whatsapp",
      eventId: "evt_retry_allowed_1",
      errorMessage: "previous error",
    });

    const response = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({
        body: {
          id: "evt_retry_allowed_1",
          from: "51999999999",
          text: "comida",
          timestamp: Date.now(),
        },
        secret: "topsecret",
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getEnqueuedJobs(env)).toHaveLength(1);
    expect(getEnqueuedJobs(env)[0]?.job.eventId).toBe("evt_retry_allowed_1");
  });

  it("marks event as failed and returns 500 when enqueue fails", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
      expenseIngestionEnqueueStatus: 500,
    });

    const response = await handleWhatsAppWebhook(
      await makeSignedWebhookRequest({
        body: {
          id: "evt_enqueue_fail_1",
          from: "51999999999",
          text: "comida",
          timestamp: Date.now(),
        },
        secret: "topsecret",
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    expect(getEnqueuedJobs(env)).toHaveLength(0);

    const dbState = (
      env.DB as unknown as {
        __state: {
          inboundWebhookEvents: Map<string, { status: "PROCESSING" | "PROCESSED" | "FAILED" }>;
        };
      }
    ).__state;

    expect(dbState.inboundWebhookEvents.get("kapso_whatsapp:evt_enqueue_fail_1")?.status).toBe(
      "FAILED",
    );
  });
});
