import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChannelDisabledError,
  ChannelPolicyError,
  ChannelSendError,
  ExpensePersistenceError,
  FeaturePolicyError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import { buildPeriodExpenses, buildPeriodSummary, buildTopSpendSummary } from "@/app/report-summary";
import type { GetReportIntentPayload } from "@/domain/intent/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";

export type GetReportFromIntentDeps = {
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  expenseRepo: ExpenseRepoPort;
  logger: LoggerPort;
};

export function createGetReportFromIntent(deps: GetReportFromIntentDeps) {
  return function getReportFromIntent(input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: GetReportIntentPayload;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean }, AppError> {
    return Effect.gen(function* () {
      const expenses = yield* fromPromise(
        () => deps.expenseRepo.listByCustomer({ customerId: input.customerId }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "listByCustomer",
            cause,
          }),
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
        () => deps.featurePolicy.isFeatureEnabled({ customerId: input.customerId, featureKey }),
        (cause) => new FeaturePolicyError({ requestId: input.requestId, featureKey, cause }),
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

      const periodExpenses = buildPeriodExpenses({
        expenses,
        nowIso: input.nowIso,
        timezone: input.timezone,
        periodKind: input.payload.periodKind,
      });

      const message =
        input.payload.periodKind === "top_spend"
          ? buildTopSpendSummary(periodExpenses)
          : periodExpenses.length === 0
            ? `No encontré gastos para ${input.payload.periodKind === "day" ? "hoy" : input.payload.periodKind === "week" ? "esta semana" : "este mes"}.`
            : buildPeriodSummary({ expenses: periodExpenses, periodKind: input.payload.periodKind });

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("report.generated_from_intent", {
        requestId: input.requestId,
        customerId: input.customerId,
        channel: input.channel,
        userId: input.userId,
        periodKind: input.payload.periodKind,
        expenseCount: periodExpenses.length,
      });

      return { handled: true };
    });
  };
}
