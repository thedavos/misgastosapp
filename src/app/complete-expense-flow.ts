import { Effect } from "effect";
import type { AiPort } from "@/ports/ai.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import {
  AiMessageGenerationError,
  ChannelDisabledError,
  ChannelPolicyError,
  FeaturePolicyError,
  ChannelSendError,
  ConversationStateError,
  type AppError,
  SubscriptionFeatureBlockedError,
} from "@/app/errors";
import { fromPromise } from "@/app/effects";

export type CompleteExpenseFlowDeps = {
  ai: AiPort;
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  conversationState: ConversationStatePort;
  logger: LoggerPort;
};

export function createCompleteExpenseFlow(deps: CompleteExpenseFlowDeps) {
  return function completeExpenseFlow(input: {
    customerId: string;
    channel: string;
    userId: string;
    categoryName: string;
    requestId?: string;
  }): Effect.Effect<void, AppError> {
    return Effect.gen(function* () {
      yield* fromPromise(
        () =>
          deps.conversationState.delete({
            customerId: input.customerId,
            channel: input.channel,
            userId: input.userId,
          }),
        (cause) =>
          new ConversationStateError({
            requestId: input.requestId,
            operation: "delete",
            cause,
          }),
      );

      const message = yield* fromPromise(
        () =>
          deps.ai.generateMessage({
            kind: "confirmation",
            categoryName: input.categoryName,
          }),
        (cause) => new AiMessageGenerationError({ requestId: input.requestId, cause }),
      );

      const isEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForCustomer({
            customerId: input.customerId,
            channelId: input.channel,
          }),
        (cause) =>
          new ChannelPolicyError({
            requestId: input.requestId,
            operation: "isEnabled",
            cause,
          }),
      );

      if (!isEnabled) {
        deps.logger.warn("channel.disabled_skip_send", {
          requestId: input.requestId,
          customerId: input.customerId,
          channelId: input.channel,
        });
        return yield* Effect.fail(
          new ChannelDisabledError({
            requestId: input.requestId,
            customerId: input.customerId,
            channelId: input.channel,
          }),
        );
      }

      const featureKey = `channels.${input.channel}`;
      const featureEnabled = yield* fromPromise(
        () =>
          deps.featurePolicy.isFeatureEnabled({
            customerId: input.customerId,
            featureKey,
          }),
        (cause) =>
          new FeaturePolicyError({
            requestId: input.requestId,
            featureKey,
            cause,
          }),
      );

      if (!featureEnabled) {
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            customerId: input.customerId,
            featureKey,
          }),
        );
      }

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.flow_completed", {
        requestId: input.requestId,
        channel: input.channel,
        userId: input.userId,
        categoryName: input.categoryName,
      });
    });
  };
}
