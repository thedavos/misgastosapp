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
import type { CreateExpenseIntentPayload } from "@/domain/intent/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";

export type CreateExpenseFromIntentDeps = {
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

export function createCreateExpenseFromIntent(deps: CreateExpenseFromIntentDeps) {
  return function createExpenseFromIntent(input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: CreateExpenseIntentPayload;
    requestId?: string;
  }): Effect.Effect<{ expenseId: string } | null, AppError> {
    return Effect.gen(function* () {
      const { draft, missingFields } = input.payload;
      if (
        missingFields.length > 0 ||
        draft.amountMinor === undefined ||
        !draft.currency ||
        !draft.merchant ||
        !draft.occurredAt
      ) {
        return null;
      }

      const amount = draft.amountMinor / 100;
      const currency = draft.currency;
      const merchant = draft.merchant;
      const occurredAt = draft.occurredAt;
      const rawText = draft.description ?? draft.merchant;

      const expense = yield* fromPromise(
        () =>
          deps.expenseRepo.createExpenseRecord({
            customerId: input.customerId,
            amount,
            currency,
            merchant,
            occurredAt,
            bank: "unknown",
            rawText,
          }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "createExpenseRecord",
            cause,
          }),
      );

      const isEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForUser({
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
            userId: input.customerId,
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

      const message = `Listo. Registré ${formatAmount(expense.amount, expense.currency)} en ${expense.merchant}.`;

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.created_from_intent", {
        requestId: input.requestId,
        customerId: input.customerId,
        channel: input.channel,
        userId: input.userId,
        expenseId: expense.id,
      });

      return { expenseId: expense.id };
    });
  };
}
