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
import type { DeleteLastExpenseIntentPayload } from "@/domain/intent/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";

export type DeleteLastExpenseFromIntentDeps = {
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

export function createDeleteLastExpenseFromIntent(deps: DeleteLastExpenseFromIntentDeps) {
  return function deleteLastExpenseFromIntent(input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: DeleteLastExpenseIntentPayload;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean; expenseId?: string }, AppError> {
    return Effect.gen(function* () {
      if (input.payload.confidence < 0.9) {
        return { handled: false };
      }

      const latestExpense = yield* fromPromise(
        () => deps.expenseRepo.findLatestByCustomer({ customerId: input.customerId }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "findLatestByCustomer",
            cause,
          }),
      );

      if (!latestExpense) {
        yield* fromPromise(
          () =>
            deps.channel.sendMessage({
              userId: input.userId,
              text: "No encontré un gasto reciente para eliminar.",
            }),
          (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
        );

        return { handled: true };
      }

      const discardedExpense = yield* fromPromise(
        () =>
          deps.expenseRepo.discard({
            id: latestExpense.id,
            customerId: input.customerId,
          }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "discard",
            cause,
          }),
      );

      if (!discardedExpense) {
        return { handled: true };
      }

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
        () =>
          deps.channel.sendMessage({
            userId: input.userId,
            text: `Listo. Eliminé tu último gasto de ${formatAmount(discardedExpense.amount, discardedExpense.currency)} en ${discardedExpense.merchant}.`,
          }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.deleted_from_intent", {
        requestId: input.requestId,
        customerId: input.customerId,
        channel: input.channel,
        userId: input.userId,
        expenseId: discardedExpense.id,
      });

      return {
        handled: true,
        expenseId: discardedExpense.id,
      };
    });
  };
}
