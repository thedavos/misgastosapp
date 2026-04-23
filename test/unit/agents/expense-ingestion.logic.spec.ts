import { Effect } from "effect";
import { createTestEnv } from "test/helpers/fakes";
import { describe, expect, it, vi } from "vitest";
import {
  processExpenseJobAttempt,
  runExpenseProcessingJobOnce,
} from "@/agents/expense-ingestion.logic";
import { WHATSAPP_PROVIDER, type ExpenseProcessingJob } from "@/agents/expense-ingestion.shared";
import { createContainer } from "@/composition/container";

function makeJob(overrides?: Partial<ExpenseProcessingJob>): ExpenseProcessingJob {
  return {
    provider: WHATSAPP_PROVIDER,
    eventId: "evt_1",
    userId: "cust_default",
    channel: "whatsapp",
    externalUserId: "51999999999",
    text: "comida",
    raw: { id: "evt_1" },
    timestamp: new Date().toISOString(),
    requestId: "req_1",
    attempt: 0,
    ...overrides,
  };
}

describe("expense ingestion logic", () => {
  it("marks inbound webhook as processed when job succeeds", async () => {
    const env = createTestEnv();
    const container = createContainer(env);

    const created = await Effect.runPromise(
      container.captureExpenseWithClarification({
        customerId: "cust_default",
        sourceText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        externalUserId: "51999999999",
      }),
    );
    expect(created?.expenseId).toBeTruthy();

    await container.webhookEventRepo.tryStartProcessing({
      provider: WHATSAPP_PROVIDER,
      eventId: "evt_1",
      payloadHash: "hash_1",
      requestId: "req_1",
    });

    const result = await runExpenseProcessingJobOnce(env, makeJob());
    expect(result).toEqual({ ok: true });

    const dbState = (
      env.DB as unknown as {
        __state: {
          inboundWebhookEvents: Map<string, { status: "PROCESSING" | "PROCESSED" | "FAILED" }>;
        };
      }
    ).__state;

    expect(dbState.inboundWebhookEvents.get("kapso_whatsapp:evt_1")?.status).toBe("PROCESSED");
  });

  it("creates the expense directly for WhatsApp without opening pending conversation state", async () => {
    const env = createTestEnv();
    const container = createContainer(env);

    await container.webhookEventRepo.tryStartProcessing({
      provider: WHATSAPP_PROVIDER,
      eventId: "evt_direct_1",
      payloadHash: "hash_direct_1",
      requestId: "req_direct_1",
    });

    const result = await runExpenseProcessingJobOnce(
      env,
      makeJob({
        eventId: "evt_direct_1",
        requestId: "req_direct_1",
        text: "S/ 50 en Tambo",
      }),
    );

    expect(result).toEqual({ ok: true });

    const dbState = (
      env.DB as unknown as {
        __state: {
          expenses: Map<string, { merchant: string; status: string }>;
        };
      }
    ).__state;

    expect(dbState.expenses.size).toBe(1);
    expect(Array.from(dbState.expenses.values())[0]).toMatchObject({
      merchant: "Tambo",
      status: "needs_clarification",
    });

    const pendingState = await env.CONVERSATION_STATE_KV.get(
      "conv:cust_default:whatsapp:51999999999",
    );
    expect(pendingState).toBeNull();
  });

  it("updates the latest WhatsApp expense directly when the correction patch is explicit", async () => {
    const env = createTestEnv();
    const container = createContainer(env);

    await Effect.runPromise(
      container.processChatMessage({
        customerId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_update_seed_1",
        text: "S/ 50 en Tambo",
      }),
    );

    await container.webhookEventRepo.tryStartProcessing({
      provider: WHATSAPP_PROVIDER,
      eventId: "evt_update_direct_1",
      payloadHash: "hash_update_direct_1",
      requestId: "req_update_direct_1",
    });

    const result = await runExpenseProcessingJobOnce(
      env,
      makeJob({
        eventId: "evt_update_direct_1",
        requestId: "req_update_direct_1",
        text: "Corrige el último gasto, fueron S/ 70",
      }),
    );

    expect(result).toEqual({ ok: true });

    const dbState = (
      env.DB as unknown as {
        __state: {
          expenses: Map<string, { amount: number; merchant: string; status: string }>;
        };
      }
    ).__state;

    expect(dbState.expenses.size).toBe(1);
    expect(Array.from(dbState.expenses.values())[0]).toMatchObject({
      amount: 70,
      merchant: "Tambo",
      status: "needs_clarification",
    });
  });

  it("discards the latest WhatsApp expense directly when asked to delete it", async () => {
    const env = createTestEnv();
    const container = createContainer(env);

    await Effect.runPromise(
      container.processChatMessage({
        customerId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_delete_seed_1",
        text: "S/ 50 en Tambo",
      }),
    );

    await container.webhookEventRepo.tryStartProcessing({
      provider: WHATSAPP_PROVIDER,
      eventId: "evt_delete_direct_1",
      payloadHash: "hash_delete_direct_1",
      requestId: "req_delete_direct_1",
    });

    const result = await runExpenseProcessingJobOnce(
      env,
      makeJob({
        eventId: "evt_delete_direct_1",
        requestId: "req_delete_direct_1",
        text: "Elimina el último gasto",
      }),
    );

    expect(result).toEqual({ ok: true });

    const dbState = (
      env.DB as unknown as {
        __state: {
          expenses: Map<string, { status: string }>;
        };
      }
    ).__state;

    expect(dbState.expenses.size).toBe(1);
    expect(Array.from(dbState.expenses.values())[0]).toMatchObject({
      status: "deleted",
    });
  });

  it("schedules retry for a failed attempt while retries remain", async () => {
    const scheduleRetry = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const sendFinalRetryMessage = vi.fn().mockResolvedValue(undefined);

    const outcome = await processExpenseJobAttempt({
      job: makeJob({ attempt: 0 }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runJob: vi.fn().mockResolvedValue({ ok: false, errorMessage: "boom" }),
      scheduleRetry,
      markFailed,
      sendFinalRetryMessage,
    });

    expect(outcome).toBe("retry_scheduled");
    expect(scheduleRetry).toHaveBeenCalledWith(5, expect.objectContaining({ attempt: 1 }));
    expect(markFailed).not.toHaveBeenCalled();
    expect(sendFinalRetryMessage).not.toHaveBeenCalled();
  });

  it("marks failed and notifies user on final retry exhaustion", async () => {
    const scheduleRetry = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const sendFinalRetryMessage = vi.fn().mockResolvedValue(undefined);

    const outcome = await processExpenseJobAttempt({
      job: makeJob({ attempt: 3 }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runJob: vi.fn().mockResolvedValue({ ok: false, errorMessage: "permanent" }),
      scheduleRetry,
      markFailed,
      sendFinalRetryMessage,
    });

    expect(outcome).toBe("failed_final");
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3 }), "permanent");
    expect(sendFinalRetryMessage).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3 }));
  });
});
