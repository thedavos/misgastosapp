import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createHandleUserReply } from "@/app/handle-user-reply";

describe("handle user reply", () => {
  it("categorizes expense when confidence is above threshold", async () => {
    const markCategorized = vi.fn().mockResolvedValue(undefined);
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
        getCustomerChannelSetting: vi.fn(),
        isChannelEnabledForCustomer: vi.fn().mockResolvedValue(true),
      },
      expenseRepo: {
        createPending: vi.fn(),
        getById: vi.fn().mockResolvedValue({ id: "exp_1", customerId: "cust_default" }),
        markCategorized,
      },
      categoryRepo: {
        listAll: vi.fn().mockResolvedValue([{ id: "cat_food", name: "Comida", slug: "comida" }]),
        getByName: vi.fn(),
        getById: vi.fn().mockResolvedValue({ id: "cat_food", name: "Comida", slug: "comida" }),
      },
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue({
          customerId: "cust_default",
          channel: "whatsapp",
          userId: "u1",
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
        customerId: "cust_default",
        message: {
          channel: "whatsapp",
          userId: "u1",
          text: "comida",
          timestamp: new Date().toISOString(),
          raw: {},
        },
      }),
    );

    expect(result).toEqual({ categorized: true });
    expect(markCategorized).toHaveBeenCalledWith({
      id: "exp_1",
      customerId: "cust_default",
      categoryId: "cat_food",
    });
    expect(deleteState).toHaveBeenCalledWith({
      customerId: "cust_default",
      channel: "whatsapp",
      userId: "u1",
    });
    expect(sendMessage).toHaveBeenCalled();
  });
});
