import type { WorkerEnv } from "types/env";
import { createCloudflareAiAdapter } from "@/adapters/ai/cloudflare-ai.adapter";
import { createCloudflareOcrAdapter } from "@/adapters/ai/cloudflare-ocr.adapter";
import { createTelegramChatSdkChannelAdapter } from "@/adapters/channels/telegram/chat-sdk-channel.adapter";
import { createKapsoChannelAdapter } from "@/adapters/channels/whatsapp/kapso.adapter";
import { createD1CategoryRepo } from "@/adapters/persistence/d1/category.repo";
import { createD1ChatMediaRepo } from "@/adapters/persistence/d1/chat-media.repo";
import { createD1ChannelPolicyRepo } from "@/adapters/persistence/d1/channel-policy.repo";
import { createD1CustomerRepo } from "@/adapters/persistence/d1/customer.repo";
import { createD1CustomerEmailRouteRepo } from "@/adapters/persistence/d1/customer-email-route.repo";
import { createD1ExpenseRepo } from "@/adapters/persistence/d1/expense.repo";
import { createD1FeaturePolicyRepo } from "@/adapters/persistence/d1/feature-policy.repo";
import { createD1SubscriptionRepo } from "@/adapters/persistence/d1/subscription.repo";
import { createD1WebhookEventRepo } from "@/adapters/persistence/d1/webhook-event.repo";
import { createKvConversationStateRepo } from "@/adapters/persistence/kv/conversation-state.repo";
import { createLogger } from "@/adapters/observability";
import { createAuthorizeChannel } from "@/app/authorize-channel";
import { createHandleUserReply } from "@/app/handle-user-reply";
import { createIngestExpenseFromEmail } from "@/app/ingest-expense-from-email";
import { createIngestPendingExpense } from "@/app/ingest-pending-expense";
import { createProcessChatMessage } from "@/app/process-chat-message";

export function createContainer(
  env: WorkerEnv,
  requestId?: string,
  options?: {
    channelOverride?: "whatsapp" | "telegram";
  },
) {
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });

  const ai = createCloudflareAiAdapter(env);
  const ocr = createCloudflareOcrAdapter(env);
  const whatsappChannel = createKapsoChannelAdapter(env);
  const telegramChannel = createTelegramChatSdkChannelAdapter(env);
  const selectedChannel = options?.channelOverride === "telegram" ? telegramChannel : whatsappChannel;
  const expenseRepo = createD1ExpenseRepo(env);
  const categoryRepo = createD1CategoryRepo(env);
  const chatMediaRepo = createD1ChatMediaRepo(env);
  const channelPolicyRepo = createD1ChannelPolicyRepo(env);
  const customerRepo = createD1CustomerRepo(env);
  const customerEmailRouteRepo = createD1CustomerEmailRouteRepo(env);
  const subscriptionRepo = createD1SubscriptionRepo(env);
  const webhookEventRepo = createD1WebhookEventRepo(env);
  const featurePolicy = createD1FeaturePolicyRepo(env, subscriptionRepo);
  const conversationState = createKvConversationStateRepo(env);
  const authorizeChannel = createAuthorizeChannel({
    channelPolicyRepo,
    featurePolicy,
    logger,
    strictPolicyMode: env.STRICT_POLICY_MODE !== "false",
  });
  const telegramAttachmentResolver = async (input: {
    channel: string;
    attachment: { data?: Uint8Array; url?: string; mimeType?: string };
  }) => {
    if (input.attachment.data && input.attachment.data.length > 0) {
      return { data: input.attachment.data, mimeType: input.attachment.mimeType };
    }

    if (!input.attachment.url) return null;

    const headers = new Headers();
    if (input.channel === "whatsapp" && env.KAPSO_API_KEY) {
      headers.set("Authorization", `Bearer ${env.KAPSO_API_KEY}`);
    }

    const firstResponse = await fetch(input.attachment.url, {
      headers,
    });
    const response =
      !firstResponse.ok && input.channel === "whatsapp"
        ? await fetch(input.attachment.url)
        : firstResponse;

    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: input.attachment.mimeType ?? response.headers.get("content-type") ?? undefined,
    };
  };

  const handleUserReply = createHandleUserReply({
    ai,
    channel: selectedChannel,
    channelPolicyRepo,
    featurePolicy,
    expenseRepo,
    categoryRepo,
    conversationState,
    logger,
    confidenceThreshold: 0.75,
  });

  const ingestPendingExpense = createIngestPendingExpense({
    ai,
    channel: selectedChannel,
    channelPolicyRepo,
    featurePolicy,
    expenseRepo,
    conversationState,
    logger,
  });

  const processChatMessage = createProcessChatMessage({
    conversationState,
    channel: selectedChannel,
    ocr,
    chatMediaRepo,
    logger,
    mediaRetentionDays: env.CHAT_MEDIA_RETENTION_DAYS,
    ingestPendingExpense,
    handleUserReply,
    resolveAttachmentData: telegramAttachmentResolver,
  });

  return {
    logger,
    ai,
    whatsappChannel,
    expenseRepo,
    categoryRepo,
    channelPolicyRepo,
    featurePolicy,
    subscriptionRepo,
    customerRepo,
    customerEmailRouteRepo,
    webhookEventRepo,
    conversationState,
    authorizeChannel,
    ingestExpenseFromEmail: createIngestExpenseFromEmail({
      ai,
      channel: whatsappChannel,
      channelPolicyRepo,
      featurePolicy,
      expenseRepo,
      conversationState,
      logger,
    }),
    handleUserReply,
    ingestPendingExpense,
    chatMediaRepo,
    ocr,
    processChatMessage,
  };
}
