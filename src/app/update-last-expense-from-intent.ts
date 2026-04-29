import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChannelDisabledError,
  ChannelPolicyError,
  FeaturePolicyError,
  ChannelSendError,
  ExpensePersistenceError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import type { UpdateLastExpenseIntentPayload } from "@/domain/intent/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";

export type UpdateLastExpenseFromIntentDeps = {
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  expenseRepo: ExpenseRepoPort;
  logger: LoggerPort;
};

function formatAmount(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol} ${amount.toFixed(2)}`;
}

function hasSupportedPatch(payload: UpdateLastExpenseIntentPayload): boolean {
  return (
    payload.patch.amountMinor !== undefined ||
    Boolean(payload.patch.currency) ||
    Boolean(payload.patch.merchant) ||
    Boolean(payload.patch.occurredAt)
  );
}

export function createUpdateLastExpenseFromIntent(deps: UpdateLastExpenseFromIntentDeps) {
  return function updateLastExpenseFromIntent(input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: UpdateLastExpenseIntentPayload;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean; expenseId?: string }, AppError> {
    return Effect.gen(function* () {
      if (!hasSupportedPatch(input.payload)) {
        return { handled: false };
      }

      const latestExpense = yield* fromPromise(
        () => deps.expenseRepo.findLatestByUser({ userId: input.userId }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "findLatestByUser",
            cause,
          }),
      );

      if (!latestExpense) {
        yield* fromPromise(
          () =>
            deps.channel.sendMessage({
              externalUserId: input.externalUserId,
              text: "No encontré un gasto reciente para corregir.",
            }),
          (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
        );

        return { handled: true };
      }

      const updatedExpense = yield* fromPromise(
        () =>
          deps.expenseRepo.update({
            id: latestExpense.id,
            userId: input.userId,
            amount:
              input.payload.patch.amountMinor !== undefined
                ? input.payload.patch.amountMinor / 100
                : latestExpense.amount,
            currency: input.payload.patch.currency ?? latestExpense.currency,
            merchant: input.payload.patch.merchant ?? latestExpense.merchant,
            occurredAt: input.payload.patch.occurredAt ?? latestExpense.occurredAt,
            rawText: latestExpense.rawText,
          }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "update",
            cause,
          }),
      );

      if (!updatedExpense) {
        return { handled: true };
      }

      const isEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForUser({
            userId: input.userId,
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
            userId: input.userId,
            channelId: input.channel,
          }),
        );
      }

      const featureKey = `channels.${input.channel}`;
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
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            userId: input.userId,
            featureKey,
          }),
        );
      }

      yield* fromPromise(
        () =>
          deps.channel.sendMessage({
            externalUserId: input.externalUserId,
            text: `Listo. Actualicé tu último gasto a ${formatAmount(updatedExpense.amount, updatedExpense.currency)} en ${updatedExpense.merchant}.`,
          }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.updated_from_intent", {
        requestId: input.requestId,
        userId: input.userId,
        channel: input.channel,
        externalUserId: input.externalUserId,
        expenseId: updatedExpense.id,
      });

      return {
        handled: true,
        expenseId: updatedExpense.id,
      };
    });
  };
}
