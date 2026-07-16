import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChatMediaPersistenceError,
  ChannelSendError,
  ConversationStateError,
  IntentContextResolveError,
  IntentParseError,
  InvalidTransactionError,
  OcrExtractionError,
  UserPersistenceError,
  type AppError,
} from "@/app/errors";
import { createExecuteChannelIntent } from "@/app/execute-channel-intent";
import { WHATSAPP_ONBOARDING_MESSAGE } from "@/app/onboarding";
import type {
  CreateExpenseIntentPayload,
  DeleteLastExpenseIntentPayload,
  GetReportIntentPayload,
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
import type { UserRepoPort } from "@/ports/user-repo.port";
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
  userRepo?: UserRepoPort;
  fallbackExpenseCapture: (input: {
    userId: string;
    sourceText: string;
    channel: string;
    externalUserId: string;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  handleUserReply: (input: {
    userId: string;
    message: IncomingUserMessage;
  }) => Effect.Effect<{ categorized: boolean }, AppError>;
  createExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: CreateExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  updateLastExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: UpdateLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  deleteLastExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: DeleteLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  getReportFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: GetReportIntentPayload;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean }, AppError>;
  parseUserIntent?: (input: {
    text: string;
    context: IntentContext;
    requestId?: string;
  }) => Promise<ParsedIntent>;
  resolveIntentContext?: (input: {
    userId: string;
    channel: string;
  }) => Promise<Omit<IntentContext, "sourceType" | "nowIso"> | null>;
  resolveAttachmentData?: (input: {
    channel: string;
    attachment: IncomingAttachment;
  }) => Promise<{ data: Uint8Array; mimeType?: string } | null>;
  mediaRetentionDays?: string;
};

export function createProcessChatMessage(deps: ProcessChatMessageDeps) {
  const retentionDays = parsePositiveInt(deps.mediaRetentionDays, 90);
  const executeChannelIntent = createExecuteChannelIntent({
    createExpenseFromIntent: deps.createExpenseFromIntent,
    updateLastExpenseFromIntent: deps.updateLastExpenseFromIntent,
    deleteLastExpenseFromIntent: deps.deleteLastExpenseFromIntent,
    getReportFromIntent: deps.getReportFromIntent,
    channel: deps.channel,
  });

  return function processChatMessage(input: {
    userId: string;
    channel: string;
    externalUserId: string;
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

      if (deps.userRepo && input.channel === "whatsapp") {
        const user = yield* fromPromise(
          () => deps.userRepo!.getById(input.userId),
          (cause) =>
            new UserPersistenceError({
              requestId: input.requestId,
              operation: "getById",
              cause,
            }),
        );

        if (user && !user.onboardingCompletedAt) {
          // Mark complete before send so retries cannot duplicate the onboarding message
          // if markOnboardingCompleted fails after a successful send.
          yield* fromPromise(
            () =>
              deps.userRepo!.markOnboardingCompleted({
                userId: input.userId,
                completedAt: new Date().toISOString(),
              }),
            (cause) =>
              new UserPersistenceError({
                requestId: input.requestId,
                operation: "markOnboardingCompleted",
                cause,
              }),
          );

          yield* fromPromise(
            () =>
              deps.channel.sendMessage({
                externalUserId: input.externalUserId,
                text: WHATSAPP_ONBOARDING_MESSAGE,
              }),
            (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
          );

          deps.logger.info("chat.onboarding_sent", {
            requestId: input.requestId,
            userId: input.userId,
            channel: input.channel,
          });

          const greetingOnly =
            !normalizedText ||
            /^(hola|buenas|ayuda|help|info|informaci[oó]n)[!?.]*$/i.test(normalizedText);
          if (greetingOnly) {
            return { categorized: false, guided: true };
          }
        }
      }

      const pendingState = yield* fromPromise(
        () =>
          deps.conversationState.get({
            userId: input.userId,
            channel: input.channel,
            externalUserId: input.externalUserId,
          }),
        (cause) =>
          new ConversationStateError({ requestId: input.requestId, operation: "get", cause }),
      );

      if (pendingState) {
        if (!normalizedText) {
          if (imageAttachments.length > 0) {
            yield* fromPromise(
              () =>
                deps.channel.sendMessage({
                  externalUserId: input.externalUserId,
                  text: GUIDANCE_MESSAGE,
                }),
              (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
            );
          }

          return { categorized: false, guided: true };
        }

        const replyResult = yield* deps.handleUserReply({
          userId: input.userId,
          message: {
            channel: input.channel,
            externalUserId: input.externalUserId,
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

            // Do not fetch arbitrary remote URLs without an allowlisted resolver (SSRF).
            return null;
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
        const r2Key = `receipts/${input.userId}/${input.channel}/${yyyy}/${mm}/${eventPart}.${extension}`;
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
              userId: input.userId,
              channel: input.channel,
              externalUserId: input.externalUserId,
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
          userId: input.userId,
          channel: input.channel,
          mediaId: created.id,
          r2Key,
        });
      }

      const sourceText = combinedSegments.join("\n").trim();
      if (!sourceText) {
        yield* fromPromise(
          () =>
            deps.channel.sendMessage({
              externalUserId: input.externalUserId,
              text: GUIDANCE_MESSAGE,
            }),
          (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
        );
        deps.logger.info("chat.ingest_no_transaction_guidance", {
          requestId: input.requestId,
          userId: input.userId,
          channel: input.channel,
        });
        return { categorized: false, guided: true };
      }

      let parsedIntent: ParsedIntent | null = null;
      let resolvedContext: IntentContext | null = null;
      if (deps.parseUserIntent) {
        const context = yield* fromPromise(
          async () => {
            const base = await deps.resolveIntentContext?.({
              userId: input.userId,
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
            new IntentContextResolveError({
              requestId: input.requestId,
              cause,
            }),
        );
        resolvedContext = context;

        parsedIntent = yield* fromPromise(
          () =>
            deps.parseUserIntent?.({
              text: sourceText,
              context,
              requestId: input.requestId,
            }) as Promise<ParsedIntent>,
          (cause) =>
            new IntentParseError({
              requestId: input.requestId,
              cause,
            }),
        );

        deps.logger.info("intent.shadow_parsed", {
          requestId: input.requestId,
          userId: input.userId,
          channel: input.channel,
          intentName: parsedIntent.name,
          confidence: parsedIntent.payload.confidence,
        });
      }

      if (input.channel === "whatsapp" && parsedIntent && resolvedContext) {
        const directIntentResult = yield* executeChannelIntent({
          userId: input.userId,
          channel: input.channel,
          sourceType: input.channel as "whatsapp" | "email" | "mobile" | "telegram",
          externalUserId: input.externalUserId,
          parsedIntent,
          timezone: resolvedContext.timezone,
          nowIso: resolvedContext.nowIso,
          requestId: input.requestId,
        });

        if (directIntentResult.handled) {
          if (directIntentResult.expenseId) {
            for (const mediaId of createdMediaIds) {
              yield* fromPromise(
                () =>
                  deps.chatMediaRepo.linkExpense({
                    id: mediaId,
                    expenseId: directIntentResult.expenseId as string,
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
            expenseId: directIntentResult.expenseId,
          };
        }
      }

      const ingestionResult = yield* deps
        .fallbackExpenseCapture({
          userId: input.userId,
          sourceText,
          channel: input.channel,
          externalUserId: input.externalUserId,
          requestId: input.requestId,
        })
        .pipe(Effect.either);

      if (ingestionResult._tag === "Left") {
        if (ingestionResult.left instanceof InvalidTransactionError) {
          yield* fromPromise(
            () =>
              deps.channel.sendMessage({
                externalUserId: input.externalUserId,
                text: GUIDANCE_MESSAGE,
              }),
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
