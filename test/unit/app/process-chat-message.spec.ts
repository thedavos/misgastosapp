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
          customerId: "cust_default",
          channel: "whatsapp",
          userId: "51999999999",
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
      ingestPendingExpense: vi.fn() as unknown as Parameters<typeof createProcessChatMessage>[0]["ingestPendingExpense"],
      handleUserReply,
    });

    const result = await Effect.runPromise(
      processChatMessage({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
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
      ingestPendingExpense: vi.fn() as unknown as Parameters<typeof createProcessChatMessage>[0]["ingestPendingExpense"],
      handleUserReply: vi.fn(),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        providerEventId: "evt_2",
        attachments: [],
      }),
    );

    expect(result.guided).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("processes OCR attachment and links media to created expense", async () => {
    const createMedia = vi.fn().mockResolvedValue({
      id: "media_1",
      customerId: "cust_default",
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
    const ingestPendingExpense = vi.fn().mockImplementation((input: { sourceText: string }) =>
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
      ingestPendingExpense: ingestPendingExpense as unknown as Parameters<typeof createProcessChatMessage>[0]["ingestPendingExpense"],
      handleUserReply: vi.fn(),
      resolveAttachmentData: vi.fn().mockResolvedValue({
        data: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    });

    const result = await Effect.runPromise(
      processChatMessage({
        customerId: "cust_default",
        channel: "whatsapp",
        userId: "51999999999",
        providerEventId: "evt_3",
        attachments: [{ type: "image", url: "https://example.com/photo.jpg", mimeType: "image/jpeg" }],
      }),
    );

    expect(result.expenseId).toBe("exp_2");
    expect(createMedia).toHaveBeenCalledTimes(1);
    expect(linkExpense).toHaveBeenCalledWith({ id: "media_1", expenseId: "exp_2" });
  });
});
