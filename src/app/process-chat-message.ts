import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChatMediaPersistenceError,
  ChannelSendError,
  ConversationStateError,
  InvalidTransactionError,
  OcrExtractionError,
  type AppError,
} from "@/app/errors";
import type {
  CreateExpenseIntentPayload,
  DeleteLastExpenseIntentPayload,
  IntentContext,
  ParsedIntent,
  SupportedSourceType,
  UpdateLastExpenseIntentPayload,
} from "@/domain/intent/entity";
import type { IncomingAttachment, IncomingUserMessage } from "@/ports/channel.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ChatMediaRepoPort } from "@/ports/chat-media-repo.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { LoggerPort } from "@/ports/logger.port";
import type { OcrPort } from "@/ports/ocr.port";
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
  createExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: CreateExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  updateLastExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: UpdateLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  deleteLastExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: DeleteLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  parseUserIntent?: (input: {
    text: string;
    context: IntentContext;
    requestId?: string;
  }) => Promise<ParsedIntent>;
  resolveIntentContext?: (input: {
    customerId: string;
    channel: string;
  }) => Promise<Omit<IntentContext, "sourceType" | "nowIso"> | null>;
  resolveAttachmentData?: (input: {
    channel: string;
    attachment: IncomingAttachment;
  }) => Promise<{ data: Uint8Array; mimeType?: string } | null>;
  mediaRetentionDays?: string;
};

function canApplyUpdateIntentDirectly(payload: UpdateLastExpenseIntentPayload): boolean {
  return payload.confidence >= 0.9 && payload.patch.amountMinor !== undefined;
}

function canApplyDeleteIntentDirectly(payload: DeleteLastExpenseIntentPayload): boolean {
  return payload.confidence >= 0.9;
}

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
        (cause) =>
          new ConversationStateError({ requestId: input.requestId, operation: "get", cause }),
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
          (cause) =>
            new ChatMediaPersistenceError({
              requestId: input.requestId,
              operation: "create",
              cause,
            }),
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
          (cause) =>
            new ChatMediaPersistenceError({
              requestId: input.requestId,
              operation: "create",
              cause,
            }),
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

      let parsedIntent: ParsedIntent | null = null;
      if (deps.parseUserIntent) {
        const resolvedContext = yield* fromPromise(
          async () => {
            const base = await deps.resolveIntentContext?.({
              customerId: input.customerId,
              channel: input.channel,
            });

            return {
              sourceType: input.channel as SupportedSourceType,
              timezone: base?.timezone ?? "America/Lima",
              defaultCurrency: base?.defaultCurrency ?? "PEN",
              nowIso: input.timestamp ?? new Date().toISOString(),
            } satisfies IntentContext;
          },
          (cause) =>
            new ConversationStateError({
              requestId: input.requestId,
              operation: "get",
              cause,
            }),
        );

        parsedIntent = yield* fromPromise(
          () =>
            deps.parseUserIntent?.({
              text: sourceText,
              context: resolvedContext,
              requestId: input.requestId,
            }) as Promise<ParsedIntent>,
          (cause) =>
            new ConversationStateError({
              requestId: input.requestId,
              operation: "get",
              cause,
            }),
        );

        deps.logger.info("intent.shadow_parsed", {
          requestId: input.requestId,
          customerId: input.customerId,
          channel: input.channel,
          intentName: parsedIntent.name,
          confidence: parsedIntent.payload.confidence,
        });
      }

      if (
        input.channel === "whatsapp" &&
        parsedIntent?.name === "create_expense" &&
        deps.createExpenseFromIntent
      ) {
        const createdFromIntent = yield* deps.createExpenseFromIntent({
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
          payload: parsedIntent.payload,
          requestId: input.requestId,
        });

        if (createdFromIntent?.expenseId) {
          for (const mediaId of createdMediaIds) {
            yield* fromPromise(
              () =>
                deps.chatMediaRepo.linkExpense({
                  id: mediaId,
                  expenseId: createdFromIntent.expenseId,
                }),
              (cause) =>
                new ChatMediaPersistenceError({
                  requestId: input.requestId,
                  operation: "linkExpense",
                  cause,
                }),
            );
          }

          return {
            categorized: false,
            expenseId: createdFromIntent.expenseId,
          };
        }
      }

      if (
        input.channel === "whatsapp" &&
        parsedIntent?.name === "update_last_expense" &&
        deps.updateLastExpenseFromIntent &&
        canApplyUpdateIntentDirectly(parsedIntent.payload)
      ) {
        const updatedFromIntent = yield* deps.updateLastExpenseFromIntent({
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
          payload: parsedIntent.payload,
          requestId: input.requestId,
        });

        if (updatedFromIntent.handled) {
          return {
            categorized: false,
            expenseId: updatedFromIntent.expenseId,
          };
        }
      }

      if (
        input.channel === "whatsapp" &&
        parsedIntent?.name === "delete_last_expense" &&
        deps.deleteLastExpenseFromIntent &&
        canApplyDeleteIntentDirectly(parsedIntent.payload)
      ) {
        const deletedFromIntent = yield* deps.deleteLastExpenseFromIntent({
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
          payload: parsedIntent.payload,
          requestId: input.requestId,
        });

        if (deletedFromIntent.handled) {
          return {
            categorized: false,
            expenseId: deletedFromIntent.expenseId,
          };
        }
      }

      const ingestionResult = yield* deps
        .ingestPendingExpense({
          customerId: input.customerId,
          sourceText,
          channel: input.channel,
          userId: input.userId,
          requestId: input.requestId,
        })
        .pipe(Effect.either);

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
            (cause) =>
              new ChatMediaPersistenceError({
                requestId: input.requestId,
                operation: "linkExpense",
                cause,
              }),
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
