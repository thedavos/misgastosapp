import { describe, expect, it } from "vitest";
import { createD1WebhookEventRepo } from "@/adapters/persistence/d1/webhook-event.repo";
import { createTestEnv } from "test/helpers/fakes";

describe("d1 webhook event repo integration", () => {
  it("tracks NEW, processed duplicates and inflight duplicates", async () => {
    const env = createTestEnv();
    const repo = createD1WebhookEventRepo(env);

    const first = await repo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_1",
      payloadHash: "hash_1",
      requestId: "req_1",
    });
    expect(first).toBe("NEW");

    const inflight = await repo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_1",
      payloadHash: "hash_1",
      requestId: "req_2",
    });
    expect(inflight).toBe("DUPLICATE_INFLIGHT");

    await repo.markProcessed({ provider: "kapso_whatsapp", eventId: "evt_1" });

    const processed = await repo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_1",
      payloadHash: "hash_1",
      requestId: "req_3",
    });
    expect(processed).toBe("DUPLICATE_PROCESSED");
  });

  it("allows retry from FAILED state and supports cleanup", async () => {
    const env = createTestEnv();
    const repo = createD1WebhookEventRepo(env);

    await repo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_2",
      payloadHash: "hash_2",
      requestId: "req_1",
    });

    await repo.markFailed({
      provider: "kapso_whatsapp",
      eventId: "evt_2",
      errorMessage: "boom",
    });

    const resumed = await repo.tryStartProcessing({
      provider: "kapso_whatsapp",
      eventId: "evt_2",
      payloadHash: "hash_2_new",
      requestId: "req_2",
    });
    expect(resumed).toBe("RETRY_ALLOWED");

    const dbState = (env.DB as unknown as {
      __state: { inboundWebhookEvents: Map<string, { last_seen_at: string }> };
    }).__state;

    const key = "kapso_whatsapp:evt_old";
    dbState.inboundWebhookEvents.set(key, {
      id: "old",
      provider: "kapso_whatsapp",
      event_id: "evt_old",
      status: "PROCESSED",
      payload_hash: "h",
      request_id: null,
      attempt_count: 1,
      first_seen_at: "2020-01-01T00:00:00.000Z",
      last_seen_at: "2020-01-01T00:00:00.000Z",
      processed_at: "2020-01-01T00:00:00.000Z",
      last_error: null,
    });

    await repo.cleanupOld({ provider: "kapso_whatsapp", retentionDays: 30 });
    expect(dbState.inboundWebhookEvents.has(key)).toBe(false);
  });
});
