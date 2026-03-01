import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import { ChannelDisabledError, ChannelSettingMissingError, SubscriptionFeatureBlockedError } from "@/app/errors";
import { createContainer } from "@/composition/container";
import { getEffectFailureMeta } from "@/utils/effect-failure";
import { sha256Hex } from "@/utils/crypto/sha256Hex";
import { normalizeText } from "@/utils/string/normalizeText";
import { isThreadDm } from "@/utils/telegram/isThreadDm";
import { normalizeTelegramAttachments } from "@/utils/telegram/normalizeTelegramAttachments";
import { parseTelegramAuthorId } from "@/utils/telegram/parseTelegramAuthorId";
import { parseTelegramEventId } from "@/utils/telegram/parseTelegramEventId";
import { safePostThreadMessage } from "@/utils/telegram/safePostThreadMessage";

const TELEGRAM_PROVIDER = "telegram_chat_sdk";
const TELEGRAM_BLOCKED_MESSAGE =
  "No tienes acceso habilitado para este bot. Escríbenos para activar tu cuenta.";
const TELEGRAM_DM_ONLY_MESSAGE = "Por ahora el bot solo funciona por mensaje directo (DM).";
const RETRY_GUIDANCE_MESSAGE = "Tuvimos un problema procesando tu mensaje. Intenta nuevamente en unos segundos.";

type BotRuntime = {
  bot: {
    webhooks: {
      telegram: (request: Request) => Promise<Response>;
    };
    openDM?: (userId: string) => Promise<{ post: (content: string) => Promise<void> }>;
  };
};

let cachedRuntime: Promise<BotRuntime | null> | null = null;

async function handleTelegramThreadMessage(input: {
  env: WorkerEnv;
  thread: unknown;
  message: unknown;
}): Promise<void> {
  const eventId = parseTelegramEventId(input.thread, input.message);
  const requestId = `telegram:${eventId}`;
  const container = createContainer(input.env, requestId, {
    channelOverride: "telegram",
  });

  if (!isThreadDm(input.thread)) {
    await safePostThreadMessage(input.thread, TELEGRAM_DM_ONLY_MESSAGE);
    return;
  }

  const userId = parseTelegramAuthorId(input.thread, input.message);
  if (!userId) {
    container.logger.warn("telegram.author_not_found", { requestId });
    return;
  }

  const incomingText = normalizeText((input.message as Record<string, unknown> | undefined)?.text);
  const incomingAttachments = await normalizeTelegramAttachments(input.message);
  const payloadHash = await sha256Hex(
    JSON.stringify({
      eventId,
      userId,
      text: incomingText,
      attachments: incomingAttachments.map((item) => ({
        mimeType: item.mimeType,
        providerFileId: item.providerFileId,
        url: item.url,
      })),
    }),
  );

  const customer = await container.customerRepo.findByChannelExternalId({
    channel: "telegram",
    externalUserId: userId,
  });

  if (!customer) {
    container.logger.warn("telegram.unknown_customer_blocked", {
      requestId,
      userId,
    });
    await safePostThreadMessage(input.thread, TELEGRAM_BLOCKED_MESSAGE);
    return;
  }

  const authorization = await Effect.runPromise(
    container.authorizeChannel({
      customerId: customer.id,
      channelId: "telegram",
      requestId,
    }).pipe(Effect.either),
  );

  if (authorization._tag === "Left") {
    if (
      authorization.left instanceof ChannelDisabledError ||
      authorization.left instanceof ChannelSettingMissingError ||
      authorization.left instanceof SubscriptionFeatureBlockedError
    ) {
      await safePostThreadMessage(input.thread, TELEGRAM_BLOCKED_MESSAGE);
      return;
    }
    throw authorization.left;
  }

  const idempotencyStatus = await container.webhookEventRepo.tryStartProcessing({
    provider: TELEGRAM_PROVIDER,
    eventId,
    payloadHash,
    requestId,
  });

  if (idempotencyStatus === "DUPLICATE_INFLIGHT" || idempotencyStatus === "DUPLICATE_PROCESSED") {
    container.logger.info("telegram.webhook_duplicate_ignored", {
      requestId,
      eventId,
      status: idempotencyStatus,
    });
    return;
  }

  if (Math.random() < 0.01) {
    const nowIso = new Date().toISOString();
    await container.chatMediaRepo.deleteExpired({
      nowIso,
      limit: 200,
    });
  }

  const processResult = await Effect.runPromiseExit(
    container.processChatMessage({
      customerId: customer.id,
      channel: "telegram",
      userId,
      providerEventId: eventId,
      text: incomingText,
      attachments: incomingAttachments,
      raw: input.message,
      timestamp:
        typeof (input.message as Record<string, unknown> | undefined)?.createdAt === "string"
          ? ((input.message as Record<string, unknown>).createdAt as string)
          : new Date().toISOString(),
      requestId,
    }),
  );

  if (processResult._tag === "Failure") {
    const { errorCode, errorMessage } = getEffectFailureMeta(processResult.cause);
    await container.webhookEventRepo.markFailed({
      provider: TELEGRAM_PROVIDER,
      eventId,
      errorMessage: errorMessage ?? errorCode ?? "telegram process error",
    });
    container.logger.error("telegram.webhook_error", {
      requestId,
      eventId,
      errorCode,
      errorMessage,
      cause: processResult.cause,
      error: processResult.cause,
    });
    await safePostThreadMessage(input.thread, RETRY_GUIDANCE_MESSAGE);
    return;
  }

  await container.webhookEventRepo.markProcessed({
    provider: TELEGRAM_PROVIDER,
    eventId,
  });
}

async function createTelegramBotRuntime(env: WorkerEnv): Promise<BotRuntime | null> {
  const chatPackageName = "chat";
  const telegramAdapterPackageName = "@chat-adapter/telegram";

  let chatModule: Record<string, unknown>;
  let telegramAdapterModule: Record<string, unknown>;
  try {
    chatModule = (await import(chatPackageName)) as Record<string, unknown>;
    telegramAdapterModule = (await import(telegramAdapterPackageName)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const ChatCtor = chatModule.Chat as
    | (new (input: {
        userName: string;
        adapters: Record<string, unknown>;
        streamingUpdateIntervalMs?: number;
      }) => {
        webhooks: { telegram: (request: Request) => Promise<Response> };
        onNewMention: (handler: (...args: unknown[]) => Promise<void>) => void;
        onSubscribedMessage: (handler: (...args: unknown[]) => Promise<void>) => void;
      })
    | undefined;
  const createTelegramAdapter = telegramAdapterModule.createTelegramAdapter as
    | ((input: Record<string, unknown>) => unknown)
    | undefined;

  if (!ChatCtor || !createTelegramAdapter) {
    return null;
  }

  const bot = new ChatCtor({
    userName: "misgastosapp",
    adapters: {
      telegram: createTelegramAdapter({
        token: env.TELEGRAM_BOT_TOKEN,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      }),
    },
    streamingUpdateIntervalMs: 500,
  });

  bot.onNewMention(async (...args: unknown[]) => {
    const thread = args[0];
    const message = args[1];

    const subscribe = (thread as { subscribe?: () => Promise<void> }).subscribe;
    if (typeof subscribe === "function") {
      await subscribe();
    }
    await safePostThreadMessage(
      thread,
      "Hola. Puedes enviarme tu gasto por texto o foto del comprobante y te ayudo a registrarlo.",
    );
    await handleTelegramThreadMessage({
      env,
      thread,
      message,
    });
  });

  bot.onSubscribedMessage(async (...args: unknown[]) => {
    const thread = args[0];
    const message = args[1];
    await handleTelegramThreadMessage({
      env,
      thread,
      message,
    });
  });

  return { bot };
}

async function getTelegramBotRuntime(env: WorkerEnv): Promise<BotRuntime | null> {
  if (!cachedRuntime) {
    cachedRuntime = createTelegramBotRuntime(env);
  }
  return cachedRuntime;
}

export async function handleTelegramWebhookWithChatSdk(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const runtime = await getTelegramBotRuntime(env);
  if (!runtime) {
    return new Response("Telegram Chat SDK not available", { status: 501 });
  }

  try {
    return await runtime.bot.webhooks.telegram(request);
  } catch (error) {
    const name = (error as { name?: unknown })?.name;
    if (name === "RateLimitError") {
      return new Response("rate limited", { status: 429 });
    }
    if (name === "NotImplementedError") {
      return new Response("not implemented", { status: 501 });
    }
    if (name === "LockError") {
      return new Response("locked", { status: 202 });
    }
    throw error;
  }
}
