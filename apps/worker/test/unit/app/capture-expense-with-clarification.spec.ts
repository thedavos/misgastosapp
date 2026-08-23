import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createCaptureExpenseWithClarification } from "@/app/capture-expense-with-clarification";

describe("ingest expense from email", () => {
  it("creates pending expense and stores conversation state", async () => {
    const createExpenseRecord = vi.fn().mockResolvedValue({
      id: "exp_1",
      userId: "cust_default",
      amount: 55,
      currency: "PEN",
      merchant: "Tambo",
    });
    const put = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });
    const generateMessage = vi.fn();

    const ingest = createCaptureExpenseWithClarification({
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
        generateMessage,
      },
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        getChannel: vi.fn(),
        getUserChannelSetting: vi.fn(),
        isChannelEnabledForUser: vi.fn().mockResolvedValue(true),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createExpenseRecord,
        getById: vi.fn(),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed: vi.fn(),
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
        userId: "cust_default",
        sourceText: "mail text",
        channel: "whatsapp",
        externalUserId: "51999999999",
      }),
    );

    expect(result).toEqual({ expenseId: "exp_1" });
    expect(createExpenseRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "cust_default",
      }),
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        expenseId: "exp_1",
      }),
    );
    expect(generateMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      externalUserId: "51999999999",
      text: "Vi S/. 55.00 en Tambo. ¿Qué categoría le pongo? (Comida, Transporte, Compras, Servicios, Otros)",
    });
  });

  it("does not persist when the channel is disabled", async () => {
    const createExpenseRecord = vi.fn();
    const put = vi.fn();
    const ingest = createCaptureExpenseWithClarification({
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
        generateMessage: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn(),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      channelPolicyRepo: {
        getChannel: vi.fn(),
        getUserChannelSetting: vi.fn(),
        isChannelEnabledForUser: vi.fn().mockResolvedValue(false),
      },
      featurePolicy: {
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createExpenseRecord,
        getById: vi.fn(),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed: vi.fn(),
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

    const exit = await Effect.runPromiseExit(
      ingest({
        userId: "cust_default",
        sourceText: "mail text",
        channel: "whatsapp",
        externalUserId: "51999999999",
      }),
    );

    expect(exit._tag).toBe("Failure");
    expect(createExpenseRecord).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
