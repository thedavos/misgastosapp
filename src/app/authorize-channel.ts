import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChannelDisabledError,
  ChannelSettingMissingError,
  ChannelPolicyError,
  FeaturePolicyError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";

export type AuthorizeChannelDeps = {
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  logger: LoggerPort;
  strictPolicyMode: boolean;
};

export function createAuthorizeChannel(deps: AuthorizeChannelDeps) {
  return function authorizeChannel(input: {
    userId: string;
    channelId: string;
    requestId?: string;
  }): Effect.Effect<void, AppError> {
    return Effect.gen(function* () {
      const isChannelEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForUser({
            userId: input.userId,
            channelId: input.channelId,
          }),
        (cause) =>
          new ChannelPolicyError({
            requestId: input.requestId,
            operation: "isEnabled",
            cause,
          }),
      );

      if (deps.strictPolicyMode) {
        const setting = yield* fromPromise(
          () =>
            deps.channelPolicyRepo.getUserChannelSetting({
              userId: input.userId,
              channelId: input.channelId,
            }),
          (cause) =>
            new ChannelPolicyError({
              requestId: input.requestId,
              operation: "isEnabled",
              cause,
            }),
        );

        if (!setting) {
          deps.logger.warn("channel.setting_missing_blocked", {
            requestId: input.requestId,
            userId: input.userId,
            channelId: input.channelId,
          });
          return yield* Effect.fail(
            new ChannelSettingMissingError({
              requestId: input.requestId,
              userId: input.userId,
              channelId: input.channelId,
            }),
          );
        }
      }

      if (!isChannelEnabled) {
        deps.logger.warn("channel.disabled", {
          requestId: input.requestId,
          userId: input.userId,
          channelId: input.channelId,
        });
        return yield* Effect.fail(
          new ChannelDisabledError({
            requestId: input.requestId,
            userId: input.userId,
            channelId: input.channelId,
          }),
        );
      }

      const featureKey = `channels.${input.channelId}`;
      const featureEnabled = yield* fromPromise(
        () =>
          deps.featurePolicy.isFeatureEnabled({
            userId: input.userId,
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
          userId: input.userId,
          featureKey,
        });
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            userId: input.userId,
            featureKey,
          }),
        );
      }
    });
  };
}
