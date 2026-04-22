import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createGetReportFromIntent } from "@/app/get-report-from-intent";

describe("get report from intent", () => {
  it("sends a month summary when there are expenses in the current month", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

    const getReportFromIntent = createGetReportFromIntent({
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        isChannelEnabledForCustomer: vi.fn().mockResolvedValue(true),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createExpenseRecord: vi.fn(),
        getById: vi.fn(),
        listByCustomer: vi.fn().mockResolvedValue([
          {
            id: "exp_1",
            customerId: "cust_default",
            amount: 18,
            currency: "PEN",
            merchant: "Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
            bank: "unknown",
            rawText: "x",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-22T10:00:00.000Z",
            updatedAt: "2026-04-22T10:00:00.000Z",
          },
          {
            id: "exp_2",
            customerId: "cust_default",
            amount: 25,
            currency: "PEN",
            merchant: "Metro",
            occurredAt: "2026-04-20T10:00:00.000Z",
            bank: "unknown",
            rawText: "y",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-20T10:00:00.000Z",
            updatedAt: "2026-04-20T10:00:00.000Z",
          },
        ]),
        findLatestByCustomer: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markCategorized: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await Effect.runPromise(
      getReportFromIntent({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        payload: { periodKind: "month", confidence: 0.96 },
        timezone: "America/Lima",
        nowIso: "2026-04-22T20:00:00.000Z",
      }),
    );

    expect(sendMessage).toHaveBeenCalledWith({
      userId: "51999999999",
      text: expect.stringContaining("Resumen de este mes:"),
    });
    expect(sendMessage).toHaveBeenCalledWith({
      userId: "51999999999",
      text: expect.stringContaining("- Total: S/. 43.00"),
    });
  });

  it("sends a top spend ranking for the current month", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

    const getReportFromIntent = createGetReportFromIntent({
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        isChannelEnabledForCustomer: vi.fn().mockResolvedValue(true),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createExpenseRecord: vi.fn(),
        getById: vi.fn(),
        listByCustomer: vi.fn().mockResolvedValue([
          {
            id: "exp_1",
            customerId: "cust_default",
            amount: 18,
            currency: "PEN",
            merchant: "Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
            bank: "unknown",
            rawText: "x",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-22T10:00:00.000Z",
            updatedAt: "2026-04-22T10:00:00.000Z",
          },
          {
            id: "exp_2",
            customerId: "cust_default",
            amount: 30,
            currency: "PEN",
            merchant: "Metro",
            occurredAt: "2026-04-20T10:00:00.000Z",
            bank: "unknown",
            rawText: "y",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-20T10:00:00.000Z",
            updatedAt: "2026-04-20T10:00:00.000Z",
          },
          {
            id: "exp_3",
            customerId: "cust_default",
            amount: 12,
            currency: "PEN",
            merchant: "Metro",
            occurredAt: "2026-04-18T10:00:00.000Z",
            bank: "unknown",
            rawText: "z",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-18T10:00:00.000Z",
            updatedAt: "2026-04-18T10:00:00.000Z",
          },
        ]),
        findLatestByCustomer: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markCategorized: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await Effect.runPromise(
      getReportFromIntent({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        payload: { periodKind: "top_spend", confidence: 0.96 },
        timezone: "America/Lima",
        nowIso: "2026-04-22T20:00:00.000Z",
      }),
    );

    expect(sendMessage).toHaveBeenCalledWith({
      userId: "51999999999",
      text: expect.stringContaining("1. Metro — S/. 42.00"),
    });
  });
});
