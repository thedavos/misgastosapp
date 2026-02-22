import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createIngestExpenseFromEmail } from "@/app/ingest-expense-from-email";

describe("ingest expense from email", () => {
  it("creates pending expense and stores conversation state", async () => {
    const createPending = vi.fn().mockResolvedValue({
      id: "exp_1",
      customerId: "cust_default",
      amount: 55,
      currency: "PEN",
      merchant: "Tambo",
    });
    const put = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

    const ingest = createIngestExpenseFromEmail({
      ai: {
        extractTransaction: vi.fn().mockResolvedValue({
          amount: 55,
          currency: "PEN",
          symbol: "S/",
          merchant: "Tambo",
          date: "2026-02-21T10:00:00.000Z",
          bank: "BCP",
          rawText: "raw",
        }),
        classifyCategory: vi.fn(),
        generateMessage: vi.fn().mockResolvedValue("¿Qué categoría le pongo?"),
      },
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        getChannel: vi.fn(),
        getCustomerChannelSetting: vi.fn(),
        isChannelEnabledForCustomer: vi.fn().mockResolvedValue(true),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createPending,
        getById: vi.fn(),
        markCategorized: vi.fn(),
      },
      conversationState: {
        put,
        get: vi.fn(),
        delete: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const result = await Effect.runPromise(
      ingest({
        customerId: "cust_default",
        emailText: "mail text",
        channel: "whatsapp",
        userId: "51999999999",
      }),
    );

    expect(result).toEqual({ expenseId: "exp_1" });
    expect(createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cust_default",
      }),
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        expenseId: "exp_1",
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith({
      userId: "51999999999",
      text: "¿Qué categoría le pongo?",
    });
  });
});
