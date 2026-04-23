import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createProcessChatMessage } from "@/app/process-chat-message";

describe("process chat message", () => {
  it("delegates to handleUserReply when there is pending state and text", async () => {
    const handleUserReply = vi.fn().mockImplementation(() => Effect.succeed({ categorized: true }));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue({
          userId: "cust_default",
          channel: "whatsapp",
          externalUserId: "51999999999",
          expenseId: "exp_1",
          createdAt: "now",
        }),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: vi.fn() as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply,
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_1",
        text: "comida",
      }),
    );

    expect(result.categorized).toBe(true);
    expect(handleUserReply).toHaveBeenCalledTimes(1);
  });

  it("sends guidance when there is no pending state and no text or OCR content", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ providerMessageId: "msg_1" });

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
      ocr: {
        extractTextFromImage: vi.fn().mockResolvedValue(null),
      },
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
      fallbackExpenseCapture: vi.fn() as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_2",
        attachments: [],
      }),
    );

    expect(result.guided).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("uses real create_expense path for WhatsApp when parser returns a complete intent", async () => {
    const createExpenseFromIntent = vi
      .fn()
      .mockImplementation(() => Effect.succeed({ expenseId: "exp_intent_1" }));
    const fallbackExpenseCapture = vi.fn().mockImplementation(() => Effect.succeed(null));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      createExpenseFromIntent: createExpenseFromIntent as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["createExpenseFromIntent"],
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "create_expense",
        payload: {
          draft: {
            amountMinor: 1800,
            currency: "PEN",
            merchant: "Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
          },
          missingFields: [],
          confidence: 0.9,
        },
      }),
      resolveIntentContext: vi.fn().mockResolvedValue({
        timezone: "America/Lima",
        defaultCurrency: "PEN",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_intent_1",
        text: "S/ 18 en Tambo",
      }),
    );

    expect(result.expenseId).toBe("exp_intent_1");
    expect(createExpenseFromIntent).toHaveBeenCalledTimes(1);
    expect(fallbackExpenseCapture).not.toHaveBeenCalled();
  });

  it("uses direct update_last_expense path for WhatsApp when the parser returns a strong patch", async () => {
    const updateLastExpenseFromIntent = vi
      .fn()
      .mockImplementation(() => Effect.succeed({ handled: true, expenseId: "exp_updated_1" }));
    const fallbackExpenseCapture = vi.fn().mockImplementation(() => Effect.succeed(null));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      updateLastExpenseFromIntent: updateLastExpenseFromIntent as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["updateLastExpenseFromIntent"],
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "update_last_expense",
        payload: {
          patch: {
            amountMinor: 2000,
            currency: "PEN",
          },
          confidence: 0.92,
        },
      }),
      resolveIntentContext: vi.fn().mockResolvedValue({
        timezone: "America/Lima",
        defaultCurrency: "PEN",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_update_1",
        text: "Corrige el último gasto, fueron S/ 20",
      }),
    );

    expect(result.expenseId).toBe("exp_updated_1");
    expect(updateLastExpenseFromIntent).toHaveBeenCalledTimes(1);
    expect(fallbackExpenseCapture).not.toHaveBeenCalled();
  });

  it("uses direct delete_last_expense path for WhatsApp when confidence is sufficient", async () => {
    const deleteLastExpenseFromIntent = vi
      .fn()
      .mockImplementation(() => Effect.succeed({ handled: true, expenseId: "exp_deleted_1" }));
    const fallbackExpenseCapture = vi.fn().mockImplementation(() => Effect.succeed(null));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      deleteLastExpenseFromIntent: deleteLastExpenseFromIntent as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["deleteLastExpenseFromIntent"],
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "delete_last_expense",
        payload: {
          confidence: 0.93,
        },
      }),
      resolveIntentContext: vi.fn().mockResolvedValue({
        timezone: "America/Lima",
        defaultCurrency: "PEN",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_delete_1",
        text: "Borra el último gasto",
      }),
    );

    expect(result.expenseId).toBe("exp_deleted_1");
    expect(deleteLastExpenseFromIntent).toHaveBeenCalledTimes(1);
    expect(fallbackExpenseCapture).not.toHaveBeenCalled();
  });

  it("uses direct get_report path for WhatsApp when confidence is sufficient", async () => {
    const getReportFromIntent = vi.fn().mockImplementation(() => Effect.succeed({ handled: true }));
    const fallbackExpenseCapture = vi.fn().mockImplementation(() => Effect.succeed(null));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      getReportFromIntent: getReportFromIntent as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["getReportFromIntent"],
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "get_report",
        payload: {
          periodKind: "month",
          confidence: 0.96,
        },
      }),
      resolveIntentContext: vi.fn().mockResolvedValue({
        timezone: "America/Lima",
        defaultCurrency: "PEN",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_report_1",
        text: "Resumen del mes",
      }),
    );

    expect(result.expenseId).toBeUndefined();
    expect(getReportFromIntent).toHaveBeenCalledTimes(1);
    expect(fallbackExpenseCapture).not.toHaveBeenCalled();
  });

  it("falls back when update_last_expense intent is too weak to apply safely", async () => {
    const updateLastExpenseFromIntent = vi
      .fn()
      .mockImplementation(() =>
        Effect.succeed({ handled: true, expenseId: "exp_updated_ignored" }),
      );
    const fallbackExpenseCapture = vi
      .fn()
      .mockImplementation(() => Effect.succeed({ expenseId: "exp_fallback_1" }));

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn(),
      },
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
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      updateLastExpenseFromIntent: updateLastExpenseFromIntent as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["updateLastExpenseFromIntent"],
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "update_last_expense",
        payload: {
          patch: {
            description: "Corrígelo por favor",
          },
          confidence: 0.55,
        },
      }),
      resolveIntentContext: vi.fn().mockResolvedValue({
        timezone: "America/Lima",
        defaultCurrency: "PEN",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_update_weak_1",
        text: "Corrígelo por favor",
      }),
    );

    expect(result.expenseId).toBe("exp_fallback_1");
    expect(updateLastExpenseFromIntent).not.toHaveBeenCalled();
    expect(fallbackExpenseCapture).toHaveBeenCalledTimes(1);
  });

  it("processes OCR attachment and links media to created expense", async () => {
    const createMedia = vi.fn().mockResolvedValue({
      id: "media_1",
      userId: "cust_default",
      channel: "whatsapp",
      externalUserId: "51999999999",
      providerEventId: "evt_3",
      expenseId: null,
      r2Key: "receipts/x",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      sha256: "hash",
      ocrText: "S/ 50 TAMBO",
      createdAt: "now",
      expiresAt: "later",
    });
    const linkExpense = vi.fn().mockResolvedValue(undefined);
    const fallbackExpenseCapture = vi
      .fn()
      .mockImplementation((input: { sourceText: string }) =>
        Effect.succeed(input.sourceText.includes("TAMBO") ? { expenseId: "exp_2" } : null),
      );

    const processChatMessage = createProcessChatMessage({
      conversationState: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
      channel: {
        sendMessage: vi.fn().mockResolvedValue({ providerMessageId: "msg_1" }),
        parseWebhook: vi.fn(),
        verifyWebhook: vi.fn(),
      },
      ocr: {
        extractTextFromImage: vi.fn().mockResolvedValue("S/ 50 TAMBO"),
      },
      chatMediaRepo: {
        create: createMedia,
        linkExpense,
        listByExpenseId: vi.fn(),
        deleteExpired: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      fallbackExpenseCapture: fallbackExpenseCapture as unknown as Parameters<
        typeof createProcessChatMessage
      >[0]["fallbackExpenseCapture"],
      handleUserReply: vi.fn(),
      resolveAttachmentData: vi.fn().mockResolvedValue({
        data: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        userId: "cust_default",
        channel: "whatsapp",
        externalUserId: "51999999999",
        providerEventId: "evt_3",
        attachments: [
          { type: "image", url: "https://example.com/photo.jpg", mimeType: "image/jpeg" },
        ],
      }),
    );

    expect(result.expenseId).toBe("exp_2");
    expect(createMedia).toHaveBeenCalledTimes(1);
    expect(linkExpense).toHaveBeenCalledWith({ id: "media_1", expenseId: "exp_2" });
  });
});
