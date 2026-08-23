import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createHandleUserReply } from "@/app/handle-user-reply";

describe("handle user reply", () => {
  it("categorizes expense when confidence is above threshold", async () => {
    const markConfirmed = vi.fn().mockResolvedValue(undefined);
    const deleteState = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });
    const generateMessage = vi.fn();

    const handleUserReply = createHandleUserReply({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn().mockResolvedValue({ categoryId: "cat_food", confidence: 0.9 }),
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
    expect(generateMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      externalUserId: "u1",
      text: "Listo, ya lo guardé en Comida.",
    });
  });

  it("retries with category options when confidence is low", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_2" });

    const handleUserReply = createHandleUserReply({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn().mockResolvedValue({ categoryId: null, confidence: 0.2 }),
        generateMessage: vi.fn(),
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
        markConfirmed: vi.fn(),
      },
      categoryRepo: {
        listAll: vi.fn().mockResolvedValue([
          { id: "cat_food", name: "Comida", slug: "comida" },
          { id: "cat_otros", name: "Otros", slug: "otros" },
        ]),
        getByName: vi.fn(),
        getById: vi.fn(),
        resolveOrFallback: vi.fn(),
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
        delete: vi.fn(),
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
          text: "tal vez",
          timestamp: new Date().toISOString(),
          raw: {},
        },
      }),
    );

    expect(result).toEqual({ categorized: false });
    expect(sendMessage).toHaveBeenCalledWith({
      externalUserId: "u1",
      text: "No me quedó clara la categoría. Opciones: Comida, Otros.",
    });
  });
});
