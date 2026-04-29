import { Effect } from "effect";
import { createCompleteExpenseFlow } from "@/app/complete-expense-flow";
import { fromPromise } from "@/app/effects";
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
import type { AiPort } from "@/ports/ai.port";
import type { CategoryRepoPort } from "@/ports/category-repo.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { IncomingUserMessage } from "@/ports/channel.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";

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
    userId: string;
    message: IncomingUserMessage;
  }): Effect.Effect<{ categorized: boolean }, AppError> {
    return Effect.gen(function* () {
      const message = input.message;
      const pendingState = yield* fromPromise(
        () =>
          deps.conversationState.get({
            userId: input.userId,
            channel: message.channel,
            externalUserId: message.externalUserId,
          }),
        (cause) => new ConversationStateError({ operation: "get", cause }),
      );

      if (!pendingState) {
        deps.logger.warn("conversation.no_pending_state", {
          channel: message.channel,
          externalUserId: message.externalUserId,
        });
        return { categorized: false };
      }

      const expense = yield* fromPromise(
        () =>
          deps.expenseRepo.getById({ id: pendingState.expenseId, userId: input.userId }),
        (cause) => new ExpensePersistenceError({ operation: "getById", cause }),
      );

      if (!expense) {
        deps.logger.error("expense.not_found_for_reply", {
          expenseId: pendingState.expenseId,
          channel: message.channel,
          externalUserId: message.externalUserId,
        });

        yield* fromPromise(
          () =>
            deps.conversationState.delete({
              userId: input.userId,
              channel: message.channel,
              externalUserId: message.externalUserId,
            }),
          (cause) => new ConversationStateError({ operation: "delete", cause }),
        );

        return { categorized: false };
      }

      const categories = yield* fromPromise(
        () => deps.categoryRepo.listAll({ userId: input.userId }),
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
            deps.channelPolicyRepo.isChannelEnabledForUser({
              userId: input.userId,
              channelId: message.channel,
            }),
          (cause) => new ChannelPolicyError({ operation: "isEnabled", cause }),
        );

        if (!isEnabled) {
          return yield* Effect.fail(
            new ChannelDisabledError({
              userId: input.userId,
              channelId: message.channel,
            }),
          );
        }

        const featureKey = `channels.${message.channel}`;
        const featureEnabled = yield* fromPromise(
          () =>
            deps.featurePolicy.isFeatureEnabled({
              userId: input.userId,
              featureKey,
            }),
          (cause) => new FeaturePolicyError({ featureKey, cause }),
        );

        if (!featureEnabled) {
          return yield* Effect.fail(
            new SubscriptionFeatureBlockedError({
              userId: input.userId,
              featureKey,
            }),
          );
        }

        yield* fromPromise(
          () =>
            deps.channel.sendMessage({
              externalUserId: message.externalUserId,
              text: "No me quedó clara la categoría. ¿Puedes elegir una más específica?",
            }),
          (cause) => new ChannelSendError({ cause }),
        );
        return { categorized: false };
      }

      const category = yield* fromPromise(
        () => deps.categoryRepo.getById({ userId: input.userId, id: categoryId }),
        (cause) => new CategoryLookupError({ operation: "getById", cause }),
      );

      if (!category) {
        deps.logger.warn("category.not_found", { categoryId });
        return { categorized: false };
      }

      yield* fromPromise(
        () =>
          deps.expenseRepo.markConfirmed({
            id: expense.id,
            userId: input.userId,
            categoryId: category.id,
          }),
        (cause) => new ExpensePersistenceError({ operation: "markConfirmed", cause }),
      );

      yield* completeExpenseFlow({
        userId: input.userId,
        channel: message.channel,
        externalUserId: message.externalUserId,
        categoryName: category.name,
      });

      return { categorized: true };
    });
  };
}
