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
    customerId: "cust_default",
    channel: "whatsapp",
    userId: "51999999999",
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
      container.ingestExpenseFromEmail({
        customerId: "cust_default",
        emailText: "Compra por S/ 50 en Tambo",
        channel: "whatsapp",
        userId: "51999999999",
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
