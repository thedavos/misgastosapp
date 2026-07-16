import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createHandleUserReply } from "@/app/handle-user-reply";

describe("handle user reply", () => {
  it("categorizes expense when confidence is above threshold", async () => {
    const markConfirmed = vi.fn().mockResolvedValue(undefined);
    const deleteState = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

    const handleUserReply = createHandleUserReply({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn().mockResolvedValue({ categoryId: "cat_food", confidence: 0.9 }),
        generateMessage: vi.fn().mockResolvedValue("Listo, guardado en Comida."),
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
        createExpenseRecord: vi.fn(),
        getById: vi.fn().mockResolvedValue({ id: "exp_1", userId: "cust_default" }),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed,
      },
      categoryRepo: {
        listAll: vi.fn().mockResolvedValue([{ id: "cat_food", name: "Comida", slug: "comida" }]),
        getByName: vi.fn(),
        getById: vi.fn().mockResolvedValue({ id: "cat_food", name: "Comida", slug: "comida" }),
        resolveOrFallback: vi
          .fn()
          .mockResolvedValue({ id: "cat_food", name: "Comida", slug: "comida" }),
      },
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue({
          userId: "cust_default",
          channel: "whatsapp",
          externalUserId: "u1",
          expenseId: "exp_1",
          createdAt: "now",
        }),
        delete: deleteState,
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      confidenceThreshold: 0.75,
    });

    const result = await Effect.runPromise(
      handleUserReply({
        userId: "cust_default",
        message: {
          channel: "whatsapp",
          externalUserId: "u1",
          text: "comida",
          timestamp: new Date().toISOString(),
          raw: {},
        },
      }),
    );

    expect(result).toEqual({ categorized: true });
    expect(markConfirmed).toHaveBeenCalledWith({
      id: "exp_1",
      userId: "cust_default",
      categoryId: "cat_food",
    });
    expect(deleteState).toHaveBeenCalledWith({
      userId: "cust_default",
      channel: "whatsapp",
      externalUserId: "u1",
    });
    expect(sendMessage).toHaveBeenCalled();
  });
});
