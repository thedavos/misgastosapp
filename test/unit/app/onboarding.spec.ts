import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { WHATSAPP_ONBOARDING_MESSAGE } from "@/app/onboarding";
import { createProcessChatMessage } from "@/app/process-chat-message";

describe("chat onboarding", () => {
  it("sends onboarding once for users without onboarding_completed_at", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });
    const markOnboardingCompleted = vi.fn().mockResolvedValue(undefined);
    const getById = vi.fn().mockResolvedValue({
      id: "cust_new",
      name: "New",
      status: "ACTIVE",
      defaultCurrency: "PEN",
      timezone: "America/Lima",
      locale: "es-PE",
      confidenceThreshold: 0.75,
      onboardingCompletedAt: null,
    });

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: { extractTextFromImage: vi.fn() },
      chatMediaRepo: {
        create: vi.fn(),
        linkExpense: vi.fn(),
        listByExpenseId: vi.fn(),
        deleteExpired: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      userRepo: {
        getById,
        findByChannelExternalId: vi.fn(),
        findOrCreateByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
        markOnboardingCompleted,
      },
      fallbackExpenseCapture: vi
        .fn()
        .mockImplementation(() => Effect.succeed({ expenseId: "exp_1" })),
      handleUserReply: vi.fn(),
    });

    await Effect.runPromise(
      processChatMessage({
        userId: "cust_new",
        channel: "whatsapp",
        externalUserId: "51911111111",
        providerEventId: "evt_onboard_1",
        text: "S/ 10 en Tambo",
      }),
    );

    expect(sendMessage).toHaveBeenCalledWith({
      externalUserId: "51911111111",
      text: WHATSAPP_ONBOARDING_MESSAGE,
    });
    expect(markOnboardingCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "cust_new" }),
    );
  });

  it("does not resend onboarding for returning users", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });
    const markOnboardingCompleted = vi.fn();

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage,
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: { extractTextFromImage: vi.fn() },
      chatMediaRepo: {
        create: vi.fn(),
        linkExpense: vi.fn(),
        listByExpenseId: vi.fn(),
        deleteExpired: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      userRepo: {
        getById: vi.fn().mockResolvedValue({
          id: "cust_old",
          name: "Old",
          status: "ACTIVE",
          defaultCurrency: "PEN",
          timezone: "America/Lima",
          locale: "es-PE",
          confidenceThreshold: 0.75,
          onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
        }),
        findByChannelExternalId: vi.fn(),
        findOrCreateByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
        markOnboardingCompleted,
      },
      fallbackExpenseCapture: vi
        .fn()
        .mockImplementation(() => Effect.succeed({ expenseId: "exp_1" })),
      handleUserReply: vi.fn(),
    });

    await Effect.runPromise(
      processChatMessage({
        userId: "cust_old",
        channel: "whatsapp",
        externalUserId: "51911111111",
        providerEventId: "evt_onboard_2",
        text: "S/ 10 en Tambo",
      }),
    );

    expect(markOnboardingCompleted).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: WHATSAPP_ONBOARDING_MESSAGE }),
    );
  });
});
