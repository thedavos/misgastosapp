import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createCreateExpenseFromIntent } from "@/app/create-expense-from-intent";

describe("create expense from intent", () => {
  it("persists and confirms when the payload is sufficient", async () => {
    const createExpenseRecord = vi.fn().mockResolvedValue({
      id: "exp_1",
      customerId: "cust_default",
      amount: 18,
      currency: "PEN",
      merchant: "Tambo",
      occurredAt: "2026-04-22T10:00:00.000Z",
      bank: "unknown",
      rawText: "S/ 18 en Tambo",
      status: "needs_clarification",
      categoryId: null,
      createdAt: "now",
      updatedAt: "now",
    });
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

    const createExpenseFromIntent = createCreateExpenseFromIntent({
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
        createExpenseRecord,
        getById: vi.fn(),
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

    const result = await Effect.runPromise(
      createExpenseFromIntent({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        payload: {
          draft: {
            amountMinor: 1800,
            currency: "PEN",
            merchant: "Tambo",
            description: "S/ 18 en Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
          },
          missingFields: [],
          confidence: 0.9,
        },
      }),
    );

    expect(createExpenseRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 18,
        currency: "PEN",
        merchant: "Tambo",
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith({
      userId: "51999999999",
      text: "Listo. Registré S/. 18.00 en Tambo.",
    });
    expect(result).toEqual({ expenseId: "exp_1" });
  });

  it("returns null when critical fields are missing", async () => {
    const createExpenseFromIntent = createCreateExpenseFromIntent({
      channel: {
        sendMessage: vi.fn(),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        isChannelEnabledForCustomer: vi.fn(),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn(),
      },
      expenseRepo: {
        createExpenseRecord: vi.fn(),
        getById: vi.fn(),
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

    const result = await Effect.runPromise(
      createExpenseFromIntent({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        payload: {
          draft: {
            currency: "PEN",
            merchant: "Tambo",
          },
          missingFields: ["amount"],
          confidence: 0.5,
        },
      }),
    );

    expect(result).toBeNull();
  });
});
