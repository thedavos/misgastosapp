import { Effect } from "effect";
import type { IncomingAttachment, IncomingUserMessage } from "@/ports/channel.port";
import type { ChatMediaRepoPort } from "@/ports/chat-media-repo.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { OcrPort } from "@/ports/ocr.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { LoggerPort } from "@/ports/logger.port";
import {
  ChatMediaPersistenceError,
  ChannelSendError,
  ConversationStateError,
  InvalidTransactionError,
  OcrExtractionError,
  type AppError,
} from "@/app/errors";
import { fromPromise } from "@/app/effects";
import { sha256Hex } from "@/utils/crypto/sha256Hex";
import { addDays } from "@/utils/date/addDays";
import { inferImageExtension } from "@/utils/media/inferImageExtension";
import { parsePositiveInt } from "@/utils/number/parsePositiveInt";

const GUIDANCE_MESSAGE =
  "No pude identificar un gasto. Envía texto como: 'S/ 50 en Tambo hoy' o una foto clara del comprobante.";

export type ProcessChatMessageDeps = {
  conversationState: ConversationStatePort;
  channel: ChannelPort;
  ocr: OcrPort;
  chatMediaRepo: ChatMediaRepoPort;
  logger: LoggerPort;
  ingestPendingExpense: (input: {
    customerId: string;
    sourceText: string;
    channel: string;
    userId: string;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  handleUserReply: (input: {
    customerId: string;
    message: IncomingUserMessage;
  }) => Effect.Effect<{ categorized: boolean }, AppError>;
  resolveAttachmentData?: (input: {
    channel: string;
    attachment: IncomingAttachment;
  }) => Promise<{ data: Uint8Array; mimeType?: string } | null>;
  mediaRetentionDays?: string;
};

export function createProcessChatMessage(deps: ProcessChatMessageDeps) {
  const retentionDays = parsePositiveInt(deps.mediaRetentionDays, 90);

  return function processChatMessage(input: {
    customerId: string;
    channel: string;
    userId: string;
    providerEventId: string;
    text?: string;
    attachments?: IncomingAttachment[];
    raw?: unknown;
    timestamp?: string;
    requestId?: string;
  }): Effect.Effect<{ categorized: boolean; expenseId?: string; guided?: boolean }, AppError> {
    return Effect.gen(function* () {
      const normalizedText = input.text?.trim() ?? "";
      const attachments = input.attachments ?? [];
      const imageAttachments = attachments.filter((attachment) => attachment.type === "image");

      const pendingState = yield* fromPromise(
        () =>
          deps.conversationState.get({
            customerId: input.customerId,
            channel: input.channel,
            userId: input.userId,
          }),
        (cause) => new ConversationStateError({ requestId: input.requestId, operation: "get", cause }),
      );

      if (pendingState) {
        if (!normalizedText) {
          if (imageAttachments.length > 0) {
            yield* fromPromise(
              () => deps.channel.sendMessage({ userId: input.userId, text: GUIDANCE_MESSAGE }),
              (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
            );
          }

          return { categorized: false, guided: true };
        }

        const replyResult = yield* deps.handleUserReply({
          customerId: input.customerId,
          message: {
            channel: input.channel,
            userId: input.userId,
            text: normalizedText,
            timestamp: input.timestamp ?? new Date().toISOString(),
            providerEventId: input.providerEventId,
            raw: input.raw ?? {},
          },
        });

        return { categorized: replyResult.categorized };
      }

      const combinedSegments: string[] = [];
      if (normalizedText) {
        combinedSegments.push(normalizedText);
      }

      const createdMediaIds: string[] = [];

      for (const attachment of imageAttachments) {
        const mediaPayload = yield* fromPromise(
          async () => {
            if (attachment.data && attachment.data.length > 0) {
              return { data: attachment.data, mimeType: attachment.mimeType };
            }

            if (deps.resolveAttachmentData) {
              return deps.resolveAttachmentData({
                channel: input.channel,
                attachment,
              });
            }

            if (!attachment.url) return null;

            const response = await fetch(attachment.url);
            if (!response.ok) return null;
            const buffer = await response.arrayBuffer();
            return {
              data: new Uint8Array(buffer),
              mimeType: attachment.mimeType ?? response.headers.get("content-type") ?? undefined,
            };
          },
          (cause) => new OcrExtractionError({ requestId: input.requestId, cause }),
        );

        if (!mediaPayload || mediaPayload.data.byteLength === 0) {
          continue;
        }

        const ocrText = yield* fromPromise(
          () =>
            deps.ocr.extractTextFromImage({
              data: mediaPayload.data,
              mimeType: mediaPayload.mimeType,
              requestId: input.requestId,
            }),
          (cause) => new OcrExtractionError({ requestId: input.requestId, cause }),
        );

        if (ocrText && ocrText.trim().length > 0) {
          combinedSegments.push(ocrText.trim());
        }

        const now = new Date();
        const yyyy = String(now.getUTCFullYear());
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const extension = inferImageExtension(mediaPayload.mimeType);
        const eventPart = input.providerEventId || crypto.randomUUID();
        const r2Key = `receipts/${input.customerId}/${input.channel}/${yyyy}/${mm}/${eventPart}.${extension}`;
        const sha256 = yield* fromPromise(
          () => sha256Hex(mediaPayload.data),
          (cause) => new ChatMediaPersistenceError({ requestId: input.requestId, operation: "create", cause }),
        );

        const created = yield* fromPromise(
          () =>
            deps.chatMediaRepo.create({
              customerId: input.customerId,
              channel: input.channel,
              externalUserId: input.userId,
              providerEventId: input.providerEventId,
              expenseId: null,
              r2Key,
              mimeType: mediaPayload.mimeType ?? null,
              sizeBytes: mediaPayload.data.byteLength,
              sha256,
              ocrText: ocrText?.trim() ?? null,
              createdAt: now.toISOString(),
              expiresAt: addDays(now, retentionDays).toISOString(),
              data: mediaPayload.data,
            }),
          (cause) => new ChatMediaPersistenceError({ requestId: input.requestId, operation: "create", cause }),
        );

        createdMediaIds.push(created.id);
        deps.logger.info("chat.media_stored", {
          requestId: input.requestId,
          customerId: input.customerId,
          channel: input.channel,
          mediaId: created.id,
          r2Key,
        });
      }

      const sourceText = combinedSegments.join("\n").trim();
      if (!sourceText) {
        yield* fromPromise(
          () => deps.channel.sendMessage({ userId: input.userId, text: GUIDANCE_MESSAGE }),
          (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
        );
        deps.logger.info("chat.ingest_no_transaction_guidance", {
          requestId: input.requestId,
          customerId: input.customerId,
          channel: input.channel,
        });
        return { categorized: false, guided: true };
      }

      const ingestionResult = yield* deps.ingestPendingExpense({
        customerId: input.customerId,
        sourceText,
        channel: input.channel,
        userId: input.userId,
        requestId: input.requestId,
      }).pipe(Effect.either);

      if (ingestionResult._tag === "Left") {
        if (ingestionResult.left instanceof InvalidTransactionError) {
          yield* fromPromise(
            () => deps.channel.sendMessage({ userId: input.userId, text: GUIDANCE_MESSAGE }),
            (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
          );
          return { categorized: false, guided: true };
        }

        return yield* Effect.fail(ingestionResult.left);
      }

      if (ingestionResult.right?.expenseId) {
        for (const mediaId of createdMediaIds) {
          yield* fromPromise(
            () =>
              deps.chatMediaRepo.linkExpense({
                id: mediaId,
                expenseId: ingestionResult.right?.expenseId as string,
              }),
            (cause) => new ChatMediaPersistenceError({ requestId: input.requestId, operation: "linkExpense", cause }),
          );
        }
      }

      return {
        categorized: false,
        expenseId: ingestionResult.right?.expenseId,
      };
    });
  };
}
