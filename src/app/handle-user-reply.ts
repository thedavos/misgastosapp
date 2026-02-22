import { Effect } from "effect";
import type { AiPort } from "@/ports/ai.port";
import type { CategoryRepoPort } from "@/ports/category-repo.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { IncomingUserMessage } from "@/ports/channel.port";
import type { LoggerPort } from "@/ports/logger.port";
import { createCompleteExpenseFlow } from "@/app/complete-expense-flow";
import type { ChannelPort } from "@/ports/channel.port";
import {
  CategoryClassificationError,
  CategoryLookupError,
  ChannelDisabledError,
  ChannelPolicyError,
  FeaturePolicyError,
  ChannelSendError,
  ConversationStateError,
  ExpensePersistenceError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import { fromPromise } from "@/app/effects";

export type HandleUserReplyDeps = {
  ai: AiPort;
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  expenseRepo: ExpenseRepoPort;
  categoryRepo: CategoryRepoPort;
  conversationState: ConversationStatePort;
  logger: LoggerPort;
  confidenceThreshold?: number;
};

export function createHandleUserReply(deps: HandleUserReplyDeps) {
  const completeExpenseFlow = createCompleteExpenseFlow({
    ai: deps.ai,
    channel: deps.channel,
    channelPolicyRepo: deps.channelPolicyRepo,
    featurePolicy: deps.featurePolicy,
    conversationState: deps.conversationState,
    logger: deps.logger,
  });

  return function handleUserReply(input: {
    customerId: string;
    message: IncomingUserMessage;
  }): Effect.Effect<{ categorized: boolean }, AppError> {
    return Effect.gen(function* () {
      const message = input.message;
      const pendingState = yield* fromPromise(
        () =>
          deps.conversationState.get({
            customerId: input.customerId,
            channel: message.channel,
            userId: message.userId,
          }),
        (cause) => new ConversationStateError({ operation: "get", cause }),
      );

      if (!pendingState) {
        deps.logger.warn("conversation.no_pending_state", {
          channel: message.channel,
          userId: message.userId,
        });
        return { categorized: false };
      }

      const expense = yield* fromPromise(
        () => deps.expenseRepo.getById({ id: pendingState.expenseId, customerId: input.customerId }),
        (cause) => new ExpensePersistenceError({ operation: "getById", cause }),
      );

      if (!expense) {
        deps.logger.error("expense.not_found_for_reply", {
          expenseId: pendingState.expenseId,
          channel: message.channel,
          userId: message.userId,
        });

        yield* fromPromise(
          () =>
            deps.conversationState.delete({
              customerId: input.customerId,
              channel: message.channel,
              userId: message.userId,
            }),
          (cause) => new ConversationStateError({ operation: "delete", cause }),
        );

        return { categorized: false };
      }

      const categories = yield* fromPromise(
        () => deps.categoryRepo.listAll({ customerId: input.customerId }),
        (cause) => new CategoryLookupError({ operation: "listAll", cause }),
      );

      const classification = yield* fromPromise(
        () =>
          deps.ai.classifyCategory({
            userReply: message.text,
            categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
          }),
        (cause) => new CategoryClassificationError({ cause }),
      );

      const threshold = deps.confidenceThreshold ?? 0.75;
      const categoryId = classification.categoryId;
      if (!categoryId || classification.confidence < threshold) {
        const isEnabled = yield* fromPromise(
          () =>
            deps.channelPolicyRepo.isChannelEnabledForCustomer({
              customerId: input.customerId,
              channelId: message.channel,
            }),
          (cause) => new ChannelPolicyError({ operation: "isEnabled", cause }),
        );

        if (!isEnabled) {
          return yield* Effect.fail(
            new ChannelDisabledError({
              customerId: input.customerId,
              channelId: message.channel,
            }),
          );
        }

        const featureKey = `channels.${message.channel}`;
        const featureEnabled = yield* fromPromise(
          () =>
            deps.featurePolicy.isFeatureEnabled({
              customerId: input.customerId,
              featureKey,
            }),
          (cause) => new FeaturePolicyError({ featureKey, cause }),
        );

        if (!featureEnabled) {
          return yield* Effect.fail(
            new SubscriptionFeatureBlockedError({
              customerId: input.customerId,
              featureKey,
            }),
          );
        }

        yield* fromPromise(
          () =>
            deps.channel.sendMessage({
              userId: message.userId,
              text: "No me quedó clara la categoría. ¿Puedes elegir una más específica?",
            }),
          (cause) => new ChannelSendError({ cause }),
        );
        return { categorized: false };
      }

      const category = yield* fromPromise(
        () => deps.categoryRepo.getById({ customerId: input.customerId, id: categoryId }),
        (cause) => new CategoryLookupError({ operation: "getById", cause }),
      );

      if (!category) {
        deps.logger.warn("category.not_found", { categoryId });
        return { categorized: false };
      }

      yield* fromPromise(
        () =>
          deps.expenseRepo.markCategorized({
            id: expense.id,
            customerId: input.customerId,
            categoryId: category.id,
          }),
        (cause) => new ExpensePersistenceError({ operation: "markCategorized", cause }),
      );

      yield* completeExpenseFlow({
        customerId: input.customerId,
        channel: message.channel,
        userId: message.userId,
        categoryName: category.name,
      });

      return { categorized: true };
    });
  };
}
