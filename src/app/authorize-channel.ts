import { Effect } from "effect";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import {
  ChannelDisabledError,
  ChannelPolicyError,
  FeaturePolicyError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import { fromPromise } from "@/app/effects";

export type AuthorizeChannelDeps = {
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  logger: LoggerPort;
};

export function createAuthorizeChannel(deps: AuthorizeChannelDeps) {
  return function authorizeChannel(input: {
    customerId: string;
    channelId: string;
    requestId?: string;
  }): Effect.Effect<void, AppError> {
    return Effect.gen(function* () {
      const isChannelEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForCustomer({
            customerId: input.customerId,
            channelId: input.channelId,
          }),
        (cause) =>
          new ChannelPolicyError({
            requestId: input.requestId,
            operation: "isEnabled",
            cause,
          }),
      );

      if (!isChannelEnabled) {
        deps.logger.warn("channel.disabled", {
          requestId: input.requestId,
          customerId: input.customerId,
          channelId: input.channelId,
        });
        return yield* Effect.fail(
          new ChannelDisabledError({
            requestId: input.requestId,
            customerId: input.customerId,
            channelId: input.channelId,
          }),
        );
      }

      const featureKey = `channels.${input.channelId}`;
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
        deps.logger.warn("subscription.feature_blocked", {
          requestId: input.requestId,
          customerId: input.customerId,
          featureKey,
        });
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            customerId: input.customerId,
            featureKey,
          }),
        );
      }
    });
  };
}
