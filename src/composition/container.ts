import type { WorkerEnv } from "types/env";
import { createCloudflareAiAdapter } from "@/adapters/ai/cloudflare-ai.adapter";
import { createKapsoChannelAdapter } from "@/adapters/channels/whatsapp/kapso.adapter";
import { createD1CategoryRepo } from "@/adapters/persistence/d1/category.repo";
import { createD1ChannelPolicyRepo } from "@/adapters/persistence/d1/channel-policy.repo";
import { createD1CustomerRepo } from "@/adapters/persistence/d1/customer.repo";
import { createD1ExpenseRepo } from "@/adapters/persistence/d1/expense.repo";
import { createKvConversationStateRepo } from "@/adapters/persistence/kv/conversation-state.repo";
import { createLogger } from "@/adapters/observability";
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
  const conversationState = createKvConversationStateRepo(env);

  return {
    logger,
    ai,
    whatsappChannel,
    expenseRepo,
    categoryRepo,
    channelPolicyRepo,
    customerRepo,
    conversationState,
    ingestExpenseFromEmail: createIngestExpenseFromEmail({
      ai,
      channel: whatsappChannel,
      channelPolicyRepo,
      expenseRepo,
      conversationState,
      logger,
    }),
    handleUserReply: createHandleUserReply({
      ai,
      channel: whatsappChannel,
      channelPolicyRepo,
      expenseRepo,
      categoryRepo,
      conversationState,
      logger,
      confidenceThreshold: 0.75,
    }),
  };
}
