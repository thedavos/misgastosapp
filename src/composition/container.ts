import type { WorkerEnv } from "types/env";
import { createCloudflareAiAdapter } from "@/adapters/ai/cloudflare-ai.adapter";
import { createKapsoChannelAdapter } from "@/adapters/channels/whatsapp/kapso.adapter";
import { createD1CategoryRepo } from "@/adapters/persistence/d1/category.repo";
import { createD1ChannelPolicyRepo } from "@/adapters/persistence/d1/channel-policy.repo";
import { createD1CustomerRepo } from "@/adapters/persistence/d1/customer.repo";
import { createD1ExpenseRepo } from "@/adapters/persistence/d1/expense.repo";
import { createD1FeaturePolicyRepo } from "@/adapters/persistence/d1/feature-policy.repo";
import { createD1SubscriptionRepo } from "@/adapters/persistence/d1/subscription.repo";
import { createKvConversationStateRepo } from "@/adapters/persistence/kv/conversation-state.repo";
import { createLogger } from "@/adapters/observability";
import { createAuthorizeChannel } from "@/app/authorize-channel";
import { createHandleUserReply } from "@/app/handle-user-reply";
import { createIngestExpenseFromEmail } from "@/app/ingest-expense-from-email";

export function createContainer(env: WorkerEnv, requestId?: string) {
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });

  const ai = createCloudflareAiAdapter(env);
  const whatsappChannel = createKapsoChannelAdapter(env);
  const expenseRepo = createD1ExpenseRepo(env);
  const categoryRepo = createD1CategoryRepo(env);
  const channelPolicyRepo = createD1ChannelPolicyRepo(env);
  const customerRepo = createD1CustomerRepo(env);
  const subscriptionRepo = createD1SubscriptionRepo(env);
  const featurePolicy = createD1FeaturePolicyRepo(env, subscriptionRepo);
  const conversationState = createKvConversationStateRepo(env);
  const authorizeChannel = createAuthorizeChannel({ channelPolicyRepo, featurePolicy, logger });

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
    handleUserReply: createHandleUserReply({
      ai,
      channel: whatsappChannel,
      channelPolicyRepo,
      featurePolicy,
      expenseRepo,
      categoryRepo,
      conversationState,
      logger,
      confidenceThreshold: 0.75,
    }),
  };
}
